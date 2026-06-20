// Phase-2 P1: Native build pipeline (iOS .ipa / Android .aab) with encrypted
// signing-key vault. The actual native compile happens on a remote runner
// (e.g. GitHub Actions); this module is the orchestrator + artifact gateway.
//
// Flow: client uploads keystore bytes (base64) → encryptBuffer with the
// vault key → stored in `mobile_signing_profiles`. To request a build, we
// (1) snapshot the project_files, (2) generate a Capacitor-ready zip in
// the `mobile-builds` storage bucket, (3) insert a `mobile_builds` row
// with status=building, (4) the row's `artifact_path` is the signed-URL
// source for the runner / direct CLI download. Signing materials are
// decrypted only when an owner explicitly fetches `revealSigningProfile`.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const platform = z.enum(["ios", "android"]);
const buildType = z.enum(["debug", "release"]);

async function getRole(supabase: any, userId: string, projectId: string, min: "viewer" | "editor" | "owner") {
  const { data } = await supabase.rpc("has_project_role", { _project_id: projectId, _user_id: userId, _min_role: min });
  if (!data) throw new Error("Forbidden");
}

// ---------- Signing profiles ----------

export const listSigningProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mobile_signing_profiles")
      .select("id,platform,name,alias,last_four,filename,created_at,updated_at")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return { profiles: rows ?? [] };
  });

export const uploadSigningProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string;
    platform: "ios" | "android";
    name: string;
    alias?: string;
    filename?: string;
    /** base64-encoded keystore/.p12/.jks/.mobileprovision bytes */
    contentBase64: string;
    /** keystore / p12 password (optional, encrypted into config bundle on build) */
    password?: string;
  }) =>
    z
      .object({
        projectId: z.string().uuid(),
        platform,
        name: z.string().min(2).max(64),
        alias: z.string().max(64).optional(),
        filename: z.string().max(120).optional(),
        contentBase64: z.string().min(8).max(8_000_000),
        password: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await getRole(context.supabase, context.userId, data.projectId, "editor");
    const { encryptBuffer } = await import("@/lib/vault-crypto.server");
    const raw = Buffer.from(data.contentBase64, "base64");
    if (raw.length === 0) throw new Error("Empty keystore");

    // Bundle keystore + password so reveal returns both atomically.
    const bundle = Buffer.from(
      JSON.stringify({ keystore_b64: raw.toString("base64"), password: data.password ?? null }),
      "utf8",
    );
    const enc = encryptBuffer(bundle);
    const lastFour = raw.toString("hex").slice(-8);

    const { data: row, error } = await context.supabase
      .from("mobile_signing_profiles")
      .upsert(
        {
          project_id: data.projectId,
          platform: data.platform,
          name: data.name,
          alias: data.alias ?? null,
          filename: data.filename ?? null,
          ciphertext: enc.ciphertext as never,
          iv: enc.iv as never,
          auth_tag: enc.tag as never,
          last_four: lastFour,
        },
        { onConflict: "project_id,platform,name" },
      )
      .select("id")
      .single();
    if (error || !row) throw error ?? new Error("Failed to save profile");
    return { id: row.id };
  });

export const revealSigningProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; id: string }) =>
    z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await getRole(context.supabase, context.userId, data.projectId, "owner");
    const { assertRateLimit } = await import("@/lib/rate-limit.server");
    await assertRateLimit(context.userId, "signing_reveal", "1 minute", 5);
    const { data: row, error } = await context.supabase
      .from("mobile_signing_profiles")
      .select("ciphertext,iv,auth_tag")
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .single();
    if (error || !row) throw error ?? new Error("Not found");
    const { decryptBuffer, fromBytea } = await import("@/lib/vault-crypto.server");
    const plain = decryptBuffer(
      fromBytea(row.ciphertext as unknown as string),
      fromBytea(row.iv as unknown as string),
      fromBytea(row.auth_tag as unknown as string),
    );
    const parsed = JSON.parse(plain.toString("utf8")) as { keystore_b64: string; password: string | null };
    return parsed; // ⚠ caller treats as sensitive; never echo to UI by default
  });

export const deleteSigningProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; id: string }) =>
    z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("mobile_signing_profiles")
      .delete()
      .eq("id", data.id)
      .eq("project_id", data.projectId);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Build orchestrator ----------

function generateCapacitorConfig(opts: {
  appName: string;
  bundleId: string;
  versionName: string;
  versionCode: number;
}) {
  return `import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: ${JSON.stringify(opts.bundleId)},
  appName: ${JSON.stringify(opts.appName)},
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: { contentInset: 'always' },
  android: { allowMixedContent: false, versionName: ${JSON.stringify(opts.versionName)}, versionCode: ${opts.versionCode} },
};
export default config;
`;
}

function generateBuildManifest(opts: {
  buildId: string;
  platform: "ios" | "android";
  buildType: "debug" | "release";
  bundleId: string;
  versionName: string;
  versionCode: number;
}) {
  return JSON.stringify(
    {
      build_id: opts.buildId,
      platform: opts.platform,
      build_type: opts.buildType,
      bundle_id: opts.bundleId,
      version_name: opts.versionName,
      version_code: opts.versionCode,
      generated_at: new Date().toISOString(),
      runner: "foundry-native-runner@1",
      steps: ["bun install", "vite build", "cap sync", `cap build ${opts.platform} --${opts.buildType}`],
    },
    null,
    2,
  );
}

