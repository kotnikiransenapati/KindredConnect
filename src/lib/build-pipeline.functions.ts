// P40 — Build pipeline orchestrator server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, enforceRateLimit, nextRunnable, simulateOutcome, validateStages, type StageDef } from "./build-pipeline.server";

const db = (ctx: any) => ctx.supabase as any;
const TriggerZ = z.enum(["manual", "push", "schedule", "webhook", "release"]);
const KindZ = z.enum(["apk","aab","ipa","zip","wasm","image","log","sbom","source-map","other"]);
const StageZ = z.object({
  key: z.string(),
  name: z.string().min(1).max(80),
  dependsOn: z.array(z.string()).max(10).optional(),
  maxAttempts: z.number().int().min(1).max(5).optional(),
  command: z.string().max(500).optional(),
});

export const listPipelines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context)
      .from("build_pipelines").select("*").eq("project_id", data.projectId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertPipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    name: z.string().min(2).max(120),
    description: z.string().max(500).optional(),
    trigger: TriggerZ.default("manual"),
    scheduleCron: z.string().max(80).optional(),
    stages: z.array(StageZ).min(1).max(30),
    enabled: z.boolean().default(true),
    concurrency: z.number().int().min(1).max(20).default(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "upsert", 30);
    const stages = validateStages(data.stages as StageDef[]);
    const payload: any = {
      project_id: data.projectId, name: data.name, description: data.description ?? null,
      trigger: data.trigger, schedule_cron: data.scheduleCron ?? null, stages,
      enabled: data.enabled, concurrency: data.concurrency, created_by: context.userId,
    };
    if (data.id) payload.id = data.id;
    const { data: saved, error } = await db(context).from("build_pipelines")
      .upsert(payload, { onConflict: data.id ? "id" : "project_id,name" })
      .select("*").single();
    if (error) throw new Error(error.code === "23505" ? "Pipeline name already exists" : error.message);
    return saved;
  });

export const deletePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("build_pipelines")
      .delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const triggerRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    pipelineId: z.string().uuid(),
    projectId: z.string().uuid(),
    trigger: TriggerZ.default("manual"),
    commitSha: z.string().max(80).optional(),
    ref: z.string().max(200).optional(),
    inputs: z.record(z.string(), z.any()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "run", 30);
    const { data: pipe, error: pe } = await db(context).from("build_pipelines")
      .select("*").eq("id", data.pipelineId).eq("project_id", data.projectId).single();
    if (pe || !pipe) throw new Error(pe?.message ?? "Pipeline not found");
    if (!pipe.enabled) throw new Error("Pipeline disabled");

    // Concurrency cap
    const { count: active } = await db(context).from("build_pipeline_runs")
      .select("id", { count: "exact", head: true })
      .eq("pipeline_id", data.pipelineId).in("status", ["queued", "running"]);
    if ((active ?? 0) >= pipe.concurrency) throw new Error(`Concurrency cap reached (${pipe.concurrency})`);

    // Compute next run_number
    const { data: last } = await db(context).from("build_pipeline_runs")
      .select("run_number").eq("pipeline_id", data.pipelineId)
      .order("run_number", { ascending: false }).limit(1).maybeSingle();
    const runNumber = Number(last?.run_number ?? 0) + 1;

    const { data: run, error: re } = await db(context).from("build_pipeline_runs").insert({
      pipeline_id: data.pipelineId, project_id: data.projectId, run_number: runNumber,
      trigger: data.trigger, status: "queued", commit_sha: data.commitSha ?? null,
      ref: data.ref ?? null, inputs: data.inputs ?? {}, triggered_by: context.userId,
    }).select("*").single();
    if (re) throw new Error(re.message);

    const stages = (pipe.stages as StageDef[]) ?? [];
    if (stages.length > 0) {
      const jobsPayload = stages.map(s => ({
        run_id: run.id, project_id: data.projectId,
        stage_key: s.key, stage_name: s.name,
        depends_on: s.dependsOn ?? [], max_attempts: s.maxAttempts ?? 1, status: "pending",
      }));
      const { error: je } = await db(context).from("build_pipeline_jobs").insert(jobsPayload);
      if (je) throw new Error(je.message);
    }
    return run;
  });

export const runDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const [{ data: run }, { data: jobs }, { data: artifacts }] = await Promise.all([
      db(context).from("build_pipeline_runs").select("*").eq("id", data.runId).eq("project_id", data.projectId).single(),
      db(context).from("build_pipeline_jobs").select("*").eq("run_id", data.runId).order("created_at", { ascending: true }),
      db(context).from("build_artifacts").select("*").eq("run_id", data.runId).order("created_at", { ascending: false }),
    ]);
    return { run, jobs: jobs ?? [], artifacts: artifacts ?? [] };
  });

