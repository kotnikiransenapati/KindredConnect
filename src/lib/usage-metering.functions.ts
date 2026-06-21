// Billing-grade usage metering: meters, idempotent events, aggregation, invoicing.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { recordAudit } from "@/lib/audit.functions";

const METRIC_RE = /^[a-z][a-z0-9_.]{1,63}$/;

async function assertOrgRole(supabase: any, orgId: string, userId: string, min: "viewer" | "admin" | "owner") {
  const { data, error } = await supabase.rpc("has_org_role", { _org_id: orgId, _user_id: userId, _min_role: min });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

async function rateLimit(supabase: any, userId: string, bucket: string, max: number, perDay = false) {
  const { data } = await supabase.rpc("check_rate_limit", {
    _user_id: userId, _bucket: bucket, _window: perDay ? "1 day" : "1 minute", _max: max,
  });
  if (!data) throw new Error(`Rate limit exceeded: ${bucket}`);
}

// ---------- Meters CRUD ----------
export const listUsageMeters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("usage_meters").select("*").eq("org_id", data.orgId).order("metric_key");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertUsageMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      id: z.string().uuid().optional(),
      metricKey: z.string().regex(METRIC_RE),
      displayName: z.string().min(1).max(120),
      unit: z.string().min(1).max(32).default("unit"),
      aggregation: z.enum(["sum", "max", "last", "count"]).default("sum"),
      pricePerUnitCents: z.number().int().min(0).max(10_000_00),
      includedQuota: z.number().min(0),
      hardCap: z.number().min(0).nullable().optional(),
      enabled: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, data.orgId, context.userId, "admin");
    await rateLimit(context.supabase, context.userId, "meter.upsert", 30);
    const payload = {
      id: data.id,
      org_id: data.orgId,
      metric_key: data.metricKey,
      display_name: data.displayName,
      unit: data.unit,
      aggregation: data.aggregation,
      price_per_unit_cents: data.pricePerUnitCents,
      included_quota: data.includedQuota,
      hard_cap: data.hardCap ?? null,
      enabled: data.enabled,
    };
    const { data: row, error } = await context.supabase
      .from("usage_meters").upsert(payload, { onConflict: "org_id,metric_key" }).select().single();
    if (error) throw new Error(error.message);
    await recordAudit(context.supabase, context.userId, {
      action: "billing.plan_change", resourceType: "usage_meter", resourceId: row.id,
      orgId: data.orgId, metadata: { metric_key: data.metricKey },
    });
    return row;
  });

export const deleteUsageMeter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, data.orgId, context.userId, "owner");
    const { error } = await context.supabase.from("usage_meters").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Event ingest ----------
export const trackUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      projectId: z.string().uuid().optional(),
      metricKey: z.string().regex(METRIC_RE),
      quantity: z.number().min(0).max(1_000_000_000),
      idempotencyKey: z.string().min(1).max(128).optional(),
      properties: z.record(z.any()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, data.orgId, context.userId, "viewer");
    await rateLimit(context.supabase, context.userId, "usage.track", 600);
    // Resolve meter to enforce hard cap if any
    const { data: meter } = await context.supabase
      .from("usage_meters").select("id, hard_cap, enabled")
      .eq("org_id", data.orgId).eq("metric_key", data.metricKey).maybeSingle();
    if (meter && !meter.enabled) throw new Error("Meter disabled");
    if (meter?.hard_cap != null) {
      const { data: agg } = await context.supabase.rpc("usage_period_totals", {
        _org_id: data.orgId,
        _from: new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10),
        _to: new Date().toISOString().slice(0, 10),
      });
      const current = (agg ?? []).find((r: any) => r.metric_key === data.metricKey)?.total ?? 0;
      if (Number(current) + data.quantity > Number(meter.hard_cap)) {
        throw new Error("Hard cap exceeded for metric");
      }
    }
    const ins = {
      org_id: data.orgId,
      project_id: data.projectId ?? null,
      metric_key: data.metricKey,
      quantity: data.quantity,
      idempotency_key: data.idempotencyKey ?? null,
      actor_id: context.userId,
      properties: data.properties ?? {},
    };
    const { data: row, error } = await context.supabase
      .from("usage_events").upsert(ins, { onConflict: "org_id,metric_key,idempotency_key", ignoreDuplicates: true })
      .select().maybeSingle();
    if (error && !/duplicate/i.test(error.message)) throw new Error(error.message);
    return { ok: true, id: row?.id ?? null, deduped: !row };
  });

