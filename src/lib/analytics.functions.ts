// Product analytics: ingest events + read aggregates for the dashboard.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

const EventInput = z.object({
  projectId: z.string().uuid(),
  eventName: z.string().min(1).max(120).regex(/^[a-z0-9_.:-]+$/i, "letters, numbers, ._-:"),
  sessionId: z.string().max(64).optional(),
  path: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
  properties: z.record(z.string(), z.any()).optional(),
});

export const trackEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EventInput.parse(d))
  .handler(async ({ data, context }) => {
    // Per-user rate limit (high — typical analytics volume).
    const rl = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "analytics_ingest", _window: "1 minute", _max: 600,
    });
    if (rl.data === false) throw new Error("Analytics rate limit exceeded.");

    const country = getRequestHeader("cf-ipcountry") ?? null;
    const { error } = await context.supabase.from("analytics_events").insert({
      project_id: data.projectId,
      user_id: context.userId,
      session_id: data.sessionId ?? null,
      event_name: data.eventName,
      path: data.path ?? null,
      referrer: data.referrer ?? null,
      country,
      properties: data.properties ?? {},
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAnalyticsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), days: z.number().int().min(1).max(90).default(30) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const to = new Date();
    const from = new Date(to.getTime() - data.days * 86400_000);

    // Daily counts via rpc
    const { data: dailyRows, error: dErr } = await context.supabase.rpc("analytics_daily_counts", {
      _project_id: data.projectId, _user_id: context.userId,
      _from: from.toISOString(), _to: to.toISOString(),
    });
    if (dErr) throw new Error(dErr.message);

    // Top events
    const { data: rawRows } = await context.supabase
      .from("analytics_events")
      .select("event_name, session_id, user_id, path, country, occurred_at")
      .eq("project_id", data.projectId)
      .gte("occurred_at", from.toISOString())
      .order("occurred_at", { ascending: false })
      .limit(5000);

    const rows = rawRows ?? [];
    const topEvents: Record<string, number> = {};
    const sessions = new Set<string>();
    const users = new Set<string>();
    const countries: Record<string, number> = {};
    const paths: Record<string, number> = {};
    for (const r of rows) {
      topEvents[r.event_name] = (topEvents[r.event_name] ?? 0) + 1;
      if (r.session_id) sessions.add(r.session_id);
      if (r.user_id) users.add(r.user_id);
      if (r.country) countries[r.country] = (countries[r.country] ?? 0) + 1;
      if (r.path) paths[r.path] = (paths[r.path] ?? 0) + 1;
    }

    return {
      totals: { events: rows.length, sessions: sessions.size, users: users.size },
      daily: (dailyRows ?? []) as Array<{ day: string; event_name: string; count: number }>,
      topEvents: Object.entries(topEvents).sort((a, b) => b[1] - a[1]).slice(0, 10),
      topCountries: Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 8),
      topPaths: Object.entries(paths).sort((a, b) => b[1] - a[1]).slice(0, 8),
      recent: rows.slice(0, 50),
    };
  });

export const computeFunnel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      steps: z.array(z.string().min(1)).min(2).max(6),
      days: z.number().int().min(1).max(90).default(14),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const from = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("analytics_events")
      .select("session_id, event_name, occurred_at")
      .eq("project_id", data.projectId)
      .in("event_name", data.steps)
      .gte("occurred_at", from)
      .order("occurred_at", { ascending: true })
      .limit(20_000);
    if (error) throw new Error(error.message);

    // Group by session, then check ordered step presence.
    const bySession = new Map<string, string[]>();
    for (const r of rows ?? []) {
      if (!r.session_id) continue;
      const arr = bySession.get(r.session_id) ?? [];
      arr.push(r.event_name);
      bySession.set(r.session_id, arr);
    }

    const counts = data.steps.map(() => 0);
    for (const events of bySession.values()) {
      let idx = 0;
      for (const e of events) {
        if (e === data.steps[idx]) {
          counts[idx]++;
          idx++;
          if (idx >= data.steps.length) break;
        }
      }
    }

    const base = counts[0] || 1;
    return {
      steps: data.steps.map((name, i) => ({
        name,
        count: counts[i],
        conversion: counts[i] / base,
        dropoff: i === 0 ? 0 : (counts[i - 1] - counts[i]) / (counts[i - 1] || 1),
      })),
      totalSessions: bySession.size,
    };
  });
