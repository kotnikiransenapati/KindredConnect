// P15 — SCIM 2.0 token management (provisioning runtime lives in src/routes/api/public/scim/).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function sha256Hex(input: string) {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const listScimTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("scim_tokens")
      .select("id, name, token_prefix, last_used_at, revoked_at, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createScimToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), name: z.string().min(1).max(80) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "scim_token_create", _window: "1 day", _max: 20,
    });
    if (ok.data === false) throw new Error("Rate limit exceeded");
    const token = `scim_${randomToken()}`;
    const token_hash = await sha256Hex(token);
    const token_prefix = token.slice(0, 12);
    const { data: row, error } = await context.supabase
      .from("scim_tokens")
      .insert({ org_id: data.orgId, name: data.name, token_hash, token_prefix, created_by: context.userId })
      .select("id, name, token_prefix, created_at")
      .single();
    if (error) throw new Error(error.message);
    // Token is shown ONCE to the user — never persisted in plaintext.
    return { token, row };
  });

export const revokeScimToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("scim_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listScimAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("scim_audit")
      .select("id, method, path, status_code, external_id, detail, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listScimProvisionedUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("scim_provisioned_users")
      .select("id, external_id, email, display_name, active, created_at, updated_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
