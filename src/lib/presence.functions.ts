// A7 — Spatial presence: live 3D avatars for project collaborators.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PALETTE = [
  "#7c5cff", "#22d3ee", "#f472b6", "#34d399", "#fbbf24",
  "#f87171", "#a78bfa", "#60a5fa", "#fb923c", "#4ade80",
];
function colorFor(userId: string) {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

async function assertViewer(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "viewer",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

export const heartbeatPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    displayName: z.string().min(1).max(80),
    pos: z.tuple([z.number(), z.number(), z.number()]),
    targetNodeId: z.string().uuid().nullable().optional(),
    status: z.enum(["online", "idle", "offline"]).default("online"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertViewer(context, data.projectId);
    const rl = await (context.supabase as any).rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "spatial_presence", _window: "1 minute", _max: 240,
    });
    if (rl.data === false) throw new Error("Rate limit exceeded.");
    const row = {
      project_id: data.projectId,
      user_id: context.userId,
      display_name: data.displayName.slice(0, 80),
      color: colorFor(context.userId),
      pos_x: data.pos[0], pos_y: data.pos[1], pos_z: data.pos[2],
      target_node_id: data.targetNodeId ?? null,
      status: data.status,
      last_seen: new Date().toISOString(),
    };
    const { data: saved, error } = await (context.supabase as any)
      .from("spatial_presence")
      .upsert(row, { onConflict: "project_id,user_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const listPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertViewer(context, data.projectId);
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { data: rows, error } = await (context.supabase as any)
      .from("spatial_presence")
      .select("*")
      .eq("project_id", data.projectId)
      .gte("last_seen", cutoff)
      .order("last_seen", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const leavePresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("spatial_presence")
      .delete()
      .eq("project_id", data.projectId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
