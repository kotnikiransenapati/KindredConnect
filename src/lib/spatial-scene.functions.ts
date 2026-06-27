import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const projectInput = z.object({ projectId: z.string().uuid() });

export const listSpatialNodes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => projectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: nodes, error } = await context.supabase
      .from("spatial_nodes")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: views } = await context.supabase
      .from("scene_viewpoints")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    return { nodes: nodes ?? [], viewpoints: views ?? [] };
  });

const upsertSchema = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid().optional(),
  kind: z.enum(["file", "route", "component", "service", "note"]).default("file"),
  label: z.string().min(1).max(120),
  filePath: z.string().max(400).optional().nullable(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  scale: z.number().min(0.1).max(10).default(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
  metadata: z.record(z.unknown()).default({}),
});

export const upsertSpatialNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const row = {
      project_id: data.projectId,
      kind: data.kind,
      label: data.label,
      file_path: data.filePath ?? null,
      pos_x: data.position.x,
      pos_y: data.position.y,
      pos_z: data.position.z,
      scale: data.scale,
      color: data.color,
      metadata: data.metadata,
      created_by: context.userId,
    };
    if (data.id) {
      const { data: out, error } = await context.supabase
        .from("spatial_nodes")
        .update(row)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return out;
    }
    const { data: out, error } = await context.supabase
      .from("spatial_nodes")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return out;
  });

const moveSchema = z.object({
  id: z.string().uuid(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
});
export const moveSpatialNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => moveSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("spatial_nodes")
      .update({ pos_x: data.position.x, pos_y: data.position.y, pos_z: data.position.z })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSpatialNode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("spatial_nodes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const seedSchema = z.object({ projectId: z.string().uuid() });
export const seedSceneFromFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => seedSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: files, error } = await context.supabase
      .from("project_files")
      .select("path")
      .eq("project_id", data.projectId)
      .limit(64);
    if (error) throw new Error(error.message);
    const list = files ?? [];
    if (list.length === 0) return { inserted: 0 };
    // golden-angle spiral layout for an organic 3D arrangement
    const golden = Math.PI * (3 - Math.sqrt(5));
    const rows = list.map((f, i) => {
      const r = Math.sqrt(i + 1) * 1.4;
      const a = i * golden;
      const y = (i % 5) * 0.6 - 1.2;
      return {
        project_id: data.projectId,
        kind: "file" as const,
        label: f.path.split("/").pop() ?? f.path,
        file_path: f.path,
        pos_x: Math.cos(a) * r,
        pos_y: y,
        pos_z: Math.sin(a) * r,
        scale: 1,
        color: pickColor(f.path),
        metadata: {},
        created_by: context.userId,
      };
    });
    const { error: insErr } = await context.supabase.from("spatial_nodes").insert(rows);
    if (insErr) throw new Error(insErr.message);
    return { inserted: rows.length };
  });

function pickColor(path: string): string {
  if (path.endsWith(".tsx") || path.endsWith(".jsx")) return "#6366f1";
  if (path.endsWith(".ts") || path.endsWith(".js")) return "#0ea5e9";
  if (path.endsWith(".css")) return "#f59e0b";
  if (path.endsWith(".json")) return "#10b981";
  if (path.endsWith(".md")) return "#a78bfa";
  return "#94a3b8";
}

const saveViewSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(80),
  camera: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  target: z.object({ x: z.number(), y: z.number(), z: z.number() }),
});
export const saveViewpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saveViewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: out, error } = await context.supabase
      .from("scene_viewpoints")
      .insert({
        project_id: data.projectId,
        name: data.name,
        cam_x: data.camera.x,
        cam_y: data.camera.y,
        cam_z: data.camera.z,
        target_x: data.target.x,
        target_y: data.target.y,
        target_z: data.target.z,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return out;
  });
