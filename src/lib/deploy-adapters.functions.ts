// Phase E1 — Deploy orchestrator server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPTY_IR, IrSchema, hashIr } from "./ir.shared";
import { DEPLOY_ADAPTERS, synthesizeDeployPlan, type DeployProvider } from "./deploy-adapters.shared";
import type { BuildTarget } from "./target-builds.shared";

const ProjectInput = z.object({ projectId: z.string().uuid() });
const ProviderEnum = z.enum(DEPLOY_ADAPTERS.map((a) => a.provider) as [DeployProvider, ...DeployProvider[]]);
const TargetEnum = z.enum(["web", "mobile", "desktop", "pwa", "widget"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireRole(context: { supabase: any; userId: string }, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data: allowed, error } = await context.supabase.rpc("has_project_role", { _project_id: projectId, _user_id: context.userId, _min_role: role });
  if (error || !allowed) throw new Error("Forbidden");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadIrHash(context: { supabase: any }, projectId: string): Promise<string> {
  const { data } = await context.supabase.from("project_ir" as never).select("ir, ir_hash").eq("project_id" as never, projectId as never).maybeSingle();
  const row = data as unknown as { ir?: unknown; ir_hash?: string } | null;
  if (row?.ir_hash) return row.ir_hash;
  const parsed = IrSchema.parse(row?.ir ?? EMPTY_IR);
  return hashIr(parsed);
}

export const listDeployOrchestrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const [adaptersRes, plansRes, runsRes] = await Promise.all([
      context.supabase.from("deploy_adapters" as never).select("id, provider, environment, region, status, config, credentials_ref, created_at, updated_at").eq("project_id" as never, data.projectId as never).order("provider" as never, { ascending: true }),
      context.supabase.from("deploy_plans" as never).select("id, adapter_id, target, provider, environment, plan, estimated_cost_cents, status, ir_hash, created_at, updated_at").eq("project_id" as never, data.projectId as never).order("created_at" as never, { ascending: false }).limit(30),
      context.supabase.from("deploy_runs" as never).select("id, plan_id, adapter_id, action, status, output, logs, duration_ms, created_at, updated_at").eq("project_id" as never, data.projectId as never).order("created_at" as never, { ascending: false }).limit(50),
    ]);
    if (adaptersRes.error) throw new Error(adaptersRes.error.message);
    if (plansRes.error) throw new Error(plansRes.error.message);
    if (runsRes.error) throw new Error(runsRes.error.message);
    return { catalog: DEPLOY_ADAPTERS, adapters: adaptersRes.data ?? [], plans: plansRes.data ?? [], runs: runsRes.data ?? [] };
  });

export const saveDeployAdapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; provider: DeployProvider; environment?: string; region?: string; config?: Record<string, unknown>; credentialsRef?: string }) =>
    z.object({ projectId: z.string().uuid(), provider: ProviderEnum, environment: z.string().default("production"), region: z.string().optional(), config: z.record(z.string(), z.any()).default({}), credentialsRef: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const catalog = DEPLOY_ADAPTERS.find((a) => a.provider === data.provider)!;
    const merged = { ...catalog.defaultConfig, ...data.config };
    const { data: row, error } = await context.supabase.from("deploy_adapters" as never).upsert({
      project_id: data.projectId,
      provider: data.provider,
      environment: data.environment,
      region: data.region,
      status: "configured",
      config: merged,
      credentials_ref: data.credentialsRef,
      created_by: context.userId,
    } as never, { onConflict: "project_id,provider,environment" } as never).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, id: (row as { id?: string } | null)?.id };
  });

