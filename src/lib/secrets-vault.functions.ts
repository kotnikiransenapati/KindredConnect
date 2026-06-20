// Per-project encrypted secrets vault. Values are encrypted at rest with
// AES-256-GCM using a key derived (HKDF/scrypt) from SUPABASE_SERVICE_ROLE_KEY
// so we never need to provision a separate KMS secret. Plaintext is only
// returned through `revealSecret`, which is owner-gated and rate-limited.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const NameRe = /^[A-Z][A-Z0-9_]{0,63}$/;

async function deriveKey(): Promise<Buffer> {
  const { scryptSync } = await import("crypto");
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Vault key unavailable on this environment");
  // Stable salt: cheap, deterministic. Rotating the service role key
  // rotates the vault key as well, which is the desired behavior.
  return scryptSync(secret, "foundry-vault-v1", 32);
}

async function encrypt(plaintext: string) {
  const { randomBytes, createCipheriv } = await import("crypto");
  const key = await deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext, iv, tag };
}

async function decrypt(ciphertext: Buffer, iv: Buffer, tag: Buffer): Promise<string> {
  const { createDecipheriv } = await import("crypto");
  const key = await deriveKey();
  const dec = createDecipheriv("aes-256-gcm", key, iv);
  dec.setAuthTag(tag);
  return Buffer.concat([dec.update(ciphertext), dec.final()]).toString("utf8");
}

async function assertRole(supabase: any, userId: string, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data } = await supabase.rpc("has_project_role", { _project_id: projectId, _user_id: userId, _min_role: role });
  if (!data) throw new Error("Forbidden");
}

export const listProjectSecrets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRole(supabase, userId, data.projectId, "editor");
    const { data: rows, error } = await supabase
      .from("project_secrets")
      .select("id, name, last_four, created_at, updated_at, created_by")
      .eq("project_id", data.projectId)
      .order("name");
    if (error) throw new Error(error.message);
    return { secrets: rows ?? [] };
  });

export const upsertProjectSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    name: z.string().regex(NameRe, "UPPER_SNAKE_CASE, ≤64 chars"),
    value: z.string().min(1).max(24576),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRole(supabase, userId, data.projectId, "editor");
    const ok = await supabase.rpc("check_rate_limit", {
      _user_id: userId, _bucket: "secrets_write", _window: "1 minute", _max: 20,
    });
    if (ok.data === false) throw new Error("Rate limit exceeded");
    const { ciphertext, iv, tag } = await encrypt(data.value);
    const last_four = data.value.slice(-4).replace(/./g, (c, i, s) => (i < s.length - 4 ? "•" : c));
    const { error } = await supabase.from("project_secrets").upsert({
      project_id: data.projectId,
      name: data.name,
      ciphertext, iv, auth_tag: tag, last_four,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "project_id,name" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProjectSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRole(supabase, userId, data.projectId, "owner");
    const { error } = await supabase.from("project_secrets")
      .delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const revealProjectSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertRole(supabase, userId, data.projectId, "owner");
    const ok = await supabase.rpc("check_rate_limit", {
      _user_id: userId, _bucket: "secrets_reveal", _window: "1 minute", _max: 10,
    });
    if (ok.data === false) throw new Error("Rate limit exceeded");
    const { data: row, error } = await supabase
      .from("project_secrets")
      .select("ciphertext, iv, auth_tag, name")
      .eq("id", data.id).eq("project_id", data.projectId).maybeSingle();
    if (error || !row) throw new Error("Secret not found");
    const value = await decrypt(
      Buffer.from(row.ciphertext as ArrayBuffer),
      Buffer.from(row.iv as ArrayBuffer),
      Buffer.from(row.auth_tag as ArrayBuffer),
    );
    return { name: row.name, value };
  });
