import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Quality gates — static analysis over project_files producing QA, Security,
 * and Performance reports. Each run inserts a row in `quality_reports` so the
 * pipeline (and the AgentsPanel reviewer loop) can gate releases on score.
 */

export type Finding = {
  severity: "info" | "warn" | "error";
  rule: string;
  message: string;
  path?: string;
  line?: number;
};

type File = { path: string; content: string };

const SECRET_PATTERNS: Array<{ rule: string; re: RegExp; msg: string }> = [
  { rule: "secret/aws", re: /AKIA[0-9A-Z]{16}/, msg: "AWS access key id committed to source." },
  { rule: "secret/stripe-live", re: /sk_live_[0-9A-Za-z]{16,}/, msg: "Live Stripe secret key committed to source." },
  { rule: "secret/openai", re: /sk-[A-Za-z0-9]{20,}/, msg: "Possible OpenAI API key committed to source." },
  { rule: "secret/google", re: /AIza[0-9A-Za-z_\-]{20,}/, msg: "Google API key committed to source." },
  { rule: "secret/jwt", re: /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/, msg: "JWT-shaped token committed to source." },
  { rule: "secret/private-key", re: /-----BEGIN (RSA |EC |OPENSSH |PGP |)PRIVATE KEY-----/, msg: "Private key material committed to source." },
];

const DANGEROUS_PATTERNS: Array<{ rule: string; re: RegExp; msg: string; sev: "warn" | "error" }> = [
  { rule: "xss/inner-html", re: /dangerouslySetInnerHTML/, msg: "dangerouslySetInnerHTML — sanitize input before rendering.", sev: "warn" },
  { rule: "code/eval", re: /\beval\s*\(/, msg: "eval() is a code-injection sink.", sev: "error" },
  { rule: "code/new-function", re: /new\s+Function\s*\(/, msg: "new Function() executes arbitrary code.", sev: "error" },
  { rule: "net/http-url", re: /http:\/\/(?!localhost|127\.0\.0\.1)/, msg: "Plain HTTP URL — use HTTPS.", sev: "warn" },
];

function lineOf(content: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < content.length; i++) if (content[i] === "\n") line++;
  return line;
}

function scanSecurity(files: File[]): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    if (!/\.(ts|tsx|js|jsx|json|env|sql|md|html|css)$/i.test(f.path)) continue;
    const c = f.content ?? "";
    for (const p of SECRET_PATTERNS) {
      const m = p.re.exec(c);
      if (m) out.push({ severity: "error", rule: p.rule, message: p.msg, path: f.path, line: lineOf(c, m.index) });
    }
    for (const p of DANGEROUS_PATTERNS) {
      const m = p.re.exec(c);
      if (m) out.push({ severity: p.sev, rule: p.rule, message: p.msg, path: f.path, line: lineOf(c, m.index) });
    }
    if (/supabase\.auth\.signInWithPassword.*autoConfirm/i.test(c)) {
      out.push({ severity: "warn", rule: "auth/auto-confirm", message: "Auto-confirm should not be enabled in production.", path: f.path });
    }
  }
  return out;
}

