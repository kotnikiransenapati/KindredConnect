// Foundry v3 Phase H3/H4/I1 — server functions for backlog, acceptance contracts, and build runs.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import type { ArtifactPlan, ProductionBlueprint } from "./foundry-production.shared";
import {
  fingerprintBuildRun,
  synthesizeAcceptanceContracts,
  synthesizeBacklog,
  synthesizeBuildRun,
  type BuildTarget,
} from "./foundry-delivery.shared";

const ProjectId = z.string().uuid();

async function requireRole(ctx: { userId: string; supabase: any }, projectId: string, role: "viewer" | "editor" | "owner") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: allowed, error } = await supabaseAdmin.rpc("has_project_role", { _project_id: projectId, _user_id: ctx.userId, _min_role: role });
  if (error || !allowed) throw new Error("Forbidden");
}

function rowToBlueprint(row: Record<string, unknown> | null | undefined): ProductionBlueprint | null {
  if (!row) return null;
  return {
    name: String(row.name ?? "Production Blueprint"),
    summary: String(row.summary ?? ""),
    surfaces: (row.surfaces as ProductionBlueprint["surfaces"]) ?? [],
    personas: (row.personas as ProductionBlueprint["personas"]) ?? [],
    dataModel: (row.data_model as ProductionBlueprint["dataModel"]) ?? [],
    integrations: (row.integrations as string[]) ?? [],
    securityControls: (row.security_controls as string[]) ?? [],
    releaseCriteria: (row.release_criteria as string[]) ?? [],
    readinessScore: Number(row.readiness_score ?? 0),
    warnings: (row.warnings as string[]) ?? [],
  };
}

async function loadLatestBlueprint(client: any, projectId: string) {
  const res = await client.from("foundry_product_blueprints" as never).select("*" as never).eq("project_id" as never, projectId as never).order("created_at" as never, { ascending: false }).limit(1).maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data as Record<string, unknown> | null;
}

// =========== H3: Backlog ===========
export const listBacklogItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const { data: rows, error } = await context.supabase.from("foundry_backlog_items" as never).select("*" as never).eq("project_id" as never, data.projectId as never).order("sequence" as never, { ascending: true });
    if (error) throw new Error(error.message);
    return { items: rows ?? [] };
  });

export const compileBacklog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const blueprintRow = await loadLatestBlueprint(context.supabase, data.projectId);
    const blueprint = rowToBlueprint(blueprintRow);
    if (!blueprint) throw new Error("No blueprint available; synthesize one first.");
    const items = synthesizeBacklog({ blueprint });
    // Replace existing planned-status items for this blueprint and re-seed
    const blueprintId = (blueprintRow?.id as string | undefined) ?? null;
    const { error: delErr } = await context.supabase.from("foundry_backlog_items" as never).delete().eq("project_id" as never, data.projectId as never).eq("status" as never, "planned" as never);
    if (delErr) throw new Error(delErr.message);
    const payload = items.map((item) => ({
      project_id: data.projectId,
      blueprint_id: blueprintId,
      sequence: item.sequence,
      kind: item.kind,
      title: item.title,
      description: item.description,
      owner: item.owner,
      priority: item.priority,
      estimate_points: item.estimatePoints,
      acceptance: item.acceptance as unknown as Json,
      dependencies: item.dependencies as unknown as Json,
      created_by: context.userId,
    }));
    const { data: saved, error } = await context.supabase.from("foundry_backlog_items" as never).insert(payload as never).select("*" as never);
    if (error) throw new Error(error.message);
    return { items: saved ?? [] };
  });

export const updateBacklogStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; itemId: string; status: "planned" | "in_progress" | "blocked" | "done" | "dropped" }) => ({
    projectId: ProjectId.parse(d.projectId),
    itemId: z.string().uuid().parse(d.itemId),
    status: z.enum(["planned", "in_progress", "blocked", "done", "dropped"]).parse(d.status),
  }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const { error } = await context.supabase.from("foundry_backlog_items" as never).update({ status: data.status } as never).eq("project_id" as never, data.projectId as never).eq("id" as never, data.itemId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========== H4: Acceptance Contracts ===========
export const listAcceptanceContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const { data: rows, error } = await context.supabase.from("foundry_acceptance_contracts" as never).select("*" as never).eq("project_id" as never, data.projectId as never).order("version" as never, { ascending: false });
    if (error) throw new Error(error.message);
    return { contracts: rows ?? [] };
  });