export const listRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), pipelineId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    let q = db(context).from("build_pipeline_runs").select("*, build_pipelines(name)")
      .eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(50);
    if (data.pipelineId) q = q.eq("pipeline_id", data.pipelineId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const advanceRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "advance", 60);
    const { data: run, error: re } = await db(context).from("build_pipeline_runs")
      .select("*").eq("id", data.runId).eq("project_id", data.projectId).single();
    if (re || !run) throw new Error(re?.message ?? "Run not found");
    if (["succeeded", "failed", "cancelled", "timed_out"].includes(run.status)) {
      return { run, advanced: 0, finalized: true };
    }
    const { data: pipe } = await db(context).from("build_pipelines").select("stages").eq("id", run.pipeline_id).single();
    const stages = ((pipe?.stages ?? []) as StageDef[]);
    const { data: jobs } = await db(context).from("build_pipeline_jobs")
      .select("*").eq("run_id", data.runId);
    const jobsArr = jobs ?? [];
    const runnable = nextRunnable(stages, jobsArr);

    const startedAt = run.started_at ?? new Date().toISOString();
    let advanced = 0;
    for (const stage of runnable) {
      const existing = jobsArr.find((j: any) => j.stage_key === stage.key);
      const attempt = (existing?.attempt ?? 0) + 1;
      const outcome = simulateOutcome(stage.key, attempt);
      const startedAtStage = new Date().toISOString();
      const finishedAtStage = new Date(Date.now() + outcome.durationMs).toISOString();
      await db(context).from("build_pipeline_jobs").update({
        status: outcome.status, attempt, logs_excerpt: outcome.logs, exit_code: outcome.exitCode,
        started_at: startedAtStage, finished_at: finishedAtStage, duration_ms: outcome.durationMs,
      }).eq("id", existing!.id);
      advanced++;
    }

    // Re-load jobs to compute new run status
    const { data: latest } = await db(context).from("build_pipeline_jobs").select("status, max_attempts, attempt").eq("run_id", data.runId);
    const all = (latest ?? []) as Array<{ status: string; max_attempts: number; attempt: number }>;
    const anyFailedTerminally = all.some((j) => j.status === "failed" && j.attempt >= j.max_attempts);
    const allDone = all.every((j) => ["succeeded", "skipped", "cancelled"].includes(j.status));
    let newStatus = run.status;
    let finished: string | null = null;
    if (anyFailedTerminally) { newStatus = "failed"; finished = new Date().toISOString(); }
    else if (allDone) { newStatus = "succeeded"; finished = new Date().toISOString(); }
    else { newStatus = "running"; }

    const patch: any = { status: newStatus, started_at: startedAt };
    if (finished) {
      patch.finished_at = finished;
      patch.duration_ms = Math.max(0, new Date(finished).getTime() - new Date(startedAt).getTime());
    }
    const { data: updated } = await db(context).from("build_pipeline_runs")
      .update(patch).eq("id", data.runId).select("*").single();
    return { run: updated, advanced, finalized: !!finished };
  });

export const cancelRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    const finished = new Date().toISOString();
    const { error: je } = await db(context).from("build_pipeline_jobs")
      .update({ status: "cancelled", finished_at: finished })
      .eq("run_id", data.runId).in("status", ["pending", "queued", "running"]);
    if (je) throw new Error(je.message);
    const { data: updated, error } = await db(context).from("build_pipeline_runs")
      .update({ status: "cancelled", finished_at: finished }).eq("id", data.runId)
      .eq("project_id", data.projectId).select("*").single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const attachArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    runId: z.string().uuid(),
    projectId: z.string().uuid(),
    jobId: z.string().uuid().optional(),
    name: z.string().min(1).max(160),
    kind: KindZ,
    sizeBytes: z.number().int().min(0).max(8 * 1024 ** 3),
    checksum: z.string().max(200).optional(),
    storagePath: z.string().min(1).max(400),
    retentionDays: z.number().int().min(1).max(3650).default(30),
    metadata: z.record(z.string(), z.any()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "artifact", 60);
    const { data: saved, error } = await db(context).from("build_artifacts").insert({
      run_id: data.runId, project_id: data.projectId, job_id: data.jobId ?? null,
      name: data.name, kind: data.kind, size_bytes: data.sizeBytes,
      checksum: data.checksum ?? null, storage_path: data.storagePath,
      retention_days: data.retentionDays, metadata: data.metadata ?? {},
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const pipelineStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: runs } = await db(context).from("build_pipeline_runs")
      .select("status, duration_ms").eq("project_id", data.projectId).gte("created_at", since).limit(500);
    const all = runs ?? [];
    const total = all.length;
    const success = all.filter((r: any) => r.status === "succeeded").length;
    const failed = all.filter((r: any) => r.status === "failed").length;
    const avgMs = all.filter((r: any) => r.duration_ms).reduce((s: number, r: any) => s + r.duration_ms, 0) / Math.max(1, all.filter((r: any) => r.duration_ms).length);
    return {
      totalRuns: total,
      successRate: total ? Math.round((success / total) * 1000) / 10 : 0,
      failed,
      avgDurationMs: Math.round(avgMs || 0),
    };
  });
