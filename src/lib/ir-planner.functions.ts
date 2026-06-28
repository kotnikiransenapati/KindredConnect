// B2 — Planner server functions. Thin wrappers; heavy work in ir-planner.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hashIr, IrSchema } from "./ir.shared";

const RunInput = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(8).max(4000),
  model: z.string().default("google/gemini-2.5-flash"),
  apply: z.boolean().default(false),
});

export const runIrPlanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof RunInput>) => RunInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: ratelimit } = await supabase.rpc("check_rate_limit" as never, {
      _user_id: userId, _bucket: "ir_planner", _window: "1 minute", _max: 6,
    } as never);
    if (ratelimit === false) throw new Error("Rate limit: try again in a minute.");

    const { data: runRow } = await supabase.from("ir_plan_runs" as never).insert({
      project_id: data.projectId, user_id: userId, prompt: data.prompt,
      status: "running", model: data.model,
    } as never).select("id").maybeSingle();
    const runId = (runRow as { id?: string } | null)?.id;

    const { planIr } = await import("./ir-planner.server");
    let result: Awaited<ReturnType<typeof planIr>>;
    try {
      result = await planIr(data.prompt, data.model);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (runId) {
        await supabase.from("ir_plan_runs" as never).update({
          status: "error", errors: [{ attempt: 0, message: msg }], attempts: 0,
        } as never).eq("id" as never, runId as never);
      }
      throw e;
    }

    let appliedRevisionId: string | undefined;
    if (result.ok && data.apply) {
      const parsed = IrSchema.parse(result.ir);
      const ir_hash = hashIr(parsed);
      const { data: existing } = await supabase.from("project_ir" as never)
        .select("version").eq("project_id" as never, data.projectId as never).maybeSingle();
      const nextVersion = ((existing as { version?: number } | null)?.version ?? 0) + 1;
      await supabase.from("project_ir" as never).upsert({
        project_id: data.projectId, ir: parsed, ir_hash, version: nextVersion, updated_by: userId,
      } as never, { onConflict: "project_id" } as never);
      const { data: rev } = await supabase.from("ir_revisions" as never).insert({
        project_id: data.projectId, version: nextVersion, ir: parsed, ir_hash,
        source: "planner", author_id: userId, note: data.prompt.slice(0, 240),
      } as never).select("id").maybeSingle();
      appliedRevisionId = (rev as { id?: string } | null)?.id;
    }

    if (runId) {
      await supabase.from("ir_plan_runs" as never).update({
        status: result.ok ? "succeeded" : "failed",
        attempts: result.attempts,
        spec: result.ir,
        errors: result.errors,
        tokens_in: result.tokensIn,
        tokens_out: result.tokensOut,
        applied_revision_id: appliedRevisionId ?? null,
      } as never).eq("id" as never, runId as never);
    }

    return {
      ok: result.ok, attempts: result.attempts, errors: result.errors,
      ir: result.ir, tokensIn: result.tokensIn, tokensOut: result.tokensOut,
      runId, appliedRevisionId,
    };
  });

export const listPlanRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.from("ir_plan_runs" as never)
      .select("id, prompt, status, attempts, errors, model, tokens_in, tokens_out, created_at, applied_revision_id")
      .eq("project_id" as never, data.projectId as never)
      .order("created_at" as never, { ascending: false })
      .limit(20);
    return { runs: (rows ?? []) as Array<{
      id: string; prompt: string; status: string; attempts: number;
      errors: unknown; model: string | null; tokens_in: number; tokens_out: number;
      created_at: string; applied_revision_id: string | null;
    }> };
  });
