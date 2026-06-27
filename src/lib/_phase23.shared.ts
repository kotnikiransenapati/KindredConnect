// Shared helpers for Phase 23.
export async function assertProjectRole(ctx: any, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: role,
  });
  if (error || !data) throw new Error("Forbidden");
}
export async function enforceRateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId, _bucket: bucket, _window: "1 minute", _max: max,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (data === false) throw new Error("Rate limit exceeded.");
}
export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
