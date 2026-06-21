// P25 — In-app A/B Experiments + Feature Flags.
// Deterministic per-subject assignment via SHA-256(experimentKey:subjectId),
// weighted variant bucketing, idempotent exposure logging, server-side
// guardrails on traffic %, status FSM and rollout caps.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash } from "crypto";

const KeyZ = z.string().regex(/^[a-z0-9][a-z0-9_\-.]{1,63}$/i, "invalid key");
const StatusZ = z.enum(["draft", "running", "paused", "completed", "archived"]);
const VariantZ = z.object({
  key: z.string().regex(/^[a-z0-9_\-]{1,32}$/i),
  weight: z.number().int().min(0).max(10000),
  payload: z.record(z.any()).optional(),
});

const ALLOWED: Record<string, string[]> = {
  draft: ["running", "archived"],
  running: ["paused", "completed"],
  paused: ["running", "completed", "archived"],
  completed: ["archived"],
  archived: [],
};

function hashBucket(seed: string, subject: string, max = 10000) {
  const h = createHash("sha256").update(`${seed}:${subject}`).digest();
  // first 4 bytes → uint32 → mod max
  const n = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
  return n % max;
}

function pickVariant(variants: Array<{ key: string; weight: number }>, bucket: number, max = 10000) {
  const total = variants.reduce((s, v) => s + Math.max(0, v.weight), 0) || 1;
  const scaled = Math.floor((bucket / max) * total);
  let acc = 0;
  for (const v of variants) {
    acc += Math.max(0, v.weight);
    if (scaled < acc) return v.key;
  }
  return variants[variants.length - 1].key;
}

async function assertEditor(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "editor",
  });
  if (error || !data) throw new Error("Forbidden");
}

// ---------- Feature flags ----------
export const listFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("feature_flags")
      .select("*").eq("project_id", data.projectId).order("key");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; key: string; description?: string;
    enabled: boolean; rolloutPercent: number; rules?: any[];
  }) => z.object({
    projectId: z.string().uuid(), key: KeyZ, description: z.string().max(500).optional(),
    enabled: z.boolean(), rolloutPercent: z.number().int().min(0).max(100),
    rules: z.array(z.record(z.any())).max(50).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "flags_write", _window: "1 minute", _max: 60,
    });
    if (ok.error || ok.data === false) throw new Error("Rate limited");
    const { data: row, error } = await context.supabase.from("feature_flags").upsert({
      project_id: data.projectId, key: data.key, description: data.description ?? null,
      enabled: data.enabled, rollout_percent: data.rolloutPercent,
      rules: data.rules ?? [], created_by: context.userId,
    }, { onConflict: "project_id,key" }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; projectId: string }) =>
    z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const { error } = await context.supabase.from("feature_flags")
      .delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const evaluateFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; key: string; subjectId: string }) =>
    z.object({ projectId: z.string().uuid(), key: KeyZ, subjectId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: f } = await context.supabase.from("feature_flags").select("*")
      .eq("project_id", data.projectId).eq("key", data.key).maybeSingle();
    if (!f) return { enabled: false, reason: "not_found" };
    if (!f.enabled) return { enabled: false, reason: "disabled" };
    const bucket = hashBucket(`ff:${f.key}`, data.subjectId, 100);
    const within = bucket < f.rollout_percent;
    return { enabled: within, reason: within ? "rollout" : "outside_rollout", bucket };
  });

