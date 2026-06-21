// P47 — Realtime whiteboard server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, enforceRateLimit } from "./_phase22.shared";

const db = (ctx: any) => ctx.supabase as any;
const ToolZ = z.enum(["pen", "marker", "highlighter", "eraser", "rect", "ellipse", "line", "arrow", "text", "sticky"]);
const PointZ = z.object({ x: z.number(), y: z.number(), p: z.number().min(0).max(1).optional() });

export const listBoards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("whiteboards")
      .select("*").eq("project_id", data.projectId).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const createBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    name: z.string().min(2).max(120),
    width: z.number().int().min(320).max(8192).default(1920),
    height: z.number().int().min(240).max(8192).default(1080),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#0b1020"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "wb:create", 30);
    const { data: saved, error } = await db(context).from("whiteboards").insert({
      project_id: data.projectId, name: data.name, width: data.width, height: data.height, background: data.background,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const deleteBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("whiteboards").delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listStrokes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), boardId: z.string().uuid(), sinceSeq: z.number().int().min(0).default(0) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("whiteboard_strokes")
      .select("*").eq("board_id", data.boardId).eq("project_id", data.projectId)
      .gt("seq", data.sinceSeq).order("seq", { ascending: true }).limit(2000);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const appendStroke = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    boardId: z.string().uuid(),
    tool: ToolZ,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    strokeWidth: z.number().int().min(1).max(64),
    points: z.array(PointZ).min(1).max(5000),
    metadata: z.record(z.string(), z.any()).default({}),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "wb:stroke", 600);
    const { data: saved, error } = await db(context).from("whiteboard_strokes").insert({
      project_id: data.projectId, board_id: data.boardId, tool: data.tool, color: data.color,
      stroke_width: data.strokeWidth, points: data.points, metadata: data.metadata,
    }).select("*").single();
    if (error) throw new Error(error.message);
    await db(context).from("whiteboards").update({ version: (Date.now() % 1_000_000_000) }).eq("id", data.boardId);
    return saved;
  });

export const clearBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), boardId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    const { error } = await db(context).from("whiteboard_strokes").delete().eq("board_id", data.boardId).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
