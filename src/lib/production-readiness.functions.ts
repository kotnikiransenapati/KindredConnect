// Phase F1/F2/F3 + G1 — generated app security, observability,
// compliance profiles, and end-to-end production readiness materialization.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assessProductionReadiness, buildComplianceFiles, buildSecurityFiles, buildTelemetryFiles, complianceControlDefaults, defaultSecurityBaseline, type ComplianceConfig, type SecurityBaselineConfig, type TelemetryConfig } from "./production-readiness.shared";
import type { RuntimeContractAdapter } from "./runtime-contract.shared";

const ProjectId = z.string().uuid();
const SecurityProfileZ = z.enum(["standard", "strict", "regulated"]);
const CspPresetZ = z.enum(["balanced", "strict", "embedded"]);
const RateTierZ = z.enum(["starter", "scale", "enterprise"]);
const TelemetryProviderZ = z.enum(["otlp", "honeycomb", "datadog", "grafana-cloud", "self-hosted"]);
const ComplianceProfileZ = z.enum(["soc2", "hipaa", "gdpr", "pci", "iso27001", "custom"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireRole(ctx: { supabase: any; userId: string }, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data: allowed, error } = await ctx.supabase.rpc("has_project_role", { _project_id: projectId, _user_id: ctx.userId, _min_role: role });
  if (error || !allowed) throw new Error("Forbidden");
}

function normalizeSecurity(row: unknown): SecurityBaselineConfig | null {
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return { profile: (r.profile as SecurityBaselineConfig["profile"]) ?? "strict", cspPreset: (r.csp_preset as SecurityBaselineConfig["cspPreset"]) ?? "strict", rateLimitTier: (r.rate_limit_tier as SecurityBaselineConfig["rateLimitTier"]) ?? "scale", secretRotationDays: Number(r.secret_rotation_days ?? 60), dependencyGateEnabled: Boolean(r.dependency_gate_enabled ?? true), rlsRequired: Boolean(r.rls_required ?? true), auditRequired: Boolean(r.audit_required ?? true) };
}

function normalizeTelemetry(row: unknown): TelemetryConfig | null {
  if (!row) return null;
  const r = row as Record<string, unknown>;
  return { provider: (r.provider as TelemetryConfig["provider"]) ?? "otlp", endpoint: String(r.endpoint ?? ""), serviceName: String(r.service_name ?? "generated-app"), sampleRate: Number(r.sample_rate ?? 0.25), tracesEnabled: Boolean(r.traces_enabled ?? true), metricsEnabled: Boolean(r.metrics_enabled ?? true), logsEnabled: Boolean(r.logs_enabled ?? true), headersSecretRef: (r.headers_secret_ref as string | null) ?? null };
}

function normalizeCompliance(rows: unknown[]): ComplianceConfig[] {
  return rows.map((row) => {
    const r = row as Record<string, unknown>;
    return { profile: (r.profile as ComplianceConfig["profile"]) ?? "custom", enabledControls: Array.isArray(r.enabled_controls) ? (r.enabled_controls as string[]) : [], retentionDays: Number(r.retention_days ?? 365), residencyRequired: Boolean(r.residency_required ?? false), piiClasses: (r.pii_classes as Record<string, string>) ?? {} };
  });
}

async function loadReadinessContext(context: { supabase: any }, projectId: string) {
  const [projectRes, securityRes, telemetryRes, complianceRes, runtimeRes, deployAdaptersRes, deployPlansRes, residencyRes, latestAssessmentRes] = await Promise.all([
    context.supabase.from("projects" as never).select("name, slug").eq("id" as never, projectId as never).maybeSingle(),
    context.supabase.from("foundry_security_policies" as never).select("*").eq("project_id" as never, projectId as never).maybeSingle(),
    context.supabase.from("foundry_telemetry_configs" as never).select("*").eq("project_id" as never, projectId as never).maybeSingle(),
    context.supabase.from("foundry_compliance_profiles" as never).select("*").eq("project_id" as never, projectId as never).order("profile" as never, { ascending: true }),
    context.supabase.from("runtime_adapter_configs" as never).select("category, provider, display_name, status, capabilities, config, secret_refs, score").eq("project_id" as never, projectId as never),
    context.supabase.from("deploy_adapters" as never).select("status").eq("project_id" as never, projectId as never),
    context.supabase.from("deploy_plans" as never).select("status").eq("project_id" as never, projectId as never).limit(20),
    context.supabase.from("project_residency" as never).select("project_id").eq("project_id" as never, projectId as never).maybeSingle(),
    context.supabase.from("foundry_readiness_assessments" as never).select("*").eq("project_id" as never, projectId as never).order("created_at" as never, { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const res of [projectRes, securityRes, telemetryRes, complianceRes, runtimeRes, deployAdaptersRes, deployPlansRes, residencyRes, latestAssessmentRes]) {
    if (res.error) throw new Error(res.error.message);
  }
  return { project: projectRes.data as { name?: string; slug?: string } | null, security: normalizeSecurity(securityRes.data), telemetry: normalizeTelemetry(telemetryRes.data), complianceProfiles: normalizeCompliance((complianceRes.data ?? []) as unknown[]), runtimeConfigs: (runtimeRes.data ?? []) as unknown as RuntimeContractAdapter[], deployAdapters: (deployAdaptersRes.data ?? []) as Array<{ status: string }>, deployPlans: (deployPlansRes.data ?? []) as Array<{ status: string }>, residencyConfigured: Boolean(residencyRes.data), latestAssessment: latestAssessmentRes.data };
}

export const listProductionReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: ProjectId }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const ctx = await loadReadinessContext(context, data.projectId);
    const assessment = assessProductionReadiness({ ...ctx, generatedFileCount: Array.isArray((ctx.latestAssessment as any)?.generated_files) ? (ctx.latestAssessment as any).generated_files.length : 0 });
    return {
      project: ctx.project,
      security: ctx.security,
      telemetry: ctx.telemetry,
      complianceProfiles: ctx.complianceProfiles,
      deployAdapterCount: ctx.deployAdapters.length,
      deployPlanCount: ctx.deployPlans.length,
      residencyConfigured: ctx.residencyConfigured,
      latestGeneratedFiles: Array.isArray((ctx.latestAssessment as any)?.generated_files) ? (ctx.latestAssessment as any).generated_files as string[] : [],
      assessment,
    };
  });

export const upsertSecurityBaseline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: ProjectId, profile: SecurityProfileZ.default("strict"), cspPreset: CspPresetZ.optional(), rateLimitTier: RateTierZ.optional(), secretRotationDays: z.number().int().min(7).max(365).optional(), dependencyGateEnabled: z.boolean().default(true) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const defaults = defaultSecurityBaseline(data.profile);
    const payload = { project_id: data.projectId, profile: data.profile, csp_preset: data.cspPreset ?? defaults.cspPreset, rate_limit_tier: data.rateLimitTier ?? defaults.rateLimitTier, secret_rotation_days: data.secretRotationDays ?? defaults.secretRotationDays, dependency_gate_enabled: data.dependencyGateEnabled, rls_required: defaults.rlsRequired, audit_required: defaults.auditRequired, created_by: context.userId };
    const { data: saved, error } = await context.supabase.from("foundry_security_policies" as never).upsert(payload as never, { onConflict: "project_id" } as never).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, security: normalizeSecurity(saved) };
  });

