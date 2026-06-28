// B7 — Replayable pipeline timeline events for generation/build/deploy readiness.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPTY_IR, IrSchema, generateFilesFromIr, hashIr, lintIr, type IrIssue } from "./ir.shared";

const ProjectInput = z.object({ projectId: z.string().uuid(), runId: z.string().optional() });

type PipelineEvent = {
  project_id: string;
  run_id: string;
  sequence: number;
  stage: string;
  status: "queued" | "running" | "succeeded" | "failed" | "blocked" | "skipped";
  severity: "debug" | "info" | "warn" | "error";
  message: string;
  payload: Record<string, unknown>;
  actor_id: string;
};

async function requireEditor(context: { supabase: any; userId: string }, projectId: string) {
  const { data: allowed } = await context.supabase.rpc("has_project_role", {
    _project_id: projectId,
    _user_id: context.userId,
    _min_role: "editor",
  });
  if (!allowed) throw new Error("Forbidden");
}

export const runPipelineReplay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context, data.projectId);
    const runId = `pipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const { data: row } = await context.supabase
      .from("project_ir" as never)
      .select("ir, ir_hash, version")
      .eq("project_id" as never, data.projectId as never)
      .maybeSingle();
    const ir = IrSchema.parse((row as unknown as { ir: unknown } | null)?.ir ?? EMPTY_IR);
    const issues = lintIr(ir);
    const files = generateFilesFromIr(ir);
    const adapters = ir.integrations.map((integration) => `${integration.kind}:${integration.provider}`);
    const blocking = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity === "warn");

    const events: PipelineEvent[] = [];
    const push = (stage: string, status: PipelineEvent["status"], severity: PipelineEvent["severity"], message: string, payload: Record<string, unknown> = {}) => {
      events.push({ project_id: data.projectId, run_id: runId, sequence: events.length + 1, stage, status, severity, message, payload, actor_id: context.userId });
    };

    push("prompt", "succeeded", "info", "IR snapshot loaded", { version: (row as unknown as { version?: number } | null)?.version ?? 0, irHash: hashIr(ir) });
    push("validate", blocking.length ? "blocked" : "succeeded", blocking.length ? "error" : warnings.length ? "warn" : "info", blocking.length ? "IR has blocking validation errors" : warnings.length ? "IR is valid with warnings" : "IR is valid", { issues: issues satisfies IrIssue[] });
    push("codegen", blocking.length ? "skipped" : "succeeded", blocking.length ? "warn" : "info", blocking.length ? "Codegen skipped until validation passes" : `Generated ${files.length} deterministic files`, { files: files.map((file) => ({ path: file.path, bytes: file.content.length })) });
    push("security", blocking.length ? "skipped" : "succeeded", "info", "Generated database artifacts include grants and row-policy scaffolds", { models: ir.models.length, policyModes: ir.models.map((model) => ({ model: model.name, rls: model.rls })) });
    push("adapters", adapters.length ? "succeeded" : "blocked", adapters.length ? "info" : "warn", adapters.length ? "Runtime adapters resolved" : "No runtime adapters selected yet", { adapters });
    push("preview", blocking.length || !adapters.length ? "blocked" : "queued", blocking.length || !adapters.length ? "warn" : "info", blocking.length || !adapters.length ? "Preview package waiting for validation/adapters" : "Preview package ready for sandbox build", { routes: ir.pages.map((page) => page.route) });

    const { error } = await context.supabase.from("pipeline_events" as never).insert(events as never);
    if (error) throw new Error(error.message);
    return { ok: true, runId, events };
  });

export const listPipelineEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof ProjectInput>) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("pipeline_events" as never)
      .select("id, run_id, sequence, stage, status, severity, message, payload, created_at")
      .eq("project_id" as never, data.projectId as never)
      .order("created_at" as never, { ascending: false })
      .order("sequence" as never, { ascending: true })
      .limit(120);
    if (data.runId) query = query.eq("run_id" as never, data.runId as never);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return { events: (rows ?? []) as Array<{ id: string; run_id: string; sequence: number; stage: string; status: string; severity: string; message: string; payload: Record<string, unknown>; created_at: string }> };
  });