function scanQa(files: File[]): Finding[] {
  const out: Finding[] = [];
  let totalSrc = 0, withTests = 0;
  for (const f of files) {
    if (!/\.(ts|tsx|js|jsx)$/i.test(f.path)) continue;
    const c = f.content ?? "";
    if (/\.test\.|\.spec\./.test(f.path)) withTests++;
    else totalSrc++;
    const todos = c.match(/\b(TODO|FIXME|XXX|HACK)\b/g);
    if (todos && todos.length > 0) {
      out.push({ severity: "info", rule: "qa/todo", message: `${todos.length} TODO/FIXME markers.`, path: f.path });
    }
    if (/console\.log\(/.test(c) && !/\.test\.|\.spec\./.test(f.path)) {
      out.push({ severity: "info", rule: "qa/console-log", message: "Leftover console.log in source.", path: f.path });
    }
    if (/:\s*any\b/.test(c) && /\.tsx?$/.test(f.path)) {
      const cnt = (c.match(/:\s*any\b/g) ?? []).length;
      if (cnt >= 3) out.push({ severity: "warn", rule: "qa/any-type", message: `${cnt} explicit \`any\` types weaken type safety.`, path: f.path });
    }
  }
  const ratio = totalSrc > 0 ? withTests / totalSrc : 0;
  if (ratio < 0.1 && totalSrc > 5) {
    out.push({ severity: "warn", rule: "qa/coverage", message: `Low test coverage: ${withTests} test files for ${totalSrc} source files.` });
  }
  return out;
}

function scanPerf(files: File[]): Finding[] {
  const out: Finding[] = [];
  for (const f of files) {
    const c = f.content ?? "";
    const bytes = new TextEncoder().encode(c).byteLength;
    if (/\.(ts|tsx|js|jsx)$/i.test(f.path) && bytes > 60_000) {
      out.push({ severity: "warn", rule: "perf/large-module", message: `Large module (${(bytes / 1024).toFixed(1)} KB) — consider code-split.`, path: f.path });
    }
    if (/\.(png|jpg|jpeg)$/i.test(f.path) && bytes > 400_000) {
      out.push({ severity: "warn", rule: "perf/large-image", message: `Image > 400KB (${(bytes / 1024).toFixed(0)} KB) — compress / resize.`, path: f.path });
    }
    if (/\.tsx?$/.test(f.path)) {
      if (/import\s+\*\s+as\s+\w+\s+from\s+["']lodash["']/.test(c)) {
        out.push({ severity: "warn", rule: "perf/lodash-full", message: "Full lodash import — use lodash-es or per-method imports.", path: f.path });
      }
      if (/<img\s[^>]*src=/i.test(c) && !/loading=/i.test(c)) {
        out.push({ severity: "info", rule: "perf/img-lazy", message: "<img> without loading=\"lazy\".", path: f.path });
      }
    }
  }
  return out;
}

function scoreOf(findings: Finding[]): { score: number; status: "pass" | "warn" | "fail" } {
  let penalty = 0;
  for (const f of findings) {
    if (f.severity === "error") penalty += 20;
    else if (f.severity === "warn") penalty += 5;
    else penalty += 1;
  }
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const status: "pass" | "warn" | "fail" =
    findings.some((f) => f.severity === "error") || score < 50 ? "fail" : score < 80 ? "warn" : "pass";
  return { score, status };
}

export const runQualityGates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertRateLimit } = await import("@/lib/rate-limit.server");
    await assertRateLimit(userId, "quality_run_day", "1 day", 60);
    await assertRateLimit(userId, "quality_run_min", "1 minute", 6);

    const { data: roleOk } = await supabase.rpc("has_project_role", {
      _project_id: data.projectId,
      _user_id: userId,
      _min_role: "editor",
    });
    if (!roleOk) throw new Error("Forbidden");

    const { data: files, error } = await supabase
      .from("project_files")
      .select("path, content")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    const list = (files ?? []) as File[];

    const reports = (["qa", "security", "performance"] as const).map((kind) => {
      const findings = kind === "qa" ? scanQa(list) : kind === "security" ? scanSecurity(list) : scanPerf(list);
      const { score, status } = scoreOf(findings);
      const errs = findings.filter((f) => f.severity === "error").length;
      const warns = findings.filter((f) => f.severity === "warn").length;
      const summary = `${score}/100 · ${errs} errors · ${warns} warnings · ${findings.length} total findings`;
      return { kind, score, status, findings, summary };
    });

    const { data: inserted, error: insErr } = await supabase
      .from("quality_reports")
      .insert(reports.map((r) => ({ ...r, project_id: data.projectId, created_by: userId })))
      .select("id, kind, score, status, findings, summary, created_at");
    if (insErr) throw new Error(insErr.message);
    return { reports: inserted ?? [] };
  });

export const listQualityReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), limit: z.number().int().min(1).max(30).default(9) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("quality_reports")
      .select("id, kind, score, status, findings, summary, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { reports: rows ?? [] };
  });
