// Foundry v3 Phase H1/H2 — production blueprint graph and verified artifact matrix.
// Pure deterministic logic only: no IO, no provider SDKs, safe to unit-test.

export type TargetSurface = "web" | "ios" | "android" | "pwa" | "desktop" | "widget" | "backend";
export type StageRisk = "low" | "medium" | "high";

export interface BlueprintPersona {
  id: string;
  name: string;
  goal: string;
  successMetric: string;
}

export interface BlueprintSurface {
  target: TargetSurface;
  experience: string;
  criticalFlows: string[];
}

export interface BlueprintEntity {
  name: string;
  fields: string[];
  policies: string[];
}

export interface ProductionBlueprint {
  name: string;
  summary: string;
  surfaces: BlueprintSurface[];
  personas: BlueprintPersona[];
  dataModel: BlueprintEntity[];
  integrations: string[];
  securityControls: string[];
  releaseCriteria: string[];
  readinessScore: number;
  warnings: string[];
}

export interface ArtifactStage {
  id: string;
  title: string;
  owner: "planner" | "codegen" | "backend" | "mobile" | "security" | "release";
  dependsOn: string[];
  outputs: string[];
  gates: string[];
  risk: StageRisk;
}

export interface ArtifactPlan {
  targetMatrix: Record<TargetSurface, { enabled: boolean; outputs: string[]; gates: string[] }>;
  stages: ArtifactStage[];
  gates: string[];
  outputs: string[];
  riskRegister: Array<{ id: string; risk: string; mitigation: string; severity: StageRisk }>;
  pipelineHash: string;
}

export interface GeneratedFile {
  path: string;
  language: string;
  content: string;
}

function hash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function score(parts: boolean[]) {
  const positives = parts.filter(Boolean).length;
  return Math.round((positives / Math.max(1, parts.length)) * 100);
}