export const saveTelemetryConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: ProjectId, provider: TelemetryProviderZ.default("otlp"), endpoint: z.string().max(500).default(""), serviceName: z.string().min(1).max(120).default("generated-app"), sampleRate: z.number().min(0).max(1).default(0.25), tracesEnabled: z.boolean().default(true), metricsEnabled: z.boolean().default(true), logsEnabled: z.boolean().default(true), headersSecretRef: z.string().max(120).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const { projectId, headersSecretRef, ...rest } = data;
    const { data: saved, error } = await context.supabase.from("foundry_telemetry_configs" as never).upsert({ project_id: projectId, ...rest, headers_secret_ref: headersSecretRef || null, status: "configured", created_by: context.userId } as never, { onConflict: "project_id" } as never).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, telemetry: normalizeTelemetry(saved) };
  });

export const enableComplianceProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: ProjectId, profile: ComplianceProfileZ.default("soc2"), retentionDays: z.number().int().min(30).max(3650).default(365), residencyRequired: z.boolean().default(false), piiClasses: z.record(z.string(), z.string()).default({ email: "personal", billing: "sensitive", analytics: "pseudonymous" }) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const controls = complianceControlDefaults(data.profile);
    const { data: saved, error } = await context.supabase.from("foundry_compliance_profiles" as never).upsert({ project_id: data.projectId, profile: data.profile, enabled_controls: controls, retention_days: data.retentionDays, residency_required: data.residencyRequired, pii_classes: data.piiClasses, status: "enabled", created_by: context.userId } as never, { onConflict: "project_id,profile" } as never).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, profile: normalizeCompliance([saved])[0] };
  });

export const materializeProductionReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: ProjectId }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const ctx = await loadReadinessContext(context, data.projectId);
    const projectName = ctx.project?.name || ctx.project?.slug || "Generated App";
    const security = ctx.security ?? defaultSecurityBaseline("strict");
    const telemetry = ctx.telemetry ?? { provider: "otlp" as const, endpoint: "${OTEL_EXPORTER_OTLP_ENDPOINT}", serviceName: (ctx.project?.slug || "generated-app").replace(/[^a-z0-9-]/gi, "-").toLowerCase(), sampleRate: 0.25, tracesEnabled: true, metricsEnabled: true, logsEnabled: true, headersSecretRef: null };
    const complianceProfiles = ctx.complianceProfiles.length ? ctx.complianceProfiles : [{ profile: "soc2" as const, enabledControls: complianceControlDefaults("soc2"), retentionDays: 365, residencyRequired: false, piiClasses: { email: "personal", billing: "sensitive", analytics: "pseudonymous" } }];
    const files = [...buildSecurityFiles(projectName, security), ...buildTelemetryFiles(projectName, telemetry), ...buildComplianceFiles(projectName, complianceProfiles)];
    const assessment = assessProductionReadiness({ ...ctx, security, telemetry, complianceProfiles, generatedFileCount: files.length });
    const upserts = files.map((file) => ({ project_id: data.projectId, path: file.path, content: file.content, language: file.language }));
    const { error: writeError } = await context.supabase.from("project_files" as never).upsert(upserts as never, { onConflict: "project_id,path" } as never);
    if (writeError) throw new Error(writeError.message);
    const { data: saved, error } = await context.supabase.from("foundry_readiness_assessments" as never).insert({ project_id: data.projectId, score: assessment.score, grade: assessment.grade, checks: assessment.checks, recommendations: assessment.recommendations, generated_files: files.map((file) => file.path), created_by: context.userId } as never).select("id, score, grade, generated_files").maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, assessmentId: (saved as { id?: string } | null)?.id, assessment, files: files.map((file) => file.path) };
  });