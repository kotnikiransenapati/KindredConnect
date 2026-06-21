export type Sensitivity = "low" | "medium" | "high";

export type DetectorLike = {
  id: string;
  name: string;
  metric_key: string;
  source: string;
  sensitivity: Sensitivity;
  min_samples: number;
};

export type Baseline = {
  mean: number;
  stdDev: number;
  sampleCount: number;
  threshold: number;
};

export type Evaluation = Baseline & {
  isAnomaly: boolean;
  zScore: number;
  score: number;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  recommendation: string;
};

const THRESHOLDS: Record<Sensitivity, number> = { low: 4, medium: 3, high: 2.2 };

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
    _bucket: bucket,
    _window: "1 minute",
    _max: max,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Rate limit exceeded");
}

export function evaluateMetric(detector: DetectorLike, value: number, history: number[]): Evaluation {
  const values = history.filter((v) => Number.isFinite(v));
  const sampleCount = values.length;
  const mean = sampleCount ? values.reduce((sum, v) => sum + v, 0) / sampleCount : value;
  const variance = sampleCount > 1
    ? values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (sampleCount - 1)
    : 0;
  const stdDev = Math.max(Math.sqrt(variance), Math.max(Math.abs(mean) * 0.05, 1));
  const threshold = THRESHOLDS[detector.sensitivity] ?? THRESHOLDS.medium;
  const zScore = Math.abs((value - mean) / stdDev);
  const score = Math.min(100, Math.round((zScore / threshold) * 100));
  const isAnomaly = sampleCount >= detector.min_samples && zScore >= threshold;
  const direction = value >= mean ? "spike" : "drop";
  const severity = score >= 175 ? "critical" : score >= 135 ? "high" : score >= 100 ? "medium" : "low";
  return {
    mean,
    stdDev,
    sampleCount,
    threshold,
    zScore,
    score,
    isAnomaly,
    severity,
    summary: `${detector.name} ${direction}: ${value.toFixed(2)} vs expected ${mean.toFixed(2)} (${zScore.toFixed(1)}σ)`,
    recommendation: direction === "spike"
      ? "Inspect recent deploys, traffic sources, error logs, and rate-limit decisions for a sudden increase."
      : "Check upstream ingestion, availability, conversion funnels, and device cohorts for a sudden decrease.",
  };
}

export function normalizeChannels(input: string[] | undefined) {
  return Array.from(new Set((input ?? []).map((v) => v.trim().toLowerCase()).filter(Boolean))).slice(0, 8);
}