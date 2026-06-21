// P44 — Server-only helpers for the edge AI inference router.
export type ModelRow = {
  id: string; slug: string; provider: string; model_id: string; region: string;
  status: "active" | "disabled" | "degraded";
  cost_per_1k_input: number; cost_per_1k_output: number;
  avg_latency_ms: number; context_window: number; capabilities: string[];
};
export type RouteRow = {
  id: string; name: string; capability: string;
  strategy: "cheapest" | "fastest" | "weighted" | "fallback" | "round-robin";
  weights: Record<string, number>; fallback_chain: string[];
  max_cost_per_1k: number | null; max_latency_ms: number | null; enabled: boolean;
};

export async function assertProjectRole(ctx: any, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: role,
  });
  if (error || !data) throw new Error("Forbidden");
}
export async function enforceRateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId, _bucket: `edge_ai:${bucket}`, _window: "1 minute", _max: max,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (data === false) throw new Error("Edge AI rate limit exceeded.");
}

/** Pick a model from a route, given candidate models that match capability. */
export function selectModel(route: RouteRow, candidates: ModelRow[], seed = 0):
  { model: ModelRow | null; reason: string; ordered: ModelRow[] } {
  if (!route.enabled) return { model: null, reason: "Route disabled", ordered: [] };
  let pool = candidates.filter((m) => m.status === "active" && m.capabilities.includes(route.capability));
  if (route.max_cost_per_1k != null) pool = pool.filter((m) => m.cost_per_1k_input + m.cost_per_1k_output <= route.max_cost_per_1k!);
  if (route.max_latency_ms != null) pool = pool.filter((m) => m.avg_latency_ms <= route.max_latency_ms!);
  if (pool.length === 0) return { model: null, reason: "No model matches constraints", ordered: [] };

  let ordered: ModelRow[];
  switch (route.strategy) {
    case "fastest":
      ordered = [...pool].sort((a, b) => a.avg_latency_ms - b.avg_latency_ms); break;
    case "weighted": {
      const total = pool.reduce((s, m) => s + Math.max(1, route.weights[m.slug] ?? 1), 0);
      const target = (seed % 1000) / 1000 * total;
      let acc = 0; let chosen = pool[0];
      for (const m of pool) {
        acc += Math.max(1, route.weights[m.slug] ?? 1);
        if (acc >= target) { chosen = m; break; }
      }
      ordered = [chosen, ...pool.filter((m) => m.id !== chosen.id)]; break;
    }
    case "fallback": {
      const chain = route.fallback_chain.length ? route.fallback_chain : pool.map((p) => p.slug);
      ordered = chain.map((slug) => pool.find((p) => p.slug === slug)).filter(Boolean) as ModelRow[];
      if (ordered.length === 0) ordered = pool; break;
    }
    case "round-robin":
      ordered = [...pool]; ordered.push(...ordered.splice(0, seed % pool.length)); break;
    case "cheapest":
    default:
      ordered = [...pool].sort((a, b) => (a.cost_per_1k_input + a.cost_per_1k_output) - (b.cost_per_1k_input + b.cost_per_1k_output));
  }
  return { model: ordered[0] ?? null, reason: `${route.strategy} pick`, ordered };
}

export function estimateCost(model: ModelRow, inputTokens: number, outputTokens: number): number {
  return Number(((model.cost_per_1k_input * inputTokens + model.cost_per_1k_output * outputTokens) / 1000).toFixed(5));
}
