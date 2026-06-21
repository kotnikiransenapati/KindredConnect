// P28 — Canary rollouts with auto-promote / auto-rollback.
// Multi-stage release (e.g. 5% → 25% → 100%) with per-stage crash & error
// budgets in PPM. Server evaluates the most recent metric row for the current
// stage and decides advance | hold | rollback.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StatusZ = z.enum(["draft", "active", "paused", "promoting", "promoted", "rolled_back", "aborted"]);
const StageZ = z.object({
  percent: z.number().int().min(1).max(100),
  hold_minutes: z.number().int().min(0).max(7 * 24 * 60),
});

const ALLOWED: Record<string, string[]> = {
  draft: ["active", "aborted"],
  active: ["paused", "promoting", "promoted", "rolled_back", "aborted"],
  paused: ["active", "rolled_back", "aborted"],
  promoting: ["active", "promoted", "rolled_back"],
  promoted: [],
  rolled_back: [],
  aborted: [],
};

async function assertEditor(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "editor",
  });
  if (error || !data) throw new Error("Forbidden");
}

async function recordEvent(ctx: any, rolloutId: string, projectId: string,
  event: string, stage: number | null, status: string | null, detail: string | null) {
  await ctx.supabase.from("canary_events").insert({
    rollout_id: rolloutId, project_id: projectId, event,
    stage, status, detail, actor_id: ctx.userId,
  });
}

export const listRollouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("canary_rollouts")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createRollout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; name: string; artifactRef: string; baselineRef?: string;
    stages?: Array<z.infer<typeof StageZ>>; crashBudgetPpm?: number; errorBudgetPpm?: number;
  }) => z.object({
    projectId: z.string().uuid(), name: z.string().min(1).max(120),
    artifactRef: z.string().min(1).max(200), baselineRef: z.string().max(200).optional(),
    stages: z.array(StageZ).min(1).max(10).optional(),
    crashBudgetPpm: z.number().int().min(0).max(1_000_000).optional(),
    errorBudgetPpm: z.number().int().min(0).max(1_000_000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    // ensure stages are monotonically increasing
    const stages = data.stages ?? [{ percent: 5, hold_minutes: 15 }, { percent: 25, hold_minutes: 30 }, { percent: 100, hold_minutes: 0 }];
    for (let i = 1; i < stages.length; i++) {
      if (stages[i].percent <= stages[i - 1].percent) throw new Error("Stages must be strictly increasing");
    }
    const { data: row, error } = await context.supabase.from("canary_rollouts").insert({
      project_id: data.projectId, name: data.name,
      artifact_ref: data.artifactRef, baseline_ref: data.baselineRef ?? null,
      stages, crash_budget_ppm: data.crashBudgetPpm ?? 5000,
      error_budget_ppm: data.errorBudgetPpm ?? 20000,
      created_by: context.userId,
    }).select().single();
    if (error) throw new Error(error.message);
    await recordEvent(context, row.id, data.projectId, "created", 0, "draft", `artifact=${data.artifactRef}`);
    return row;
  });

export const startRollout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; projectId: string }) =>
    z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const { data: cur } = await context.supabase.from("canary_rollouts")
      .select("status").eq("id", data.id).single();
    if (!cur || !ALLOWED[cur.status]?.includes("active")) throw new Error("Cannot start");
    const { error } = await context.supabase.from("canary_rollouts").update({
      status: "active", current_stage: 0, started_at: new Date().toISOString(),
    }).eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    await recordEvent(context, data.id, data.projectId, "started", 0, "active", null);
    return { ok: true };
  });

