// P42 — Server-only helpers for the multi-region failover orchestrator.
export type Region = {
  id: string; code: string; display_name: string;
  role: "primary" | "replica" | "standby" | "observer";
  status: "healthy" | "degraded" | "down" | "draining";
  latency_ms: number;
};

export async function assertProjectRole(ctx: any, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: role,
  });
  if (error || !data) throw new Error("Forbidden");
}

export async function enforceRateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId, _bucket: `failover:${bucket}`, _window: "1 minute", _max: max,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (data === false) throw new Error("Failover rate limit exceeded.");
}

/** Decide a failover plan given current regions + policy. */
export function planFailover(
  regions: Region[],
  policy: { strategy: string; health_threshold: number; traffic_weights: Record<string, number> },
): { action: "none" | "failover" | "rebalance" | "promote"; from?: string; to?: string; reason: string; weights: Record<string, number> } {
  const primary = regions.find((r) => r.role === "primary");
  const healthyOthers = regions
    .filter((r) => r.id !== primary?.id && r.status === "healthy" && r.role !== "observer")
    .sort((a, b) => a.latency_ms - b.latency_ms);

  if (primary && (primary.status === "down" || (primary.status === "degraded" && primary.latency_ms > 500))) {
    const candidate = healthyOthers[0];
    if (!candidate) return { action: "none", reason: "No healthy candidate available", weights: {} };
    return {
      action: "failover", from: primary.code, to: candidate.code,
      reason: `Primary ${primary.code} ${primary.status} (latency=${primary.latency_ms}ms); promote ${candidate.code}`,
      weights: { [candidate.code]: 100 },
    };
  }

  if (!primary) {
    const candidate = healthyOthers[0];
    if (!candidate) return { action: "none", reason: "No regions available", weights: {} };
    return { action: "promote", to: candidate.code, reason: `No primary set; promote ${candidate.code}`, weights: { [candidate.code]: 100 } };
  }

  if (policy.strategy === "active-active" || policy.strategy === "weighted") {
    const healthy = regions.filter((r) => r.status === "healthy" && r.role !== "observer");
    const totalWeight = healthy.reduce((s, r) => s + Math.max(1, 1000 / Math.max(1, r.latency_ms)), 0);
    const weights: Record<string, number> = {};
    for (const r of healthy) {
      const w = Math.max(1, 1000 / Math.max(1, r.latency_ms));
      weights[r.code] = Math.round((w / totalWeight) * 100);
    }
    return { action: "rebalance", reason: "Latency-weighted rebalance", weights };
  }

  return { action: "none", reason: `Primary ${primary.code} healthy`, weights: { [primary.code]: 100 } };
}
