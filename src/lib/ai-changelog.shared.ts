// P51 — AI changelog generator (deterministic heuristic).
type Src = { kind: string; ref: string; title: string; body?: string | null; labels?: string[] | null };

const CATEGORY_KEYWORDS: Array<[string, string[]]> = [
  ["security", ["cve", "vuln", "security", "auth", "rce", "xss", "sql injection"]],
  ["breaking", ["breaking", "remove", "drop ", "rename"]],
  ["fix", ["fix", "bug", "regression", "patch", "hotfix"]],
  ["perf", ["perf", "performance", "speed up", "optimi"]],
  ["docs", ["docs", "readme", "documentation"]],
  ["chore", ["chore", "deps", "bump"]],
];

export function classify(src: Src): { category: string; impact: string; audience: string } {
  const text = `${src.title} ${src.body ?? ""} ${(src.labels ?? []).join(" ")}`.toLowerCase();
  let category = "feature";
  for (const [cat, kws] of CATEGORY_KEYWORDS) {
    if (kws.some((k) => text.includes(k))) { category = cat; break; }
  }
  const impact = category === "breaking" ? "breaking"
    : category === "security" ? "major"
    : category === "feature" ? "minor"
    : "patch";
  const audience = category === "docs" ? "developer"
    : category === "security" ? "admin"
    : category === "feature" ? "enduser"
    : "all";
  return { category, impact, audience };
}

export function bumpVersion(prev: string, impact: string): string {
  const [maj, min, pat] = prev.split(".").map((n) => Number(n) || 0);
  if (impact === "breaking" || impact === "major") return `${maj + 1}.0.0`;
  if (impact === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

export function summarize(sources: Src[]): { title: string; summary: string } {
  const top = sources.slice(0, 6);
  const title = top.length === 1
    ? top[0].title.slice(0, 80)
    : `${top.length} changes across ${new Set(top.map((s) => s.kind)).size} streams`;
  const summary = top
    .map((s) => `- **${s.kind}** ${s.ref}: ${s.title.replace(/\s+/g, " ").trim()}`)
    .join("\n");
  return { title, summary };
}
