// Phase E2/E3/E4 — server functions for credential validation, self-host
// bundle export, and multi-region canary plan synthesis.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEPLOY_ADAPTERS, type DeployProvider } from "./deploy-adapters.shared";
import { synthesizeCanaryPlan, synthesizeSelfHostBundle, validateCredentialSet, type CanaryStage } from "./deploy-extras.shared";
import { EMPTY_IR, IrSchema, hashIr } from "./ir.shared";
import type { BuildTarget } from "./target-builds.shared";

const ProviderEnum = z.enum(DEPLOY_ADAPTERS.map((a) => a.provider) as [DeployProvider, ...DeployProvider[]]);
const TargetEnum = z.enum(["web", "mobile", "desktop", "pwa", "widget"]);
const ProjectId = z.string().uuid();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireRole(ctx: { supabase: any; userId: string }, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data: ok, error } = await ctx.supabase.rpc("has_project_role", { _project_id: projectId, _user_id: ctx.userId, _min_role: role });
  if (error || !ok) throw new Error("Forbidden");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadIrHash(ctx: { supabase: any }, projectId: string): Promise<string> {
  const { data } = await ctx.supabase.from("project_ir" as never).select("ir, ir_hash").eq("project_id" as never, projectId as never).maybeSingle();
  const row = data as unknown as { ir?: unknown; ir_hash?: string } | null;
  if (row?.ir_hash) return row.ir_hash;
  return hashIr(IrSchema.parse(row?.ir ?? EMPTY_IR));
}

export const validateDeployCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; provider: DeployProvider }) =>
    z.object({ projectId: ProjectId, provider: ProviderEnum }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const { data: rows, error } = await context.supabase
      .from("project_secrets" as never)
      .select("name")
      .eq("project_id" as never, data.projectId as never);
    if (error) throw new Error(error.message);
    const names = ((rows ?? []) as Array<{ name: string }>).map((r) => r.name);
    return validateCredentialSet(data.provider, names);
  });

export const exportSelfHostBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; provider: DeployProvider; target: BuildTarget; domain?: string }) =>
    z.object({ projectId: ProjectId, provider: ProviderEnum, target: TargetEnum, domain: z.string().max(253).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const { data: project, error } = await context.supabase.from("projects" as never).select("slug, name").eq("id" as never, data.projectId as never).maybeSingle();
    if (error) throw new Error(error.message);
    const row = project as unknown as { slug?: string; name?: string } | null;
    const irHash = await loadIrHash(context, data.projectId);
    const bundle = synthesizeSelfHostBundle({
      provider: data.provider,
      target: data.target,
      projectSlug: row?.slug || row?.name || "foundry-app",
      domain: data.domain,
      irHash,
    });
    await context.supabase.from("deploy_runs" as never).insert({
      project_id: data.projectId,
      action: "logs",
      status: "success",
      output: { kind: "self-host-export", provider: data.provider, target: data.target, files: bundle.summary.fileCount, bytes: bundle.summary.bytes },
      logs: `Exported self-host bundle (${bundle.summary.fileCount} files, ${bundle.summary.bytes}B) for ${data.provider}/${data.target}.`,
      duration_ms: 12,
      triggered_by: context.userId,
    } as never);
    return bundle;
  });

export const createCanaryDeployPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; provider: DeployProvider; target: BuildTarget; environment?: string;
    regions?: string[]; stages?: CanaryStage[];
  }) => z.object({
    projectId: ProjectId,
    provider: ProviderEnum,
    target: TargetEnum,
    environment: z.string().default("production"),
    regions: z.array(z.string().min(1).max(40)).max(12).default([]),
    stages: z.array(z.object({ percent: z.number().int().min(1).max(100), holdSeconds: z.number().int().min(0).max(3600).default(60), region: z.string().max(40).optional() })).max(10).default([
      { percent: 5, holdSeconds: 120 }, { percent: 25, holdSeconds: 180 }, { percent: 50, holdSeconds: 180 }, { percent: 100, holdSeconds: 0 },
    ]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const irHash = await loadIrHash(context, data.projectId);
    const plan = synthesizeCanaryPlan({
      provider: data.provider, target: data.target, environment: data.environment,
      irHash, regions: data.regions, stages: data.stages,
    });
    const { data: adapterRow } = await context.supabase
      .from("deploy_adapters" as never)
      .select("id")
      .eq("project_id" as never, data.projectId as never)
      .eq("provider" as never, data.provider as never)
      .eq("environment" as never, data.environment as never)
      .maybeSingle();
    const { data: planRow, error } = await context.supabase.from("deploy_plans" as never).insert({
      project_id: data.projectId,
      adapter_id: (adapterRow as { id?: string } | null)?.id ?? null,
      target: data.target,
      provider: data.provider,
      environment: data.environment,
      plan: { ...plan, kind: "canary", regions: data.regions, stages: data.stages },
      estimated_cost_cents: plan.estimatedCostCents,
      status: "draft",
      ir_hash: irHash,
      created_by: context.userId,
    } as never).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    await context.supabase.from("deploy_runs" as never).insert({
      project_id: data.projectId,
      plan_id: (planRow as { id?: string } | null)?.id,
      adapter_id: (adapterRow as { id?: string } | null)?.id ?? null,
      action: "plan",
      status: "success",
      output: { kind: "canary", stages: data.stages.length, regions: data.regions.length, warnings: plan.warnings.length },
      logs: `Canary plan synthesized: ${data.stages.length} stage(s) across ${Math.max(1, data.regions.length)} region(s) for ${data.provider}/${data.target}.`,
      duration_ms: 6,
      triggered_by: context.userId,
    } as never);
    return { ok: true, planId: (planRow as { id?: string } | null)?.id, plan };
  });
