/**
 * Minimal cron evaluator for background agent schedules.
 *
 * Supports:
 *   - 5-field cron: "min hour dom month dow"
 *   - Each field: "*", "N", "N-M", "N,M,O", "* /N"  (without the space)
 *   - Macros: @hourly, @daily, @weekly, @monthly
 *
 * Returns the next UTC firing time strictly after `from`.
 */
const MACROS: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
};

type Field = { min: number; max: number };
const FIELDS: Field[] = [
  { min: 0, max: 59 },   // minute
  { min: 0, max: 23 },   // hour
  { min: 1, max: 31 },   // day of month
  { min: 1, max: 12 },   // month
  { min: 0, max: 6 },    // day of week (0 = Sun)
];

function parseField(raw: string, { min, max }: Field): Set<number> {
  const result = new Set<number>();
  for (const part of raw.split(",")) {
    let step = 1;
    let range = part;
    const slash = part.indexOf("/");
    if (slash >= 0) {
      step = Math.max(1, parseInt(part.slice(slash + 1), 10) || 1);
      range = part.slice(0, slash);
    }
    let lo = min;
    let hi = max;
    if (range !== "*" && range !== "") {
      const dash = range.indexOf("-");
      if (dash >= 0) {
        lo = parseInt(range.slice(0, dash), 10);
        hi = parseInt(range.slice(dash + 1), 10);
      } else {
        lo = parseInt(range, 10);
        hi = lo;
      }
    }
    if (Number.isNaN(lo) || Number.isNaN(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`Invalid cron field: "${raw}"`);
    }
    for (let v = lo; v <= hi; v += step) result.add(v);
  }
  return result;
}

export function parseCron(expr: string): Set<number>[] {
  const e = MACROS[expr.trim()] ?? expr.trim();
  const parts = e.split(/\s+/);
  if (parts.length !== 5) throw new Error(`Cron must have 5 fields, got: "${expr}"`);
  return parts.map((p, i) => parseField(p, FIELDS[i]));
}

export function nextCronFire(expr: string, from: Date = new Date()): Date {
  const [mins, hours, doms, months, dows] = parseCron(expr);
  // Search up to 366 days ahead — guarantees a hit for any valid expression.
  const cursor = new Date(Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
    from.getUTCHours(), from.getUTCMinutes() + 1, 0, 0,
  ));
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (
      mins.has(cursor.getUTCMinutes()) &&
      hours.has(cursor.getUTCHours()) &&
      doms.has(cursor.getUTCDate()) &&
      months.has(cursor.getUTCMonth() + 1) &&
      dows.has(cursor.getUTCDay())
    ) {
      return new Date(cursor);
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  throw new Error(`Cron "${expr}" never fires within a year.`);
}
