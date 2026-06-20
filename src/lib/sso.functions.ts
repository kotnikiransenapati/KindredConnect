// Enterprise SSO (SAML 2.0) — org-scoped identity provider configuration.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProviderEnum = z.enum([
  "okta",
  "azure_ad",
  "google_workspace",
  "onelogin",
  "jumpcloud",
  "generic_saml",
]);

const DomainRx = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const UrlRx = /^https:\/\/[^\s/$.?#].[^\s]*$/i;
// Reasonable bounds for a single PEM-encoded x509 certificate.
const PemRx = /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/;

function assertOrgId(id: string) {
  return z.string().uuid().parse(id);
}

export const listSsoConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sso_connections")
      .select("id, provider, display_name, domain, entity_id, sso_url, status, last_tested_at, last_error, attribute_map, created_at, updated_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { connections: rows ?? [] };
  });

export const upsertSsoConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      orgId: z.string().uuid(),
      provider: ProviderEnum,
      displayName: z.string().min(2).max(80),
      domain: z.string().regex(DomainRx, "Invalid domain (e.g. acme.com)").toLowerCase(),
      entityId: z.string().min(3).max(500),
      ssoUrl: z.string().regex(UrlRx, "SSO URL must be https://"),
      certificate: z.string().regex(PemRx, "Paste the full PEM x509 certificate"),
      attributeMap: z
        .object({
          email: z.string().min(1).default("email"),
          name: z.string().min(1).default("name"),
        })
        .partial()
        .optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Rate-limit destructive identity changes
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId,
      _bucket: "sso_write",
      _window: "1 minute",
      _max: 10,
    });
    if (ok.data === false) throw new Error("Rate limit: try again shortly.");

    assertOrgId(data.orgId);

    const payload = {
      org_id: data.orgId,
      provider: data.provider,
      display_name: data.displayName,
      domain: data.domain,
      entity_id: data.entityId,
      sso_url: data.ssoUrl,
      certificate: data.certificate.trim(),
      attribute_map: { email: "email", name: "name", ...(data.attributeMap ?? {}) },
      status: "pending" as const,
    };

    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("sso_connections")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return { connection: row };
    }
    const { data: row, error } = await context.supabase
      .from("sso_connections")
      .insert(payload)
      .select()
      .single();
    if (error) {
      if (error.message.toLowerCase().includes("unique"))
        throw new Error("This org already has an SSO connection for that domain.");
      throw error;
    }
    return { connection: row };
  });

export const testSsoConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId,
      _bucket: "sso_test",
      _window: "1 minute",
      _max: 6,
    });
    if (ok.data === false) throw new Error("Rate limit: too many tests, slow down.");

    const { data: row, error } = await context.supabase
      .from("sso_connections")
      .select("id, sso_url, certificate, entity_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Connection not found");

    // Probe: HEAD the SSO URL; success ⇒ active, otherwise error w/ message.
    let status: "active" | "error" = "error";
    let lastError: string | null = null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(row.sso_url, { method: "HEAD", redirect: "manual", signal: ctrl.signal });
      clearTimeout(t);
      // SAML IdPs typically respond 200/302/405 for HEAD; anything < 500 is reachable.
      if (res.status < 500) status = "active";
      else lastError = `IdP responded ${res.status}`;
    } catch (e: any) {
      lastError = e?.message ?? "Unreachable";
    }

    // Cert sanity check.
    const certBody = row.certificate.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    if (certBody.length < 100) {
      status = "error";
      lastError = (lastError ? lastError + " · " : "") + "Certificate too short";
    }

    const { error: updErr } = await context.supabase
      .from("sso_connections")
      .update({ status, last_tested_at: new Date().toISOString(), last_error: lastError })
      .eq("id", data.id);
    if (updErr) throw updErr;

    return { status, error: lastError };
  });

export const setSsoEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("sso_connections")
      .update({ status: data.enabled ? "active" : "disabled" })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteSsoConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("sso_connections").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
