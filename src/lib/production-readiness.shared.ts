// Phase F + G1 — deterministic production hardening kits for generated apps.
// Pure helpers: safe to import from both server functions and React panels.
import { runtimeContractSummary, type RuntimeContractAdapter } from "./runtime-contract.shared";

export type SecurityProfile = "standard" | "strict" | "regulated";
export type TelemetryProvider = "otlp" | "honeycomb" | "datadog" | "grafana-cloud" | "self-hosted";
export type ComplianceProfile = "soc2" | "hipaa" | "gdpr" | "pci" | "iso27001" | "custom";

export type GeneratedProductionFile = { path: string; content: string; language: "ts" | "json" | "md" | "sql" };

export type SecurityBaselineConfig = {
  profile: SecurityProfile;
  cspPreset: "balanced" | "strict" | "embedded";
  rateLimitTier: "starter" | "scale" | "enterprise";
  secretRotationDays: number;
  dependencyGateEnabled: boolean;
  rlsRequired: boolean;
  auditRequired: boolean;
};

export type TelemetryConfig = {
  provider: TelemetryProvider;
  endpoint: string;
  serviceName: string;
  sampleRate: number;
  tracesEnabled: boolean;
  metricsEnabled: boolean;
  logsEnabled: boolean;
  headersSecretRef?: string | null;
};

export type ComplianceConfig = {
  profile: ComplianceProfile;
  enabledControls: string[];
  retentionDays: number;
  residencyRequired: boolean;
  piiClasses: Record<string, string>;
};

export type ProductionReadinessCheck = {
  key: string;
  label: string;
  status: "pass" | "warn" | "fail";
  score: number;
  detail: string;
};

export function defaultSecurityBaseline(profile: SecurityProfile = "strict"): SecurityBaselineConfig {
  if (profile === "regulated") {
    return { profile, cspPreset: "strict", rateLimitTier: "enterprise", secretRotationDays: 30, dependencyGateEnabled: true, rlsRequired: true, auditRequired: true };
  }
  if (profile === "standard") {
    return { profile, cspPreset: "balanced", rateLimitTier: "scale", secretRotationDays: 90, dependencyGateEnabled: true, rlsRequired: true, auditRequired: true };
  }
  return { profile, cspPreset: "strict", rateLimitTier: "scale", secretRotationDays: 60, dependencyGateEnabled: true, rlsRequired: true, auditRequired: true };
}

export function complianceControlDefaults(profile: ComplianceProfile): string[] {
  const common = ["access-control", "audit-logging", "incident-response", "encryption", "vendor-risk"];
  const byProfile: Record<ComplianceProfile, string[]> = {
    soc2: [...common, "change-management", "availability-monitoring", "backup-recovery"],
    hipaa: [...common, "phi-minimization", "baa-tracking", "break-glass-access", "retention-policy"],
    gdpr: [...common, "data-subject-requests", "lawful-basis", "right-to-erasure", "data-processing-records"],
    pci: [...common, "cardholder-data-isolation", "quarterly-scans", "key-rotation", "network-segmentation"],
    iso27001: [...common, "asset-inventory", "risk-register", "internal-audit", "business-continuity"],
    custom: common,
  };
  return byProfile[profile];
}

export function buildSecurityFiles(projectName: string, config: SecurityBaselineConfig): GeneratedProductionFile[] {
  const csp = cspForPreset(config.cspPreset);
  const rateLimits = rateLimitForTier(config.rateLimitTier);
  const manifest = {
    project: projectName,
    profile: config.profile,
    cspPreset: config.cspPreset,
    rateLimitTier: config.rateLimitTier,
    secretRotationDays: config.secretRotationDays,
    dependencyGateEnabled: config.dependencyGateEnabled,
    rlsRequired: config.rlsRequired,
    auditRequired: config.auditRequired,
    headers: { contentSecurityPolicy: csp, hsts: "max-age=63072000; includeSubDomains; preload" },
    rateLimits,
  };
  return [
    { path: "foundry.security.json", language: "json", content: stableJson(manifest) + "\n" },
    { path: "packages/security/src/headers.ts", language: "ts", content: securityHeadersTs(csp) },
    { path: "packages/security/src/rate-limit.ts", language: "ts", content: rateLimitTs(rateLimits) },
    { path: "packages/security/src/audit.ts", language: "ts", content: auditTs(config.auditRequired) },
    { path: "scripts/security/dependency-gate.ts", language: "ts", content: dependencyGateTs(config.dependencyGateEnabled) },
    { path: "security/rls-checklist.sql", language: "sql", content: rlsChecklistSql(config.rlsRequired) },
  ];
}

