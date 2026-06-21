// P36 — Shared client-safe estimator for on-device LLM artifact size.
const QUANT_FACTOR: Record<string, number> = {
  q4_k_m: 0.30,
  q5_k_m: 0.36,
  q8_0:   0.55,
  fp16:   1.00,
};
const PLATFORM_OVERHEAD_MB: Record<string, number> = {
  ios: 6, android: 8, web: 12,
};
export function estimateBuildSize(baseSizeMb: number, quant: string, platform: string) {
  const f = QUANT_FACTOR[quant] ?? 1;
  const overhead = PLATFORM_OVERHEAD_MB[platform] ?? 8;
  const mb = Math.round(baseSizeMb * f + overhead);
  return { mb, bytes: mb * 1024 * 1024 };
}
