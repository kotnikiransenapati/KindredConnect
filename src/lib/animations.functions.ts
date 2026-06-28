import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Easing = z.enum(["linear", "easeIn", "easeOut", "easeInOut", "spring", "step"]);
const LoopMode = z.enum(["once", "loop", "pingpong"]);
const AnimProperty = z.enum([
  "position.x", "position.y", "position.z",
  "rotation.x", "rotation.y", "rotation.z",
  "scale", "opacity", "color",
]);

export const listAnimations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), nodeId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("node_animations")
      .select("*, node_keyframes(*)")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (data.nodeId) q = q.eq("node_id", data.nodeId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { animations: rows ?? [] };
  });

const createSchema = z.object({
  projectId: z.string().uuid(),
  nodeId: z.string().uuid(),
  name: z.string().min(1).max(80),
  property: AnimProperty,
  durationMs: z.number().int().min(50).max(600000).default(1000),
  loopMode: LoopMode.default("once"),
});

export const createAnimation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      project_id: data.projectId,
      node_id: data.nodeId,
      name: data.name,
      property: data.property,
      duration_ms: data.durationMs,
      loop_mode: data.loopMode,
      created_by: context.userId,
    };
    const { data: out, error } = await context.supabase
      .from("node_animations")
      .insert(row as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const toggleAnimation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("node_animations")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAnimation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("node_animations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const kfSchema = z.object({
  projectId: z.string().uuid(),
  animationId: z.string().uuid(),
  timeMs: z.number().int().min(0).max(600000),
  value: z.any(),
  easing: Easing.default("easeInOut"),
});

export const upsertKeyframe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => kfSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      project_id: data.projectId,
      animation_id: data.animationId,
      time_ms: data.timeMs,
      value: data.value as never,
      easing: data.easing,
    };
    const { data: out, error } = await context.supabase
      .from("node_keyframes")
      .upsert(row as never, { onConflict: "animation_id,time_ms" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

export const deleteKeyframe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("node_keyframes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

