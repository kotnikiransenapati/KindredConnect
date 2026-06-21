// P43 — SLSA build provenance + SBOM helpers (server-only).
export async function assertProjectRole(ctx: any, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: role,
  });
  if (error || !data) throw new Error("Forbidden");
}

export async function enforceRateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId, _bucket: `provenance:${bucket}`, _window: "1 minute", _max: max,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (data === false) throw new Error("Provenance rate limit exceeded.");
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Build a DSSE envelope (Dead Simple Signing Envelope) shape with a project-scoped HMAC signature. */
export async function buildDsseEnvelope(predicate: object, keyMaterial: string): Promise<{ payloadType: string; payload: string; signatures: Array<{ keyid: string; sig: string }> }> {
  const payload = btoa(JSON.stringify(predicate));
  const payloadType = "application/vnd.in-toto+json";
  const pae = `DSSEv1 ${payloadType.length} ${payloadType} ${payload.length} ${payload}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(keyMaterial),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(pae)));
  const keyid = (await sha256Hex(keyMaterial)).slice(0, 16);
  return { payloadType, payload, signatures: [{ keyid, sig: b64url(sig) }] };
}

/** Verify a DSSE envelope. */
export async function verifyDsseEnvelope(env: { payloadType: string; payload: string; signatures: Array<{ sig: string }> }, keyMaterial: string): Promise<boolean> {
  const pae = `DSSEv1 ${env.payloadType.length} ${env.payloadType} ${env.payload.length} ${env.payload}`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(keyMaterial),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(pae)));
  const expectedB64 = b64url(expected);
  return env.signatures.some((s) => s.sig === expectedB64);
}

/** Build a SLSA v1 provenance predicate. */
export function buildSlsaPredicate(input: {
  subjectName: string; subjectDigest: string; builderId: string;
  sourceUri?: string; sourceDigest?: string;
}): object {
  return {
    buildType: "https://lovable.dev/builder/v1",
    builder: { id: input.builderId },
    invocation: {
      configSource: {
        uri: input.sourceUri ?? "git+unknown",
        digest: input.sourceDigest ? { sha256: input.sourceDigest } : {},
      },
    },
    subject: [{ name: input.subjectName, digest: { sha256: input.subjectDigest } }],
    metadata: { buildStartedOn: new Date().toISOString(), reproducible: false },
  };
}

/** Roll up vulnerabilities by severity from a synthetic SBOM. */
export function rollupSeverity(vulns: Array<{ severity: string }>): Record<string, number> {
  const acc: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
  for (const v of vulns) {
    const k = (v.severity ?? "unknown").toLowerCase();
    acc[k] = (acc[k] ?? 0) + 1;
  }
  return acc;
}
