import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Catalog of supported Capacitor plugins exposed to the UI + agent. */
export const CAPACITOR_PLUGINS = [
  { id: "camera", pkg: "@capacitor/camera", name: "Camera", desc: "Take photos or pick from gallery." },
  { id: "geolocation", pkg: "@capacitor/geolocation", name: "Geolocation", desc: "Read device GPS coordinates." },
  { id: "push-notifications", pkg: "@capacitor/push-notifications", name: "Push notifications", desc: "Remote push via APNs / FCM." },
  { id: "local-notifications", pkg: "@capacitor/local-notifications", name: "Local notifications", desc: "Schedule notifications on device." },
  { id: "preferences", pkg: "@capacitor/preferences", name: "Preferences (KV storage)", desc: "Small key-value persistent storage." },
  { id: "filesystem", pkg: "@capacitor/filesystem", name: "Filesystem", desc: "Read/write files in app sandbox." },
  { id: "share", pkg: "@capacitor/share", name: "Share sheet", desc: "Native share dialog." },
  { id: "haptics", pkg: "@capacitor/haptics", name: "Haptics", desc: "Vibration and tactile feedback." },
  { id: "status-bar", pkg: "@capacitor/status-bar", name: "Status bar", desc: "Style and overlay control." },
  { id: "splash-screen", pkg: "@capacitor/splash-screen", name: "Splash screen", desc: "Launch splash control." },
  { id: "browser", pkg: "@capacitor/browser", name: "In-app browser", desc: "SFSafariViewController / CustomTabs." },
  { id: "app", pkg: "@capacitor/app", name: "App lifecycle", desc: "Back button, state, deep links." },
] as const;

export type CapacitorPluginId = (typeof CAPACITOR_PLUGINS)[number]["id"];

export const listCapacitorPlugins = createServerFn({ method: "GET" }).handler(async () => {
  return { plugins: CAPACITOR_PLUGINS as readonly { id: string; pkg: string; name: string; desc: string }[] };
});

/** Bundle the project's virtual files into a downloadable ZIP (base64). */
export const bundleMobileProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertRateLimit } = await import("@/lib/rate-limit.server");
    await assertRateLimit(userId, "mobile_bundle_day", "1 day", 20);
    await assertRateLimit(userId, "mobile_bundle_min", "1 minute", 3);

    const { data: roleOk } = await supabase.rpc("has_project_role", {
      _project_id: data.projectId, _user_id: userId, _min_role: "editor",
    });
    if (!roleOk) throw new Error("Forbidden");

    const { data: proj, error: pErr } = await supabase
      .from("projects").select("id, slug, name").eq("id", data.projectId).maybeSingle();
    if (pErr || !proj) throw new Error("Project not found");

    const { data: files, error: fErr } = await supabase
      .from("project_files").select("path, content").eq("project_id", data.projectId);
    if (fErr) throw new Error(fErr.message);
    if (!files || files.length === 0) throw new Error("No files to bundle");

    const { zipSync, strToU8 } = await import("fflate");
    const tree: Record<string, Uint8Array> = {};
    for (const f of files) {
      const rel = f.path.startsWith("/") ? f.path.slice(1) : f.path;
      if (!rel) continue;
      tree[rel] = strToU8(f.content ?? "");
    }

    // Always include a top-level README with one-shot mobile build steps.
    const readme = `# ${proj.name} — Mobile bundle

Unzip, then run from this folder:

\`\`\`bash
npm install
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/ios @capacitor/android
npx cap init "${proj.name}" "app.foundry.${proj.slug.replace(/[^a-z0-9]/g, "")}" --web-dir dist
npm run build
npx cap add ios
npx cap add android
npx cap sync
npx cap open ios       # Xcode → Run on device / simulator
npx cap open android   # Android Studio → Run
\`\`\`

This bundle is the source of your React app exactly as it lives in Foundry. The
generated /capacitor.config.ts (if present) and /docs/MOBILE.md are included.
`;
    if (!tree["README.MOBILE.md"]) tree["README.MOBILE.md"] = strToU8(readme);

    const zipped = zipSync(tree, { level: 6 });
    const b64 = Buffer.from(zipped).toString("base64");
    return {
      filename: `${proj.slug}-mobile.zip`,
      size: zipped.byteLength,
      base64: b64,
    };
  });
