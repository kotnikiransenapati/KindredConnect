// P41 — Agentic Playwright test author server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, enforceRateLimit, generateSpec, simulateRun, type SelectorStrategy } from "./ai-tests.server";

const db = (ctx: any) => ctx.supabase as any;
const StrategyZ = z.enum(["role", "testid", "text", "css", "auto"]);

export const listSuites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("ai_test_suites")
      .select("*").eq("project_id", data.projectId).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertSuite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    name: z.string().min(2).max(120),
    baseUrl: z.string().url().optional().or(z.literal("")),
    target: z.string().max(200).optional(),
    status: z.enum(["active", "paused", "archived"]).default("active"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "suite", 30);
    const payload: any = {
      project_id: data.projectId, name: data.name,
      base_url: data.baseUrl || null, target: data.target ?? null,
      status: data.status, created_by: context.userId,
    };
    if (data.id) payload.id = data.id;
    const { data: saved, error } = await db(context).from("ai_test_suites")
      .upsert(payload, { onConflict: data.id ? "id" : "project_id,name" }).select("*").single();
    if (error) throw new Error(error.code === "23505" ? "Suite name already exists" : error.message);
    return saved;
  });

export const listCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ suiteId: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("ai_test_cases")
      .select("*").eq("suite_id", data.suiteId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const authorCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    suiteId: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string().min(2).max(160),
    userStory: z.string().min(8).max(4000),
    selectorStrategy: StrategyZ.default("auto"),
    maxRetries: z.number().int().min(0).max(8).default(3),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "author", 20);
    const { data: suite } = await db(context).from("ai_test_suites")
      .select("base_url").eq("id", data.suiteId).single();
    const spec = generateSpec(data.title, data.userStory, suite?.base_url ?? null, data.selectorStrategy as SelectorStrategy);
    const { data: saved, error } = await db(context).from("ai_test_cases").insert({
      suite_id: data.suiteId, project_id: data.projectId,
      title: data.title, user_story: data.userStory,
      spec_code: spec, selector_strategy: data.selectorStrategy, max_retries: data.maxRetries,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const deleteCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    const { error } = await db(context).from("ai_test_cases").delete()
      .eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const runCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "run", 60);
    const { data: tc, error: ce } = await db(context).from("ai_test_cases")
      .select("*").eq("id", data.caseId).eq("project_id", data.projectId).single();
    if (ce || !tc) throw new Error(ce?.message ?? "Case not found");

    const runs: any[] = [];
    let final: "passed" | "failed" | "healed" | "flaky" = "failed";
    for (let attempt = 1; attempt <= tc.max_retries + 1; attempt++) {
      const out = simulateRun(tc.spec_code, attempt);
      const { data: runRow } = await db(context).from("ai_test_runs").insert({
        case_id: data.caseId, project_id: data.projectId,
        attempt, status: out.status, duration_ms: out.durationMs,
        failure_reason: out.failureReason ?? null,
        healed_locators: out.healed ?? [],
        logs_excerpt: `Attempt ${attempt}: ${out.status} in ${out.durationMs}ms${out.failureReason ? ` — ${out.failureReason}` : ""}`,
      }).select("*").single();
      runs.push(runRow);
      if (out.status === "passed") { final = attempt === 1 ? "passed" : "flaky"; break; }
      if (out.status === "healed") { final = "healed"; break; }
    }
    await db(context).from("ai_test_cases").update({
      last_status: final, last_run_at: new Date().toISOString(),
    }).eq("id", data.caseId);
    return { final, runs };
  });

export const listRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("ai_test_runs")
      .select("*").eq("case_id", data.caseId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const testStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: cases } = await db(context).from("ai_test_cases")
      .select("last_status").eq("project_id", data.projectId);
    const all = (cases ?? []) as Array<{ last_status: string }>;
    return {
      total: all.length,
      passed: all.filter((c) => c.last_status === "passed").length,
      failed: all.filter((c) => c.last_status === "failed").length,
      healed: all.filter((c) => c.last_status === "healed").length,
      flaky: all.filter((c) => c.last_status === "flaky").length,
    };
  });