// ---------- Experiments ----------
export const listExperiments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("experiments")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertExperiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; key: string; hypothesis?: string; primaryMetric: string;
    trafficPercent: number; variants: Array<{ key: string; weight: number; payload?: any }>;
  }) => z.object({
    projectId: z.string().uuid(), key: KeyZ, hypothesis: z.string().max(2000).optional(),
    primaryMetric: KeyZ, trafficPercent: z.number().int().min(0).max(100),
    variants: z.array(VariantZ).min(2).max(10),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const sum = data.variants.reduce((s, v) => s + v.weight, 0);
    if (sum <= 0) throw new Error("Variant weights must sum > 0");
    const { data: row, error } = await context.supabase.from("experiments").upsert({
      project_id: data.projectId, key: data.key, hypothesis: data.hypothesis ?? null,
      primary_metric: data.primaryMetric, traffic_percent: data.trafficPercent,
      variants: data.variants, created_by: context.userId,
    }, { onConflict: "project_id,key" }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const transitionExperiment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; projectId: string; status: z.infer<typeof StatusZ> }) =>
    z.object({ id: z.string().uuid(), projectId: z.string().uuid(), status: StatusZ }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const { data: cur } = await context.supabase.from("experiments")
      .select("status").eq("id", data.id).single();
    if (!cur) throw new Error("Not found");
    const allowed = ALLOWED[cur.status as string] ?? [];
    if (!allowed.includes(data.status)) throw new Error(`Illegal transition ${cur.status}→${data.status}`);
    const patch: any = { status: data.status };
    if (data.status === "running" && cur.status === "draft") patch.started_at = new Date().toISOString();
    if (data.status === "completed") patch.ended_at = new Date().toISOString();
    const { error } = await context.supabase.from("experiments")
      .update(patch).eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { experimentId: string; projectId: string; subjectId: string }) =>
    z.object({
      experimentId: z.string().uuid(), projectId: z.string().uuid(),
      subjectId: z.string().min(1).max(200),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: exp } = await context.supabase.from("experiments")
      .select("*").eq("id", data.experimentId).eq("project_id", data.projectId).maybeSingle();
    if (!exp) throw new Error("Experiment not found");
    if (exp.status !== "running") return { variant: null, reason: `status_${exp.status}` };

    // sticky assignment
    const { data: existing } = await context.supabase.from("experiment_assignments")
      .select("variant").eq("experiment_id", data.experimentId).eq("subject_id", data.subjectId).maybeSingle();
    if (existing) return { variant: existing.variant, reason: "sticky" };

    // traffic gate
    const trafficBucket = hashBucket(`traffic:${exp.key}`, data.subjectId, 100);
    if (trafficBucket >= exp.traffic_percent) return { variant: null, reason: "out_of_traffic" };

    const variant = pickVariant(exp.variants as any[], hashBucket(`split:${exp.key}`, data.subjectId));
    const { error } = await context.supabase.from("experiment_assignments").insert({
      experiment_id: data.experimentId, project_id: data.projectId,
      subject_id: data.subjectId, variant,
    });
    if (error && !String(error.message).includes("duplicate")) throw new Error(error.message);
    return { variant, reason: "assigned" };
  });

export const trackExposure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    experimentId: string; projectId: string; subjectId: string;
    metricKey: string; metricValue?: number; isConversion?: boolean; properties?: Record<string, any>;
  }) => z.object({
    experimentId: z.string().uuid(), projectId: z.string().uuid(),
    subjectId: z.string().min(1).max(200), metricKey: KeyZ,
    metricValue: z.number().finite().optional(),
    isConversion: z.boolean().optional(),
    properties: z.record(z.any()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "exp_exposure", _window: "1 minute", _max: 600,
    });
    if (ok.error || ok.data === false) throw new Error("Rate limited");
    const { data: assn } = await context.supabase.from("experiment_assignments")
      .select("variant").eq("experiment_id", data.experimentId).eq("subject_id", data.subjectId).maybeSingle();
    if (!assn) throw new Error("Subject not assigned");
    const { error } = await context.supabase.from("experiment_exposures").insert({
      experiment_id: data.experimentId, project_id: data.projectId,
      subject_id: data.subjectId, variant: assn.variant,
      metric_key: data.metricKey, metric_value: data.metricValue ?? 1,
      is_conversion: data.isConversion ?? false, properties: data.properties ?? {},
    });
    if (error) throw new Error(error.message);
    return { ok: true, variant: assn.variant };
  });

export const experimentResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { experimentId: string }) => z.object({ experimentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("experiment_results", {
      _exp_id: data.experimentId, _user_id: context.userId,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