export const recordMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    rolloutId: string; projectId: string;
    sessions: number; crashes: number; errors: number; p95LatencyMs?: number; source?: string;
  }) => z.object({
    rolloutId: z.string().uuid(), projectId: z.string().uuid(),
    sessions: z.number().int().min(0).max(1_000_000_000),
    crashes: z.number().int().min(0).max(1_000_000_000),
    errors: z.number().int().min(0).max(1_000_000_000),
    p95LatencyMs: z.number().finite().min(0).optional(),
    source: z.string().max(40).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ro } = await context.supabase.from("canary_rollouts")
      .select("current_stage, status").eq("id", data.rolloutId).eq("project_id", data.projectId).single();
    if (!ro) throw new Error("Rollout not found");
    const { error } = await context.supabase.from("canary_metrics").insert({
      rollout_id: data.rolloutId, project_id: data.projectId,
      stage: ro.current_stage, sessions: data.sessions,
      crashes: data.crashes, errors: data.errors,
      p95_latency_ms: data.p95LatencyMs ?? null, source: data.source ?? "manual",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type Decision = { decision: "advance" | "hold" | "rollback" | "complete" | "stale"; reason: string; ppmCrash?: number; ppmError?: number };

export const evaluateRollout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; projectId: string; apply?: boolean }) =>
    z.object({ id: z.string().uuid(), projectId: z.string().uuid(), apply: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }): Promise<Decision & { rolloutId: string }> => {
    await assertEditor(context, data.projectId);
    const { data: ro } = await context.supabase.from("canary_rollouts")
      .select("*").eq("id", data.id).eq("project_id", data.projectId).single();
    if (!ro) throw new Error("Not found");
    if (ro.status !== "active") return { rolloutId: data.id, decision: "hold", reason: `status=${ro.status}` };

    const stages = (ro.stages as Array<{ percent: number; hold_minutes: number }>) ?? [];
    const stage = stages[ro.current_stage];
    if (!stage) return { rolloutId: data.id, decision: "complete", reason: "no_more_stages" };

    // aggregate metrics for current stage
    const { data: mrows } = await context.supabase.from("canary_metrics")
      .select("sessions,crashes,errors,recorded_at")
      .eq("rollout_id", data.id).eq("stage", ro.current_stage)
      .order("recorded_at", { ascending: false }).limit(200);
    const ms = (mrows ?? []) as Array<{ sessions: number; crashes: number; errors: number; recorded_at: string }>;
    if (!ms.length) return { rolloutId: data.id, decision: "stale", reason: "no_metrics" };

    const sessions = ms.reduce((s, r) => s + r.sessions, 0);
    const crashes = ms.reduce((s, r) => s + r.crashes, 0);
    const errors = ms.reduce((s, r) => s + r.errors, 0);
    if (sessions < 50) return { rolloutId: data.id, decision: "hold", reason: `low_sample sessions=${sessions}` };

    const ppmCrash = Math.round((crashes / sessions) * 1_000_000);
    const ppmError = Math.round((errors / sessions) * 1_000_000);

    let decision: Decision["decision"] = "hold";
    let reason = "within_budget_warming";
    if (ppmCrash > ro.crash_budget_ppm || ppmError > ro.error_budget_ppm) {
      decision = "rollback";
      reason = `budget_exceeded crash=${ppmCrash}/${ro.crash_budget_ppm}ppm error=${ppmError}/${ro.error_budget_ppm}ppm`;
    } else {
      // hold period satisfied?
      const startedAt = new Date(ro.started_at ?? ro.created_at).getTime();
      const elapsed = (Date.now() - startedAt) / 60000;
      if (elapsed >= stage.hold_minutes) {
        decision = ro.current_stage + 1 >= stages.length ? "complete" : "advance";
        reason = `hold_met (${elapsed.toFixed(1)}m≥${stage.hold_minutes}m)`;
      } else {
        reason = `hold_pending (${elapsed.toFixed(1)}m<${stage.hold_minutes}m)`;
      }
    }

    if (data.apply) {
      if (decision === "advance") {
        await context.supabase.from("canary_rollouts").update({
          current_stage: ro.current_stage + 1, status: "active",
        }).eq("id", data.id);
        await recordEvent(context, data.id, data.projectId, "stage_advanced", ro.current_stage + 1, "active", reason);
      } else if (decision === "complete") {
        await context.supabase.from("canary_rollouts").update({
          status: "promoted", ended_at: new Date().toISOString(),
        }).eq("id", data.id);
        await recordEvent(context, data.id, data.projectId, "promoted", ro.current_stage, "promoted", reason);
      } else if (decision === "rollback") {
        await context.supabase.from("canary_rollouts").update({
          status: "rolled_back", ended_at: new Date().toISOString(),
        }).eq("id", data.id);
        await recordEvent(context, data.id, data.projectId, "rolled_back", ro.current_stage, "rolled_back", reason);
      }
    }
    return { rolloutId: data.id, decision, reason, ppmCrash, ppmError };
  });

export const transitionRollout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; projectId: string; status: z.infer<typeof StatusZ>; detail?: string }) =>
    z.object({
      id: z.string().uuid(), projectId: z.string().uuid(),
      status: StatusZ, detail: z.string().max(300).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const { data: cur } = await context.supabase.from("canary_rollouts")
      .select("status, current_stage").eq("id", data.id).single();
    if (!cur) throw new Error("Not found");
    const allowed = ALLOWED[cur.status] ?? [];
    if (!allowed.includes(data.status)) throw new Error(`Illegal transition ${cur.status}→${data.status}`);
    const patch: any = { status: data.status };
    if (["promoted", "rolled_back", "aborted"].includes(data.status)) patch.ended_at = new Date().toISOString();
    const { error } = await context.supabase.from("canary_rollouts").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordEvent(context, data.id, data.projectId, "transition", cur.current_stage, data.status, data.detail ?? null);
    return { ok: true };
  });

export const rolloutEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rolloutId: string }) => z.object({ rolloutId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("canary_events")
      .select("*").eq("rollout_id", data.rolloutId).order("occurred_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const rolloutMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rolloutId: string }) => z.object({ rolloutId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("canary_metrics")
      .select("*").eq("rollout_id", data.rolloutId).order("recorded_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
