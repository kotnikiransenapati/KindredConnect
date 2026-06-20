/**
 * Public cron tick for background agent schedules.
 *
 * Call this from an external scheduler (every minute is fine) with:
 *   GET /api/public/agents/tick?secret=<AGENT_TICK_SECRET>
 *
 * For each enabled schedule whose next_run_at <= now():
 *   1) starts a new agent_run with status=running, owned by the schedule's user_id
 *   2) seeds one orchestrator task + one task per role
 *   3) advances next_run_at using the schedule's cron expression
 *
 * Security: bearer-style shared secret compared in constant time. No PII in errors.
 * Idempotency: processes at most 50 schedules per tick and uses
 * `next_run_at` advancement to avoid double-firing.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { nextCronFire } from "@/lib/cron-parser.server";

export const Route = createFileRoute("/api/public/agents/tick")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const provided = url.searchParams.get("secret") ?? "";
        const expected = process.env.AGENT_TICK_SECRET ?? "";
        if (!expected) return new Response("Tick disabled", { status: 503 });
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const nowIso = new Date().toISOString();

        const { data: due, error } = await supabaseAdmin
          .from("agent_schedules")
          .select("*")
          .eq("enabled", true)
          .lte("next_run_at", nowIso)
          .order("next_run_at", { ascending: true })
          .limit(50);
        if (error) return new Response(`Query failed: ${error.message}`, { status: 500 });

        const results: Array<{ id: string; status: string; reason?: string }> = [];

        for (const schedule of due ?? []) {
          try {
            const roles: string[] = Array.isArray(schedule.roles) && schedule.roles.length
              ? schedule.roles
              : ["architect", "frontend", "backend", "qa"];

            const { data: run, error: runErr } = await supabaseAdmin
              .from("agent_runs")
              .insert({
                project_id: schedule.project_id,
                user_id: schedule.user_id,
                goal: schedule.goal,
                status: "running",
                model: "google/gemini-3-flash-preview",
                plan: { roles, source: "schedule", schedule_id: schedule.id },
                started_at: nowIso,
              })
              .select()
              .single();
            if (runErr || !run) throw new Error(runErr?.message ?? "run insert failed");

            const tasks = [
              {
                run_id: run.id, project_id: schedule.project_id, role: "orchestrator",
                title: `Background plan: ${schedule.name}`,
                input: { goal: schedule.goal, roles, schedule_id: schedule.id },
                status: "succeeded",
                output: { roles, summary: `Background dispatch to ${roles.length} agents.` },
                started_at: nowIso, finished_at: nowIso,
              },
              ...roles.map((role) => ({
                run_id: run.id, project_id: schedule.project_id, role,
                title: `[${role}] ${schedule.goal.slice(0, 60)}`,
                input: { goal: schedule.goal },
                status: "queued",
              })),
            ];
            await supabaseAdmin.from("agent_tasks").insert(tasks);

            const next = nextCronFire(schedule.cron, new Date()).toISOString();
            await supabaseAdmin.from("agent_schedules").update({
              last_run_at: nowIso,
              last_run_id: run.id,
              next_run_at: next,
            }).eq("id", schedule.id);

            results.push({ id: schedule.id, status: "started" });
          } catch (e) {
            // Advance next_run_at a minute to avoid hot-looping a broken schedule.
            const skipUntil = new Date(Date.now() + 60_000).toISOString();
            await supabaseAdmin.from("agent_schedules").update({ next_run_at: skipUntil }).eq("id", schedule.id);
            results.push({ id: schedule.id, status: "error", reason: (e as Error).message });
          }
        }

        return Response.json({ ok: true, ticked: results.length, results });
      },
    },
  },
});