export function synthesizeProductionBlueprint(input: {
  projectName: string;
  description?: string | null;
  runtimeAdapters: string[];
  deployAdapters: string[];
  hasSecurityBaseline: boolean;
  hasTelemetry: boolean;
  hasCompliance: boolean;
  hasMonetization: boolean;
  hasOnboarding: boolean;
  generatedFileCount: number;
}): ProductionBlueprint {
  const appName = input.projectName || "Generated App";
  const runtime = new Set(input.runtimeAdapters.map((v) => v.toLowerCase()));
  const hasPayments = [...runtime].some((v) => /stripe|paddle|razorpay|payment/.test(v));
  const hasAuth = [...runtime].some((v) => /auth|supabase|firebase|clerk|cognito|keycloak/.test(v));
  const hasAi = [...runtime].some((v) => /ai|openai|ollama|gateway|anthropic/.test(v));

  const surfaces: BlueprintSurface[] = [
    { target: "web", experience: "SSR production website and app shell", criticalFlows: ["landing", "auth", "dashboard", "settings"] },
    { target: "ios", experience: "native iOS package with mobile-safe navigation", criticalFlows: ["onboarding", "push consent", "offline recovery"] },
    { target: "android", experience: "native Android package with adaptive layouts", criticalFlows: ["onboarding", "push consent", "deep links"] },
    { target: "backend", experience: "portable API, database, auth, storage and job runtime", criticalFlows: ["request validation", "policy enforcement", "audit capture"] },
  ];
  if (input.hasOnboarding) surfaces.push({ target: "pwa", experience: "installable offline-first PWA", criticalFlows: ["install prompt", "offline shell", "background sync"] });
  if (input.deployAdapters.length > 0) surfaces.push({ target: "widget", experience: "embeddable customer-facing widget", criticalFlows: ["shadow DOM mount", "tenant routing", "safe teardown"] });

  const dataModel: BlueprintEntity[] = [
    { name: "UserProfile", fields: ["id", "displayName", "avatarUrl", "locale", "createdAt"], policies: ["self read/update", "audit all writes"] },
    { name: "Workspace", fields: ["id", "name", "slug", "plan", "region"], policies: ["member scoped access", "owner-only billing changes"] },
    { name: "Project", fields: ["id", "workspaceId", "name", "status", "artifactHash"], policies: ["role based viewer/editor/owner"] },
    { name: "Release", fields: ["id", "projectId", "version", "channel", "provenance"], policies: ["editor create", "owner promote", "immutable after publish"] },
  ];
  if (hasPayments || input.hasMonetization) dataModel.push({ name: "Entitlement", fields: ["workspaceId", "planCode", "quota", "usage", "periodEnd"], policies: ["server authoritative", "append-only usage events"] });

  const securityControls = [
    "RLS on every user-owned table",
    "server-side role checks before privileged writes",
    "CSP and strict transport headers",
    "rate limits on mutating actions",
    "audit log for deploy, billing and membership events",
  ];
  if (input.hasCompliance) securityControls.push("retention, residency and evidence export controls");
  if (hasAuth) securityControls.push("MFA/passkey-ready identity adapter boundary");

  const warnings: string[] = [];
  if (!hasAuth) warnings.push("No auth adapter detected; generated app needs an identity provider before production launch.");
  if (!input.hasTelemetry) warnings.push("Telemetry is not configured; incident triage and SLO tracking will be incomplete.");
  if (!input.hasSecurityBaseline) warnings.push("Security baseline is missing; enable strict defaults before materialization.");
  if (input.deployAdapters.length === 0) warnings.push("No deploy adapter configured; artifact plan can be generated but not shipped.");
  if (input.generatedFileCount < 10) warnings.push("Current generated file count is low; create or materialize the IR before release planning.");

  return {
    name: `${appName} Production Blueprint`,
    summary: input.description || `${appName} is planned as a portable, multi-target product with verified web, mobile, backend and release artifacts.`,
    surfaces,
    personas: [
      { id: "owner", name: "Product owner", goal: "ship a complete app without vendor lock-in", successMetric: "first production deploy completed" },
      { id: "builder", name: "Builder operator", goal: "iterate safely through IR, preview, tests and deployment", successMetric: "all artifact gates pass" },
      { id: "end-user", name: "End user", goal: "use a reliable app on web, iOS and Android", successMetric: "task completion without support escalation" },
    ],
    dataModel,
    integrations: Array.from(new Set([...input.runtimeAdapters, ...input.deployAdapters, hasAi ? "AI orchestration" : "AI-ready adapter slot"])).slice(0, 24),
    securityControls,
    releaseCriteria: [
      "All target artifacts generated from the same IR hash",
      "Typecheck, lint, unit, e2e and mobile smoke gates pass",
      "Security baseline and dependency audit pass with no critical findings",
      "Observability endpoints receive traces, metrics and structured logs",
      "Rollback and canary promotion path verified before public launch",
    ],
    readinessScore: score([hasAuth, input.hasSecurityBaseline, input.hasTelemetry, input.hasCompliance, input.hasOnboarding, input.hasMonetization, input.deployAdapters.length > 0, input.generatedFileCount >= 10]),
    warnings,
  };
}

