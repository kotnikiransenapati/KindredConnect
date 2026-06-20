import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { AGENT_BY_ROLE, type AgentRole } from "./agents.catalog";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const FAST_MODEL = "google/gemini-3-flash-preview";
const CAPABLE_MODEL = "google/gemini-3-pro-preview";

function systemPromptFor(role: AgentRole, goal: string): string {
  const def = AGENT_BY_ROLE[role];
  return [
    `You are the ${def.name} agent in a multi-agent app-builder swarm.`,
    `Role: ${def.tagline}. ${def.description}`,
    `Tools available (conceptual): ${def.tools.join(", ")}.`,
    "",
    "Produce a concise, actionable response focused only on your specialty.",
    "Structure your answer as Markdown with: ## Plan, ## Deliverables, ## Risks.",
    "Keep it under ~300 words. Do NOT speculate outside your role.",
    "",
    `User goal: ${goal}`,
  ].join("\n");
}

/**
 * Execute one queued agent task: call the AI gateway, persist the assistant
 * message, mark the task succeeded/failed, and update the run's token/cost
 * aggregates + usage_ledger row.
 *
 * This is the worker loop primitive — `runQueuedTasks` iterates over a run's
 * queued tasks and invokes this once per task with bounded concurrency.
 */
export const executeAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!lovableKey) throw new Error("Missing LOVABLE_API_KEY");

    // Claim the task atomically: only proceed if still queued.
    const { data: claimed, error: claimErr } = await supabase
      .from("agent_tasks")
      .update({ status: "running", started_at: new Date().toISOString(), attempt: 1 })
      .eq("id", data.taskId)
      .eq("status", "queued")
      .select("id,run_id,project_id,role,title,input")
      .maybeSingle();
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed) return { ok: true, skipped: true };

    const role = claimed.role as AgentRole;
    const def = AGENT_BY_ROLE[role];
    const goal = (claimed.input as { goal?: string })?.goal ?? "";
    const modelId = def?.model === "capable" ? CAPABLE_MODEL : FAST_MODEL;
    const gateway = createLovableAiGatewayProvider(lovableKey);

    try {
      const { text, usage } = await generateText({
        model: gateway.chatModel(modelId),
        system: systemPromptFor(role, goal),
        prompt: `Task: ${claimed.title}\n\nDeliver your specialist output now.`,
      });
      const tokens = (usage?.totalTokens ?? 0) | 0;

      await supabase.from("agent_messages").insert({
        task_id: claimed.id,
        project_id: claimed.project_id,
        role: "assistant",
        parts: [{ type: "text", text }],
        tokens,
      });

      await supabase
        .from("agent_tasks")
        .update({
          status: "succeeded",
          output: { text },
          tokens,
          finished_at: new Date().toISOString(),
        })
        .eq("id", claimed.id);

      // Aggregate into run + ledger (best-effort; do not fail the task on these).
      await supabase.rpc; // noop type guard
      const { data: run } = await supabase
        .from("agent_runs")
        .select("total_tokens")
        .eq("id", claimed.run_id)
        .maybeSingle();
      if (run) {
        await supabase
          .from("agent_runs")
          .update({ total_tokens: (run.total_tokens ?? 0) + tokens })
          .eq("id", claimed.run_id);
      }
      await supabase.from("usage_ledger").insert({
        user_id: userId,
        project_id: claimed.project_id,
        run_id: claimed.run_id,
        kind: "ai_tokens",
        tokens,
        cost_cents: 0,
        meta: { role, model: modelId },
      });

      return { ok: true, taskId: claimed.id, tokens };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("agent_tasks")
        .update({
          status: "failed",
          error: message.slice(0, 1000),
          finished_at: new Date().toISOString(),
        })
        .eq("id", claimed.id);
      return { ok: false, taskId: claimed.id, error: message };
    }
  });

/**
 * Drain all queued tasks for a run with bounded concurrency. Marks the run
 * succeeded/failed at the end based on task outcomes.
 */
export const runQueuedTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tasks, error } = await supabase
      .from("agent_tasks")
      .select("id")
      .eq("run_id", data.runId)
      .eq("status", "queued")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    const ids = (tasks ?? []).map((t) => t.id);
    const CONCURRENCY = 3;
    let cursor = 0;
    const results: Array<{ ok: boolean }> = [];

    async function worker() {
      while (cursor < ids.length) {
        const idx = cursor++;
        const id = ids[idx];
        const r = await executeAgentTask({ data: { taskId: id } });
        results.push({ ok: r.ok !== false });
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));

    const failed = results.filter((r) => !r.ok).length;
    await supabase
      .from("agent_runs")
      .update({
        status: failed === results.length && results.length > 0 ? "failed" : "succeeded",
        finished_at: new Date().toISOString(),
        error: failed > 0 ? `${failed}/${results.length} tasks failed` : null,
      })
      .eq("id", data.runId);

    return { ok: true, total: results.length, failed };
  });
