// P47 — Whiteboard server helpers.
export function periodWindow(period: string): Date {
  const now = Date.now();
  const map: Record<string, number> = { hourly: 3600_000, daily: 86_400_000, weekly: 7 * 86_400_000, monthly: 30 * 86_400_000 };
  return new Date(now - (map[period] ?? map.monthly));
}

export function evaluateBudget(limit: number, soft: number, hard: number, spend: number) {
  const pct = Math.round((spend / limit) * 100);
  let level: "ok" | "soft" | "hard" = "ok";
  if (pct >= hard) level = "hard";
  else if (pct >= soft) level = "soft";
  return { pct, level };
}