export const compileAcceptanceContracts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const blueprintRow = await loadLatestBlueprint(context.supabase, data.projectId);
    const blueprint = rowToBlueprint(blueprintRow);
    if (!blueprint) throw new Error("No blueprint available; synthesize one first.");
    const blueprintId = (blueprintRow?.id as string | undefined) ?? null;
    const versionRes = await context.supabase.from("foundry_acceptance_contracts" as never).select("version" as never).eq("project_id" as never, data.projectId as never).order("version" as never, { ascending: false }).limit(1).maybeSingle();
    if (versionRes.error) throw new Error(versionRes.error.message);
    const version = Number((versionRes.data as { version?: number } | null)?.version ?? 0) + 1;
    const contracts = synthesizeAcceptanceContracts({ blueprint });
    const payload = contracts.map((c) => ({
      project_id: data.projectId,
      blueprint_id: blueprintId,
      version,
      surface: String(c.surface),
      flow: c.flow,
      given: c.given as unknown as Json,
      when_steps: c.whenSteps as unknown as Json,
      then_assertions: c.thenAssertions as unknown as Json,
      fixtures: c.fixtures as unknown as Json,
      severity: c.severity,
      created_by: context.userId,
    }));
    const { data: saved, error } = await context.supabase.from("foundry_acceptance_contracts" as never).insert(payload as never).select("*" as never);
    if (error) throw new Error(error.message);
    return { contracts: saved ?? [], version };
  });

export const markAcceptanceResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; contractId: string; status: "pending" | "passing" | "failing" | "quarantined" }) => ({
    projectId: ProjectId.parse(d.projectId),
    contractId: z.string().uuid().parse(d.contractId),
    status: z.enum(["pending", "passing", "failing", "quarantined"]).parse(d.status),
  }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const { error } = await context.supabase.from("foundry_acceptance_contracts" as never).update({ status: data.status, last_run_at: new Date().toISOString() } as never).eq("project_id" as never, data.projectId as never).eq("id" as never, data.contractId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========== I1: Build Runs ===========
export const listBuildRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const { data: rows, error } = await context.supabase.from("foundry_build_runs" as never).select("*" as never).eq("project_id" as never, data.projectId as never).order("run_number" as never, { ascending: false }).limit(25);
    if (error) throw new Error(error.message);
    return { runs: rows ?? [] };
  });

export const triggerBuildRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; planId?: string; target?: BuildTarget }) => ({
    projectId: ProjectId.parse(d.projectId),
    planId: d.planId ? z.string().uuid().parse(d.planId) : undefined,
    target: (d.target ?? "all") as BuildTarget,
  }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    let planRow: Record<string, unknown> | null = null;
    if (data.planId) {
      const res = await context.supabase.from("foundry_artifact_plans" as never).select("*" as never).eq("project_id" as never, data.projectId as never).eq("id" as never, data.planId as never).maybeSingle();
      if (res.error) throw new Error(res.error.message);
      planRow = res.data as Record<string, unknown> | null;
    } else {
      const res = await context.supabase.from("foundry_artifact_plans" as never).select("*" as never).eq("project_id" as never, data.projectId as never).order("created_at" as never, { ascending: false }).limit(1).maybeSingle();
      if (res.error) throw new Error(res.error.message);
      planRow = res.data as Record<string, unknown> | null;
    }
    if (!planRow) throw new Error("No artifact plan available; synthesize one first.");
    const plan: ArtifactPlan = {
      targetMatrix: planRow.target_matrix as ArtifactPlan["targetMatrix"],
      stages: planRow.stages as ArtifactPlan["stages"],
      gates: planRow.gates as string[],
      outputs: planRow.outputs as string[],
      riskRegister: planRow.risk_register as ArtifactPlan["riskRegister"],
      pipelineHash: String(planRow.pipeline_hash),
    };
    const run = synthesizeBuildRun({ plan, target: data.target });
    const numRes = await context.supabase.from("foundry_build_runs" as never).select("run_number" as never).eq("project_id" as never, data.projectId as never).order("run_number" as never, { ascending: false }).limit(1).maybeSingle();
    if (numRes.error) throw new Error(numRes.error.message);
    const runNumber = Number((numRes.data as { run_number?: number } | null)?.run_number ?? 0) + 1;
    const fp = fingerprintBuildRun(run);
    const now = new Date().toISOString();
    const { data: saved, error } = await context.supabase.from("foundry_build_runs" as never).insert({
      project_id: data.projectId,
      plan_id: (planRow.id as string | undefined) ?? null,
      run_number: runNumber,
      target: String(data.target),
      status: run.status,
      pipeline_hash: run.pipelineHash,
      stages: run.stages as unknown as Json,
      gates: run.gateSummary as unknown as Json,
      artifacts: run.artifacts as unknown as Json,
      logs: run.stages.flatMap((s) => s.logs) as unknown as Json,
      duration_ms: run.totalDurationMs,
      triggered_by: context.userId,
      started_at: now,
      completed_at: now,
      metadata: { fingerprint: fp } as unknown as Json,
    } as never).select("*" as never).single();
    if (error) throw new Error(error.message);
    return { run: saved };
  });
