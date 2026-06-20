import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { assertRateLimit } from "./rate-limit.server";

const FAST_MODEL = "google/gemini-3-flash-preview";

export const listHealingEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("deploy_healing").select("*").eq("project_id", data.projectId)
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const TriggerInput = z.object({
  projectId: z.string().uuid(),
  deploymentId: z.string().uuid(),
  ciGateId: z.string().uuid().optional(),
  mode: z.enum(["rollback", "proposal", "auto"]).default("auto"),
});

/**
 * Self-heal a broken deployment.
 *   - Loads the failing CI gate (if provided) for context.
 *   - mode=rollback (or auto+no AI): find the most recent successful previous
 *     deployment, flip is_current → it. Audit log row.
 *   - mode=proposal (or auto+AI available): ask the AI for a minimal fix
 *     summary and create an agent_proposal the user can review/apply.
 *
 * All writes go through the authenticated user; RLS enforces editor role.
 */
export const triggerSelfHeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof TriggerInput>) => TriggerInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRateLimit(context.userId, "self_heal_min", "1 minute", 6);
    await assertRateLimit(context.userId, "self_heal_day", "1 day", 100);

    const { supabase } = context;

    const { data: deployment, error: depErr } = await supabase
      .from("deployments").select("*").eq("id", data.deploymentId).single();
    if (depErr || !deployment) throw new Error(depErr?.message ?? "Deployment not found");

    let gate: any = null;
    if (data.ciGateId) {
      const { data: g } = await supabase.from("ci_gates").select("*").eq("id", data.ciGateId).maybeSingle();
      gate = g;
    }

    // Pick action.
    const lovableKey = process.env.LOVABLE_API_KEY;
    const mode = data.mode === "auto" ? (lovableKey ? "proposal" : "rollback") : data.mode;

    if (mode === "rollback") {
      const { data: previous } = await supabase
        .from("deployments")
        .select("id,version_num,status")
        .eq("project_id", data.projectId)
        .eq("slug", deployment.slug)
        .lt("version_num", deployment.version_num)
        .eq("status", "ready")
        .order("version_num", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: healRow, error: healErr } = await supabase.from("deploy_healing").insert({
        project_id: data.projectId,
        deployment_id: data.deploymentId,
        ci_gate_id: data.ciGateId ?? null,
        action: "rollback",
        status: previous ? "pending" : "failed",
        rollback_to_deployment_id: previous?.id ?? null,
        summary: previous
          ? `Rolling back v${deployment.version_num} → v${previous.version_num}`
          : "No previous successful deployment to roll back to.",
        detail: { gate: gate ? { kind: gate.kind, score: gate.score, status: gate.status } : null },
      }).select().single();
      if (healErr) throw new Error(healErr.message);
      if (!previous) return { ok: false, action: "rollback", reason: "no_prior_deployment" };

      // Flip is_current atomically: clear, then set previous.
      await supabase.from("deployments").update({ is_current: false })
        .eq("project_id", data.projectId).eq("slug", deployment.slug);
      const { error: setErr } = await supabase.from("deployments").update({ is_current: true })
        .eq("id", previous.id);
      if (setErr) {
        await supabase.from("deploy_healing").update({ status: "failed", summary: setErr.message }).eq("id", healRow.id);
        throw new Error(setErr.message);
      }
      await supabase.from("deploy_healing").update({ status: "succeeded" }).eq("id", healRow.id);
      return { ok: true, action: "rollback", rolledBackTo: previous.id };
    }

    // mode === "proposal": ask AI for a remediation summary + per-file diff.
    if (!lovableKey) throw new Error("AI gateway not configured for proposal mode.");

    const gateSummary = gate
      ? `Failing gate: ${gate.kind} · status=${gate.status} · score=${gate.score ?? "n/a"}\nReport (truncated): ${JSON.stringify(gate.report ?? {}).slice(0, 1500)}`
      : "No CI gate details provided.";

    const gateway = createLovableAiGatewayProvider(lovableKey);
    const { text } = await generateText({
      model: gateway(FAST_MODEL),
      system: `You are a senior reliability engineer. A deployment just failed a CI gate.
Propose the SMALLEST safe change to make the gate pass.
Reply with a one-paragraph summary only — no code, no markdown.`,
      prompt: `${gateSummary}\n\nDeployment label: ${deployment.label ?? `v${deployment.version_num}`}.`,
    });

    const summary = text.trim().slice(0, 1200);

    const { data: prop, error: propErr } = await supabase.from("agent_proposals").insert({
      project_id: data.projectId,
      title: `Self-heal: ${gate?.kind ?? "deployment"} regression in v${deployment.version_num}`,
      summary,
      diff: [],
      status: "pending",
    }).select().single();
    if (propErr || !prop) throw new Error(propErr?.message ?? "Failed to write proposal");

    const { data: healRow, error: healErr } = await supabase.from("deploy_healing").insert({
      project_id: data.projectId,
      deployment_id: data.deploymentId,
      ci_gate_id: data.ciGateId ?? null,
      action: "proposal",
      status: "succeeded",
      proposal_id: prop.id,
      summary,
      detail: { model: FAST_MODEL, gate: gate?.kind ?? null },
    }).select().single();
    if (healErr) throw new Error(healErr.message);

    return { ok: true, action: "proposal", proposalId: prop.id, healId: healRow.id };
  });