export function buildTelemetryFiles(projectName: string, config: TelemetryConfig): GeneratedProductionFile[] {
  const manifest = {
    project: projectName,
    provider: config.provider,
    endpoint: config.endpoint,
    serviceName: config.serviceName,
    sampleRate: config.sampleRate,
    tracesEnabled: config.tracesEnabled,
    metricsEnabled: config.metricsEnabled,
    logsEnabled: config.logsEnabled,
    headersSecretRef: config.headersSecretRef || null,
  };
  return [
    { path: "foundry.telemetry.json", language: "json", content: stableJson(manifest) + "\n" },
    { path: "packages/observability/src/telemetry.ts", language: "ts", content: telemetryTs(config) },
    { path: "docs/observability.md", language: "md", content: observabilityReadme(projectName, config) },
  ];
}

export function buildComplianceFiles(projectName: string, configs: ComplianceConfig[]): GeneratedProductionFile[] {
  const sorted = [...configs].sort((a, b) => a.profile.localeCompare(b.profile));
  const files: GeneratedProductionFile[] = [
    { path: "foundry.compliance.json", language: "json", content: stableJson({ project: projectName, profiles: sorted }) + "\n" },
  ];
  for (const config of sorted) {
    const base = `compliance/${config.profile}`;
    files.push(
      { path: `${base}/controls.json`, language: "json", content: stableJson(config.enabledControls.map((control) => ({ control, owner: "security", status: "required" }))) + "\n" },
      { path: `${base}/data-map.json`, language: "json", content: stableJson({ piiClasses: config.piiClasses, residencyRequired: config.residencyRequired }) + "\n" },
      { path: `${base}/retention-policy.md`, language: "md", content: retentionPolicyMd(projectName, config) },
    );
  }
  return files;
}