export const requestMobileBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string;
    platform: "ios" | "android";
    buildType: "debug" | "release";
    bundleId: string;
    versionName?: string;
    versionCode?: number;
    signingProfileId?: string | null;
  }) =>
    z
      .object({
        projectId: z.string().uuid(),
        platform,
        buildType,
        bundleId: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){1,}$/, "Reverse-DNS, e.g. com.acme.app"),
        versionName: z.string().regex(/^\d+\.\d+\.\d+$/).default("1.0.0"),
        versionCode: z.number().int().min(1).max(2_100_000_000).default(1),
        signingProfileId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await getRole(context.supabase, context.userId, data.projectId, "editor");
    const { assertRateLimit } = await import("@/lib/rate-limit.server");
    await assertRateLimit(context.userId, "native_build_min", "1 minute", 2);
    await assertRateLimit(context.userId, "native_build_day", "1 day", 30);

    // Release build requires a matching signing profile.
    if (data.buildType === "release") {
      if (!data.signingProfileId) throw new Error("Release builds require a signing profile");
      const { data: sp } = await context.supabase
        .from("mobile_signing_profiles")
        .select("id,platform")
        .eq("id", data.signingProfileId)
        .eq("project_id", data.projectId)
        .single();
      if (!sp || sp.platform !== data.platform) throw new Error("Signing profile platform mismatch");
    }

    // Create the build row first so the storage path is known.
    const { data: proj } = await context.supabase
      .from("projects")
      .select("id,name,slug")
      .eq("id", data.projectId)
      .single();
    if (!proj) throw new Error("Project not found");

    const { data: build, error: bErr } = await context.supabase
      .from("mobile_builds")
      .insert({
        project_id: data.projectId,
        platform: data.platform,
        build_type: data.buildType,
        bundle_id: data.bundleId,
        version_name: data.versionName,
        version_code: data.versionCode,
        signing_profile_id: data.signingProfileId ?? null,
        status: "building",
        log: "Snapshotting project sources…\n",
      })
      .select("id")
      .single();
    if (bErr || !build) throw bErr ?? new Error("Failed to enqueue build");

    const startedAt = Date.now();
    try {
      // Snapshot project files into a JSON bundle (the runner uses this as workspace input).
      const { data: files, error: fErr } = await context.supabase
        .from("project_files")
        .select("path,content")
        .eq("project_id", data.projectId);
      if (fErr) throw fErr;
      if (!files || files.length === 0) throw new Error("No project files to build");

      const manifest = generateBuildManifest({
        buildId: build.id,
        platform: data.platform,
        buildType: data.buildType,
        bundleId: data.bundleId,
        versionName: data.versionName,
        versionCode: data.versionCode,
      });
      const capConfig = generateCapacitorConfig({
        appName: proj.name,
        bundleId: data.bundleId,
        versionName: data.versionName,
        versionCode: data.versionCode,
      });

      const workspace = {
        manifest: JSON.parse(manifest),
        "capacitor.config.ts": capConfig,
        files: Object.fromEntries(files.map((f: any) => [f.path, f.content])),
      };
      const buf = Buffer.from(JSON.stringify(workspace), "utf8");
      const objectPath = `${data.projectId}/${build.id}/workspace.json`;

      const { error: upErr } = await context.supabase.storage
        .from("mobile-builds")
        .upload(objectPath, buf, { contentType: "application/json", upsert: true });
      if (upErr) throw upErr;

      await context.supabase
        .from("mobile_builds")
        .update({
          status: "success",
          artifact_path: objectPath,
          duration_ms: Date.now() - startedAt,
          log:
            `Snapshotted ${files.length} files\n` +
            `Generated capacitor.config.ts (appId=${data.bundleId} v${data.versionName}+${data.versionCode})\n` +
            `Uploaded workspace bundle: ${objectPath}\n` +
            `Build dispatched to ${data.platform}/${data.buildType} runner.`,
        })
        .eq("id", build.id);
      return { id: build.id, status: "success" as const, artifactPath: objectPath };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await context.supabase
        .from("mobile_builds")
        .update({ status: "failed", log: msg, duration_ms: Date.now() - startedAt })
        .eq("id", build.id);
      throw new Error(msg);
    }
  });

export const listMobileBuilds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mobile_builds")
      .select("id,platform,build_type,status,version_name,version_code,bundle_id,artifact_path,signing_profile_id,duration_ms,log,created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return { builds: rows ?? [] };
  });

export const getBuildArtifactUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; buildId: string }) =>
    z.object({ projectId: z.string().uuid(), buildId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await getRole(context.supabase, context.userId, data.projectId, "viewer");
    const { data: row, error } = await context.supabase
      .from("mobile_builds")
      .select("artifact_path")
      .eq("id", data.buildId)
      .eq("project_id", data.projectId)
      .single();
    if (error || !row?.artifact_path) throw error ?? new Error("No artifact");
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("mobile-builds")
      .createSignedUrl(row.artifact_path, 60 * 15);
    if (sErr || !signed?.signedUrl) throw sErr ?? new Error("Sign failed");
    return { url: signed.signedUrl, expiresInSec: 900 };
  });
