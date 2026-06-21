// P46 — Server-only helpers for fleet device management.
export async function assertProjectRole(ctx: any, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: role,
  });
  if (error || !data) throw new Error("Forbidden");
}
export async function enforceRateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId, _bucket: `fleet:${bucket}`, _window: "1 minute", _max: max,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (data === false) throw new Error("Fleet rate limit exceeded.");
}

export const DESTRUCTIVE_COMMANDS = new Set(["wipe", "lock", "quarantine"]);
export function nextCommandStatus(current: string): string | null {
  const flow: Record<string, string> = {
    queued: "dispatched", dispatched: "acknowledged", acknowledged: "succeeded",
  };
  return flow[current] ?? null;
}
