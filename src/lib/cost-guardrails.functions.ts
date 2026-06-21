// P48 — AI cost guardrails server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, enforceRateLimit } from "./_phase22.shared";
import { evaluateBudget, periodWindow } from "./cost-guardrails.server";

const db = (ctx: any) => ctx.supabase as any;
const PeriodZ = z.enum(["hourly", "daily", "weekly", "monthly"]);
const ScopeZ = z.enum(["project", "org", "user", "route"]);
const ActionZ = z.enum(["alert", "throttle", "block"]);

export const listBudgets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("ai_cost_budgets")
      .select("*").eq("project_id", data.projectId).order("name");
    if (error) throw new Error(error.message);

    const enriched = await Promise.all((rows ?? []).map(async (b: any) => {
      const { data: spendRows } = await db(context).from("ai_cost_ledger")
        .select("cost_usd").eq("budget_id", b.id).gte("occurred_at", periodWindow(b.period).toISOString());
      const spend = (spendRows ?? []).reduce((s: number, r: any) => s + Number(r.cost_usd ?? 0), 0);
      const ev = evaluateBudget(Number(b.limit_usd), b.soft_pct, b.hard_pct, spend);
      return { ...b, spend: Number(spend.toFixed(4)), pct: ev.pct, level: ev.level };
    }));
    return enriched;
  });

export const upsertBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    name: z.string().min(2).max(80),
    scope: ScopeZ.default("project"),
    period: PeriodZ.default("monthly"),
    limitUsd: z.number().min(0.01).max(1_000_000),
    softPct: z.number().int().min(1).max(100).default(80),
    hardPct: z.number().int().min(1).max(200).default(100),
    action: ActionZ.default("throttle"),
    enabled: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    await enforceRateLimit(context, "cost:budget", 30);
    if (data.softPct > data.hardPct) throw new Error("Soft threshold must be ≤ hard threshold");
    const payload: any = {
      project_id: data.projectId, name: data.name, scope: data.scope, period: data.period,
      limit_usd: data.limitUsd, soft_pct: data.softPct, hard_pct: data.hardPct,
      action: data.action, enabled: data.enabled,
    };
    if (data.id) payload.id = data.id;
    const { data: saved, error } = await db(context).from("ai_cost_budgets")
      .upsert(payload, { onConflict: data.id ? "id" : "project_id,name" }).select("*").single();
    if (error) throw new Error(error.code === "23505" ? "Budget name already exists" : error.message);
    return saved;
  });

export const deleteBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("ai_cost_budgets").delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordSpend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    budgetId: z.string().uuid().optional(),
    provider: z.string().min(1).max(40),
    model: z.string().min(1).max(120),
    inputTokens: z.number().int().min(0).max(2_000_000).default(0),
    outputTokens: z.number().int().min(0).max(2_000_000).default(0),
    costUsd: z.number().min(0).max(10_000),
    route: z.string().max(80).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "cost:record", 300);

    // Enforce 'block' action if budget hard-exhausted
    if (data.budgetId) {
      const { data: budget } = await db(context).from("ai_cost_budgets").select("*").eq("id", data.budgetId).single();
      if (budget?.enabled) {
        const { data: prior } = await db(context).from("ai_cost_ledger")
          .select("cost_usd").eq("budget_id", budget.id).gte("occurred_at", periodWindow(budget.period).toISOString());
        const spendBefore = (prior ?? []).reduce((s: number, r: any) => s + Number(r.cost_usd), 0);
        const after = spendBefore + data.costUsd;
        const ev = evaluateBudget(Number(budget.limit_usd), budget.soft_pct, budget.hard_pct, after);
        if (ev.level === "hard" && budget.action === "block") {
          throw new Error(`Budget "${budget.name}" exhausted (${ev.pct}% of $${budget.limit_usd}); blocked`);
        }
        if (ev.level !== "ok") {
          await db(context).from("ai_cost_alerts").insert({
            project_id: data.projectId, budget_id: budget.id, threshold: ev.level,
            current_spend: Number(after.toFixed(4)), limit_usd: Number(budget.limit_usd),
          });
        }
      }
    }

    const { data: saved, error } = await db(context).from("ai_cost_ledger").insert({
      project_id: data.projectId, budget_id: data.budgetId ?? null, user_id: context.userId,
      provider: data.provider, model: data.model, input_tokens: data.inputTokens,
      output_tokens: data.outputTokens, cost_usd: data.costUsd, route: data.route ?? null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const listAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("ai_cost_alerts")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const ackAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    const { error } = await db(context).from("ai_cost_alerts")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: context.userId })
      .eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const ledgerSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const { data: rows } = await db(context).from("ai_cost_ledger")
      .select("*").eq("project_id", data.projectId).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(500);
    const list = (rows ?? []) as any[];
    const total = Number(list.reduce((s, r) => s + Number(r.cost_usd), 0).toFixed(4));
    const byModel: Record<string, number> = {};
    list.forEach((r) => { byModel[r.model] = Number(((byModel[r.model] ?? 0) + Number(r.cost_usd)).toFixed(4)); });
    return { total, byModel, recent: list.slice(0, 20) };
  });
