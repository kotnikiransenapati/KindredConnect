import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertRateLimit } from "@/lib/rate-limit.server";

const gateKind = z.enum(["lighthouse", "smoke", "a11y"]);

export const listCiGates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ci_gates")
      .select("id,deployment_id,kind,status,score,threshold,target_url,report,error,duration_ms,created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return { gates: rows ?? [] };
  });

type LhCategory = { score: number | null };
type LhResult = {
  lighthouseResult?: {
    categories?: {
      performance?: LhCategory;
      accessibility?: LhCategory;
      "best-practices"?: LhCategory;
      seo?: LhCategory;
    };
    audits?: Record<string, { id: string; title: string; score: number | null; displayValue?: string }>;
  };
};

async function runLighthouse(targetUrl: string) {
  const api = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  api.searchParams.set("url", targetUrl);
  api.searchParams.set("strategy", "mobile");
  for (const c of ["performance", "accessibility", "best-practices", "seo"])
    api.searchParams.append("category", c);
  const res = await fetch(api.toString(), { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`PageSpeed Insights ${res.status}`);
  const json = (await res.json()) as LhResult;
  const cats = json.lighthouseResult?.categories ?? {};
  const scores = {
    performance: Math.round(((cats.performance?.score ?? 0) || 0) * 100),
    accessibility: Math.round(((cats.accessibility?.score ?? 0) || 0) * 100),
    bestPractices: Math.round(((cats["best-practices"]?.score ?? 0) || 0) * 100),
    seo: Math.round(((cats.seo?.score ?? 0) || 0) * 100),
  };
  const overall = Math.round((scores.performance + scores.accessibility + scores.bestPractices + scores.seo) / 4);
  // Surface the top failed audits for the report.
  const audits = json.lighthouseResult?.audits ?? {};
  const failed = Object.values(audits)
    .filter((a) => typeof a.score === "number" && (a.score ?? 1) < 0.9)
    .slice(0, 12)
    .map((a) => ({ id: a.id, title: a.title, score: a.score, value: a.displayValue ?? null }));
  return { overall, scores, failed };
}

async function runSmoke(targetUrl: string, assertions: string[]) {
  const res = await fetch(targetUrl, { headers: { "user-agent": "FoundryCI/1.0" } });
  const ok = res.ok;
  const html = await res.text();
  const lower = html.toLowerCase();
  const checks = assertions.map((a) => ({ text: a, passed: lower.includes(a.toLowerCase()) }));
  const passed = ok && checks.every((c) => c.passed);
  const score = !ok ? 0 : checks.length === 0 ? 100 : Math.round((checks.filter((c) => c.passed).length / checks.length) * 100);
  return { score, passed, statusCode: res.status, byteLength: html.length, checks };
}

async function runA11y(targetUrl: string) {
  // Heuristic accessibility audit using only fetch — extracts HTML and runs cheap rules.
  const res = await fetch(targetUrl, { headers: { "user-agent": "FoundryCI/1.0" } });
  const html = await res.text();
  const findings: { rule: string; count: number }[] = [];
  const add = (rule: string, count: number) => { if (count > 0) findings.push({ rule, count }); };
  add("img without alt", (html.match(/<img\b(?![^>]*\balt=)[^>]*>/gi) || []).length);
  add("input without label/aria-label", (html.match(/<input\b(?![^>]*\baria-label=)(?![^>]*\bid=)[^>]*>/gi) || []).length);
  add("button without accessible name", (html.match(/<button\b[^>]*>\s*<\/button>/gi) || []).length);
  add("missing <html lang>", /<html\b[^>]*\blang=/i.test(html) ? 0 : 1);
  add("missing <title>", /<title>[^<]+<\/title>/i.test(html) ? 0 : 1);
  add("multiple <h1>", Math.max(0, (html.match(/<h1\b/gi) || []).length - 1));
  add("link without text", (html.match(/<a\b[^>]*>\s*<\/a>/gi) || []).length);
  const totalIssues = findings.reduce((s, f) => s + f.count, 0);
  const score = Math.max(0, 100 - totalIssues * 4);
  return { score, totalIssues, findings };
}

export const runCiGate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string;
    deploymentId?: string | null;
    kind: "lighthouse" | "smoke" | "a11y";
    targetUrl: string;
    threshold?: number;
    assertions?: string[];
  }) =>
    z
      .object({
        projectId: z.string().uuid(),
        deploymentId: z.string().uuid().nullable().optional(),
        kind: gateKind,
        targetUrl: z.string().url().refine((u) => /^https?:\/\//.test(u), "http(s) URLs only"),
        threshold: z.number().min(0).max(100).default(70),
        assertions: z.array(z.string().min(1).max(120)).max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRateLimit(context.userId, "ci_gate_min", "1 minute", 6);
    await assertRateLimit(context.userId, "ci_gate_day", "1 day", 200);

    const { data: pending, error: insErr } = await context.supabase
      .from("ci_gates")
      .insert({
        project_id: data.projectId,
        deployment_id: data.deploymentId ?? null,
        kind: data.kind,
        target_url: data.targetUrl,
        threshold: data.threshold ?? 70,
        status: "pending",
      })
      .select("id")
      .single();
    if (insErr || !pending) throw insErr ?? new Error("Failed to enqueue gate");

    const startedAt = Date.now();
    try {
      let report: Record<string, any> = {};
      let score = 0;
      if (data.kind === "lighthouse") {
        const lh = await runLighthouse(data.targetUrl);
        score = lh.overall;
        report = lh;
      } else if (data.kind === "smoke") {
        const sm = await runSmoke(data.targetUrl, data.assertions ?? []);
        score = sm.score;
        report = sm;
      } else {
        const ax = await runA11y(data.targetUrl);
        score = ax.score;
        report = ax;
      }
      const status = score >= (data.threshold ?? 70) ? "passed" : "failed";
      await context.supabase
        .from("ci_gates")
        .update({
          status,
          score,
          report: report as never,
          duration_ms: Date.now() - startedAt,
        })
        .eq("id", pending.id);
      return { id: pending.id, status, score, report: report as Record<string, any> };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await context.supabase
        .from("ci_gates")
        .update({ status: "error", error: msg, duration_ms: Date.now() - startedAt })
        .eq("id", pending.id);
      return { id: pending.id, status: "error" as const, score: 0, error: msg };
    }
  });
