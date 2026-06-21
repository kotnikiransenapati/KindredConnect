// P40 — Server-only helpers for build pipeline orchestrator.
export type StageDef = {
  key: string;
  name: string;
  dependsOn?: string[];
  maxAttempts?: number;
  command?: string;
};

export async function assertProjectRole(ctx: any, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId,
    _user_id: ctx.userId,
    _min_role: role,
  });
  if (error || !data) throw new Error("Forbidden");
}

export async function enforceRateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId,
    _bucket: `pipeline:${bucket}`,
    _window: "1 minute",
    _max: max,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (data === false) throw new Error("Pipeline rate limit exceeded.");
}

/** Validate a list of stages: unique keys, only depend on prior keys (DAG). */
export function validateStages(stages: StageDef[]): StageDef[] {
  if (!Array.isArray(stages) || stages.length === 0) throw new Error("At least one stage required");
  if (stages.length > 30) throw new Error("Max 30 stages per pipeline");
  const seen = new Set<string>();
  for (const s of stages) {
    if (!s.key || !/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(s.key)) throw new Error(`Invalid stage key: ${s.key}`);
    if (seen.has(s.key)) throw new Error(`Duplicate stage key: ${s.key}`);
    seen.add(s.key);
    for (const dep of s.dependsOn ?? []) {
      if (!seen.has(dep)) throw new Error(`Stage "${s.key}" depends on unknown "${dep}" (must be earlier)`);
    }
    if (s.maxAttempts && (s.maxAttempts < 1 || s.maxAttempts > 5)) throw new Error("maxAttempts 1-5");
  }
  return stages;
}

/** Compute which stages are runnable now given current job statuses. */
export function nextRunnable(stages: StageDef[], jobs: Array<{ stage_key: string; status: string }>): StageDef[] {
  const byKey = new Map(jobs.map(j => [j.stage_key, j.status]));
  return stages.filter(s => {
    const status = byKey.get(s.key);
    if (status && status !== "pending") return false;
    return (s.dependsOn ?? []).every(d => byKey.get(d) === "succeeded");
  });
}

/** Deterministic mock execution outcome — for advancing the pipeline FSM. */
export function simulateOutcome(stageKey: string, attempt: number): { status: "succeeded" | "failed"; exitCode: number; logs: string; durationMs: number } {
  // Hash key+attempt for a stable pseudo-result; first attempts fail ~20%, retries usually pass.
  let h = attempt * 7;
  for (let i = 0; i < stageKey.length; i++) h = (h * 31 + stageKey.charCodeAt(i)) | 0;
  const flaky = Math.abs(h) % 100 < (attempt === 1 ? 20 : 8);
  const durationMs = 800 + (Math.abs(h) % 4200);
  if (flaky) return { status: "failed", exitCode: 1, logs: `[${stageKey}] attempt ${attempt} failed: transient error`, durationMs };
  return { status: "succeeded", exitCode: 0, logs: `[${stageKey}] attempt ${attempt} ok in ${durationMs}ms`, durationMs };
}

export function isTerminalRunStatus(status: string) {
  return ["succeeded", "failed", "cancelled", "timed_out"].includes(status);
}
