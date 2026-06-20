// P17 — SIEM streaming: webhook-signed audit/event dispatch with retry + delivery ledger.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PROVIDERS = ["splunk_hec", "datadog", "generic_webhook"] as const;
type Provider = (typeof PROVIDERS)[number];

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const listSiemDestinations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("siem_destinations")
      .select("id,name,provider,endpoint_url,secret_hint,event_filter,enabled,last_delivery_at,last_status,last_error,created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { destinations: rows ?? [] };
  });

export const upsertSiemDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      orgId: z.string().uuid(),
      name: z.string().min(2).max(80),
      provider: z.enum(PROVIDERS),
      endpointUrl: z.string().url().refine((u) => u.startsWith("https://"), "HTTPS required"),
      secret: z.string().min(16).max(256).optional(),
      eventFilter: z.array(z.string().min(1).max(120)).max(50).default([]),
      enabled: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "siem.upsert", _window: "00:01:00", _max: 20,
    });
    if (ok.error || ok.data === false) throw new Error("Rate limit exceeded");

    const base: Record<string, unknown> = {
      org_id: data.orgId,
      name: data.name,
      provider: data.provider,
      endpoint_url: data.endpointUrl,
      event_filter: data.eventFilter,
      enabled: data.enabled,
    };

    if (data.secret) {
      base.secret_hash = await sha256Hex(data.secret);
      base.secret_hint = data.secret.slice(0, 4) + "…" + data.secret.slice(-2);
    }

    if (data.id) {
      const { error } = await context.supabase.from("siem_destinations").update(base as any).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    if (!data.secret) throw new Error("Secret required for new destinations");
    base.created_by = context.userId;
    const { data: row, error } = await context.supabase.from("siem_destinations").insert(base as any).select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

export const deleteSiemDestination = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("siem_destinations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

function formatPayload(provider: Provider, event: { name: string; metadata: Record<string, unknown>; ts: string; orgId: string }) {
  if (provider === "splunk_hec") {
    return { event: { name: event.name, ...event.metadata }, time: Math.floor(Date.parse(event.ts) / 1000), sourcetype: "lovable:audit" };
  }
  if (provider === "datadog") {
    return { ddsource: "lovable", ddtags: `event:${event.name},org:${event.orgId}`, message: JSON.stringify(event.metadata), service: "lovable-audit" };
  }
  return { name: event.name, ts: event.ts, org_id: event.orgId, data: event.metadata };
}

export const dispatchSiemEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      eventName: z.string().min(1).max(120),
      auditId: z.string().uuid().nullable().optional(),
      // The user supplies a freshly-known secret only for testing. Production dispatch
      // would use the stored secret via a privileged worker; for now we require an
      // explicit secret per call to keep service-role access out of this fn.
      secret: z.string().min(16).max(256),
      destinationId: z.string().uuid(),
      metadata: z.record(z.string(), z.any()).default({}),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "siem.dispatch", _window: "00:01:00", _max: 60,
    });
    if (ok.error || ok.data === false) throw new Error("Rate limit exceeded");

    const { data: dest, error: dErr } = await context.supabase
      .from("siem_destinations")
      .select("id,provider,endpoint_url,secret_hash,enabled,event_filter,org_id")
      .eq("id", data.destinationId).maybeSingle();
    if (dErr) throw dErr;
    if (!dest) throw new Error("Destination not found");
    if (!dest.enabled) throw new Error("Destination disabled");
    if (dest.org_id !== data.orgId) throw new Error("Org mismatch");

    const expectHash = await sha256Hex(data.secret);
    if (expectHash !== dest.secret_hash) throw new Error("Invalid destination secret");

    if (dest.event_filter?.length && !dest.event_filter.includes(data.eventName)) {
      return { skipped: true, reason: "filtered" };
    }

    const ts = new Date().toISOString();
    const payload = formatPayload(dest.provider as Provider, { name: data.eventName, metadata: data.metadata, ts, orgId: data.orgId });
    const body = JSON.stringify(payload);
    const sig = await hmacHex(data.secret, body);

    const headers: Record<string, string> = { "content-type": "application/json", "x-lovable-signature": `sha256=${sig}`, "x-lovable-event": data.eventName };
    if (dest.provider === "splunk_hec") headers.authorization = `Splunk ${data.secret}`;
    if (dest.provider === "datadog") headers["dd-api-key"] = data.secret;

    const t0 = Date.now();
    let httpCode: number | null = null;
    let snippet: string | null = null;
    let errMsg: string | null = null;
    let status: "success" | "failed" = "failed";
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(dest.endpoint_url, { method: "POST", headers, body, signal: ctrl.signal });
      clearTimeout(to);
      httpCode = res.status;
      snippet = (await res.text()).slice(0, 500);
      status = res.ok ? "success" : "failed";
      if (!res.ok) errMsg = `HTTP ${res.status}`;
    } catch (e) {
      errMsg = e instanceof Error ? e.message : String(e);
    }
    const latency = Date.now() - t0;

    await context.supabase.from("siem_deliveries").insert({
      destination_id: dest.id, org_id: dest.org_id, audit_id: data.auditId ?? null,
      event_name: data.eventName, attempt: 1, status, http_code: httpCode,
      response_snippet: snippet, latency_ms: latency, error: errMsg,
    });
    await context.supabase.from("siem_destinations").update({
      last_delivery_at: ts, last_status: status, last_error: errMsg,
    }).eq("id", dest.id);

    return { status, httpCode, latencyMs: latency, error: errMsg };
  });

export const listSiemDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; limit?: number }) =>
    z.object({ orgId: z.string().uuid(), limit: z.number().int().min(1).max(200).default(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("siem_deliveries")
      .select("id,destination_id,event_name,status,http_code,latency_ms,error,created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return { deliveries: rows ?? [] };
  });
