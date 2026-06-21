// P27 — Hot-reload bridge.
// Tracks live preview clients (iOS/Android/web), publishes bundle pushes
// (full/delta) with monotonic seq, and broadcasts via supabase realtime.
// Clients pair via a one-time token; server stores only the sha256 hash.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createHash, randomBytes } from "crypto";

const PlatformZ = z.enum(["ios", "android", "web"]);
const KindZ = z.enum(["full", "delta", "asset"]);
const StatusZ = z.enum(["idle", "connected", "reloading", "error", "disconnected"]);

async function assertEditor(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "editor",
  });
  if (error || !data) throw new Error("Forbidden");
}

function sha256(s: string) { return createHash("sha256").update(s).digest("hex"); }

export const registerClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; platform: z.infer<typeof PlatformZ>; deviceLabel?: string }) =>
    z.object({ projectId: z.string().uuid(), platform: PlatformZ, deviceLabel: z.string().max(80).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "hr_register", _window: "1 minute", _max: 30,
    });
    if (ok.error || ok.data === false) throw new Error("Rate limited");
    const token = `hrk_${randomBytes(24).toString("hex")}`;
    const { data: row, error } = await context.supabase.from("hot_reload_clients").insert({
      project_id: data.projectId, platform: data.platform,
      device_label: data.deviceLabel ?? null,
      client_token_hash: sha256(token), status: "idle",
    }).select().single();
    if (error) throw new Error(error.message);
    return { client: row, token }; // token shown once
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("hot_reload_clients")
      .select("*").eq("project_id", data.projectId).order("last_seen_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const revokeClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; projectId: string }) =>
    z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const { error } = await context.supabase.from("hot_reload_clients")
      .update({ status: "disconnected" }).eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const publishBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; kind: z.infer<typeof KindZ>; bundleUrl?: string;
    checksum: string; sizeBytes: number; changedPaths?: string[]; notes?: string;
  }) => z.object({
    projectId: z.string().uuid(), kind: KindZ,
    bundleUrl: z.string().url().max(1000).optional(),
    checksum: z.string().regex(/^[a-f0-9]{32,128}$/i),
    sizeBytes: z.number().int().min(0).max(500_000_000),
    changedPaths: z.array(z.string().max(500)).max(2000).optional(),
    notes: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "hr_publish", _window: "1 minute", _max: 60,
    });
    if (ok.error || ok.data === false) throw new Error("Rate limited");

    // monotonic seq per project
    const { data: last } = await context.supabase.from("hot_reload_bundles")
      .select("seq").eq("project_id", data.projectId).order("seq", { ascending: false }).limit(1).maybeSingle();
    const seq = ((last?.seq as number | undefined) ?? 0) + 1;

    const { data: row, error } = await context.supabase.from("hot_reload_bundles").insert({
      project_id: data.projectId, seq, kind: data.kind,
      bundle_url: data.bundleUrl ?? null, checksum: data.checksum.toLowerCase(),
      size_bytes: data.sizeBytes, changed_paths: data.changedPaths ?? [],
      notes: data.notes ?? null, created_by: context.userId,
    }).select().single();
    if (error) throw new Error(error.message);

    await context.supabase.from("hot_reload_events").insert({
      project_id: data.projectId, bundle_id: row.id, event: "published",
      detail: `seq=${seq} kind=${data.kind} size=${data.sizeBytes}B`,
      metadata: { paths: (data.changedPaths ?? []).slice(0, 20) },
    });
    return row;
  });

export const listBundles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("hot_reload_bundles")
      .select("*").eq("project_id", data.projectId).order("seq", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.from("hot_reload_events")
      .select("*").eq("project_id", data.projectId).order("occurred_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const ackReload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientId: string; projectId: string; bundleId: string; status: z.infer<typeof StatusZ>; detail?: string }) =>
    z.object({
      clientId: z.string().uuid(), projectId: z.string().uuid(),
      bundleId: z.string().uuid(), status: StatusZ, detail: z.string().max(500).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const { data: b } = await context.supabase.from("hot_reload_bundles")
      .select("seq").eq("id", data.bundleId).maybeSingle();
    const patch: any = { status: data.status, last_seen_at: new Date().toISOString() };
    if (b?.seq != null) { patch.last_seq = b.seq; patch.current_bundle_id = data.bundleId; }
    await context.supabase.from("hot_reload_clients").update(patch)
      .eq("id", data.clientId).eq("project_id", data.projectId);
    await context.supabase.from("hot_reload_events").insert({
      project_id: data.projectId, client_id: data.clientId, bundle_id: data.bundleId,
      event: `client_${data.status}`, detail: data.detail ?? null,
    });
    return { ok: true };
  });
