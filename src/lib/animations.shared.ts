// Deterministic easing/interpolation helpers — pure, safe in client & server.
export type Easing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring" | "step";

export function applyEasing(p: number, easing: Easing | string): number {
  switch (easing) {
    case "linear": return p;
    case "easeIn": return p * p;
    case "easeOut": return 1 - (1 - p) * (1 - p);
    case "easeInOut": return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    case "spring": return 1 - Math.cos(p * Math.PI * 0.5);
    case "step": return p < 1 ? 0 : 1;
    default: return p;
  }
}

export function sampleTrack(
  keyframes: Array<{ time_ms: number; value: number; easing: string }>,
  t: number,
): number {
  if (keyframes.length === 0) return 0;
  const sorted = [...keyframes].sort((a, b) => a.time_ms - b.time_ms);
  if (t <= sorted[0].time_ms) return sorted[0].value;
  if (t >= sorted[sorted.length - 1].time_ms) return sorted[sorted.length - 1].value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i + 1];
    if (t >= a.time_ms && t <= b.time_ms) {
      const p = (t - a.time_ms) / (b.time_ms - a.time_ms);
      const eased = applyEasing(p, b.easing);
      return a.value + (b.value - a.value) * eased;
    }
  }
  return sorted[sorted.length - 1].value;
}
