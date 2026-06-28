// Phase E1 — Deploy adapter catalog and deterministic plan synthesis.
// Pure shared module: safe to import from client and server.
import type { BuildTarget } from "./target-builds.shared";

export type DeployProvider =
  | "vercel" | "cloudflare-pages" | "cloudflare-workers" | "netlify"
  | "fly-io" | "render" | "railway"
  | "aws-amplify" | "aws-ecs" | "gcp-cloud-run" | "azure-static-web-apps"
  | "docker-compose" | "kubernetes-helm" | "self-host";

export type DeployActionKind = "plan" | "apply" | "rollback" | "status" | "logs";

export type DeployAdapterCatalogEntry = {
  provider: DeployProvider;
  displayName: string;
  supportedTargets: BuildTarget[];
  capabilities: { multiRegion: boolean; canary: boolean; previewEnvironments: boolean; selfHost: boolean; managedTls: boolean; logsRetentionDays: number };
  defaultConfig: Record<string, any>;
  credentialKeys: string[];
  // Estimated cents per million requests at baseline tier — used for plan cost estimates.
  estimatedCostPerMillionCents: number;
};

export const DEPLOY_ADAPTERS: DeployAdapterCatalogEntry[] = [
  { provider: "vercel", displayName: "Vercel", supportedTargets: ["web", "pwa", "widget"], capabilities: { multiRegion: true, canary: true, previewEnvironments: true, selfHost: false, managedTls: true, logsRetentionDays: 30 }, defaultConfig: { framework: "tanstack-start", region: "iad1" }, credentialKeys: ["VERCEL_TOKEN", "VERCEL_PROJECT_ID"], estimatedCostPerMillionCents: 4000 },
  { provider: "cloudflare-pages", displayName: "Cloudflare Pages", supportedTargets: ["web", "pwa", "widget"], capabilities: { multiRegion: true, canary: false, previewEnvironments: true, selfHost: false, managedTls: true, logsRetentionDays: 7 }, defaultConfig: { branch: "main" }, credentialKeys: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"], estimatedCostPerMillionCents: 50 },
  { provider: "cloudflare-workers", displayName: "Cloudflare Workers", supportedTargets: ["web", "widget"], capabilities: { multiRegion: true, canary: true, previewEnvironments: true, selfHost: false, managedTls: true, logsRetentionDays: 7 }, defaultConfig: { compatibilityFlags: ["nodejs_compat"] }, credentialKeys: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"], estimatedCostPerMillionCents: 50 },
  { provider: "netlify", displayName: "Netlify", supportedTargets: ["web", "pwa", "widget"], capabilities: { multiRegion: false, canary: true, previewEnvironments: true, selfHost: false, managedTls: true, logsRetentionDays: 14 }, defaultConfig: { buildCmd: "bun run build", publishDir: "dist" }, credentialKeys: ["NETLIFY_AUTH_TOKEN", "NETLIFY_SITE_ID"], estimatedCostPerMillionCents: 2500 },
  { provider: "fly-io", displayName: "Fly.io", supportedTargets: ["web"], capabilities: { multiRegion: true, canary: true, previewEnvironments: false, selfHost: false, managedTls: true, logsRetentionDays: 7 }, defaultConfig: { primaryRegion: "iad", machines: 2 }, credentialKeys: ["FLY_API_TOKEN"], estimatedCostPerMillionCents: 1500 },
  { provider: "render", displayName: "Render", supportedTargets: ["web"], capabilities: { multiRegion: false, canary: false, previewEnvironments: true, selfHost: false, managedTls: true, logsRetentionDays: 14 }, defaultConfig: { plan: "starter" }, credentialKeys: ["RENDER_API_KEY"], estimatedCostPerMillionCents: 1800 },
  { provider: "railway", displayName: "Railway", supportedTargets: ["web"], capabilities: { multiRegion: false, canary: false, previewEnvironments: true, selfHost: false, managedTls: true, logsRetentionDays: 7 }, defaultConfig: {}, credentialKeys: ["RAILWAY_TOKEN"], estimatedCostPerMillionCents: 2000 },
  { provider: "aws-amplify", displayName: "AWS Amplify Hosting", supportedTargets: ["web", "pwa"], capabilities: { multiRegion: true, canary: false, previewEnvironments: true, selfHost: false, managedTls: true, logsRetentionDays: 30 }, defaultConfig: { region: "us-east-1" }, credentialKeys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"], estimatedCostPerMillionCents: 3000 },
  { provider: "aws-ecs", displayName: "AWS ECS Fargate", supportedTargets: ["web"], capabilities: { multiRegion: true, canary: true, previewEnvironments: false, selfHost: false, managedTls: true, logsRetentionDays: 30 }, defaultConfig: { cluster: "foundry", cpu: 512, memory: 1024 }, credentialKeys: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_REGION"], estimatedCostPerMillionCents: 2500 },
  { provider: "gcp-cloud-run", displayName: "GCP Cloud Run", supportedTargets: ["web"], capabilities: { multiRegion: true, canary: true, previewEnvironments: false, selfHost: false, managedTls: true, logsRetentionDays: 30 }, defaultConfig: { region: "us-central1", maxInstances: 50 }, credentialKeys: ["GOOGLE_APPLICATION_CREDENTIALS_JSON", "GCP_PROJECT_ID"], estimatedCostPerMillionCents: 1200 },
  { provider: "azure-static-web-apps", displayName: "Azure Static Web Apps", supportedTargets: ["web", "pwa", "widget"], capabilities: { multiRegion: true, canary: false, previewEnvironments: true, selfHost: false, managedTls: true, logsRetentionDays: 30 }, defaultConfig: { sku: "Standard" }, credentialKeys: ["AZURE_STATIC_WEB_APPS_API_TOKEN"], estimatedCostPerMillionCents: 1500 },
  { provider: "docker-compose", displayName: "Docker Compose (self-host)", supportedTargets: ["web", "desktop"], capabilities: { multiRegion: false, canary: false, previewEnvironments: false, selfHost: true, managedTls: false, logsRetentionDays: 1 }, defaultConfig: { composeFile: "docker-compose.yml" }, credentialKeys: [], estimatedCostPerMillionCents: 0 },
  { provider: "kubernetes-helm", displayName: "Kubernetes (Helm)", supportedTargets: ["web"], capabilities: { multiRegion: true, canary: true, previewEnvironments: true, selfHost: true, managedTls: true, logsRetentionDays: 14 }, defaultConfig: { namespace: "foundry", replicas: 3, chartVersion: "0.1.0" }, credentialKeys: ["KUBECONFIG"], estimatedCostPerMillionCents: 800 },
  { provider: "self-host", displayName: "Self-host (Compose + Terraform export)", supportedTargets: ["web", "desktop"], capabilities: { multiRegion: false, canary: false, previewEnvironments: false, selfHost: true, managedTls: false, logsRetentionDays: 0 }, defaultConfig: { exportFormat: "compose+terraform" }, credentialKeys: [], estimatedCostPerMillionCents: 0 },
];

export function findDeployAdapter(provider: DeployProvider) {
  return DEPLOY_ADAPTERS.find((a) => a.provider === provider);
}

export type DeployPlanStep = { key: string; name: string; description: string; estimatedSeconds: number; reversible: boolean };
export type DeployPlan = {
  provider: DeployProvider;
  target: BuildTarget;
  environment: string;
  irHash: string;
  steps: DeployPlanStep[];
  estimatedDurationSeconds: number;
  estimatedCostCents: number;
  warnings: string[];
  rollbackStrategy: "immutable-swap" | "blue-green" | "in-place" | "manual";
  generatedAt: string;
};

export function synthesizeDeployPlan(input: {
  provider: DeployProvider;
  target: BuildTarget;
  environment: string;
  irHash: string;
  trafficPercent?: number;
  region?: string;
}): DeployPlan {
  const adapter = findDeployAdapter(input.provider);
  if (!adapter) throw new Error(`Unknown deploy provider: ${input.provider}`);
  if (!adapter.supportedTargets.includes(input.target)) {
    throw new Error(`Provider ${input.provider} does not support target ${input.target}`);
  }
  const traffic = Math.max(0, Math.min(100, input.trafficPercent ?? 100));
  const warnings: string[] = [];
  if (!input.irHash) warnings.push("No IR hash supplied — plan will not be reproducible.");
  if (traffic < 100 && !adapter.capabilities.canary) warnings.push(`Provider ${input.provider} does not support canary; traffic shift will be all-or-nothing.`);
  if (input.environment === "production" && !adapter.capabilities.managedTls) warnings.push("Provider does not manage TLS — supply certificates separately.");

  const steps: DeployPlanStep[] = [
    { key: "validate", name: "Validate inputs", description: `Verify credentials and target=${input.target}`, estimatedSeconds: 4, reversible: true },
    { key: "build", name: "Build artifact", description: `Produce ${input.target} artifact from IR ${input.irHash.slice(0, 12) || "(unset)"}`, estimatedSeconds: 90, reversible: true },
    { key: "upload", name: "Upload artifact", description: `Push to ${adapter.displayName}${input.region ? ` (${input.region})` : ""}`, estimatedSeconds: 30, reversible: true },
    { key: "provision", name: "Provision routes", description: "Allocate domains, TLS, and runtime configuration", estimatedSeconds: 25, reversible: true },
  ];
  if (adapter.capabilities.canary && traffic < 100) {
    steps.push({ key: "canary-shift", name: `Canary ${traffic}%`, description: `Shift ${traffic}% of traffic to the new revision`, estimatedSeconds: 60, reversible: true });
  }
  steps.push({ key: "promote", name: "Promote release", description: "Mark release as the active revision", estimatedSeconds: 8, reversible: true });
  steps.push({ key: "verify", name: "Verify health", description: "Run smoke checks and emit deploy event", estimatedSeconds: 20, reversible: false });

  const estimatedDurationSeconds = steps.reduce((sum, step) => sum + step.estimatedSeconds, 0);
  // Cost estimate assumes 1M requests/month baseline — UI can recalibrate later.
  const estimatedCostCents = Math.round((adapter.estimatedCostPerMillionCents * traffic) / 100);
  const rollbackStrategy: DeployPlan["rollbackStrategy"] =
    adapter.capabilities.canary ? "blue-green" :
    adapter.capabilities.selfHost ? "manual" :
    adapter.provider.startsWith("aws-") || adapter.provider.startsWith("gcp-") ? "blue-green" :
    "immutable-swap";

  return {
    provider: input.provider,
    target: input.target,
    environment: input.environment,
    irHash: input.irHash,
    steps,
    estimatedDurationSeconds,
    estimatedCostCents,
    warnings,
    rollbackStrategy,
    generatedAt: new Date().toISOString(),
  };
}

export function summarizeAdapterHealth(rows: Array<{ provider: string; status: string }>): { healthy: number; degraded: number; disabled: number; score: number } {
  let healthy = 0, degraded = 0, disabled = 0;
  for (const r of rows) {
    if (r.status === "configured") healthy++;
    else if (r.status === "degraded" || r.status === "pending") degraded++;
    else disabled++;
  }
  const total = rows.length || 1;
  const score = Math.round(((healthy * 100) + (degraded * 50)) / total);
  return { healthy, degraded, disabled, score };
}