export function assessProductionReadiness(input: {
  security?: SecurityBaselineConfig | null;
  telemetry?: TelemetryConfig | null;
  complianceProfiles: ComplianceConfig[];
  runtimeConfigs: RuntimeContractAdapter[];
  deployAdapters: Array<{ status: string }>;
  deployPlans: Array<{ status: string }>;
  residencyConfigured: boolean;
  generatedFileCount: number;
}): { score: number; grade: "A" | "B" | "C" | "D"; checks: ProductionReadinessCheck[]; recommendations: string[] } {
  const runtimeSummary = runtimeContractSummary(input.runtimeConfigs);
  const checks: ProductionReadinessCheck[] = [
    { key: "security-baseline", label: "Security baseline", status: input.security ? "pass" : "fail", score: input.security ? (input.security.profile === "regulated" ? 100 : 90) : 0, detail: input.security ? `${input.security.profile} profile with ${input.security.cspPreset} CSP` : "No generated app security profile configured" },
    { key: "runtime-adapters", label: "Portable runtime", status: runtimeSummary.productionReady ? "pass" : runtimeSummary.missingCategories.length <= 2 ? "warn" : "fail", score: runtimeSummary.productionReady ? 100 : Math.max(20, 100 - runtimeSummary.missingCategories.length * 12 - runtimeSummary.degraded.length * 8), detail: runtimeSummary.productionReady ? "All runtime categories configured" : `Missing ${runtimeSummary.missingCategories.join(", ") || "health checks"}` },
    { key: "telemetry", label: "Observability", status: input.telemetry && (input.telemetry.tracesEnabled || input.telemetry.metricsEnabled || input.telemetry.logsEnabled) ? "pass" : "warn", score: input.telemetry ? 90 : 45, detail: input.telemetry ? `${input.telemetry.provider} → ${input.telemetry.endpoint || "collector from environment"}` : "Telemetry exporter not configured" },
    { key: "deploy-orchestrator", label: "Deploy readiness", status: input.deployAdapters.length && input.deployPlans.length ? "pass" : input.deployAdapters.length ? "warn" : "fail", score: input.deployAdapters.length && input.deployPlans.length ? 95 : input.deployAdapters.length ? 65 : 20, detail: `${input.deployAdapters.length} adapter(s), ${input.deployPlans.length} deploy plan(s)` },
    { key: "compliance", label: "Governance profile", status: input.complianceProfiles.length ? "pass" : "warn", score: input.complianceProfiles.length ? 90 : 50, detail: input.complianceProfiles.length ? input.complianceProfiles.map((p) => p.profile).join(", ") : "No compliance profile enabled" },
    { key: "residency", label: "Residency posture", status: input.residencyConfigured || !input.complianceProfiles.some((p) => p.residencyRequired) ? "pass" : "warn", score: input.residencyConfigured ? 90 : input.complianceProfiles.some((p) => p.residencyRequired) ? 55 : 80, detail: input.residencyConfigured ? "Project residency is pinned" : "Residency pinning not required or not configured" },
    { key: "materialized-files", label: "Generated controls", status: input.generatedFileCount >= 8 ? "pass" : input.generatedFileCount > 0 ? "warn" : "fail", score: input.generatedFileCount >= 8 ? 100 : input.generatedFileCount > 0 ? 70 : 0, detail: `${input.generatedFileCount} production control file(s) generated` },
  ];
  const score = Math.round(checks.reduce((sum, check) => sum + check.score, 0) / checks.length);
  const grade = score >= 90 ? "A" : score >= 78 ? "B" : score >= 65 ? "C" : "D";
  const recommendations = checks.filter((check) => check.status !== "pass").map((check) => `${check.label}: ${check.detail}`);
  return { score, grade, checks, recommendations };
}

