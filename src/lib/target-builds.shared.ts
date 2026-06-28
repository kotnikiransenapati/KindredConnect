// Phase D — deterministic cross-platform target planner.
// Pure functions only; safe to import from client and server.
import { hashIr, type Ir } from "./ir.shared";

export type BuildTarget = "web" | "mobile";
export type TargetStatus = "planned" | "configured" | "ready" | "blocked";

export type TargetProfile = {
  target: BuildTarget;
  displayName: string;
  description: string;
  outputKinds: string[];
  requiredAdapters: string[];
  // TanStack server function serializability rejects `unknown` in returned DTOs.
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
];

export type TargetAdapterConfig = { category: string; provider: string; status: string; score?: number };
export type TargetGeneratedFile = { path: string; content: string; language: "ts" | "json" | "md" | "yml" | "dockerfile" };

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
  return target === "web" ? webFiles(manifest) : mobileFiles(manifest, ir);
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

function stableJson(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sortDeep(nested)]));
}