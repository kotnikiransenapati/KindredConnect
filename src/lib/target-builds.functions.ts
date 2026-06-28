// Phase D1-D2 — Cross-platform target configuration, materialization, and run tracking.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPTY_IR, IrSchema, hashIr } from "./ir.shared";
import { TARGET_PROFILES, generateTargetFiles, targetReadiness, type BuildTarget, type TargetAdapterConfig, type TargetStatus } from "./target-builds.shared";

const TargetSchema = z.enum(["web", "mobile"]);
const ProjectInput = z.object({ projectId: z.string().uuid() });

async function requireRole(context: { supabase: any; userId: string }, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data: allowed, error } = await context.supabase.rpc("has_project_role", {
    _project_id: projectId,
    _user_id: context.userId,
    _min_role: role,
  });
  if (error || !allowed) throw new Error("Forbidden");
}

async function loadAdapters(context: { supabase: any }, projectId: string): Promise<TargetAdapterConfig[]> {
  const { data, error } = await context.supabase
    .from("runtime_adapter_configs" as never)
    .select("category, provider, status, score")
    .eq("project_id" as never, projectId as never);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TargetAdapterConfig[];
}

async function loadIr(context: { supabase: any }, projectId: string) {
  const { data } = await context.supabase
    .from("project_ir" as never)
    .select("ir, ir_hash, version")
    .eq("project_id" as never, projectId as never)
    .maybeSingle();
  const ir = IrSchema.parse((data as unknown as { ir?: unknown } | null)?.ir ?? EMPTY_IR);
  return { ir, irHash: (data as unknown as { ir_hash?: string } | null)?.ir_hash ?? hashIr(ir), version: (data as unknown as { version?: number } | null)?.version ?? 0 };
}

export const getTargetBuilds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const [adapters, configsRes, runsRes] = await Promise.all([
      loadAdapters(context, data.projectId),
      context.supabase
        .from("target_build_configs" as never)
        .select("id, target, status, config, readiness, created_at, updated_at")
        .eq("project_id" as never, data.projectId as never)
        .order("target" as never, { ascending: true }),
      context.supabase
        .from("target_build_runs" as never)
        .select("id, target, status, ir_hash, artifact_paths, logs, duration_ms, created_at, updated_at")
        .eq("project_id" as never, data.projectId as never)
        .order("created_at" as never, { ascending: false })
        .limit(20),
    ]);
    if (configsRes.error) throw new Error(configsRes.error.message);
    if (runsRes.error) throw new Error(runsRes.error.message);
    const configs = (configsRes.data ?? []) as Array<{ id: string; target: BuildTarget; status: TargetStatus; config: Record<string, unknown>; readiness: Record<string, unknown>; created_at: string; updated_at: string }>;
    const configuredTargets = new Set(configs.map((config) => config.target));
    const profileSummaries = TARGET_PROFILES.map((profile) => ({
      ...profile,
      readiness: targetReadiness(profile.target, adapters, configs.find((config) => config.target === profile.target)?.config ?? profile.defaultConfig),
      configured: configuredTargets.has(profile.target),
    }));
    return { profiles: profileSummaries, configs, runs: runsRes.data ?? [], adapters };
  });

export const saveTargetBuildConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; target: BuildTarget; config?: Record<string, unknown> }) => z.object({ projectId: z.string().uuid(), target: TargetSchema, config: z.record(z.string(), z.any()).default({}) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const profile = TARGET_PROFILES.find((p) => p.target === data.target);
    if (!profile) throw new Error("Unknown target");
    const adapters = await loadAdapters(context, data.projectId);
    const config = { ...profile.defaultConfig, ...data.config };
    const readiness = targetReadiness(data.target, adapters, config);
    const status: TargetStatus = readiness.productionReady ? "ready" : readiness.missingAdapters.length ? "planned" : "configured";
    const { data: saved, error } = await context.supabase
      .from("target_build_configs" as never)
      .upsert({
        project_id: data.projectId,
        target: data.target,
        status,
        config,
        readiness,
        created_by: context.userId,
      } as never, { onConflict: "project_id,target" } as never)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, id: (saved as { id?: string } | null)?.id, status, readiness };
  });

export const materializeTargetArtifacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; target: BuildTarget }) => z.object({ projectId: z.string().uuid(), target: TargetSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const [{ ir, irHash }, adapters, configRow] = await Promise.all([
      loadIr(context, data.projectId),
      loadAdapters(context, data.projectId),
      context.supabase
        .from("target_build_configs" as never)
        .select("config")
        .eq("project_id" as never, data.projectId as never)
        .eq("target" as never, data.target as never)
        .maybeSingle(),
    ]);
    if (configRow.error) throw new Error(configRow.error.message);
    const config = ((configRow.data as unknown as { config?: Record<string, unknown> } | null)?.config ?? {}) as Record<string, unknown>;
    const files = generateTargetFiles(ir, data.target, adapters, config);
    const { data: run, error: runError } = await context.supabase
      .from("target_build_runs" as never)
      .insert({
        project_id: data.projectId,
        target: data.target,
        status: "running",
        ir_hash: irHash,
        config,
        triggered_by: context.userId,
        logs: `Materializing ${data.target} target from IR ${irHash}…`,
      } as never)
      .select("id")
      .maybeSingle();
    if (runError) throw new Error(runError.message);
    const started = Date.now();
    const paths = files.map((file) => file.path);
    const { error: writeError } = await context.supabase
      .from("project_files" as never)
      .upsert(files.map((file) => ({ project_id: data.projectId, path: file.path, content: file.content, language: file.language })) as never, { onConflict: "project_id,path" } as never);
    if (writeError) {
      await context.supabase.from("target_build_runs" as never).update({ status: "failed", logs: writeError.message, duration_ms: Date.now() - started } as never).eq("id" as never, (run as { id: string } | null)?.id as never);
      throw new Error(writeError.message);
    }
    const readiness = targetReadiness(data.target, adapters, config);
    await context.supabase
      .from("target_build_runs" as never)
      .update({
        status: readiness.productionReady ? "success" : "blocked",
        artifact_paths: paths,
        logs: `Generated ${files.length} ${data.target} target files. ${readiness.productionReady ? "Ready for pipeline execution." : `Blocked by missing adapters: ${readiness.missingAdapters.join(", ") || "health checks"}.`}`,
        duration_ms: Date.now() - started,
      } as never)
      .eq("id" as never, (run as { id: string } | null)?.id as never);
    return { ok: true, runId: (run as { id: string } | null)?.id, files: files.length, paths, readiness };
  });