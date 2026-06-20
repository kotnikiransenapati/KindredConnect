// Phase-2 P3: Push notifications + deep linking
//
// - push_devices: tokens registered by signed-in users from the running app
// - push_campaigns: outgoing messages; sendCampaign attempts FCM v1 via
//   FCM_SERVER_KEY if present, otherwise marks as dispatched (counts only).
// - deep_links: writes apple-app-site-association + assetlinks.json into
//   project_files so universal/app links resolve on install.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const platform = z.enum(["ios", "android"]);

// ---------- devices ----------

export const registerPushDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; platform: "ios" | "android"; token: string; deviceLabel?: string }) =>
    z.object({
      projectId: z.string().uuid(),
      platform,
      token: z.string().min(8).max(4096),
      deviceLabel: z.string().max(80).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_devices")
      .upsert({
        project_id: data.projectId,
        user_id: context.userId,
        platform: data.platform,
        token: data.token,
        device_label: data.deviceLabel ?? null,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "project_id,token" });
    if (error) throw error;
    return { ok: true };
  });

export const listPushDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("push_devices")
      .select("id,platform,device_label,last_seen_at,user_id")
      .eq("project_id", data.projectId)
      .order("last_seen_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { devices: rows ?? [] };
  });

// ---------- campaigns ----------

async function fcmSend(serverKey: string, token: string, payload: { title: string; body: string; data: Record<string, unknown> }) {
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `key=${serverKey}` },
    body: JSON.stringify({
      to: token,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
    }),
  });
  return res.ok;
}

export const listPushCampaigns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("push_campaigns")
      .select("id,title,body,target,target_value,status,sent_count,fail_count,scheduled_at,sent_at,error,created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return { campaigns: rows ?? [] };
  });

export const upsertPushCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string;
    id?: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    target?: "all" | "user" | "segment";
    targetValue?: string | null;
    scheduledAt?: string | null;
  }) => z.object({
    projectId: z.string().uuid(),
    id: z.string().uuid().optional(),
    title: z.string().min(1).max(80),
    body: z.string().min(1).max(240),
    data: z.record(z.string(), z.any()).default({}),
    target: z.enum(["all", "user", "segment"]).default("all"),
    targetValue: z.string().max(200).nullable().optional(),
    scheduledAt: z.string().datetime().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      project_id: data.projectId,
      title: data.title,
      body: data.body,
      data: data.data as never,
      target: data.target,
      target_value: data.targetValue ?? null,
      status: (data.scheduledAt ? "scheduled" : "draft") as "scheduled" | "draft",
      scheduled_at: data.scheduledAt ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("push_campaigns").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("push_campaigns").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row!.id };
  });

export const sendPushCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; id: string }) =>
    z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertRateLimit } = await import("@/lib/rate-limit.server");
    await assertRateLimit(context.userId, "push_send_min", "1 minute", 4);
    await assertRateLimit(context.userId, "push_send_day", "1 day", 100);

    const { data: c, error } = await context.supabase
      .from("push_campaigns")
      .select("id,project_id,title,body,data,target,target_value")
      .eq("id", data.id).eq("project_id", data.projectId).single();
    if (error || !c) throw error ?? new Error("Campaign not found");

    await context.supabase.from("push_campaigns").update({ status: "sending" }).eq("id", c.id);

    // Resolve target devices.
    let q = context.supabase.from("push_devices").select("token,platform,user_id").eq("project_id", c.project_id);
    if (c.target === "user" && c.target_value) q = q.eq("user_id", c.target_value);
    if (c.target === "segment" && c.target_value) q = q.eq("platform", c.target_value === "ios" || c.target_value === "android" ? c.target_value : "ios");
    const { data: devices } = await q.limit(2000);

    const serverKey = process.env.FCM_SERVER_KEY;
    let ok = 0, fail = 0, errMsg: string | null = null;

    if (!serverKey) {
      // Dispatch-only mode: count as queued for an external delivery worker.
      ok = devices?.length ?? 0;
      errMsg = "FCM_SERVER_KEY not configured — recorded only; configure the secret to enable real delivery.";
    } else {
      const payload = { title: c.title, body: c.body, data: (c.data as Record<string, unknown>) ?? {} };
      const results = await Promise.allSettled(
        (devices ?? []).map((d) => fcmSend(serverKey, d.token, payload)),
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) ok++; else fail++;
      }
    }

    await context.supabase.from("push_campaigns").update({
      status: fail === 0 ? "sent" : "failed",
      sent_count: ok, fail_count: fail,
      sent_at: new Date().toISOString(),
      error: errMsg,
    }).eq("id", c.id);

    return { sent: ok, failed: fail, note: errMsg };
  });

export const deletePushCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("push_campaigns").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- deep links ----------

export const listDeepLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("deep_links")
      .select("id,path,screen_slug,params,enabled,updated_at")
      .eq("project_id", data.projectId)
      .order("path");
    if (error) throw error;
    return { links: rows ?? [] };
  });

export const upsertDeepLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; id?: string;
    path: string; screenSlug: string;
    params?: Record<string, unknown>; enabled?: boolean;
  }) => z.object({
    projectId: z.string().uuid(),
    id: z.string().uuid().optional(),
    path: z.string().regex(/^\/[A-Za-z0-9_\-/:]{0,200}$/, "Must start with /, ASCII only"),
    screenSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{0,40}$/),
    params: z.record(z.string(), z.any()).default({}),
    enabled: z.boolean().default(true),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      project_id: data.projectId,
      path: data.path, screen_slug: data.screenSlug,
      params: data.params as never, enabled: data.enabled,
    };
    if (data.id) {
      const { error } = await context.supabase.from("deep_links").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase.from("deep_links").insert(payload).select("id").single();
    if (error) throw error;
    return { id: row!.id };
  });

export const deleteDeepLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("deep_links").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const generateDeepLinkFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; appleAppId: string; androidPackage: string; sha256Fingerprint: string }) =>
    z.object({
      projectId: z.string().uuid(),
      appleAppId: z.string().regex(/^[A-Z0-9]{8,12}\.[A-Za-z0-9.\-]+$/, "Format: TEAMID.bundle.id"),
      androidPackage: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){1,}$/),
      sha256Fingerprint: z.string().regex(/^[A-F0-9:]{59,95}$/i, "Hex pairs separated by ':'"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: links } = await context.supabase
      .from("deep_links").select("path").eq("project_id", data.projectId).eq("enabled", true);
    const paths = (links ?? []).map((l) => l.path);

    const aasa = {
      applinks: {
        apps: [],
        details: [{ appID: data.appleAppId, paths: paths.length ? paths : ["*"] }],
      },
    };
    const assetlinks = [{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: data.androidPackage, sha256_cert_fingerprints: [data.sha256Fingerprint] },
    }];

    const files = [
      { path: "public/.well-known/apple-app-site-association", content: JSON.stringify(aasa, null, 2) },
      { path: "public/.well-known/assetlinks.json", content: JSON.stringify(assetlinks, null, 2) },
    ];
    for (const f of files) {
      const { error } = await context.supabase.from("project_files")
        .upsert({ project_id: data.projectId, path: f.path, content: f.content }, { onConflict: "project_id,path" });
      if (error) throw error;
    }
    return { written: files.map((f) => f.path) };
  });