// ---------- Aggregation pipeline ----------
export const rollupUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, data.orgId, context.userId, "admin");
    await rateLimit(context.supabase, context.userId, "usage.rollup", 12);
    const { data: events, error } = await context.supabase
      .from("usage_events")
      .select("metric_key, quantity, occurred_at")
      .eq("org_id", data.orgId)
      .gte("occurred_at", `${data.from}T00:00:00Z`)
      .lte("occurred_at", `${data.to}T23:59:59Z`)
      .limit(50_000);
    if (error) throw new Error(error.message);
    const buckets = new Map<string, { total: number; count: number }>();
    for (const ev of events ?? []) {
      const day = (ev as any).occurred_at.slice(0, 10);
      const key = `${(ev as any).metric_key}|${day}`;
      const b = buckets.get(key) ?? { total: 0, count: 0 };
      b.total += Number((ev as any).quantity);
      b.count += 1;
      buckets.set(key, b);
    }
    const rows = Array.from(buckets.entries()).map(([k, v]) => {
      const [metric_key, day] = k.split("|");
      return { org_id: data.orgId, metric_key, day, total: v.total, event_count: v.count, computed_at: new Date().toISOString() };
    });
    if (rows.length) {
      const { error: upErr } = await context.supabase
        .from("usage_aggregates").upsert(rows, { onConflict: "org_id,metric_key,day" });
      if (upErr) throw new Error(upErr.message);
    }
    return { rolled: rows.length, events: events?.length ?? 0 };
  });

// ---------- Period totals & invoice ----------
export const getPeriodTotals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: totals, error } = await context.supabase.rpc("usage_period_totals", {
      _org_id: data.orgId, _from: data.from, _to: data.to,
    });
    if (error) throw new Error(error.message);
    return totals ?? [];
  });

export const generateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      currency: z.string().length(3).default("usd"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, data.orgId, context.userId, "admin");
    await rateLimit(context.supabase, context.userId, "invoice.gen", 6);
    const [{ data: meters }, { data: totals }] = await Promise.all([
      context.supabase.from("usage_meters").select("metric_key, display_name, unit, price_per_unit_cents, included_quota").eq("org_id", data.orgId),
      context.supabase.rpc("usage_period_totals", { _org_id: data.orgId, _from: data.from, _to: data.to }),
    ]);
    const meterMap = new Map((meters ?? []).map((m: any) => [m.metric_key, m]));
    let subtotal = 0;
    const lineItems = (totals ?? []).map((t: any) => {
      const m = meterMap.get(t.metric_key) as any;
      const used = Number(t.total);
      const billable = m ? Math.max(0, used - Number(m.included_quota)) : used;
      const price = m?.price_per_unit_cents ?? 0;
      const amount_cents = Math.round(billable * price);
      subtotal += amount_cents;
      return {
        metric_key: t.metric_key,
        display_name: m?.display_name ?? t.metric_key,
        unit: m?.unit ?? "unit",
        quantity: used,
        billable_quantity: billable,
        price_per_unit_cents: price,
        amount_cents,
      };
    });
    const { data: inv, error } = await context.supabase
      .from("usage_invoices").upsert({
        org_id: data.orgId,
        period_start: data.from,
        period_end: data.to,
        status: "draft",
        subtotal_cents: subtotal,
        currency: data.currency,
        line_items: lineItems,
        generated_by: context.userId,
        generated_at: new Date().toISOString(),
      }, { onConflict: "org_id,period_start,period_end" }).select().single();
    if (error) throw new Error(error.message);
    await recordAudit(context.supabase, context.userId, {
      action: "billing.plan_change", resourceType: "invoice", resourceId: inv.id,
      orgId: data.orgId, metadata: { subtotal_cents: subtotal, period: `${data.from}_${data.to}` },
    });
    return inv;
  });

export const listInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("usage_invoices").select("*").eq("org_id", data.orgId)
      .order("period_end", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const setInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(), orgId: z.string().uuid(),
    status: z.enum(["draft", "issued", "paid", "void"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, data.orgId, context.userId, "admin");
    const patch: any = { status: data.status };
    if (data.status === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await context.supabase.from("usage_invoices").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
