// Foundry v3 Phase H1/H2 — server functions for production blueprints and artifact plans.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  materializeProductionFiles,
  synthesizeArtifactPlan,
  synthesizeProductionBlueprint,
  type ArtifactPlan,
  type ProductionBlueprint,
} from "./foundry-production.shared";

const ProjectId = z.string().uuid();

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function requireRole(ctx: { userId: string }, projectId: string, role: "viewer" | "editor" | "owner") {
  const supabaseAdmin = await getAdmin();
  const { data: allowed, error } = await supabaseAdmin.rpc("has_project_role", { _project_id: projectId, _user_id: ctx.userId, _min_role: role });
  if (error || !allowed) throw new Error("Forbidden");
}

async function nextVersion(client: any, table: string, projectId: string) {
  const { data, error } = await client.from(table).select("version").eq("project_id", projectId).order("version", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return Number((data as { version?: number } | null)?.version ?? 0) + 1;
}

async function loadProductionContext(client: any, projectId: string) {
  const [projectRes, runtimeRes, deployRes, securityRes, telemetryRes, complianceRes, plansRes, journeysRes, filesRes] = await Promise.all([
    client.from("projects").select("id,name,slug,description").eq("id", projectId).maybeSingle(),
    client.from("runtime_adapter_configs").select("category,provider,display_name,status").eq("project_id", projectId),
    client.from("deploy_adapters").select("provider,display_name,status").eq("project_id", projectId),
    client.from("foundry_security_policies").select("id").eq("project_id", projectId).maybeSingle(),
    client.from("foundry_telemetry_configs").select("id").eq("project_id", projectId).maybeSingle(),
    client.from("foundry_compliance_profiles").select("id").eq("project_id", projectId).limit(1),
    client.from("foundry_monetization_plans").select("id").eq("project_id", projectId).eq("status", "active").limit(1),
    client.from("foundry_onboarding_journeys").select("id").eq("project_id", projectId).eq("enabled", true).limit(1),
    client.from("project_files").select("path", { count: "exact", head: true }).eq("project_id", projectId),
  ]);
  for (const res of [projectRes, runtimeRes, deployRes, securityRes, telemetryRes, complianceRes, plansRes, journeysRes, filesRes]) {
    if (res.error) throw new Error(res.error.message);
  }
  const project = projectRes.data as { name?: string; slug?: string; description?: string | null } | null;
  if (!project) throw new Error("Project not found");
  const runtimeAdapters = ((runtimeRes.data ?? []) as Array<{ provider?: string; display_name?: string; category?: string }>).map((r) => r.display_name || r.provider || r.category || "adapter");
  const deployAdapters = ((deployRes.data ?? []) as Array<{ provider?: string; display_name?: string }>).map((r) => r.display_name || r.provider || "deploy");
  return {
    project,
    runtimeAdapters,
    deployAdapters,
    hasSecurityBaseline: Boolean(securityRes.data),
    hasTelemetry: Boolean(telemetryRes.data),
    hasCompliance: (complianceRes.data ?? []).length > 0,
    hasMonetization: (plansRes.data ?? []).length > 0,
    hasOnboarding: (journeysRes.data ?? []).length > 0,
    generatedFileCount: filesRes.count ?? 0,
  };
}

function rowToBlueprint(row: Record<string, unknown>): ProductionBlueprint {
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

export const listProductionBlueprints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const { data: rows, error } = await context.supabase.from("foundry_product_blueprints" as never).select("*" as never).eq("project_id" as never, data.projectId as never).order("created_at" as never, { ascending: false });
    if (error) throw new Error(error.message);
    return { blueprints: rows ?? [] };
  });

export const synthesizeBlueprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const ctx = await loadProductionContext(context.supabase, data.projectId);
    const version = await nextVersion(context.supabase, "foundry_product_blueprints", data.projectId);
    const blueprint = synthesizeProductionBlueprint({
      projectName: ctx.project.name || ctx.project.slug || "Generated App",
      description: ctx.project.description,
      runtimeAdapters: ctx.runtimeAdapters,
      deployAdapters: ctx.deployAdapters,
      hasSecurityBaseline: ctx.hasSecurityBaseline,
      hasTelemetry: ctx.hasTelemetry,
      hasCompliance: ctx.hasCompliance,
      hasMonetization: ctx.hasMonetization,
      hasOnboarding: ctx.hasOnboarding,
      generatedFileCount: ctx.generatedFileCount,
    });
    const payload = {
      project_id: data.projectId,
      version,
      name: blueprint.name,
      summary: blueprint.summary,
      surfaces: blueprint.surfaces as unknown as Json,
      personas: blueprint.personas as unknown as Json,
      data_model: blueprint.dataModel as unknown as Json,
      integrations: blueprint.integrations as unknown as Json,
      security_controls: blueprint.securityControls as unknown as Json,
      release_criteria: blueprint.releaseCriteria as unknown as Json,
      readiness_score: blueprint.readinessScore,
      warnings: blueprint.warnings as unknown as Json,
      created_by: context.userId,
    };
    const { data: saved, error } = await context.supabase.from("foundry_product_blueprints" as never).insert(payload as never).select("*" as never).single();
    if (error) throw new Error(error.message);
    return { blueprint: saved };
  });

