// P46 — Fleet device management server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, DESTRUCTIVE_COMMANDS, enforceRateLimit, nextCommandStatus } from "./fleet.server";

const db = (ctx: any) => ctx.supabase as any;
const PlatformZ = z.enum(["ios", "android", "web", "desktop", "wearable", "tv"]);
const ChannelZ = z.enum(["production", "beta", "internal", "dev"]);
const DeviceStatusZ = z.enum(["active", "idle", "offline", "quarantined", "retired"]);
const CmdKindZ = z.enum(["wipe", "lock", "unlock", "refresh-config", "push-update", "reboot", "collect-logs", "quarantine", "release"]);

export const listDevices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("fleet_devices")
      .select("*").eq("project_id", data.projectId).order("last_seen_at", { ascending: false, nullsFirst: false }).limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const enrollDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    deviceId: z.string().min(4).max(120).regex(/^[a-zA-Z0-9._:-]+$/),
    label: z.string().max(120).optional(),
    platform: PlatformZ,
    osVersion: z.string().max(40).optional(),
    appVersion: z.string().max(40).optional(),
    channel: ChannelZ.default("production"),
    status: DeviceStatusZ.default("active"),
    userLabel: z.string().max(120).optional(),
    attributes: z.record(z.string(), z.any()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "enroll", 60);
    const payload: any = {
      project_id: data.projectId, device_id: data.deviceId, label: data.label ?? null,
      platform: data.platform, os_version: data.osVersion ?? null, app_version: data.appVersion ?? null,
      channel: data.channel, status: data.status, user_label: data.userLabel ?? null,
      attributes: data.attributes, enrolled_by: context.userId, last_seen_at: new Date().toISOString(),
    };
    if (data.id) payload.id = data.id;
    const { data: saved, error } = await db(context).from("fleet_devices")
      .upsert(payload, { onConflict: data.id ? "id" : "project_id,device_id" }).select("*").single();
    if (error) throw new Error(error.code === "23505" ? "Device already enrolled" : error.message);
    return saved;
  });

export const heartbeatDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), id: z.string().uuid(), status: DeviceStatusZ.optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "heartbeat", 240);
    const patch: any = { last_seen_at: new Date().toISOString() };
    if (data.status) patch.status = data.status;
    const { error } = await db(context).from("fleet_devices").update(patch)
      .eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("fleet_devices").delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const issueCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    deviceId: z.string().uuid(),
    kind: CmdKindZ,
    payload: z.record(z.string(), z.any()).default({}),
    confirmDestructive: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "command", 60);
    if (DESTRUCTIVE_COMMANDS.has(data.kind) && !data.confirmDestructive) {
      throw new Error(`Destructive command "${data.kind}" requires explicit confirmation`);
    }
    const { data: device } = await db(context).from("fleet_devices")
      .select("id, status").eq("id", data.deviceId).eq("project_id", data.projectId).single();
    if (!device) throw new Error("Device not found");
    if (device.status === "retired") throw new Error("Cannot command a retired device");

    const { data: saved, error } = await db(context).from("fleet_commands").insert({
      project_id: data.projectId, device_id: data.deviceId, kind: data.kind,
      payload: data.payload, status: "queued",
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const advanceCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), id: z.string().uuid(),
    forceStatus: z.enum(["dispatched", "acknowledged", "succeeded", "failed", "cancelled", "expired"]).optional(),
    result: z.record(z.string(), z.any()).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "advance", 120);
    const { data: cmd } = await db(context).from("fleet_commands")
      .select("*").eq("id", data.id).eq("project_id", data.projectId).single();
    if (!cmd) throw new Error("Command not found");
    if (["succeeded", "failed", "expired", "cancelled"].includes(cmd.status))
      throw new Error(`Command already ${cmd.status}`);

    const next = data.forceStatus ?? nextCommandStatus(cmd.status);
    if (!next) throw new Error("No further status available");
    const patch: any = { status: next };
    if (next === "dispatched") patch.dispatched_at = new Date().toISOString();
    if (["succeeded", "failed", "expired", "cancelled"].includes(next)) patch.completed_at = new Date().toISOString();
    if (data.result) patch.result = data.result;

    const { data: saved, error } = await db(context).from("fleet_commands")
      .update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const listCommands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), deviceId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    let q = db(context).from("fleet_commands").select("*").eq("project_id", data.projectId);
    if (data.deviceId) q = q.eq("device_id", data.deviceId);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const fleetStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const [{ data: devices }, { data: cmds }] = await Promise.all([
      db(context).from("fleet_devices").select("status, platform").eq("project_id", data.projectId),
      db(context).from("fleet_commands").select("status").eq("project_id", data.projectId),
    ]);
    const dRows = (devices ?? []) as any[];
    const cRows = (cmds ?? []) as any[];
    const byStatus: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};
    dRows.forEach((d) => { byStatus[d.status] = (byStatus[d.status] ?? 0) + 1; byPlatform[d.platform] = (byPlatform[d.platform] ?? 0) + 1; });
    const cmdByStatus: Record<string, number> = {};
    cRows.forEach((c) => { cmdByStatus[c.status] = (cmdByStatus[c.status] ?? 0) + 1; });
    return { totalDevices: dRows.length, totalCommands: cRows.length, byStatus, byPlatform, cmdByStatus };
  });
