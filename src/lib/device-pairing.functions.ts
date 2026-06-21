// P21 — Real-device pairing & live native preview sessions.
// Pair phones/tablets to a project via short code + one-time token (stored hashed).
// Live preview sessions broadcast bundle URLs/status; UI polls the row for latest state.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randCode(len = 6) {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusable chars
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => a[b % a.length]).join("");
}
function randToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

const PlatformZ = z.enum(["ios", "android", "web"]);

export const createPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "device_pair_create", _window: "00:01:00", _max: 30,
    });
    if (ok.error) throw ok.error;
    if (ok.data === false) throw new Error("Rate limit exceeded");

    // unique short code (retry on collision)
    let code = "";
    for (let i = 0; i < 5; i++) {
      const c = randCode(6);
      const { data: existing } = await context.supabase
        .from("device_pairings").select("id").eq("code", c).maybeSingle();
      if (!existing) { code = c; break; }
    }
    if (!code) throw new Error("Could not allocate pairing code, try again");

    const token = randToken();
    const token_hash = await sha256Hex(token);
    const expires_at = new Date(Date.now() + 15 * 60_000).toISOString();

    const { data: row, error } = await context.supabase
      .from("device_pairings")
      .insert({
        project_id: data.projectId,
        created_by: context.userId,
        code,
        token_hash,
        status: "pending",
        expires_at,
      })
      .select("id, code, expires_at, status, created_at")
      .single();
    if (error) throw error;
    // Token is returned ONCE (used by device app to claim the pairing).
    return { pairing: row, token };
  });

export const listPairings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("device_pairings")
      .select("id, code, platform, device_name, device_model, os_version, status, paired_at, last_seen_at, expires_at, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return { pairings: rows ?? [] };
  });

export const claimPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      code: z.string().min(4).max(12),
      token: z.string().min(16).max(128),
      platform: PlatformZ,
      deviceName: z.string().max(80).optional(),
      deviceModel: z.string().max(80).optional(),
      osVersion: z.string().max(40).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "device_pair_claim", _window: "00:01:00", _max: 20,
    });
    if (ok.error) throw ok.error;
    if (ok.data === false) throw new Error("Rate limit exceeded");

    const token_hash = await sha256Hex(data.token);
    const { data: row, error } = await context.supabase
      .from("device_pairings")
      .select("id, project_id, status, expires_at, token_hash")
      .eq("code", data.code.toUpperCase())
      .maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("Invalid pairing code");
    if (row.status !== "pending") throw new Error("Pairing already used or revoked");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("Pairing expired");
    if (row.token_hash !== token_hash) throw new Error("Invalid pairing token");

    const { error: uErr } = await context.supabase
      .from("device_pairings")
      .update({
        status: "paired",
        platform: data.platform,
        device_name: data.deviceName ?? null,
        device_model: data.deviceModel ?? null,
        os_version: data.osVersion ?? null,
        paired_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (uErr) throw uErr;
    return { ok: true, pairingId: row.id, projectId: row.project_id };
  });

export const heartbeatPairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ pairingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("device_pairings")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", data.pairingId);
    if (error) throw error;
    return { ok: true };
  });

export const revokePairing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("device_pairings")
      .update({ status: "revoked" })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---- Preview sessions ----

export const startPreviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      pairingId: z.string().uuid().optional(),
      bundleUrl: z.string().url().max(2000).optional(),
      bundleVersion: z.string().max(40).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "preview_session_start", _window: "00:01:00", _max: 60,
    });
    if (ok.error) throw ok.error;
    if (ok.data === false) throw new Error("Rate limit exceeded");

    const { data: row, error } = await context.supabase
      .from("preview_sessions")
      .insert({
        project_id: data.projectId,
        pairing_id: data.pairingId ?? null,
        bundle_url: data.bundleUrl ?? null,
        bundle_version: data.bundleVersion ?? null,
        status: "connecting",
        last_event_at: new Date().toISOString(),
      })
      .select("id, status, created_at")
      .single();
    if (error) throw error;
    return { session: row };
  });

export const updatePreviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["idle", "connecting", "live", "error"]).optional(),
      error: z.string().max(500).nullable().optional(),
      incrementEvents: z.number().int().min(0).max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { last_event_at: new Date().toISOString() };
    if (data.status) patch.status = data.status;
    if (data.error !== undefined) patch.error = data.error;
    if (data.incrementEvents) {
      const { data: cur } = await context.supabase
        .from("preview_sessions").select("event_count").eq("id", data.id).maybeSingle();
      patch.event_count = (cur?.event_count ?? 0) + data.incrementEvents;
    }
    const { error } = await context.supabase.from("preview_sessions").update(patch).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const listPreviewSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("preview_sessions")
      .select("id, pairing_id, bundle_url, bundle_version, status, event_count, last_event_at, error, created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return { sessions: rows ?? [] };
  });
