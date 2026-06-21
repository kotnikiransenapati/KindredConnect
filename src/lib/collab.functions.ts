// P39 — Live multiplayer collaborative editor server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { applyOp, assertProjectRole, colorForUser, enforceRateLimit } from "./collab.server";

const db = (ctx: any) => ctx.supabase as any;
const OpKindZ = z.enum(["insert", "delete", "retain", "format", "annotation"]);

// Legacy: per-file save used by the older CollabEditor realtime panel.
export const upsertProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      path: z.string().min(1).max(400),
      content: z.string().max(2_000_000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const rl = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "file_upsert", _window: "1 minute", _max: 120,
    });
    if (rl.data === false) throw new Error("Rate limit exceeded on file saves.");
    const { error } = await context.supabase.from("project_files").upsert(
      { project_id: data.projectId, path: data.path, content: data.content },
      { onConflict: "project_id,path" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context)
      .from("collab_sessions")
      .select("*")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    documentPath: z.string().min(1).max(400),
    title: z.string().max(160).optional(),
    initialContent: z.string().max(200_000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "session", 30);
    const { data: saved, error } = await db(context)
      .from("collab_sessions")
      .upsert({
        project_id: data.projectId,
        document_path: data.documentPath,
        title: data.title ?? data.documentPath,
        snapshot: { text: data.initialContent ?? "" },
        created_by: context.userId,
      }, { onConflict: "project_id,document_path" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const archiveSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    const { error } = await db(context).from("collab_sessions")
      .update({ status: "archived" }).eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const joinSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sessionId: z.string().uuid(),
    projectId: z.string().uuid(),
    displayName: z.string().min(1).max(80),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    await enforceRateLimit(context, "join", 60);
    const { data: saved, error } = await db(context)
      .from("collab_participants")
      .upsert({
        session_id: data.sessionId,
        project_id: data.projectId,
        user_id: context.userId,
        display_name: data.displayName,
        color: colorForUser(context.userId),
        status: "online",
        last_seen: new Date().toISOString(),
      }, { onConflict: "session_id,user_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const listParticipants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context)
      .from("collab_participants")
      .select("*")
      .eq("session_id", data.sessionId)
      .order("joined_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const presenceHeartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sessionId: z.string().uuid(),
    projectId: z.string().uuid(),
    cursor: z.record(z.string(), z.any()).optional(),
    selection: z.record(z.string(), z.any()).optional(),
    status: z.enum(["online", "idle", "offline"]).default("online"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    await enforceRateLimit(context, "presence", 600);
    const { error } = await db(context)
      .from("collab_participants")
      .update({
        cursor: data.cursor ?? {},
        selection: data.selection ?? {},
        status: data.status,
        last_seen: new Date().toISOString(),
      })
      .eq("session_id", data.sessionId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitOp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sessionId: z.string().uuid(),
    projectId: z.string().uuid(),
    parentVersion: z.number().int().min(0),
    opKind: OpKindZ,
    payload: z.record(z.string(), z.any()),
    clientId: z.string().max(64).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "op", 600);
    const { data: sessRow, error: se } = await db(context)
      .from("collab_sessions").select("*").eq("id", data.sessionId).eq("project_id", data.projectId).single();
    if (se || !sessRow) throw new Error(se?.message ?? "Session not found");
    if (sessRow.status !== "active") throw new Error(`Session is ${sessRow.status}`);
    const nextVersion = Number(sessRow.head_version) + 1;
    const { data: opRow, error: oe } = await db(context).from("collab_ops").insert({
      session_id: data.sessionId, project_id: data.projectId,
      version: nextVersion, op_kind: data.opKind, payload: data.payload,
      parent_version: data.parentVersion, actor_id: context.userId, client_id: data.clientId ?? null,
    }).select("*").single();
    if (oe) {
      if (oe.code === "23505") throw new Error("Version conflict — refresh ops and retry.");
      throw new Error(oe.message);
    }
    const newText = applyOp(String(sessRow.snapshot?.text ?? ""), { kind: data.opKind, payload: data.payload });
    await db(context).from("collab_sessions")
      .update({ head_version: nextVersion, snapshot: { ...sessRow.snapshot, text: newText } })
      .eq("id", data.sessionId);
    return { op: opRow, headVersion: nextVersion, snapshot: newText };
  });

export const listOps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sessionId: z.string().uuid(), projectId: z.string().uuid(),
    sinceVersion: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(500).default(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context)
      .from("collab_ops").select("*")
      .eq("session_id", data.sessionId)
      .gt("version", data.sinceVersion)
      .order("version", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const postComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    sessionId: z.string().uuid(), projectId: z.string().uuid(),
    body: z.string().min(1).max(4000),
    anchor: z.record(z.string(), z.any()).optional(),
    parentId: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    await enforceRateLimit(context, "comment", 60);
    const { data: saved, error } = await db(context).from("collab_comments").insert({
      session_id: data.sessionId, project_id: data.projectId,
      author_id: context.userId, body: data.body,
      anchor: data.anchor ?? {}, parent_id: data.parentId ?? null,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const listComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ sessionId: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("collab_comments")
      .select("*").eq("session_id", data.sessionId).order("created_at", { ascending: true }).limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const resolveComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), projectId: z.string().uuid(), resolved: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    const { error } = await db(context).from("collab_comments")
      .update({ resolved_at: data.resolved ? new Date().toISOString() : null })
      .eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
