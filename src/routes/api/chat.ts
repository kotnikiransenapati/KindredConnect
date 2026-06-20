import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { parse as babelParse } from "@babel/parser";
import { createTwoFilesPatch } from "diff";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

/** Parse JS/TS/JSX/TSX with Babel — returns syntax errors (no type-checking). */
function lintSource(path: string, content: string): { ok: boolean; errors: { line: number; column: number; message: string }[] } {
  const isTs = /\.(ts|tsx)$/.test(path);
  const isJsx = /\.(jsx|tsx)$/.test(path);
  if (!/\.(jsx?|tsx?|mjs|cjs)$/.test(path)) return { ok: true, errors: [] };
  try {
    babelParse(content, {
      sourceType: "module",
      allowReturnOutsideFunction: false,
      errorRecovery: true,
      plugins: [
        isJsx ? "jsx" : null,
        isTs ? "typescript" : null,
        "decorators-legacy",
        "classProperties",
        "topLevelAwait",
      ].filter(Boolean) as never,
    });
    return { ok: true, errors: [] };
  } catch (e) {
    const err = e as { loc?: { line: number; column: number }; message?: string };
    return {
      ok: false,
      errors: [{ line: err.loc?.line ?? 0, column: err.loc?.column ?? 0, message: err.message ?? "Parse error" }],
    };
  }
}

function makePatch(path: string, oldContent: string, newContent: string): string {
  const patch = createTwoFilesPatch(path, path, oldContent, newContent, "", "", { context: 3 });
  return patch.length > 16_000 ? patch.slice(0, 16_000) + "\n... (truncated)" : patch;
}

const SYSTEM_PROMPT_BASE = `You are Foundry, an expert AI engineer that builds production-grade web and mobile apps inside a sandboxed workspace.

PIPELINE (follow strictly):
1. Plan: briefly state your intent in one sentence before tool calls.
2. Read: if a file likely exists, call readFile before overwriting blindly.
3. Search: use searchFiles to discover where a symbol/text lives.
4. Write: produce COMPLETE, runnable files. Never use ellipsis/placeholders/"... rest unchanged".
5. Verify: after edits, summarize what changed in 1-3 sentences.

STACK:
- React 18 + TypeScript + Tailwind utility classes. Entry: /App.tsx.
- Functional components, hooks, semantic HTML, accessible markup, responsive-first.
- Keep components small (<200 lines), split into /components/* when appropriate.
- No secrets, no backend code, no network calls to private APIs.

MOBILE (iOS / Android / PWA):
- If the user asks for a mobile app or wants to ship to iOS/Android, call scaffoldCapacitor once.
  This adds capacitor.config.ts + /docs/MOBILE.md with the exact 'npx cap add ios/android' steps.
- If the user wants "installable" / "add to home screen" / offline, call scaffoldPWA once — it writes
  /public/manifest.webmanifest, /public/sw.js (offline cache), and the registration snippet doc.
- After major UI work on a mobile target, call runMobileAudit and fix any findings before declaring done.
- Design touch-first: 44px+ tap targets, safe-area padding (env(safe-area-inset-*)), no hover-only states.
- Prefer system fonts on mobile; avoid fixed pixel widths; use clamp() / responsive units.

TOOL DISCIPLINE:
- Never invent tools. Only call the provided tool names.
- Prefer writeFile over deleteFile+writeFile. Use renameFile for moves.
- After writeFile, inspect the returned 'lint' object. If lint.ok is false, immediately call writeFile again with corrected content. Repeat until clean (max 3 attempts per file).
- Stop calling tools once the user's request is satisfied and all touched files lint cleanly.`;

const EMBEDDABLE = /\.(tsx?|jsx?|css|md|mdx|json|html|txt|ya?ml)$/i;

/** Fire-and-forget chunk + embed of a file, scoped to the user's project. */
async function autoEmbedFile(
  supabaseAdmin: ReturnType<typeof createClient<Database>>,
  gateway: ReturnType<typeof createLovableAiGatewayProvider>,
  projectId: string,
  path: string,
  content: string,
): Promise<void> {
  try {
    if (!EMBEDDABLE.test(path) || content.length < 80 || content.length > 60_000) return;
    const { embedMany } = await import("ai");
    const SIZE = 1200, OVERLAP = 150;
    const chunks: string[] = [];
    let i = 0;
    while (i < content.length) { chunks.push(content.slice(i, i + SIZE)); i += SIZE - OVERLAP; }
    const { embeddings } = await embedMany({
      model: gateway.textEmbeddingModel("google/text-embedding-004"),
      values: chunks,
    });
    await supabaseAdmin.from("knowledge_chunks")
      .delete().eq("project_id", projectId).eq("source_type", "file").eq("source_path", path);
    await supabaseAdmin.from("knowledge_chunks").insert(
      chunks.map((c, idx) => ({
        project_id: projectId, source_type: "file" as const, source_path: path,
        chunk_index: idx, content: c, tokens: Math.ceil(c.length / 4),
        embedding: embeddings[idx] as unknown as string,
      })),
    );
  } catch (e) {
    console.warn("[autoEmbed] skipped", path, e);
  }
}

const BodySchema = z.object({
  messages: z.array(z.any()).min(1).max(200),
  projectId: z.string().uuid(),
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const url = process.env.SUPABASE_URL;
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!url || !anon || !lovableKey) return new Response("Server misconfigured", { status: 500 });

        const supabase = createClient<Database>(url, anon, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return new Response("Invalid request body", { status: 400 });
        }
        const { messages, projectId } = body;

        // Verify access (owner OR member as editor+) via security-definer fn
        const { data: canEdit } = await supabase.rpc("has_project_role", {
          _project_id: projectId, _user_id: userId, _min_role: "editor",
        });
        if (!canEdit) return new Response("Project not found or insufficient permission", { status: 403 });

        // Rate limit: 20 messages/minute, 200/day per user (service-role bypasses RLS)
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [perMin, perDay] = await Promise.all([
          supabaseAdmin.rpc("check_rate_limit", { _user_id: userId, _bucket: "chat_min", _window: "1 minute", _max: 20 }),
          supabaseAdmin.rpc("check_rate_limit", { _user_id: userId, _bucket: "chat_day", _window: "1 day", _max: 200 }),
        ]);
        if (perMin.data === false || perDay.data === false) {
          return new Response("Rate limit exceeded. Try again later.", { status: 429 });
        }

        // Persist the latest user message
        const lastMsg = messages[messages.length - 1] as UIMessage;
        if (lastMsg?.role === "user") {
          await supabase.from("messages").insert({
            project_id: projectId, user_id: userId, role: "user",
            parts: lastMsg.parts as unknown as Database["public"]["Tables"]["messages"]["Insert"]["parts"],
          });
        }

        const promptChars = JSON.stringify(messages).length;
        const gateway = createLovableAiGatewayProvider(lovableKey);
        const modelId = "google/gemini-3-flash-preview";
        const model = gateway(modelId);


        const tools = {
          writeFile: tool({
            description: "Create or overwrite a file with COMPLETE contents. Result includes a unified diff and lint errors (if any). If lint.ok is false, FIX the syntax error and call writeFile again.",
            inputSchema: z.object({
              path: z.string().min(1).max(255).describe("Absolute path starting with /"),
              content: z.string().max(200_000),
              language: z.string().max(40).optional(),
            }),
            execute: async ({ path, content, language }) => {
              const normalized = path.startsWith("/") ? path : `/${path}`;
              const lint = lintSource(normalized, content);
              const { data: existing } = await supabase
                .from("project_files").select("id, version, content")
                .eq("project_id", projectId).eq("path", normalized).maybeSingle();
              const oldContent = existing?.content ?? "";
              const patch = makePatch(normalized, oldContent, content);
              if (existing) {
                const { error } = await supabase.from("project_files")
                  .update({ content, language: language ?? null, version: existing.version + 1 })
                  .eq("id", existing.id);
                if (error) return { ok: false, error: error.message };
                void autoEmbedFile(supabaseAdmin, gateway, projectId, normalized, content);
                return { ok: true, path: normalized, action: "updated", version: existing.version + 1, lint, patch };
              }
              const { error } = await supabase.from("project_files").insert({
                project_id: projectId, path: normalized, content, language: language ?? null,
              });
              if (error) return { ok: false, error: error.message };
              void autoEmbedFile(supabaseAdmin, gateway, projectId, normalized, content);
              return { ok: true, path: normalized, action: "created", version: 1, lint, patch };
            },
          }),
          scaffoldCapacitor: tool({
            description: "Add Capacitor mobile-shell config so this project can be wrapped as an iOS / Android app. Writes /capacitor.config.ts and /docs/MOBILE.md with the exact CLI steps. Call ONCE per project when the user wants a mobile app.",
            inputSchema: z.object({
              appId: z.string().regex(/^[a-z][a-z0-9.]*$/).max(120).describe("Reverse-DNS bundle id, e.g. app.foundry.todo"),
              appName: z.string().min(1).max(80),
              platforms: z.array(z.enum(["ios", "android"])).min(1).default(["ios", "android"]),
            }),
            execute: async ({ appId, appName, platforms }) => {
              const cfg = `import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: '${appId}',
  appName: ${JSON.stringify(appName)},
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: { contentInset: 'always', limitsNavigationsToAppBoundDomains: true },
  android: { allowMixedContent: false },
  server: { androidScheme: 'https' },
  plugins: {
    SplashScreen: { launchShowDuration: 1200, backgroundColor: '#0b0b10' },
    StatusBar: { style: 'dark', overlaysWebView: false },
  },
};

export default config;
`;
              const docs = `# ${appName} — Mobile (iOS / Android)

This project is configured with Capacitor for native iOS / Android shells around the same React app.

## One-time setup (on your machine)
\`\`\`bash
npm i -D @capacitor/cli
npm i @capacitor/core ${platforms.includes("ios") ? "@capacitor/ios " : ""}${platforms.includes("android") ? "@capacitor/android" : ""}
npx cap init "${appName}" "${appId}" --web-dir dist
${platforms.includes("ios") ? "npx cap add ios\n" : ""}${platforms.includes("android") ? "npx cap add android\n" : ""}\`\`\`

## Every build
\`\`\`bash
npm run build
npx cap sync
${platforms.includes("ios") ? "npx cap open ios       # Xcode → Run on device / simulator\n" : ""}${platforms.includes("android") ? "npx cap open android   # Android Studio → Run\n" : ""}\`\`\`

## Native features (install on demand)
- Camera:  \`npm i @capacitor/camera\`
- Push:    \`npm i @capacitor/push-notifications\`
- Storage: \`npm i @capacitor/preferences\`
- Geolocation: \`npm i @capacitor/geolocation\`

## Design rules baked into the UI
- 44px+ tap targets, safe-area insets (\`env(safe-area-inset-*)\`), no hover-only states.
- Use system fonts on mobile, prefer \`clamp()\` and responsive units over fixed px.
`;
              const writeOne = async (p: string, c: string) => {
                const { data: ex } = await supabase.from("project_files")
                  .select("id, version").eq("project_id", projectId).eq("path", p).maybeSingle();
                if (ex) {
                  await supabase.from("project_files")
                    .update({ content: c, version: ex.version + 1 }).eq("id", ex.id);
                } else {
                  await supabase.from("project_files").insert({ project_id: projectId, path: p, content: c });
                }
              };
              await writeOne("/capacitor.config.ts", cfg);
              await writeOne("/docs/MOBILE.md", docs);
              return { ok: true, appId, appName, platforms, files: ["/capacitor.config.ts", "/docs/MOBILE.md"] };
            },
          }),
          addCapacitorPlugin: tool({
            description: "Install a native Capacitor plugin (camera, geolocation, push, haptics, share, etc). Updates /docs/MOBILE.md with the install command and a minimal usage snippet. Call AFTER scaffoldCapacitor.",
            inputSchema: z.object({
              plugin: z.enum([
                "camera", "geolocation", "push-notifications", "local-notifications",
                "preferences", "filesystem", "share", "haptics",
                "status-bar", "splash-screen", "browser", "app",
              ]),
            }),
            execute: async ({ plugin }) => {
              const pkg = `@capacitor/${plugin}`;
              const SNIPPETS: Record<string, string> = {
                "camera": `import { Camera, CameraResultType } from '@capacitor/camera';\nconst photo = await Camera.getPhoto({ resultType: CameraResultType.Uri, quality: 90 });`,
                "geolocation": `import { Geolocation } from '@capacitor/geolocation';\nconst pos = await Geolocation.getCurrentPosition();`,
                "push-notifications": `import { PushNotifications } from '@capacitor/push-notifications';\nawait PushNotifications.requestPermissions(); await PushNotifications.register();`,
                "local-notifications": `import { LocalNotifications } from '@capacitor/local-notifications';\nawait LocalNotifications.schedule({ notifications: [{ id: 1, title: 'Hi', body: 'Hello' }] });`,
                "preferences": `import { Preferences } from '@capacitor/preferences';\nawait Preferences.set({ key: 'name', value: 'Foundry' });`,
                "filesystem": `import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';\nawait Filesystem.writeFile({ path: 'log.txt', data: 'hi', directory: Directory.Data, encoding: Encoding.UTF8 });`,
                "share": `import { Share } from '@capacitor/share';\nawait Share.share({ title: 'Hi', text: 'Check this', url: 'https://example.com' });`,
                "haptics": `import { Haptics, ImpactStyle } from '@capacitor/haptics';\nawait Haptics.impact({ style: ImpactStyle.Medium });`,
                "status-bar": `import { StatusBar, Style } from '@capacitor/status-bar';\nawait StatusBar.setStyle({ style: Style.Dark });`,
                "splash-screen": `import { SplashScreen } from '@capacitor/splash-screen';\nawait SplashScreen.hide();`,
                "browser": `import { Browser } from '@capacitor/browser';\nawait Browser.open({ url: 'https://example.com' });`,
                "app": `import { App } from '@capacitor/app';\nApp.addListener('appStateChange', ({ isActive }) => console.log(isActive));`,
              };
              const snippet = SNIPPETS[plugin] ?? "";
              const { data: existing } = await supabase.from("project_files")
                .select("id, content, version").eq("project_id", projectId).eq("path", "/docs/MOBILE.md").maybeSingle();
              const block = `\n\n## Plugin: ${plugin}\n\`\`\`bash\nnpm i ${pkg}\nnpx cap sync\n\`\`\`\n\n\`\`\`ts\n${snippet}\n\`\`\`\n`;
              const next = (existing?.content ?? `# Mobile\n`) + (existing?.content?.includes(`## Plugin: ${plugin}`) ? "" : block);
              if (existing) {
                await supabase.from("project_files").update({ content: next, version: existing.version + 1 }).eq("id", existing.id);
              } else {
                await supabase.from("project_files").insert({ project_id: projectId, path: "/docs/MOBILE.md", content: next });
              }
              return { ok: true, plugin, pkg, installCommand: `npm i ${pkg} && npx cap sync` };
            },
          }),
          scaffoldPWA: tool({
            description: "Make this app installable on iOS / Android / desktop as a PWA. Writes /public/manifest.webmanifest, /public/sw.js (offline-first cache), and /docs/PWA.md with the <head> snippet to add. Call ONCE per project.",
            inputSchema: z.object({
              appName: z.string().min(1).max(80),
              shortName: z.string().min(1).max(20),
              themeColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0b0b10"),
              backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0b0b10"),
              startUrl: z.string().default("/"),
            }),
            execute: async ({ appName, shortName, themeColor, backgroundColor, startUrl }) => {
              const manifest = JSON.stringify({
                name: appName,
                short_name: shortName,
                start_url: startUrl,
                scope: "/",
                display: "standalone",
                orientation: "portrait",
                theme_color: themeColor,
                background_color: backgroundColor,
                icons: [
                  { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
                  { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
                ],
              }, null, 2);
              const sw = `// Foundry PWA service worker — offline-first with stale-while-revalidate
const CACHE = 'foundry-v1';
const CORE = ['/', '/index.html', '/manifest.webmanifest'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) =>
    Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then((res) => {
      if (res.ok && new URL(req.url).origin === location.origin) cache.put(req, res.clone());
      return res;
    }).catch(() => cached);
    return cached || network;
  })());
});`;
              const docs = `# ${appName} — Progressive Web App

This project is installable on iOS, Android and desktop.

## Add to your \`index.html\` <head>

\`\`\`html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="${themeColor}" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
  }
</script>
\`\`\`

## Icons
Place \`/public/icons/icon-192.png\` and \`/public/icons/icon-512.png\` (maskable, square).

## Install prompts
- iOS Safari: Share → Add to Home Screen.
- Android Chrome: address bar → Install app.
- Desktop Chrome/Edge: install icon in the URL bar.
`;
              const writeOne = async (p: string, c: string) => {
                const { data: ex } = await supabase.from("project_files")
                  .select("id, version").eq("project_id", projectId).eq("path", p).maybeSingle();
                if (ex) await supabase.from("project_files").update({ content: c, version: ex.version + 1 }).eq("id", ex.id);
                else await supabase.from("project_files").insert({ project_id: projectId, path: p, content: c });
              };
              await writeOne("/public/manifest.webmanifest", manifest);
              await writeOne("/public/sw.js", sw);
              await writeOne("/docs/PWA.md", docs);
              return { ok: true, files: ["/public/manifest.webmanifest", "/public/sw.js", "/docs/PWA.md"] };
            },
          }),
          runMobileAudit: tool({
            description: "Scan all project files for mobile UX issues: hover-only states, fixed pixel widths, missing safe-area insets, tiny tap targets, viewport meta. Returns a findings list. Call before declaring a mobile build done.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data: files } = await supabase.from("project_files")
                .select("path, content").eq("project_id", projectId);
              const findings: Array<{ path: string; rule: string; hint: string; count: number }> = [];
              let viewportOk = false;
              for (const f of files ?? []) {
                const c = f.content ?? "";
                if (/<meta[^>]+name=["']viewport["']/i.test(c)) viewportOk = true;
                const push = (rule: string, hint: string, count: number) => {
                  if (count > 0) findings.push({ path: f.path, rule, hint, count });
                };
                push("hover-only-interaction",
                  "Wrap hover styles with @media (hover: hover) — touch devices skip them.",
                  (c.match(/\bhover:/g) ?? []).length > 0 && !/@media\s*\(hover:\s*hover\)/.test(c)
                    ? (c.match(/\bhover:/g) ?? []).length : 0);
                push("fixed-pixel-width",
                  "Replace fixed widths (>=360px) with max-w-*, clamp() or responsive units.",
                  (c.match(/\bw-\[(?:3[6-9]\d|[4-9]\d{2,}|\d{4,})px\]/g) ?? []).length);
                push("missing-safe-area",
                  "Add padding for env(safe-area-inset-top/bottom) on fixed top/bottom bars.",
                  /position:\s*fixed|fixed\s+(?:top-0|bottom-0)/.test(c) && !/safe-area-inset/.test(c) ? 1 : 0);
                push("tiny-tap-target",
                  "Buttons / links must be >= 44x44px (use min-h-11 min-w-11 or p-3).",
                  (c.match(/<button[^>]*className=["'][^"']*\b(?:h-[1-7]|w-[1-7])\b/g) ?? []).length);
              }
              if (!viewportOk && (files ?? []).some((f) => f.path.endsWith(".html"))) {
                findings.push({ path: "/index.html", rule: "missing-viewport-meta",
                  hint: 'Add <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />', count: 1 });
              }
              return { ok: true, findings, totalFiles: files?.length ?? 0, totalFindings: findings.length };
            },
          }),
          lintFile: tool({
            description: "Run syntax/parse check on a file already in the project. Use to verify before declaring done.",
            inputSchema: z.object({ path: z.string().min(1).max(255) }),
            execute: async ({ path }) => {
              const normalized = path.startsWith("/") ? path : `/${path}`;
              const { data } = await supabase.from("project_files")
                .select("content").eq("project_id", projectId).eq("path", normalized).maybeSingle();
              if (!data) return { ok: false, error: "Not found" };
              return { path: normalized, ...lintSource(normalized, data.content) };
            },
          }),
          deleteFile: tool({
            description: "Delete a file from the project.",
            inputSchema: z.object({ path: z.string().min(1).max(255) }),
            execute: async ({ path }) => {
              const normalized = path.startsWith("/") ? path : `/${path}`;
              const { error } = await supabase.from("project_files")
                .delete().eq("project_id", projectId).eq("path", normalized);
              if (error) return { ok: false, error: error.message };
              return { ok: true, path: normalized, action: "deleted" };
            },
          }),
          readFile: tool({
            description: "Read an existing file from the project.",
            inputSchema: z.object({ path: z.string().min(1).max(255) }),
            execute: async ({ path }) => {
              const normalized = path.startsWith("/") ? path : `/${path}`;
              const { data } = await supabase.from("project_files")
                .select("content, language, version").eq("project_id", projectId).eq("path", normalized).maybeSingle();
              if (!data) return { ok: false, error: "Not found" };
              return { ok: true, ...data };
            },
          }),
          listFiles: tool({
            description: "List all files in the project.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data } = await supabase.from("project_files")
                .select("path, version").eq("project_id", projectId).order("path");
              return { files: data ?? [] };
            },
          }),
          searchFiles: tool({
            description: "Case-insensitive substring search across file contents. Returns up to 20 matching paths with a snippet.",
            inputSchema: z.object({ query: z.string().min(1).max(200) }),
            execute: async ({ query }) => {
              const { data } = await supabase.from("project_files")
                .select("path, content")
                .eq("project_id", projectId)
                .ilike("content", `%${query}%`)
                .limit(20);
              return {
                matches: (data ?? []).map((f) => {
                  const idx = f.content.toLowerCase().indexOf(query.toLowerCase());
                  const start = Math.max(0, idx - 60);
                  const end = Math.min(f.content.length, idx + query.length + 60);
                  return { path: f.path, snippet: f.content.slice(start, end) };
                }),
              };
            },
          }),
          renameFile: tool({
            description: "Rename or move a file in the project.",
            inputSchema: z.object({
              from: z.string().min(1).max(255),
              to: z.string().min(1).max(255),
            }),
            execute: async ({ from, to }) => {
              const src = from.startsWith("/") ? from : `/${from}`;
              const dst = to.startsWith("/") ? to : `/${to}`;
              const { data: existing } = await supabase.from("project_files")
                .select("id, version").eq("project_id", projectId).eq("path", src).maybeSingle();
              if (!existing) return { ok: false, error: "Source not found" };
              const { error } = await supabase.from("project_files")
                .update({ path: dst, version: existing.version + 1 })
                .eq("id", existing.id);
              if (error) return { ok: false, error: error.message };
              return { ok: true, from: src, to: dst };
            },
          }),
          installIntegration: tool({
            description: "Install a pre-wired integration (Stripe, Resend, OpenAI, Google Maps, PostHog) into the project. Writes ready-to-use files and returns env vars the user must add as secrets.",
            inputSchema: z.object({
              slug: z.enum(["stripe-checkout", "resend-email", "openai-chat", "google-maps", "posthog-analytics"]),
              overwrite: z.boolean().default(false),
            }),
            execute: async ({ slug, overwrite }) => {
              const { getIntegration } = await import("@/lib/integrations.catalog");
              const integration = getIntegration(slug);
              if (!integration) return { ok: false, error: `Unknown integration: ${slug}` };
              const written: string[] = [];
              const skipped: string[] = [];
              for (const f of integration.files) {
                const { data: ex } = await supabase.from("project_files")
                  .select("id, version").eq("project_id", projectId).eq("path", f.path).maybeSingle();
                if (ex && !overwrite) { skipped.push(f.path); continue; }
                if (ex) {
                  const { error } = await supabase.from("project_files")
                    .update({ content: f.content, version: ex.version + 1 }).eq("id", ex.id);
                  if (error) return { ok: false, error: error.message };
                } else {
                  const { error } = await supabase.from("project_files")
                    .insert({ project_id: projectId, path: f.path, content: f.content });
                  if (error) return { ok: false, error: error.message };
                }
                written.push(f.path);
              }
              return { ok: true, slug, name: integration.name, written, skipped, envVars: integration.envVars };
            },
          }),
        };

        // Inject current file index into the system prompt so the model has context
        const { data: fileIndex } = await supabase
          .from("project_files")
          .select("path, version")
          .eq("project_id", projectId)
          .order("path")
          .limit(200);
        const indexBlock = fileIndex && fileIndex.length > 0
          ? `\n\nCURRENT PROJECT FILES (${fileIndex.length}):\n${fileIndex.map((f) => `- ${f.path} (v${f.version})`).join("\n")}`
          : "\n\nCURRENT PROJECT FILES: (empty — start by creating /App.tsx)";

        // RAG: top-20 vector hits → diversity rerank → top-6 into prompt
        let knowledgeBlock = "";
        try {
          const userText = (lastMsg?.parts ?? [])
            .filter((p): p is { type: "text"; text: string } => (p as { type?: string }).type === "text")
            .map((p) => p.text).join(" ").slice(0, 2000);
          if (userText && userText.trim().length > 8) {
            const { embed } = await import("ai");
            const { embedding } = await embed({
              model: gateway.textEmbeddingModel("google/text-embedding-004"),
              value: userText,
            });
            const { data: hits } = await supabaseAdmin.rpc("match_knowledge", {
              _project_id: projectId,
              _user_id: userId,
              _query: embedding as unknown as string,
              _k: 20,
            });
            if (hits && hits.length > 0) {
              // Diversity rerank: penalize repeats from same source_path so a single
              // file can't dominate the window. Top-6 wins.
              const seen = new Map<string, number>();
              const reranked = hits
                .map((h) => {
                  const repeats = seen.get(h.source_path) ?? 0;
                  seen.set(h.source_path, repeats + 1);
                  const penalty = repeats * 0.12;
                  return { h, score: h.similarity - penalty };
                })
                .sort((a, b) => b.score - a.score)
                .slice(0, 6)
                .map(({ h }) => h);
              knowledgeBlock = "\n\nRELEVANT KNOWLEDGE (retrieved + reranked from project KB):\n" +
                reranked.map((h, i) => `[#${i + 1} ${h.source_type}:${h.source_path} sim=${h.similarity.toFixed(2)}]\n${h.content.slice(0, 800)}`).join("\n\n");
            }
          }
        } catch (e) {
          console.warn("[chat] knowledge retrieval skipped", e);
        }

        // Long-term user preferences (cross-project memory)
        let prefsBlock = "";
        try {
          const { data: prefs } = await supabase
            .from("user_preferences")
            .select("notes")
            .eq("user_id", userId)
            .maybeSingle();
          const notes = (prefs?.notes ?? "").trim();
          if (notes.length > 0) {
            prefsBlock = `\n\nUSER PREFERENCES (apply across all projects):\n${notes.slice(0, 4000)}`;
          }
        } catch (e) {
          console.warn("[chat] preferences fetch skipped", e);
        }

        const systemPrompt = SYSTEM_PROMPT_BASE + prefsBlock + indexBlock + knowledgeBlock;

        const result = streamText({
          model,
          system: systemPrompt,
          messages: await convertToModelMessages(messages as UIMessage[]),
          tools,
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
          onFinish: async ({ responseMessage }) => {
            try {
              const parts = responseMessage.parts as Array<{ type: string }>;
              const toolCalls = parts.filter((p) => p.type?.startsWith("tool-")).length;
              const responseChars = JSON.stringify(parts).length;
              await Promise.all([
                supabase.from("messages").insert({
                  project_id: projectId, user_id: userId, role: "assistant",
                  parts: responseMessage.parts as unknown as Database["public"]["Tables"]["messages"]["Insert"]["parts"],
                }),
                supabase.from("ai_usage").insert({
                  project_id: projectId, user_id: userId, model: modelId,
                  prompt_chars: promptChars, response_chars: responseChars, tool_calls: toolCalls,
                }),
              ]);
            } catch (e) {
              console.error("[chat] persist failed", e);
            }
          },
        });
      },
    },
  },
});