function cspForPreset(preset: SecurityBaselineConfig["cspPreset"]) {
  const base = ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "img-src 'self' data: blob: https:", "font-src 'self' data:", "connect-src 'self' https: wss:", "upgrade-insecure-requests"];
  if (preset === "embedded") return [...base, "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "frame-ancestors *"].join("; ");
  if (preset === "strict") return [...base, "script-src 'self'", "style-src 'self'", "frame-ancestors 'none'"].join("; ");
  return [...base, "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "frame-ancestors 'self'"].join("; ");
}

function rateLimitForTier(tier: SecurityBaselineConfig["rateLimitTier"]) {
  if (tier === "enterprise") return { anonymousPerMinute: 60, userPerMinute: 900, writePerMinute: 180, aiPerHour: 600 };
  if (tier === "scale") return { anonymousPerMinute: 30, userPerMinute: 360, writePerMinute: 90, aiPerHour: 180 };
  return { anonymousPerMinute: 15, userPerMinute: 120, writePerMinute: 30, aiPerHour: 60 };
}

function securityHeadersTs(csp: string) {
  return `// AUTO-GENERATED by Foundry Production Readiness.\nexport const securityHeaders = {\n  "content-security-policy": ${JSON.stringify(csp)},\n  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",\n  "x-content-type-options": "nosniff",\n  "referrer-policy": "strict-origin-when-cross-origin",\n  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",\n};\n\nexport function withSecurityHeaders(response: Response) {\n  for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);\n  return response;\n}\n`;
}

function rateLimitTs(limits: ReturnType<typeof rateLimitForTier>) {
  return `// AUTO-GENERATED by Foundry Production Readiness.\nexport const rateLimitPolicy = ${stableJson(limits)} as const;\n\nexport function bucketForRequest(userId: string | null, route: string) {\n  if (route.includes("/ai/")) return { key: \`ai:\${userId ?? "anon"}\`, limit: rateLimitPolicy.aiPerHour, windowSeconds: 3600 };\n  if (["POST", "PUT", "PATCH", "DELETE"].some((method) => route.startsWith(method))) return { key: \`write:\${userId ?? "anon"}\`, limit: rateLimitPolicy.writePerMinute, windowSeconds: 60 };\n  return { key: \`read:\${userId ?? "anon"}\`, limit: userId ? rateLimitPolicy.userPerMinute : rateLimitPolicy.anonymousPerMinute, windowSeconds: 60 };\n}\n`;
}

function auditTs(enabled: boolean) {
  return `// AUTO-GENERATED by Foundry Production Readiness.\nexport type AuditEvent = { actorId?: string | null; action: string; resource: string; metadata?: Record<string, unknown> };\n\nexport async function recordAuditEvent(event: AuditEvent) {\n  if (${JSON.stringify(!enabled)}) return { skipped: true };\n  return { queued: true, event: { ...event, occurredAt: new Date().toISOString() } };\n}\n`;
}

function dependencyGateTs(enabled: boolean) {
  return `// AUTO-GENERATED by Foundry Production Readiness.\nconst enabled = ${JSON.stringify(enabled)};\nexport function evaluateDependencyFinding(finding: { severity: "low" | "moderate" | "high" | "critical" }) {\n  if (!enabled) return { allowed: true, reason: "gate disabled" };\n  if (finding.severity === "critical" || finding.severity === "high") return { allowed: false, reason: \`blocked \${finding.severity} dependency finding\` };\n  return { allowed: true, reason: "below blocking threshold" };\n}\n`;
}

function rlsChecklistSql(required: boolean) {
  return `-- AUTO-GENERATED by Foundry Production Readiness.\n-- RLS required: ${required ? "yes" : "no"}\nselect schemaname, tablename, rowsecurity\nfrom pg_tables\nwhere schemaname = 'public'\norder by tablename;\n`;
}

function telemetryTs(config: TelemetryConfig) {
  return `// AUTO-GENERATED by Foundry Production Readiness.\nexport const telemetryConfig = ${stableJson(config)} as const;\n\nexport function shouldSample(traceId: string) {\n  const rate = Math.max(0, Math.min(1, telemetryConfig.sampleRate));\n  const nibble = parseInt(traceId.slice(-2) || "0", 16) / 255;\n  return nibble <= rate;\n}\n\nexport async function emitTelemetry(kind: "trace" | "metric" | "log", payload: Record<string, unknown>) {\n  if (kind === "trace" && !telemetryConfig.tracesEnabled) return { skipped: true };\n  if (kind === "metric" && !telemetryConfig.metricsEnabled) return { skipped: true };\n  if (kind === "log" && !telemetryConfig.logsEnabled) return { skipped: true };\n  return { queued: true, provider: telemetryConfig.provider, endpoint: telemetryConfig.endpoint, payload };\n}\n`;
}

function observabilityReadme(projectName: string, config: TelemetryConfig) {
  return `# ${projectName} Observability\n\nTelemetry is configured for **${config.provider}** with service name \`${config.serviceName}\`. Traces, metrics, and logs are exported through the generated observability adapter so the app can move between hosted and self-managed collectors without code changes.\n`;
}

function retentionPolicyMd(projectName: string, config: ComplianceConfig) {
  return `# ${projectName} ${config.profile.toUpperCase()} Retention Policy\n\nDefault retention is **${config.retentionDays} days**. Residency pinning is ${config.residencyRequired ? "required" : "optional"}. PII classes are mapped in \`data-map.json\`; generated app pipelines must block deployments when required controls are missing.\n`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortDeep(value), null, 2);
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sortDeep(nested)]));
}