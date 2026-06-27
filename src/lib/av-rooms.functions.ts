// P50 — AV rooms server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, enforceRateLimit } from "./_phase23.shared";
import { canJoin } from "./av-rooms.shared";

const db = (ctx: any) => ctx.supabase as any;

export const listRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("av_rooms")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const createRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    name: z.string().min(2).max(80),
    topic: z.string().max(200).optional(),
    mode: z.enum(["mesh", "sfu"]).default("mesh"),
    maxParticipants: z.number().int().min(2).max(50).default(8),
    recording: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "av:create", 20);
    const { data: saved, error } = await db(context).from("av_rooms").insert({
      project_id: data.projectId, name: data.name, topic: data.topic ?? null,
      mode: data.mode, max_participants: data.maxParticipants, recording: data.recording,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const updateRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    id: z.string().uuid(),
    status: z.enum(["open", "locked", "ended"]).optional(),
    recording: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    const patch: any = {};
    if (data.status) { patch.status = data.status; if (data.status === "ended") patch.ended_at = new Date().toISOString(); }
    if (data.recording !== undefined) patch.recording = data.recording;
    const { data: saved, error } = await db(context).from("av_rooms")
      .update(patch).eq("id", data.id).eq("project_id", data.projectId).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const joinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), roomId: z.string().uuid(),
    displayName: z.string().min(1).max(60),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    await enforceRateLimit(context, "av:join", 60);
    const [{ data: room }, { count }] = await Promise.all([
      db(context).from("av_rooms").select("*").eq("id", data.roomId).single(),
      db(context).from("av_participants").select("*", { count: "exact", head: true })
        .eq("room_id", data.roomId).is("left_at", null),
    ]);
    if (!room) throw new Error("Room not found");
    const gate = canJoin(room, count ?? 0);
    if (!gate.ok) throw new Error(gate.reason);
    const { data: saved, error } = await db(context).from("av_participants").upsert({
      room_id: data.roomId, project_id: data.projectId, user_id: context.userId,
      display_name: data.displayName, left_at: null, joined_at: new Date().toISOString(),
    }, { onConflict: "room_id,user_id" }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const leaveRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { error } = await db(context).from("av_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("room_id", data.roomId).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("av_participants")
      .select("*").eq("room_id", data.roomId).is("left_at", null).order("joined_at");
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const postSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), roomId: z.string().uuid(),
    toUser: z.string().uuid().optional(),
    kind: z.enum(["offer", "answer", "ice", "leave", "mute", "kick", "chat"]),
    payload: z.record(z.string(), z.any()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    await enforceRateLimit(context, "av:signal", 600);
    const { data: saved, error } = await db(context).from("av_signals").insert({
      room_id: data.roomId, project_id: data.projectId, to_user: data.toUser ?? null,
      kind: data.kind, payload: data.payload,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });
