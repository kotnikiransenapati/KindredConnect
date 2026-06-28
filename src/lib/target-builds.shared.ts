// Phase D — deterministic cross-platform target planner.
// Pure functions only; safe to import from client and server.
import { hashIr, type Ir } from "./ir.shared";

export type BuildTarget = "web" | "mobile" | "desktop" | "pwa" | "widget";
export type TargetStatus = "planned" | "configured" | "ready" | "blocked";

export type TargetProfile = {
  target: BuildTarget;
  displayName: string;
  description: string;
  outputKinds: string[];
  requiredAdapters: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  defaultConfig: Record<string, any>;
  pipelineStages: Array<{ key: string; name: string; dependsOn?: string[] }>;
};

export const TARGET_PROFILES: TargetProfile[] = [
  {
    target: "web",
    displayName: "Web Target",
    description: "Generates hostable web artifacts for SSR, SSG, SPA, Docker, and adapter-specific deploy bundles.",
    outputKinds: ["ssr", "ssg", "spa", "docker", "cloud-adapter"],
    requiredAdapters: ["auth", "database", "storage", "functions", "ai", "payments", "email", "push"],
    defaultConfig: { framework: "tanstack-start", renderMode: "ssr", docker: true, staticExport: true, nodeVersion: 20 },
    pipelineStages: [
      { key: "resolve-runtime", name: "Resolve runtime adapters" },
      { key: "emit-web", name: "Emit TanStack web app", dependsOn: ["resolve-runtime"] },
      { key: "typecheck", name: "Strict typecheck", dependsOn: ["emit-web"] },
      { key: "bundle", name: "Build SSR/SSG/SPA artifacts", dependsOn: ["typecheck"] },
      { key: "package", name: "Package Docker and cloud bundles", dependsOn: ["bundle"] },
    ],
  },
  {
    target: "mobile",
    displayName: "iOS & Android Target",
    description: "Generates Expo/React Native plus Capacitor fallback artifacts, native permissions, OTA metadata, and signed runner inputs.",
    outputKinds: ["expo", "react-native", "capacitor", "ipa", "aab", "ota"],
    requiredAdapters: ["auth", "database", "storage", "functions", "push"],
    defaultConfig: { framework: "expo-rn", expoSdk: 54, rnVersion: "0.78", capacitorFallback: true, ota: true, minIos: "15.0", minAndroidSdk: 26 },
    pipelineStages: [
      { key: "resolve-runtime", name: "Resolve runtime adapters" },
      { key: "emit-native", name: "Emit Expo and Capacitor source", dependsOn: ["resolve-runtime"] },
      { key: "permissions", name: "Generate native permission manifests", dependsOn: ["emit-native"] },
      { key: "ota", name: "Prepare OTA update channel", dependsOn: ["permissions"] },
      { key: "package", name: "Package runner workspace", dependsOn: ["ota"] },
    ],
  },
  {
    target: "desktop",
    displayName: "Desktop (Tauri)",
    description: "Generates a Tauri 2 Rust shell with the same React UI, native menus, tray, notifications, and signed installers for Windows, macOS, and Linux.",
    outputKinds: ["tauri", "msi", "dmg", "appimage", "deb"],
    requiredAdapters: ["auth", "database", "storage", "functions"],
    defaultConfig: { framework: "tauri", tauriVersion: 2, windowWidth: 1280, windowHeight: 800, autoUpdater: true, systemTray: true, targets: ["windows", "macos", "linux"] },
    pipelineStages: [
      { key: "resolve-runtime", name: "Resolve runtime adapters" },
      { key: "emit-ui", name: "Emit shared React UI", dependsOn: ["resolve-runtime"] },
      { key: "emit-tauri", name: "Emit Rust shell + tauri.conf", dependsOn: ["emit-ui"] },
      { key: "sign", name: "Sign with provided certs" , dependsOn: ["emit-tauri"] },
      { key: "package", name: "Package per-OS installers", dependsOn: ["sign"] },
    ],
  },
  {
    target: "pwa",
    displayName: "Progressive Web App",
    description: "Installable, offline-first PWA with Workbox service worker, VAPID web push, share target, and file handlers.",
    outputKinds: ["manifest", "service-worker", "offline-shell", "share-target"],
    requiredAdapters: ["auth", "database", "storage", "push"],
    defaultConfig: { manifestName: "", themeColor: "#0b0b14", backgroundColor: "#0b0b14", display: "standalone", offlineShell: true, shareTarget: true, fileHandlers: false },
    pipelineStages: [
      { key: "resolve-runtime", name: "Resolve runtime adapters" },
      { key: "manifest", name: "Generate web app manifest", dependsOn: ["resolve-runtime"] },
      { key: "service-worker", name: "Build Workbox service worker", dependsOn: ["manifest"] },
      { key: "offline", name: "Precache offline shell", dependsOn: ["service-worker"] },
      { key: "package", name: "Bundle PWA assets", dependsOn: ["offline"] },
    ],
  },
  {
    target: "widget",
    displayName: "Embeddable Widget",
    description: "Single <script> tag that mounts the app inside a host page using a shadow DOM, talking to the same backend adapters via signed JWT.",
    outputKinds: ["umd", "esm", "embed-snippet", "shadow-dom"],
    requiredAdapters: ["auth", "database", "functions"],
    defaultConfig: { mountSelector: "[data-foundry-widget]", isolation: "shadow", csp: "strict", themeMode: "inherit", maxBundleKb: 180 },
    pipelineStages: [
      { key: "resolve-runtime", name: "Resolve runtime adapters" },
      { key: "emit-widget", name: "Emit shadow-DOM entry", dependsOn: ["resolve-runtime"] },
      { key: "bundle", name: "Bundle UMD + ESM", dependsOn: ["emit-widget"] },
      { key: "snippet", name: "Emit embed snippet", dependsOn: ["bundle"] },
    ],
  },
];

export type TargetAdapterConfig = { category: string; provider: string; status: string; score?: number };
export type TargetGeneratedFile = { path: string; content: string; language: "ts" | "json" | "md" | "yml" | "dockerfile" | "html" | "rust" | "toml" };

export function targetProfile(target: BuildTarget) {
  return TARGET_PROFILES.find((profile) => profile.target === target) ?? TARGET_PROFILES[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function targetReadiness(target: BuildTarget, adapters: TargetAdapterConfig[], config: Record<string, any> = {}) {
  const profile = targetProfile(target);
  const byCategory = new Map(adapters.map((adapter) => [adapter.category, adapter]));
  const missingAdapters = profile.requiredAdapters.filter((category) => !byCategory.has(category));
  const degradedAdapters = profile.requiredAdapters
    .map((category) => byCategory.get(category))
    .filter((adapter): adapter is TargetAdapterConfig => !!adapter && !["healthy", "configured"].includes(adapter.status));
  const configKeys = Object.keys({ ...profile.defaultConfig, ...config }).sort();
  const avgAdapterScore = profile.requiredAdapters.length
    ? Math.round(profile.requiredAdapters.reduce((sum, category) => sum + (byCategory.get(category)?.score ?? 0), 0) / profile.requiredAdapters.length)
    : 0;
  const score = Math.max(0, Math.min(100, avgAdapterScore - missingAdapters.length * 10 - degradedAdapters.length * 8));
  return {
    target,
    score,
    missingAdapters,
    degradedAdapters: degradedAdapters.map((adapter) => ({ category: adapter.category, provider: adapter.provider, status: adapter.status })),
    configKeys,
    productionReady: missingAdapters.length === 0 && degradedAdapters.length === 0 && score >= 70,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateTargetFiles(ir: Ir, target: BuildTarget, adapters: TargetAdapterConfig[], config: Record<string, any> = {}): TargetGeneratedFile[] {
  const profile = targetProfile(target);
  const mergedConfig = { ...profile.defaultConfig, ...config };
  const readiness = targetReadiness(target, adapters, mergedConfig);
  const irHash = hashIr(ir);
  const manifest = {
    target,
    targetVersion: 1,
    project: ir.name,
    irHash,
    outputKinds: profile.outputKinds,
    config: mergedConfig,
    adapters: adapters.map((adapter) => ({ category: adapter.category, provider: adapter.provider, status: adapter.status })).sort((a, b) => a.category.localeCompare(b.category)),
    readiness,
    pipelineStages: profile.pipelineStages,
  };
  switch (target) {
    case "web": return webFiles(manifest);
    case "mobile": return mobileFiles(manifest, ir);
    case "desktop": return desktopFiles(manifest, ir, mergedConfig);
    case "pwa": return pwaFiles(manifest, ir, mergedConfig);
    case "widget": return widgetFiles(manifest, ir, mergedConfig);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function webFiles(manifest: Record<string, any>): TargetGeneratedFile[] {
  return [
    { path: "targets/web/foundry.target.json", language: "json", content: stableJson(manifest) + "\n" },
    { path: "targets/web/Dockerfile", language: "dockerfile", content: `FROM oven/bun:1 AS deps\nWORKDIR /app\nCOPY . .\nRUN bun install --frozen-lockfile\nRUN bun run build\n\nFROM gcr.io/distroless/nodejs20-debian12\nWORKDIR /app\nCOPY --from=deps /app/.output ./.output\nENV NODE_ENV=production\nCMD [".output/server/index.mjs"]\n` },
    { path: "targets/web/deploy.pipeline.yml", language: "yml", content: `target: web\nstages:\n  - resolve-runtime\n  - emit-web\n  - typecheck\n  - bundle\n  - package\nartifacts:\n  - dist/**\n  - .output/**\n  - targets/web/Dockerfile\n` },
    { path: "targets/web/README.md", language: "md", content: `# Web Target\n\nHostable outputs include SSR server bundle, static export, SPA fallback, Docker image context, and provider-specific deploy adapters. Generated code imports backend services only from \`@app/runtime\`.\n` },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mobileFiles(manifest: Record<string, any>, ir: Ir): TargetGeneratedFile[] {
  const appName = ir.name.replace(/[^a-z0-9 ]/gi, "").trim() || "Foundry App";
  return [
    { path: "targets/mobile/foundry.target.json", language: "json", content: stableJson(manifest) + "\n" },
    { path: "targets/mobile/app.config.ts", language: "ts", content: `export default {\n  name: ${JSON.stringify(appName)},\n  slug: ${JSON.stringify(appName.toLowerCase().replace(/\s+/g, "-"))},\n  scheme: "foundry",\n  ios: { supportsTablet: true, bundleIdentifier: "com.foundry.generated" },\n  android: { package: "com.foundry.generated", adaptiveIcon: { backgroundColor: "#0b0b14" } },\n  extra: { runtimeContract: "@app/runtime", generatedBy: "foundry" },\n};\n` },
    { path: "targets/mobile/capacitor.config.ts", language: "ts", content: `import type { CapacitorConfig } from "@capacitor/cli";\n\nconst config: CapacitorConfig = {\n  appId: "com.foundry.generated",\n  appName: ${JSON.stringify(appName)},\n  webDir: "dist",\n  server: { androidScheme: "https" },\n};\nexport default config;\n` },
    { path: "targets/mobile/permissions.json", language: "json", content: stableJson({ ios: ["camera", "notifications", "photo-library"], android: ["POST_NOTIFICATIONS", "CAMERA"], generatedFromAdapters: true }) + "\n" },
    { path: "targets/mobile/README.md", language: "md", content: `# iOS & Android Target\n\nThis target emits Expo/React Native source metadata, Capacitor fallback config, native permission manifests, OTA channel metadata, and runner inputs for signed IPA/AAB production builds.\n` },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function desktopFiles(manifest: Record<string, any>, ir: Ir, cfg: Record<string, any>): TargetGeneratedFile[] {
  const appName = ir.name.replace(/[^a-z0-9 ]/gi, "").trim() || "Foundry App";
  const identifier = `com.foundry.${appName.toLowerCase().replace(/\s+/g, "")}`;
  const tauriConf = {
    productName: appName,
    version: "0.1.0",
    identifier,
    build: { beforeBuildCommand: "bun run build", beforeDevCommand: "bun run dev", devUrl: "http://localhost:8080", frontendDist: "../dist" },
    app: {
      windows: [{ title: appName, width: cfg.windowWidth ?? 1280, height: cfg.windowHeight ?? 800, resizable: true, fullscreen: false }],
      security: { csp: "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'" },
      trayIcon: cfg.systemTray ? { iconPath: "icons/tray.png", iconAsTemplate: true } : undefined,
    },
    bundle: { active: true, targets: cfg.targets ?? ["msi", "dmg", "appimage"], icon: ["icons/icon.icns", "icons/icon.ico", "icons/icon.png"], category: "Productivity", shortDescription: appName, longDescription: appName },
    plugins: cfg.autoUpdater ? { updater: { active: true, dialog: true, pubkey: "REPLACE_WITH_PUBKEY", endpoints: ["https://updates.foundry.dev/{{target}}/{{current_version}}"] } } : {},
  };
  return [
    { path: "targets/desktop/foundry.target.json", language: "json", content: stableJson(manifest) + "\n" },
    { path: "targets/desktop/src-tauri/tauri.conf.json", language: "json", content: stableJson(tauriConf) + "\n" },
    { path: "targets/desktop/src-tauri/Cargo.toml", language: "toml", content: `[package]\nname = "${appName.toLowerCase().replace(/\s+/g, "-")}"\nversion = "0.1.0"\nedition = "2021"\n\n[build-dependencies]\ntauri-build = { version = "2", features = [] }\n\n[dependencies]\ntauri = { version = "2", features = ["tray-icon"] }\ntauri-plugin-shell = "2"\ntauri-plugin-notification = "2"\nserde = { version = "1", features = ["derive"] }\nserde_json = "1"\n` },
    { path: "targets/desktop/src-tauri/src/main.rs", language: "rust", content: `// Foundry-generated Tauri shell\n#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]\n\nfn main() {\n  tauri::Builder::default()\n    .plugin(tauri_plugin_shell::init())\n    .plugin(tauri_plugin_notification::init())\n    .setup(|_app| Ok(()))\n    .run(tauri::generate_context!())\n    .expect("foundry: error running tauri shell");\n}\n` },
    { path: "targets/desktop/src-tauri/build.rs", language: "rust", content: `fn main() { tauri_build::build() }\n` },
    { path: "targets/desktop/deploy.pipeline.yml", language: "yml", content: `target: desktop\nstages:\n  - resolve-runtime\n  - emit-ui\n  - emit-tauri\n  - sign\n  - package\nartifacts:\n  - src-tauri/target/release/bundle/**\n` },
    { path: "targets/desktop/README.md", language: "md", content: `# Desktop (Tauri 2)\n\nShared React UI compiled into a Rust-shell binary (~8MB) with native menus, tray, notifications, and auto-updater. Bundle targets: ${(cfg.targets ?? []).join(", ")}.\n` },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pwaFiles(manifest: Record<string, any>, ir: Ir, cfg: Record<string, any>): TargetGeneratedFile[] {
  const name = cfg.manifestName || ir.name || "Foundry App";
  const webManifest = {
    name,
    short_name: name.slice(0, 12),
    start_url: "/",
    scope: "/",
    display: cfg.display ?? "standalone",
    background_color: cfg.backgroundColor ?? "#0b0b14",
    theme_color: cfg.themeColor ?? "#0b0b14",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
    share_target: cfg.shareTarget ? { action: "/share-target", method: "POST", enctype: "multipart/form-data", params: { title: "title", text: "text", url: "url", files: [{ name: "media", accept: ["image/*", "video/*"] }] } } : undefined,
    file_handlers: cfg.fileHandlers ? [{ action: "/open", accept: { "text/plain": [".txt", ".md"] } }] : undefined,
  };
  return [
    { path: "targets/pwa/foundry.target.json", language: "json", content: stableJson(manifest) + "\n" },
    { path: "targets/pwa/manifest.webmanifest", language: "json", content: stableJson(webManifest) + "\n" },
    { path: "targets/pwa/service-worker.ts", language: "ts", content: `// Foundry-generated Workbox service worker\nimport { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";\nimport { registerRoute, NavigationRoute } from "workbox-routing";\nimport { NetworkFirst, StaleWhileRevalidate, CacheFirst } from "workbox-strategies";\nimport { ExpirationPlugin } from "workbox-expiration";\n\ndeclare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };\n\ncleanupOutdatedCaches();\nprecacheAndRoute(self.__WB_MANIFEST);\nregisterRoute(new NavigationRoute(new NetworkFirst({ cacheName: "foundry-shell", networkTimeoutSeconds: 3 })));\nregisterRoute(({ request }) => request.destination === "image", new CacheFirst({ cacheName: "foundry-images", plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 })] }));\nregisterRoute(({ request }) => ["style", "script", "worker"].includes(request.destination), new StaleWhileRevalidate({ cacheName: "foundry-assets" }));\n\nself.addEventListener("push", (event) => {\n  if (!event.data) return;\n  const payload = event.data.json();\n  event.waitUntil(self.registration.showNotification(payload.title ?? "Update", { body: payload.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: payload.data }));\n});\nself.addEventListener("notificationclick", (event) => {\n  event.notification.close();\n  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? "/"));\n});\n` },
    { path: "targets/pwa/offline.html", language: "html", content: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${name} — Offline</title><style>body{font-family:system-ui;background:${cfg.backgroundColor};color:#fff;display:grid;place-items:center;height:100vh;margin:0}main{text-align:center;max-width:32rem;padding:2rem}</style></head><body><main><h1>You're offline</h1><p>${name} will sync once you're back online.</p></main></body></html>\n` },
    { path: "targets/pwa/deploy.pipeline.yml", language: "yml", content: `target: pwa\nstages:\n  - resolve-runtime\n  - manifest\n  - service-worker\n  - offline\n  - package\nartifacts:\n  - dist/manifest.webmanifest\n  - dist/sw.js\n  - dist/offline.html\n` },
    { path: "targets/pwa/README.md", language: "md", content: `# Progressive Web App\n\nInstallable on iOS/Android/Desktop. Includes Workbox service worker, offline shell, VAPID push subscription handler${cfg.shareTarget ? ", and Web Share Target" : ""}.\n` },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function widgetFiles(manifest: Record<string, any>, ir: Ir, cfg: Record<string, any>): TargetGeneratedFile[] {
  const name = (ir.name || "FoundryWidget").replace(/[^a-z0-9]/gi, "");
  const globalVar = name.charAt(0).toUpperCase() + name.slice(1);
  return [
    { path: "targets/widget/foundry.target.json", language: "json", content: stableJson(manifest) + "\n" },
    { path: "targets/widget/widget.entry.ts", language: "ts", content: `// Foundry-generated embeddable widget entry\nimport { createRoot, type Root } from "react-dom/client";\nimport { StrictMode } from "react";\nimport WidgetApp from "./WidgetApp";\n\ntype WidgetOptions = { token?: string; theme?: "light" | "dark" | "inherit"; baseUrl?: string };\nconst MOUNTED = new WeakMap<Element, Root>();\n\nfunction mount(host: Element, options: WidgetOptions = {}) {\n  if (MOUNTED.has(host)) return;\n  const root = ${cfg.isolation === "shadow" ? `(host as HTMLElement).attachShadow ? (host as HTMLElement).attachShadow({ mode: "open" }) : host` : "host"};\n  const container = document.createElement("div");\n  container.setAttribute("data-foundry-widget-root", "");\n  root.appendChild(container);\n  const reactRoot = createRoot(container);\n  reactRoot.render(<StrictMode><WidgetApp {...options} /></StrictMode>);\n  MOUNTED.set(host, reactRoot);\n}\n\nfunction unmount(host: Element) {\n  const root = MOUNTED.get(host);\n  if (root) { root.unmount(); MOUNTED.delete(host); }\n}\n\nfunction autoMount() {\n  document.querySelectorAll(${JSON.stringify(cfg.mountSelector ?? "[data-foundry-widget]")}).forEach((host) => {\n    const token = host.getAttribute("data-token") ?? undefined;\n    const theme = (host.getAttribute("data-theme") as WidgetOptions["theme"]) ?? "inherit";\n    mount(host, { token, theme });\n  });\n}\n\nif (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoMount);\nelse autoMount();\n\n(globalThis as any).${globalVar} = { mount, unmount, version: "0.1.0" };\nexport { mount, unmount };\n` },
    { path: "targets/widget/WidgetApp.tsx", language: "ts", content: `// Foundry-generated widget shell. Talks to backend via @app/runtime.\nimport { useEffect, useState } from "react";\nimport { auth } from "@app/runtime";\n\nexport default function WidgetApp({ token, theme = "inherit" }: { token?: string; theme?: "light" | "dark" | "inherit" }) {\n  const [ready, setReady] = useState(false);\n  useEffect(() => { (async () => { if (token) await auth.exchangeWidgetToken?.(token); setReady(true); })(); }, [token]);\n  return (<div data-theme={theme} style={{ font: "14px/1.4 system-ui", padding: 16 }}>{ready ? "${ir.name} widget ready." : "Loading…"}</div>);\n}\n` },
    { path: "targets/widget/embed.snippet.html", language: "html", content: `<!-- Embed Foundry widget on any page -->\n<div data-foundry-widget data-token="REPLACE_WITH_PUBLIC_TOKEN" data-theme="inherit"></div>\n<script async src="https://cdn.foundry.dev/widget/${name.toLowerCase()}.umd.js"></script>\n` },
    { path: "targets/widget/deploy.pipeline.yml", language: "yml", content: `target: widget\nstages:\n  - resolve-runtime\n  - emit-widget\n  - bundle\n  - snippet\nartifacts:\n  - dist/widget/*.umd.js\n  - dist/widget/*.esm.js\n  - dist/widget/embed.snippet.html\nbudget:\n  maxKb: ${cfg.maxBundleKb ?? 180}\n` },
    { path: "targets/widget/README.md", language: "md", content: `# Embeddable Widget\n\nDrop-in <script> + <div data-foundry-widget>. Renders inside ${cfg.isolation === "shadow" ? "an isolated shadow DOM" : "the host DOM"}, talks to the same backend adapters as web/mobile. Bundle budget ${cfg.maxBundleKb ?? 180} KB.\n` },
  ];
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sortDeep(nested)]));
}
