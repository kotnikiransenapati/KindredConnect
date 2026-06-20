import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { AGENTS, type AgentRole } from "./agents.catalog";
import { assertRateLimit } from "./rate-limit.server";

const RoleEnum = z.enum([
  "orchestrator", "architect", "designer", "frontend", "backend", "mobile",
  "data", "integrations", "qa", "security", "perf", "reviewer", "release",
]);

/**
 * Start a new multi-agent run. The orchestrator decomposes the goal into
 * a seed plan (a list of specialist tasks). Actual agent execution happens
 * asynchronously — workers pick up `queued` tasks from `agent_tasks`.
 */
export const startAgentRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; goal: string; roles?: AgentRole[] }) => d)
  .handler(async ({ data, context }) => {
    if (!data.goal || data.goal.trim().length < 4) throw new Error("Goal is too short.");
    await assertRateLimit(context.userId, "agent_run_min", "1 minute", 5);
    await assertRateLimit(context.userId, "agent_run_day", "1 day", 200);

    const { supabase, userId } = context;

    // Seed plan: pick the requested roles, or a sensible default fan-out.
    const roles: AgentRole[] = data.roles?.length
      ? data.roles
      : ["architect", "designer", "frontend", "backend", "mobile", "qa", "security", "release"];

    const { data: run, error: runErr } = await supabase
      .from("agent_runs")
      .insert({
        project_id: data.projectId,
        user_id: userId,
        goal: data.goal,
        status: "running",
        model: "google/gemini-3-flash-preview",
        plan: { roles },
        started_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (runErr || !run) throw new Error(runErr?.message ?? "Failed to create run.");

    // Orchestrator task (planning) + one queued task per specialist.
    const tasks = [
      {
        run_id: run.id, project_id: data.projectId, role: "orchestrator",
        title: "Plan the build",
        input: { goal: data.goal, roles },
        status: "succeeded",
        output: { roles, summary: `Dispatching ${roles.length} specialist agents.` },
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
      },
      ...roles.map((role) => ({
        run_id: run.id,
        project_id: data.projectId,
        role,
        title: `${role} — initial pass`,
        status: "queued",
        input: { goal: data.goal },
      })),
    ];
    const { error: tErr } = await supabase.from("agent_tasks").insert(tasks);
    if (tErr) throw new Error(tErr.message);

    return { runId: run.id, roles };
  });

export const listAgentRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: runs, error } = await context.supabase
      .from("agent_runs")
      .select("id,goal,status,total_tokens,total_cost_cents,created_at,started_at,finished_at,error")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { runs: runs ?? [] };
  });

export const getAgentRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => d)
  .handler(async ({ data, context }) => {
    const [{ data: run, error: rErr }, { data: tasks, error: tErr }] = await Promise.all([
      context.supabase.from("agent_runs").select("*").eq("id", data.runId).maybeSingle(),
      context.supabase
        .from("agent_tasks")
        .select("id,role,title,status,output,error,tokens,cost_cents,created_at,finished_at")
        .eq("run_id", data.runId)
        .order("created_at", { ascending: true }),
    ]);
    if (rErr) throw new Error(rErr.message);
    if (tErr) throw new Error(tErr.message);
    if (!run) throw new Error("Run not found.");
    return { run, tasks: tasks ?? [] };
  });

export const cancelAgentRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agent_runs")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", data.runId)
      .in("status", ["queued", "running"]);
    if (error) throw new Error(error.message);
    // Cancel pending tasks too
    await context.supabase
      .from("agent_tasks")
      .update({ status: "skipped", finished_at: new Date().toISOString() })
      .eq("run_id", data.runId)
      .in("status", ["queued", "running"]);
    return { ok: true };
  });

export const listAgentCatalog = createServerFn({ method: "GET" })
  .handler(async () => ({ agents: AGENTS }));

// Schema export for client typing reuse.
export const _AgentRoleSchema = RoleEnum;
