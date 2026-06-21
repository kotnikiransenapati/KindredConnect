// P39 — Server-only helpers for live multiplayer collaborative editor.
export type OpKind = "insert" | "delete" | "retain" | "format" | "annotation";

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
    _bucket: `collab:${bucket}`,
    _window: "1 minute",
    _max: max,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (data === false) throw new Error("Slow down — collab rate limit exceeded.");
}

/** Apply a sequence of CRDT-style retain/insert/delete ops to a string snapshot. */
export function applyOp(snapshot: string, op: { kind: OpKind; payload: any }): string {
  const pos = Math.max(0, Math.min(snapshot.length, Number(op.payload?.position ?? 0)));
  if (op.kind === "insert") {
    const text = String(op.payload?.text ?? "");
    return snapshot.slice(0, pos) + text + snapshot.slice(pos);
  }
  if (op.kind === "delete") {
    const len = Math.max(0, Math.min(snapshot.length - pos, Number(op.payload?.length ?? 0)));
    return snapshot.slice(0, pos) + snapshot.slice(pos + len);
  }
  // retain / format / annotation are presentation-only — snapshot unchanged.
  return snapshot;
}

/** Pick a stable participant color from a palette using user id hash. */
const PALETTE = ["#6366f1","#10b981","#f59e0b","#ef4444","#ec4899","#06b6d4","#8b5cf6","#84cc16"];
export function colorForUser(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}