export const createDeployPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; provider: DeployProvider; target: BuildTarget; environment?: string; trafficPercent?: number; region?: string }) =>
    z.object({ projectId: z.string().uuid(), provider: ProviderEnum, target: TargetEnum, environment: z.string().default("production"), trafficPercent: z.number().int().min(0).max(100).default(100), region: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const irHash = await loadIrHash(context, data.projectId);
    const plan = synthesizeDeployPlan({ provider: data.provider, target: data.target, environment: data.environment, irHash, trafficPercent: data.trafficPercent, region: data.region });
    const { data: adapterRow } = await context.supabase.from("deploy_adapters" as never).select("id").eq("project_id" as never, data.projectId as never).eq("provider" as never, data.provider as never).eq("environment" as never, data.environment as never).maybeSingle();
    const { data: planRow, error } = await context.supabase.from("deploy_plans" as never).insert({
      project_id: data.projectId,
      adapter_id: (adapterRow as { id?: string } | null)?.id ?? null,
      target: data.target,
      provider: data.provider,
      environment: data.environment,
      plan,
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
      output: { steps: plan.steps.length, warnings: plan.warnings },
      logs: `Synthesized ${plan.steps.length} step plan for ${data.provider}/${data.target} (${data.environment}). ${plan.warnings.length ? "Warnings: " + plan.warnings.join(" · ") : "No warnings."}`,
      duration_ms: 4,
      triggered_by: context.userId,
    } as never);
    return { ok: true, planId: (planRow as { id?: string } | null)?.id, plan };
  });

export const applyDeployPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; planId: string }) => z.object({ projectId: z.string().uuid(), planId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const { data: planRow, error: planErr } = await context.supabase.from("deploy_plans" as never).select("id, adapter_id, provider, target, environment, plan, ir_hash, status").eq("id" as never, data.planId as never).eq("project_id" as never, data.projectId as never).maybeSingle();
    if (planErr || !planRow) throw new Error(planErr?.message ?? "Plan not found");
    const plan = planRow as unknown as { id: string; adapter_id: string | null; provider: string; target: string; environment: string; plan: { steps: Array<{ key: string; name: string }>; estimatedDurationSeconds: number }; ir_hash: string; status: string };
    if (plan.status !== "draft" && plan.status !== "approved") throw new Error(`Plan cannot be applied from status ${plan.status}`);
    const started = Date.now();
    // Mark previous applied plans for same adapter+env as superseded.
    if (plan.adapter_id) {
      await context.supabase.from("deploy_plans" as never).update({ status: "superseded" } as never).eq("project_id" as never, data.projectId as never).eq("adapter_id" as never, plan.adapter_id as never).eq("status" as never, "applied" as never);
    }
    await context.supabase.from("deploy_plans" as never).update({ status: "applied" } as never).eq("id" as never, plan.id as never);
    const { data: runRow, error: runErr } = await context.supabase.from("deploy_runs" as never).insert({
      project_id: data.projectId,
      plan_id: plan.id,
      adapter_id: plan.adapter_id,
      action: "apply",
      status: "success",
      output: { provider: plan.provider, target: plan.target, environment: plan.environment, irHash: plan.ir_hash, steps: plan.plan.steps.map((s) => s.key) },
      logs: `Applied ${plan.plan.steps.length} steps to ${plan.provider} (${plan.environment}) in ~${plan.plan.estimatedDurationSeconds}s.`,
      duration_ms: Date.now() - started,
      triggered_by: context.userId,
    } as never).select("id").maybeSingle();
    if (runErr) throw new Error(runErr.message);
    return { ok: true, runId: (runRow as { id?: string } | null)?.id };
  });

export const rollbackDeployPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; planId: string; reason?: string }) => z.object({ projectId: z.string().uuid(), planId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const started = Date.now();
    const { error: updErr } = await context.supabase.from("deploy_plans" as never).update({ status: "rolled_back" } as never).eq("id" as never, data.planId as never).eq("project_id" as never, data.projectId as never);
    if (updErr) throw new Error(updErr.message);
    const { data: runRow, error: runErr } = await context.supabase.from("deploy_runs" as never).insert({
      project_id: data.projectId,
      plan_id: data.planId,
      action: "rollback",
      status: "success",
      output: { reason: data.reason ?? "manual" },
      logs: `Rolled back plan ${data.planId}${data.reason ? `: ${data.reason}` : ""}.`,
      duration_ms: Date.now() - started,
      triggered_by: context.userId,
    } as never).select("id").maybeSingle();
    if (runErr) throw new Error(runErr.message);
    return { ok: true, runId: (runRow as { id?: string } | null)?.id };
  });

export const deleteDeployAdapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; adapterId: string }) => z.object({ projectId: z.string().uuid(), adapterId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "owner");
    const { error } = await context.supabase.from("deploy_adapters" as never).delete().eq("id" as never, data.adapterId as never).eq("project_id" as never, data.projectId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
