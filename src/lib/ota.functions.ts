import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Mobile OTA (Over-The-Air) bundle publishing.
 *
 * A bundle is a zip of the project's virtual files (the "JS payload" a wrapped
 * Capacitor shell would fetch on launch). Each publish creates a new immutable
 * version in `ota_bundles` and uploads the zip to the `ota-bundles` storage
 * bucket under `<project_id>/<channel>/<version>.zip`. The mobile shell calls
 * `getLatestOtaManifest` on cold start and downloads the bundle if the local
 * version is older.
 */

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const publishOtaBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        channel: z.enum(["production", "beta", "internal"]).default("production"),
        notes: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertRateLimit } = await import("@/lib/rate-limit.server");
    await assertRateLimit(userId, "ota_publish_day", "1 day", 30);
    await assertRateLimit(userId, "ota_publish_min", "1 minute", 3);

    const { data: roleOk } = await supabase.rpc("has_project_role", {
      _project_id: data.projectId,
      _user_id: userId,
      _min_role: "editor",
    });
    if (!roleOk) throw new Error("Forbidden");

    const { data: proj } = await supabase
      .from("projects")
      .select("id, slug, name")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj) throw new Error("Project not found");

    const { data: files, error: fErr } = await supabase
      .from("project_files")
      .select("path, content")
      .eq("project_id", data.projectId);
    if (fErr) throw new Error(fErr.message);
    if (!files || files.length === 0) throw new Error("No files to bundle");

    const { zipSync, strToU8 } = await import("fflate");
    const tree: Record<string, Uint8Array> = {};
    for (const f of files) {
      const rel = f.path.startsWith("/") ? f.path.slice(1) : f.path;
      if (!rel) continue;
      tree[rel] = strToU8(f.content ?? "");
    }
    const zipped = zipSync(tree, { level: 9 });
    const sha = await sha256Hex(zipped);

    // Compute next version atomically via select-then-insert (UNIQUE guards races).
    const { data: latest } = await supabase
      .from("ota_bundles")
      .select("version")
      .eq("project_id", data.projectId)
      .eq("channel", data.channel)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version ?? 0) + 1;
    const storagePath = `${data.projectId}/${data.channel}/${nextVersion}.zip`;

    // Use admin client for upload (storage policies still respected via RLS on objects;
    // admin bypasses, which is fine because we already verified editor role above).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin.storage
      .from("ota-bundles")
      .upload(storagePath, zipped, { contentType: "application/zip", upsert: false });
    if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

    const manifest = {
      project: { id: proj.id, slug: proj.slug, name: proj.name },
      version: nextVersion,
      channel: data.channel,
      sha256: sha,
      size: zipped.byteLength,
      file_count: Object.keys(tree).length,
      notes: data.notes ?? null,
      published_at: new Date().toISOString(),
    };

    const { data: row, error: insErr } = await supabase
      .from("ota_bundles")
      .insert({
        project_id: data.projectId,
        version: nextVersion,
        channel: data.channel,
        storage_path: storagePath,
        size_bytes: zipped.byteLength,
        sha256: sha,
        manifest,
        published_by: userId,
      })
      .select("id, version, channel, sha256, size_bytes, storage_path, created_at, manifest")
      .single();
    if (insErr) {
      // Roll back uploaded object on insert failure.
      await supabaseAdmin.storage.from("ota-bundles").remove([storagePath]);
      throw new Error(insErr.message);
    }
    return row;
  });

export const listOtaBundles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(20) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("ota_bundles")
      .select("id, version, channel, sha256, size_bytes, storage_path, created_at, manifest")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { bundles: rows ?? [] };
  });

export const getOtaBundleUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), bundleId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleOk } = await supabase.rpc("has_project_role", {
      _project_id: data.projectId,
      _user_id: userId,
      _min_role: "viewer",
    });
    if (!roleOk) throw new Error("Forbidden");

    const { data: row } = await supabase
      .from("ota_bundles")
      .select("storage_path")
      .eq("id", data.bundleId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (!row) throw new Error("Bundle not found");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("ota-bundles")
      .createSignedUrl(row.storage_path, 60 * 10); // 10 min
    if (error || !signed) throw new Error(error?.message ?? "Sign failed");
    return { url: signed.signedUrl, expires_in: 600 };
  });
