import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
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
    "Structure your answer as Markdown with sections: ## Plan, ## Deliverables, ## Risks.",
    "Keep it under ~300 words. Do not speculate outside your role.",
    "",
    `User goal: ${goal}`,
  ].join("\n");
}

/**
 * Core task executor — claims a queued task, runs the LLM, persists
 * messages + token aggregates. Shared between the single-task RPC and the
 * batch `runQueuedTasks` worker.
 */
async function runOneTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  taskId: string,
  lovableKey: string,
): Promise<{ ok: boolean; tokens: number; error?: string }> {
  // Atomic claim
  const { data: claimed, error: claimErr } = await supabase
    .from("agent_tasks")
    .update({ status: "running", started_at: new Date().toISOString(), attempt: 1 })
    .eq("id", taskId)
    .eq("status", "queued")
    .select("id,run_id,project_id,role,title,input")
    .maybeSingle();
  if (claimErr) throw new Error(claimErr.message);
  if (!claimed) return { ok: true, tokens: 0 };

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

    return { ok: true, tokens };
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
    return { ok: false, tokens: 0, error: message };
  }
}

/** Execute one queued agent task (RPC). */
export const executeAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    return runOneTask(context.supabase, context.userId, data.taskId, key);
  });

/**
 * Drain all queued tasks for a run with bounded concurrency, then mark the
 * run succeeded/failed based on aggregate outcomes.
 */
export const runQueuedTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const key: string | undefined = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const apiKey: string = key;

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
        const id = ids[cursor++];
        if (!id) break;
        const r = await runOneTask(supabase, userId, id, key);
        results.push({ ok: r.ok });
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, ids.length) || 1 }, worker),
    );

    const failed = results.filter((r) => !r.ok).length;
    const allFailed = results.length > 0 && failed === results.length;
    await supabase
      .from("agent_runs")
      .update({
        status: allFailed ? "failed" : "succeeded",
        finished_at: new Date().toISOString(),
        error: failed > 0 ? `${failed}/${results.length} tasks failed` : null,
      })
      .eq("id", data.runId);

    return { ok: true, total: results.length, failed };
  });
