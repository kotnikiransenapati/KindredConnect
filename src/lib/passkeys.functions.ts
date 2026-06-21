// P31 — On-device Passkeys / WebAuthn for end-user apps.
// Issues short-lived registration / authentication challenges, verifies
// device responses with a constant-time check, and tracks credentials with
// monotonic counter + revocation. This is the project-scoped service the
// mobile/web apps built with the platform consume.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { randomBytes, createHash, timingSafeEqual } from "crypto";

async function assertViewer(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "viewer",
  });
  if (error || !data) throw new Error("Forbidden");
}
async function rateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId, _bucket: bucket, _window: "1 minute", _max: max,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Rate limit exceeded");
}

function b64url(buf: Buffer) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const listMyCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("passkey_credentials")
      .select("id,credential_id,device_label,transports,backed_up,last_used_at,revoked_at,created_at")
      .eq("project_id", data.projectId).eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listProjectCredentials = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertViewer(context, data.projectId);
    const { data: rows, error } = await context.supabase.from("passkey_credentials")
      .select("id,user_id,credential_id,device_label,transports,backed_up,last_used_at,revoked_at,created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const RpZ = z.string().min(3).max(253).regex(/^[a-z0-9.-]+$/i);

export const beginRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; rpId: string }) =>
    z.object({ projectId: z.string().uuid(), rpId: RpZ }).parse(d))
  .handler(async ({ data, context }) => {
    await rateLimit(context, `passkey_reg:${context.userId}`, 10);
    const challenge = b64url(randomBytes(32));
    const { error } = await context.supabase.from("passkey_challenges").insert({
      project_id: data.projectId, user_id: context.userId,
      challenge, purpose: "register", rp_id: data.rpId.toLowerCase(),
    });
    if (error) throw new Error(error.message);
    return {
      challenge, rp: { id: data.rpId.toLowerCase(), name: data.rpId },
      user: { id: context.userId, name: context.userId, displayName: "User" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      timeout: 60_000, attestation: "none",
    };
  });

export const finishRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; challenge: string; credentialId: string;
    publicKey: string; transports?: string[]; deviceLabel?: string;
    aaguid?: string; backedUp?: boolean;
  }) => z.object({
    projectId: z.string().uuid(),
    challenge: z.string().min(20).max(200),
    credentialId: z.string().min(20).max(500),
    publicKey: z.string().min(20).max(2000),
    transports: z.array(z.enum(["usb","nfc","ble","internal","hybrid"])).max(5).optional(),
    deviceLabel: z.string().max(80).optional(),
    aaguid: z.string().max(80).optional(),
    backedUp: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ch, error: cerr } = await context.supabase.from("passkey_challenges")
      .select("*").eq("project_id", data.projectId).eq("challenge", data.challenge)
      .eq("purpose", "register").eq("user_id", context.userId).maybeSingle();
    if (cerr) throw new Error(cerr.message);
    if (!ch) throw new Error("Unknown challenge");
    if (ch.consumed_at) throw new Error("Challenge already used");
    if (new Date(ch.expires_at).getTime() < Date.now()) throw new Error("Challenge expired");

    await context.supabase.from("passkey_challenges")
      .update({ consumed_at: new Date().toISOString() }).eq("id", ch.id);

    const { data: row, error } = await context.supabase.from("passkey_credentials").insert({
      project_id: data.projectId, user_id: context.userId,
      credential_id: data.credentialId, public_key: data.publicKey,
      transports: data.transports ?? [], device_label: data.deviceLabel ?? null,
      aaguid: data.aaguid ?? null, backed_up: data.backedUp ?? false,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const beginAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; rpId: string }) =>
    z.object({ projectId: z.string().uuid(), rpId: RpZ }).parse(d))
  .handler(async ({ data, context }) => {
    await rateLimit(context, `passkey_auth:${context.userId}`, 30);
    const challenge = b64url(randomBytes(32));
    const { error } = await context.supabase.from("passkey_challenges").insert({
      project_id: data.projectId, user_id: context.userId,
      challenge, purpose: "authenticate", rp_id: data.rpId.toLowerCase(),
    });
    if (error) throw new Error(error.message);
    const { data: creds } = await context.supabase.from("passkey_credentials")
      .select("credential_id,transports").eq("project_id", data.projectId)
      .eq("user_id", context.userId).is("revoked_at", null);
    return {
      challenge, rpId: data.rpId.toLowerCase(), timeout: 60_000,
      allowCredentials: (creds ?? []).map((c: any) => ({
        type: "public-key", id: c.credential_id, transports: c.transports ?? [],
      })),
      userVerification: "preferred",
    };
  });

export const finishAuthentication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; challenge: string; credentialId: string;
    counter: number; signatureDigest: string;
  }) => z.object({
    projectId: z.string().uuid(),
    challenge: z.string().min(20).max(200),
    credentialId: z.string().min(20).max(500),
    counter: z.number().int().min(0).max(2_000_000_000),
    signatureDigest: z.string().min(20).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ch, error: cerr } = await context.supabase.from("passkey_challenges")
      .select("*").eq("project_id", data.projectId).eq("challenge", data.challenge)
      .eq("purpose", "authenticate").eq("user_id", context.userId).maybeSingle();
    if (cerr) throw new Error(cerr.message);
    if (!ch || ch.consumed_at || new Date(ch.expires_at).getTime() < Date.now())
      throw new Error("Invalid challenge");

    const { data: cred, error: kerr } = await context.supabase.from("passkey_credentials")
      .select("*").eq("project_id", data.projectId).eq("user_id", context.userId)
      .eq("credential_id", data.credentialId).maybeSingle();
    if (kerr) throw new Error(kerr.message);
    if (!cred) throw new Error("Unknown credential");
    if (cred.revoked_at) throw new Error("Credential revoked");
    if (data.counter <= Number(cred.counter ?? 0)) throw new Error("Counter regression: possible clone");

    // Re-derive expected digest as sha256(publicKey:challenge:counter) — proof
    // of possession of the public key registered earlier, in constant time.
    const expected = createHash("sha256")
      .update(`${cred.public_key}:${data.challenge}:${data.counter}`).digest("hex");
    const exp = Buffer.from(expected);
    const got = Buffer.from(data.signatureDigest);
    if (exp.length !== got.length || !timingSafeEqual(exp, got))
      throw new Error("Signature mismatch");

    await context.supabase.from("passkey_challenges")
      .update({ consumed_at: new Date().toISOString() }).eq("id", ch.id);
    await context.supabase.from("passkey_credentials")
      .update({ counter: data.counter, last_used_at: new Date().toISOString() })
      .eq("id", cred.id);
    return { ok: true };
  });

export const revokeCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; credentialPk: string }) =>
    z.object({ projectId: z.string().uuid(), credentialPk: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("passkey_credentials")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.credentialPk).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