export function synthesizeArtifactPlan(input: { blueprint: ProductionBlueprint; projectSlug: string; fileCount: number }): ArtifactPlan {
  const enabled = new Set(input.blueprint.surfaces.map((surface) => surface.target));
  const targetMatrix: ArtifactPlan["targetMatrix"] = {
    web: { enabled: enabled.has("web"), outputs: [".output/server", "public assets", "route manifest"], gates: ["typecheck", "seo", "a11y"] },
    ios: { enabled: enabled.has("ios"), outputs: ["ios workspace", "Expo config", "Fastlane lane"], gates: ["native smoke", "signing profile", "store metadata"] },
    android: { enabled: enabled.has("android"), outputs: ["android project", "AAB profile", "Play listing"], gates: ["native smoke", "keystore check", "deep-link validation"] },
    pwa: { enabled: enabled.has("pwa"), outputs: ["manifest", "service worker", "offline shell"], gates: ["installability", "offline navigation"] },
    desktop: { enabled: enabled.has("desktop"), outputs: ["Tauri shell", "update manifest"], gates: ["signed binary", "auto-update check"] },
    widget: { enabled: enabled.has("widget"), outputs: ["shadow DOM bundle", "embed snippet"], gates: ["isolation", "CSP compatibility"] },
    backend: { enabled: enabled.has("backend"), outputs: ["migrations", "server functions", "runtime contract"], gates: ["RLS audit", "rate-limit audit", "secret reference audit"] },
  };
  const stages: ArtifactStage[] = [
    { id: "requirements", title: "Freeze blueprint and acceptance criteria", owner: "planner", dependsOn: [], outputs: ["docs/production-blueprint.md"], gates: ["owner approval", "warning triage"], risk: input.blueprint.warnings.length ? "medium" : "low" },
    { id: "schema", title: "Generate data model, policies and adapter contract", owner: "backend", dependsOn: ["requirements"], outputs: ["migrations/*.sql", "src/runtime/contract.ts"], gates: ["RLS enabled", "GRANT coverage", "schema diff review"], risk: "high" },
    { id: "ui", title: "Materialize responsive web and spatial UI", owner: "codegen", dependsOn: ["requirements"], outputs: ["src/routes/*", "src/components/*", "src/styles.css"], gates: ["a11y scan", "responsive screenshots", "hydration check"], risk: "medium" },
    { id: "mobile", title: "Build iOS and Android targets from the shared product graph", owner: "mobile", dependsOn: ["schema", "ui"], outputs: ["ios/*", "android/*", "app.config.ts"], gates: ["device smoke", "permissions review", "store compliance"], risk: "high" },
    { id: "tests", title: "Create verification suite and self-healing smoke journeys", owner: "security", dependsOn: ["schema", "ui"], outputs: ["tests/e2e/*", "tests/security/*"], gates: ["unit", "integration", "e2e", "dependency audit"], risk: "medium" },
    { id: "release", title: "Package, sign, deploy and promote through canary", owner: "release", dependsOn: ["mobile", "tests"], outputs: ["release/provenance.json", "release/canary-plan.json"], gates: ["SLSA provenance", "rollback drill", "observability live"], risk: "high" },
  ];
  const outputs = stages.flatMap((stage) => stage.outputs);
  const gates = Array.from(new Set(stages.flatMap((stage) => stage.gates)));
  const riskRegister = [
    { id: "authz", risk: "Generated backend may miss a tenant boundary", mitigation: "Policy diff gate blocks tables without project/user scoped RLS", severity: "high" as const },
    { id: "mobile-parity", risk: "Mobile flows can drift from web behavior", mitigation: "Shared IR drives screen contracts and smoke tests per target", severity: "medium" as const },
    { id: "provider-lock", risk: "Vendor SDK leaks into generated app code", mitigation: "Runtime contract scan fails direct provider imports outside adapters", severity: "medium" as const },
  ];
  const pipelineHash = `h2-${hash(JSON.stringify({ slug: input.projectSlug, fileCount: input.fileCount, gates, outputs, warnings: input.blueprint.warnings }))}`;
  return { targetMatrix, stages, gates, outputs, riskRegister, pipelineHash };
}

export function materializeProductionFiles(input: { blueprint: ProductionBlueprint; plan: ArtifactPlan; projectSlug: string }): GeneratedFile[] {
  const blueprintMd = [
    `# ${input.blueprint.name}`,
    "",
    input.blueprint.summary,
    "",
    "## Surfaces",
    ...input.blueprint.surfaces.map((surface) => `- **${surface.target}** — ${surface.experience}; flows: ${surface.criticalFlows.join(", ")}`),
    "",
    "## Release Criteria",
    ...input.blueprint.releaseCriteria.map((criterion) => `- ${criterion}`),
    "",
    "## Security Controls",
    ...input.blueprint.securityControls.map((control) => `- ${control}`),
  ].join("\n");
  const manifest = {
    project: input.projectSlug,
    pipelineHash: input.plan.pipelineHash,
    targetMatrix: input.plan.targetMatrix,
    gates: input.plan.gates,
    outputs: input.plan.outputs,
    riskRegister: input.plan.riskRegister,
  };
  const pipeline = {
    version: 1,
    pipelineHash: input.plan.pipelineHash,
    stages: input.plan.stages.map((stage) => ({ id: stage.id, dependsOn: stage.dependsOn, gates: stage.gates, outputs: stage.outputs, owner: stage.owner })),
  };
  return [
    { path: "docs/production-blueprint.md", language: "markdown", content: blueprintMd },
    { path: "foundry/production-artifact-manifest.json", language: "json", content: JSON.stringify(manifest, null, 2) },
    { path: "foundry/pipeline/verified-artifact-pipeline.json", language: "json", content: JSON.stringify(pipeline, null, 2) },
  ];
}