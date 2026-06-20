import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertRateLimit } from "./rate-limit.server";
import { nextCronFire, parseCron } from "./cron-parser.server";

const CRON_REGEX = /^(@hourly|@daily|@weekly|@monthly|[\d*,/\-\s]+)$/;

const ScheduleInput = z.object({
  id: z.string().uuid().optional(),
  projectId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  goal: z.string().trim().min(8).max(2000),
  cron: z.string().trim().min(2).max(80).regex(CRON_REGEX, "Invalid cron expression"),
  roles: z.array(z.string()).max(13).default([]),
  enabled: z.boolean().default(true),
});

/** Owner-or-editor: create or update a recurring background agent schedule. */
export const upsertAgentSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof ScheduleInput>) => ScheduleInput.parse(d))
  .handler(async ({ data, context }) => {
    // Validate cron eagerly so the user gets a clear error.
    const nextRun = nextCronFire(data.cron);
    parseCron(data.cron);

    await assertRateLimit(context.userId, "agent_schedule_upsert", "1 minute", 10);

    const row = {
      project_id: data.projectId,
      user_id: context.userId,
      name: data.name,
      goal: data.goal,
      cron: data.cron,
      roles: data.roles,
      enabled: data.enabled,
      next_run_at: nextRun.toISOString(),
    };

    const q = data.id
      ? context.supabase.from("agent_schedules").update(row).eq("id", data.id).select().single()
      : context.supabase.from("agent_schedules").insert(row).select().single();
    const { data: out, error } = await q;
    if (error) throw new Error(error.message);
    return out;
  });

export const listAgentSchedules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_schedules")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deleteAgentSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agent_schedules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Manual run-now: bumps next_run_at to now() so the next tick picks it up. */
export const triggerScheduleNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertRateLimit(context.userId, "agent_schedule_trigger", "1 minute", 12);
    const { error } = await context.supabase
      .from("agent_schedules")
      .update({ next_run_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- Proposals ----------------

export const listProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_proposals")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const ReviewInput = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "reject", "apply"]),
});

/**
 * Review a background proposal.
 *   - approve/reject: just flips status.
 *   - apply: writes each diff entry { path, content } into project_files as the user.
 */
export const reviewProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof ReviewInput>) => ReviewInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRateLimit(context.userId, "agent_proposal_review", "1 minute", 30);
    const { data: prop, error: pErr } = await context.supabase
      .from("agent_proposals").select("*").eq("id", data.id).single();
    if (pErr || !prop) throw new Error(pErr?.message ?? "Proposal not found.");

    if (data.action === "approve") {
      await context.supabase.from("agent_proposals").update({ status: "approved" }).eq("id", data.id);
      return { ok: true, status: "approved" };
    }
    if (data.action === "reject") {
      await context.supabase.from("agent_proposals").update({ status: "rejected" }).eq("id", data.id);
      return { ok: true, status: "rejected" };
    }

    // apply: write each file edit through RLS as the user (must be editor).
    const diff = Array.isArray(prop.diff) ? prop.diff as Array<{ path: string; content: string }> : [];
    let applied = 0;
    for (const change of diff) {
      if (typeof change?.path !== "string" || typeof change?.content !== "string") continue;
      const { error: upErr } = await context.supabase
        .from("project_files")
        .upsert(
          { project_id: prop.project_id, path: change.path, content: change.content, updated_by: context.userId },
          { onConflict: "project_id,path" },
        );
      if (upErr) throw new Error(`Apply failed at ${change.path}: ${upErr.message}`);
      applied++;
    }
    await context.supabase.from("agent_proposals").update({ status: "applied" }).eq("id", data.id);
    return { ok: true, status: "applied", filesChanged: applied };
  });
