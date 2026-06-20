import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateText } from "ai";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { assertRateLimit } from "./rate-limit.server";

const MODEL_ID = "google/gemini-3-pro-preview";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "spec";

const SYSTEM = `You are a senior QA engineer. Convert a plain-English user story
into a single Playwright @playwright/test spec file in TypeScript.

Rules:
- Output ONLY the .ts file body. No markdown, no commentary, no fences.
- Always: import { test, expect } from "@playwright/test";
- Use a single test.describe block named after the feature.
- Prefer accessible selectors: getByRole, getByLabel, getByText.
- Use awaited assertions (await expect(...).toBeVisible(), toHaveURL, etc.).
- Use process.env.E2E_BASE_URL ?? "http://localhost:5173" as the starting page.
- No external dependencies, no fixtures, no fs/network mocks.
- Keep it deterministic and runnable as-is.`;

export const listE2eTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("e2e_tests").select("*").eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const GenInput = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  userStory: z.string().trim().min(12).max(4000),
});

/**
 * Generate a Playwright spec from a user story.
 * Creates the e2e_tests row in `generating`, calls the AI, writes the
 * generated spec into project_files (tests/e2e/<slug>.spec.ts), then
 * marks the row `ready`. Errors land in status=error with `error` filled.
 */
export const generateE2eTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof GenInput>) => GenInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertRateLimit(context.userId, "e2e_generate_min", "1 minute", 5);
    await assertRateLimit(context.userId, "e2e_generate_day", "1 day", 100);

    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!lovableKey) throw new Error("AI gateway not configured.");

    const slug = slugify(data.name);
    const specPath = `tests/e2e/${slug}.spec.ts`;

    const { data: row, error: insErr } = await context.supabase
      .from("e2e_tests")
      .upsert(
        {
          project_id: data.projectId,
          created_by: context.userId,
          name: data.name,
          user_story: data.userStory,
          spec_path: specPath,
          status: "generating",
          model: MODEL_ID,
          error: null,
        },
        { onConflict: "project_id,spec_path" },
      )
      .select()
      .single();
    if (insErr || !row) throw new Error(insErr?.message ?? "Failed to record test.");

    try {
      const gateway = createLovableAiGatewayProvider(lovableKey);
      const { text } = await generateText({
        model: gateway(MODEL_ID),
        system: SYSTEM,
        prompt: `Feature name: ${data.name}\n\nUser story:\n${data.userStory}\n\nProduce the .spec.ts now.`,
      });

      // Strip accidental code fences just in case.
      const cleaned = text
        .replace(/^```(?:ts|tsx|typescript)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();

      await context.supabase.from("project_files").upsert(
        { project_id: data.projectId, path: specPath, content: cleaned, language: "typescript" },
        { onConflict: "project_id,path" },
      );

      await context.supabase.from("e2e_tests").update({
        spec_code: cleaned, status: "ready", error: null,
      }).eq("id", row.id);

      return { ok: true, id: row.id, specPath };
    } catch (e) {
      await context.supabase.from("e2e_tests").update({
        status: "error", error: (e as Error).message,
      }).eq("id", row.id);
      throw e;
    }
  });

export const deleteE2eTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("e2e_tests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Record an external runner's result. The Worker runtime can't run Playwright,
 * so this accepts a signed report from a CI runner via the authenticated user.
 */
const ReportInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["passed", "failed", "error"]),
  report: z.record(z.string(), z.any()).default({}),
});
export const recordE2eRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof ReportInput>) => ReportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("e2e_tests").update({
      last_run_status: data.status,
      last_run_report: data.report,
    }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
