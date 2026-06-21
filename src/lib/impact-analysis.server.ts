// P45 — Server-only helpers for the impact analysis bot.
export type FileChange = { path: string; additions: number; deletions: number };

export async function assertProjectRole(ctx: any, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: role,
  });
  if (error || !data) throw new Error("Forbidden");
}
export async function enforceRateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId, _bucket: `impact:${bucket}`, _window: "1 minute", _max: max,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (data === false) throw new Error("Impact analysis rate limit exceeded.");
}

const HIGH_RISK_PATTERNS = [/migrations?\//i, /\.sql$/i, /auth/i, /payment/i, /billing/i, /webhook/i, /security/i, /rls/i];
const MEDIUM_RISK_PATTERNS = [/api\//i, /server/i, /\.functions\.ts$/i, /\.server\.ts$/i, /middleware/i, /\.config\./i];
const ROUTE_HINTS = [/^src\/routes\//i, /^app\/routes\//i, /pages\//i];

function componentFor(path: string): string {
  if (/\.sql$/i.test(path) || /migrations?\//i.test(path)) return "database";
  if (/auth|session|login|signin|signup/i.test(path)) return "auth";
  if (/payment|billing|stripe|paddle/i.test(path)) return "payments";
  if (/api|server|functions\.ts|server\.ts/i.test(path)) return "backend";
  if (ROUTE_HINTS.some((r) => r.test(path))) return "routing";
  if (/components\//i.test(path) || /\.tsx$/i.test(path)) return "ui";
  if (/test|spec/i.test(path)) return "tests";
  if (/config|\.env|\.toml|\.yml|\.yaml/i.test(path)) return "configuration";
  return "general";
}

export function analyzeChanges(files: FileChange[]): {
  riskScore: number; riskLevel: "low" | "medium" | "high" | "critical"; summary: string;
  findings: Array<{ filePath: string; component: string; severity: "info" | "low" | "medium" | "high" | "critical"; blastRadius: number; message: string; affectedRoutes: string[] }>;
  reviewerSuggestions: string[];
} {
  const findings = files.map((f) => {
    const churn = f.additions + f.deletions;
    const isHigh = HIGH_RISK_PATTERNS.some((p) => p.test(f.path));
    const isMed = MEDIUM_RISK_PATTERNS.some((p) => p.test(f.path));
    const severity: "info" | "low" | "medium" | "high" | "critical" =
      isHigh && churn > 200 ? "critical" : isHigh ? "high" : isMed && churn > 120 ? "high" : isMed ? "medium" : churn > 80 ? "low" : "info";
    const blastRadius =
      (isHigh ? 25 : isMed ? 10 : 3) + Math.floor(churn / 25);
    const component = componentFor(f.path);
    const affectedRoutes = ROUTE_HINTS.some((r) => r.test(f.path))
      ? [f.path.replace(/^.*routes\//i, "/").replace(/\.tsx?$/i, "").replace(/index$/, "")]
      : [];
    return {
      filePath: f.path, component, severity, blastRadius,
      message: `${component} change (~${churn} LOC) — ${severity} risk`,
      affectedRoutes,
    };
  });

  const sevWeight = { info: 1, low: 4, medium: 12, high: 28, critical: 55 } as const;
  const raw = findings.reduce((s, f) => s + sevWeight[f.severity] + Math.min(20, f.blastRadius), 0);
  const riskScore = Math.min(100, Math.round(raw));
  const riskLevel: "low" | "medium" | "high" | "critical" =
    riskScore >= 75 ? "critical" : riskScore >= 50 ? "high" : riskScore >= 25 ? "medium" : "low";

  const components = Array.from(new Set(findings.map((f) => f.component)));
  const summary = `${files.length} file(s) changed across ${components.length} area(s): ${components.join(", ")}. Risk ${riskLevel} (${riskScore}/100).`;

  const reviewerSuggestions: string[] = [];
  if (components.includes("database")) reviewerSuggestions.push("database-owners");
  if (components.includes("auth")) reviewerSuggestions.push("security-team");
  if (components.includes("payments")) reviewerSuggestions.push("billing-team");
  if (components.includes("backend")) reviewerSuggestions.push("backend-leads");
  if (components.includes("ui") && riskLevel !== "low") reviewerSuggestions.push("frontend-leads");
  if (!reviewerSuggestions.length) reviewerSuggestions.push("project-maintainers");

  return { riskScore, riskLevel, summary, findings, reviewerSuggestions };
}
