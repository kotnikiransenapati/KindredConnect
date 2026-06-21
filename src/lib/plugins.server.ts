// P49 — Plugin runtime helpers.
const ALLOWED_PERMISSIONS = new Set([
  "files:read", "files:write", "secrets:read", "deploy:trigger",
  "ai:invoke", "db:read", "db:write", "network:fetch", "ui:render", "analytics:read",
]);
const SENSITIVE = new Set(["secrets:read", "files:write", "db:write", "deploy:trigger"]);

export function validatePermissions(perms: string[]): { ok: true } | { ok: false; reason: string } {
  for (const p of perms) {
    if (!ALLOWED_PERMISSIONS.has(p)) return { ok: false, reason: `Unknown permission: ${p}` };
  }
  return { ok: true };
}

export function authorize(grantedPerms: string[], required: string[]):
  { ok: boolean; missing: string[]; sensitiveUsed: string[] } {
  const granted = new Set(grantedPerms);
  const missing = required.filter((r) => !granted.has(r));
  const sensitiveUsed = required.filter((r) => SENSITIVE.has(r));
  return { ok: missing.length === 0, missing, sensitiveUsed };
}

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isHttpsUrl(url: string): boolean {
  try { const u = new URL(url); return u.protocol === "https:"; } catch { return false; }
}
