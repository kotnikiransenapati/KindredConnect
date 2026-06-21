// P41 — Server-only helpers for the agentic Playwright test author.
export type SelectorStrategy = "role" | "testid" | "text" | "css" | "auto";

export async function assertProjectRole(ctx: any, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: role,
  });
  if (error || !data) throw new Error("Forbidden");
}

export async function enforceRateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId, _bucket: `aitest:${bucket}`, _window: "1 minute", _max: max,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (data === false) throw new Error("Test author rate limit exceeded.");
}

/** Deterministic Playwright spec generator from a user story. */
export function generateSpec(title: string, story: string, baseUrl: string | null, strategy: SelectorStrategy): string {
  const steps = parseStory(story);
  const lines: string[] = [
    `import { test, expect } from '@playwright/test';`,
    ``,
    `test(${JSON.stringify(title)}, async ({ page }) => {`,
    `  await page.goto(${JSON.stringify(baseUrl ?? "/")});`,
  ];
  for (const step of steps) {
    if (step.kind === "click") {
      lines.push(`  await ${locator(step.target, strategy)}.click();`);
    } else if (step.kind === "type") {
      lines.push(`  await ${locator(step.target, strategy)}.fill(${JSON.stringify(step.value ?? "")});`);
    } else if (step.kind === "expect") {
      lines.push(`  await expect(${locator(step.target, strategy)}).toBeVisible();`);
    } else if (step.kind === "navigate") {
      lines.push(`  await page.goto(${JSON.stringify(step.target)});`);
    }
  }
  lines.push("});", "");
  return lines.join("\n");
}

type Step = { kind: "click" | "type" | "expect" | "navigate"; target: string; value?: string };

function parseStory(story: string): Step[] {
  const out: Step[] = [];
  for (const raw of story.split(/\n|->|;|then\b/i)) {
    const line = raw.trim();
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith("go to ") || lower.startsWith("visit ")) {
      out.push({ kind: "navigate", target: line.replace(/^(go to |visit )/i, "").trim() });
    } else if (lower.startsWith("click ")) {
      out.push({ kind: "click", target: stripQuotes(line.slice(6).trim()) });
    } else if (lower.startsWith("type ") || lower.startsWith("fill ")) {
      const m = line.match(/^\w+\s+(.+?)\s+(?:into|in)\s+(.+)$/i);
      if (m) out.push({ kind: "type", target: stripQuotes(m[2].trim()), value: stripQuotes(m[1].trim()) });
    } else if (lower.startsWith("expect ") || lower.startsWith("see ") || lower.startsWith("verify ")) {
      out.push({ kind: "expect", target: stripQuotes(line.replace(/^(expect |see |verify )/i, "").trim()) });
    } else {
      out.push({ kind: "expect", target: stripQuotes(line) });
    }
  }
  return out;
}

function stripQuotes(s: string) { return s.replace(/^["'`]|["'`]$/g, ""); }

function locator(target: string, strategy: SelectorStrategy): string {
  const safe = JSON.stringify(target);
  if (strategy === "testid") return `page.getByTestId(${safe})`;
  if (strategy === "text") return `page.getByText(${safe})`;
  if (strategy === "css") return `page.locator(${safe})`;
  if (strategy === "role") return `page.getByRole('button', { name: ${safe} })`;
  // auto: prefer testid → role → text
  return `page.getByTestId(${safe}).or(page.getByRole('button', { name: ${safe} })).or(page.getByText(${safe}))`;
}

/** RL-style retry: deterministic outcome — first attempts sometimes fail, retries heal via fallback locators. */
export function simulateRun(spec: string, attempt: number): { status: "passed" | "failed" | "healed"; durationMs: number; failureReason?: string; healed?: Array<{ original: string; replacement: string }> } {
  let h = attempt * 17;
  for (let i = 0; i < spec.length; i++) h = (h * 31 + spec.charCodeAt(i)) | 0;
  const durationMs = 400 + (Math.abs(h) % 3200);
  const failChance = attempt === 1 ? 28 : 6;
  const roll = Math.abs(h) % 100;
  if (roll < failChance) {
    return { status: "failed", durationMs, failureReason: "Selector timeout (locator not found)" };
  }
  if (attempt > 1 && roll < failChance + 18) {
    return {
      status: "healed",
      durationMs,
      healed: [{ original: "getByRole('button', { name: 'Submit' })", replacement: "getByTestId('submit-btn')" }],
    };
  }
  return { status: "passed", durationMs };
}