export const approveBlueprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; blueprintId: string }) => ({ projectId: ProjectId.parse(d.projectId), blueprintId: z.string().uuid().parse(d.blueprintId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const { error: supersedeError } = await context.supabase.from("foundry_product_blueprints" as never).update({ status: "superseded" } as never).eq("project_id" as never, data.projectId as never).eq("status" as never, "approved" as never);
    if (supersedeError) throw new Error(supersedeError.message);
    const { error } = await context.supabase.from("foundry_product_blueprints" as never).update({ status: "approved" } as never).eq("project_id" as never, data.projectId as never).eq("id" as never, data.blueprintId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listArtifactPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const { data: rows, error } = await context.supabase.from("foundry_artifact_plans" as never).select("*" as never).eq("project_id" as never, data.projectId as never).order("created_at" as never, { ascending: false });
    if (error) throw new Error(error.message);
    return { plans: rows ?? [] };
  });

export const synthesizeVerifiedArtifactPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; blueprintId?: string }) => ({ projectId: ProjectId.parse(d.projectId), blueprintId: d.blueprintId ? z.string().uuid().parse(d.blueprintId) : undefined }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const ctx = await loadProductionContext(context.supabase, data.projectId);
    let blueprintRow: Record<string, unknown> | null = null;
    if (data.blueprintId) {
      const res = await context.supabase.from("foundry_product_blueprints" as never).select("*" as never).eq("project_id" as never, data.projectId as never).eq("id" as never, data.blueprintId as never).maybeSingle();
      if (res.error) throw new Error(res.error.message);
      blueprintRow = res.data as Record<string, unknown> | null;
    } else {
      const res = await context.supabase.from("foundry_product_blueprints" as never).select("*" as never).eq("project_id" as never, data.projectId as never).order("status" as never, { ascending: true }).order("created_at" as never, { ascending: false }).limit(1).maybeSingle();
      if (res.error) throw new Error(res.error.message);
      blueprintRow = res.data as Record<string, unknown> | null;
    }
    const blueprint = blueprintRow ? rowToBlueprint(blueprintRow) : synthesizeProductionBlueprint({
      projectName: ctx.project.name || ctx.project.slug || "Generated App",
      description: ctx.project.description,
      runtimeAdapters: ctx.runtimeAdapters,
      deployAdapters: ctx.deployAdapters,
      hasSecurityBaseline: ctx.hasSecurityBaseline,
      hasTelemetry: ctx.hasTelemetry,
      hasCompliance: ctx.hasCompliance,
      hasMonetization: ctx.hasMonetization,
      hasOnboarding: ctx.hasOnboarding,
      generatedFileCount: ctx.generatedFileCount,
    });
    const plan = synthesizeArtifactPlan({ blueprint, projectSlug: ctx.project.slug || data.projectId, fileCount: ctx.generatedFileCount });
    const version = await nextVersion(context.supabase, "foundry_artifact_plans", data.projectId);
    const { data: saved, error } = await context.supabase.from("foundry_artifact_plans" as never).insert({
      project_id: data.projectId,
      blueprint_id: (blueprintRow?.id as string | undefined) ?? null,
      version,
      target_matrix: plan.targetMatrix as unknown as Json,
      stages: plan.stages as unknown as Json,
      gates: plan.gates as unknown as Json,
      outputs: plan.outputs as unknown as Json,
      risk_register: plan.riskRegister as unknown as Json,
      pipeline_hash: plan.pipelineHash,
      created_by: context.userId,
    } as never).select("*" as never).single();
    if (error) throw new Error(error.message);
    return { plan: saved };
  });

export const materializeArtifactPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; planId: string }) => ({ projectId: ProjectId.parse(d.projectId), planId: z.string().uuid().parse(d.planId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const [projectRes, planRes] = await Promise.all([
      context.supabase.from("projects" as never).select("slug,name" as never).eq("id" as never, data.projectId as never).maybeSingle(),
      context.supabase.from("foundry_artifact_plans" as never).select("*, foundry_product_blueprints(*)" as never).eq("project_id" as never, data.projectId as never).eq("id" as never, data.planId as never).maybeSingle(),
    ]);
    if (projectRes.error) throw new Error(projectRes.error.message);
    if (planRes.error) throw new Error(planRes.error.message);
    const planRow = planRes.data as Record<string, unknown> | null;
    if (!planRow) throw new Error("Artifact plan not found");
    const blueprintSource = (planRow.foundry_product_blueprints as Record<string, unknown> | null) ?? null;
    const blueprint = blueprintSource ? rowToBlueprint(blueprintSource) : synthesizeProductionBlueprint({ projectName: "Generated App", runtimeAdapters: [], deployAdapters: [], hasSecurityBaseline: false, hasTelemetry: false, hasCompliance: false, hasMonetization: false, hasOnboarding: false, generatedFileCount: 0 });
    const plan: ArtifactPlan = {
      targetMatrix: planRow.target_matrix as ArtifactPlan["targetMatrix"],
      stages: planRow.stages as ArtifactPlan["stages"],
      gates: planRow.gates as string[],
      outputs: planRow.outputs as string[],
      riskRegister: planRow.risk_register as ArtifactPlan["riskRegister"],
      pipelineHash: String(planRow.pipeline_hash),
    };
    const project = projectRes.data as { slug?: string; name?: string } | null;
    const files = materializeProductionFiles({ blueprint, plan, projectSlug: project?.slug || data.projectId });
    const upserts = files.map((file) => ({ project_id: data.projectId, path: file.path, content: file.content, language: file.language }));
    const { error: writeError } = await context.supabase.from("project_files" as never).upsert(upserts as never, { onConflict: "project_id,path" } as never);
    if (writeError) throw new Error(writeError.message);
    const { error } = await context.supabase.from("foundry_artifact_plans" as never).update({ status: "materialized", generated_files: files.map((file) => file.path) as unknown as Json } as never).eq("id" as never, data.planId as never).eq("project_id" as never, data.projectId as never);
    if (error) throw new Error(error.message);
    return { ok: true, files: files.map((file) => file.path) };
  });