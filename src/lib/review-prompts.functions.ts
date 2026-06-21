// P32 — In-app review prompts with sentiment routing.
// Campaigns define WHEN to ask; responses are routed to store / support /
// dismissed based on rating + lexical sentiment scoring (server-side, no
// external API), then exposed as an aggregate dashboard.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TriggerZ = z.enum(["on_open","after_event","after_purchase","after_session_count","manual"]);

async function assertEditor(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "editor",
  });
  if (error || !data) throw new Error("Forbidden");
}
async function assertViewer(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "viewer",
  });
  if (error || !data) throw new Error("Forbidden");
}
async function rateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId, _bucket: bucket, _window: "1 minute", _max: max,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Rate limit exceeded");
}

// Lightweight lexical sentiment scorer. Returns -1..1.
const POS = ["love","great","amazing","awesome","perfect","excellent","fast","smooth","beautiful","helpful","easy","best"];
const NEG = ["hate","bad","slow","crash","crashes","buggy","broken","worst","awful","terrible","useless","laggy","ugly"];
const NEG_BOOST = ["not","never","no"];

export function scoreSentiment(text: string): number {
  if (!text) return 0;
  const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
  let s = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : "";
    const flip = NEG_BOOST.includes(prev) ? -1 : 1;
    if (POS.includes(t)) s += 1 * flip;
    else if (NEG.includes(t)) s -= 1 * flip;
  }
  const denom = Math.max(8, tokens.length);
  return Math.max(-1, Math.min(1, s / denom * 4));
}

function decideRoute(rating: number, sentiment: number, threshold: number): "store"|"support"|"dismissed" {
  if (rating >= threshold && sentiment >= 0) return "store";
  if (rating <= 2 || sentiment <= -0.2) return "support";
  return "dismissed";
}

export const listPrompts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertViewer(context, data.projectId);
    const { data: rows, error } = await context.supabase.from("review_prompts")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; id?: string; name: string; trigger: z.infer<typeof TriggerZ>;
    triggerEvent?: string; minSessions?: number; cooldownDays?: number;
    sentimentThreshold?: number; enabled?: boolean; copy?: Record<string, unknown>;
  }) => z.object({
    projectId: z.string().uuid(), id: z.string().uuid().optional(),
    name: z.string().min(1).max(120),
    trigger: TriggerZ,
    triggerEvent: z.string().max(120).optional(),
    minSessions: z.number().int().min(0).max(10000).optional(),
    cooldownDays: z.number().int().min(0).max(3650).optional(),
    sentimentThreshold: z.number().int().min(1).max(5).optional(),
    enabled: z.boolean().optional(),
    copy: z.record(z.string(), z.any()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    await rateLimit(context, `review_prompt:${data.projectId}`, 30);
    if (data.trigger === "after_event" && !data.triggerEvent)
      throw new Error("trigger_event required for after_event");
    const payload = {
      project_id: data.projectId, name: data.name, trigger: data.trigger,
      trigger_event: data.triggerEvent ?? null,
      min_sessions: data.minSessions ?? 3,
      cooldown_days: data.cooldownDays ?? 90,
      sentiment_threshold: data.sentimentThreshold ?? 4,
      enabled: data.enabled ?? true,
      copy: data.copy ?? {},
    };
    if (data.id) {
      const { data: row, error } = await context.supabase.from("review_prompts")
        .update(payload).eq("id", data.id).eq("project_id", data.projectId).select("*").single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase.from("review_prompts")
      .insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; id: string }) =>
    z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const { error } = await context.supabase.from("review_prompts")
      .delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; promptId?: string; subjectId: string; rating: number;
    comment?: string; platform?: "ios"|"android"|"web"; appVersion?: string;
  }) => z.object({
    projectId: z.string().uuid(),
    promptId: z.string().uuid().optional(),
    subjectId: z.string().min(1).max(200),
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
    platform: z.enum(["ios","android","web"]).optional(),
    appVersion: z.string().max(40).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertViewer(context, data.projectId);
    await rateLimit(context, `review_resp:${data.projectId}`, 120);
    let threshold = 4;
    if (data.promptId) {
      const { data: p } = await context.supabase.from("review_prompts")
        .select("sentiment_threshold").eq("id", data.promptId)
        .eq("project_id", data.projectId).maybeSingle();
      if (p) threshold = p.sentiment_threshold ?? 4;
    }
    const sentiment = scoreSentiment(data.comment ?? "");
    const routed = decideRoute(data.rating, sentiment, threshold);
    const { data: row, error } = await context.supabase.from("review_responses").insert({
      project_id: data.projectId, prompt_id: data.promptId ?? null,
      subject_id: data.subjectId, rating: data.rating, comment: data.comment ?? null,
      sentiment: Number(sentiment.toFixed(3)), routed_to: routed,
      platform: data.platform ?? null, app_version: data.appVersion ?? null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { routedTo: routed, sentiment: Number(sentiment.toFixed(3)), id: row.id };
  });

export const reviewStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; days?: number }) =>
    z.object({ projectId: z.string().uuid(), days: z.number().int().min(1).max(365).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertViewer(context, data.projectId);
    const since = new Date(Date.now() - (data.days ?? 30) * 86400_000).toISOString();
    const { data: rows, error } = await context.supabase.from("review_responses")
      .select("rating,sentiment,routed_to,platform,created_at,comment")
      .eq("project_id", data.projectId).gte("created_at", since)
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    const totals = { count: 0, avgRating: 0, avgSentiment: 0,
      store: 0, support: 0, dismissed: 0, byRating: [0,0,0,0,0] as number[] };
    let r = 0, s = 0;
    for (const x of rows ?? []) {
      totals.count += 1; r += Number(x.rating);
      s += Number(x.sentiment ?? 0);
      const route = x.routed_to as "store"|"support"|"dismissed";
      totals[route] = (totals[route] ?? 0) + 1;
      totals.byRating[(x.rating as number) - 1] += 1;
    }
    if (totals.count) { totals.avgRating = +(r / totals.count).toFixed(2);
      totals.avgSentiment = +(s / totals.count).toFixed(3); }
    return { totals, recent: rows ?? [] };
  });
