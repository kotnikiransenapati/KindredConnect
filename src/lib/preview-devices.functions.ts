import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const projectInput = z.object({ projectId: z.string().uuid() });

const DEVICE_PRESETS: Record<string, { w: number; h: number; scale: number; label: string }> = {
  phone: { w: 390, h: 844, scale: 1, label: "iPhone 15" },
  phone_android: { w: 412, h: 915, scale: 1, label: "Pixel 8" },
  tablet: { w: 820, h: 1180, scale: 0.8, label: "iPad" },
  laptop: { w: 1366, h: 854, scale: 0.55, label: "Laptop 13\"" },
  desktop: { w: 1920, h: 1080, scale: 0.4, label: "Desktop" },
};

export const listPreviewDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => projectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("preview_devices")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { devices: rows ?? [] };
  });

const createSchema = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(["phone", "phone_android", "tablet", "laptop", "desktop"]),
  previewUrl: z.string().url().optional().nullable(),
  label: z.string().min(1).max(80).optional(),
});

export const addPreviewDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const preset = DEVICE_PRESETS[data.kind];
    const { count } = await context.supabase
      .from("preview_devices")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.projectId);
    const offset = (count ?? 0) * 2.5;
    const { data: row, error } = await context.supabase
      .from("preview_devices")
      .insert({
        project_id: data.projectId,
        label: data.label ?? preset.label,
        kind: data.kind,
        viewport_w: preset.w,
        viewport_h: preset.h,
        scale: preset.scale,
        position_x: offset,
        position_y: 0,
        position_z: 0,
        preview_url: data.previewUrl ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { device: row };
  });

const updateSchema = z.object({
  projectId: z.string().uuid(),
  id: z.string().uuid(),
  patch: z.object({
    label: z.string().min(1).max(80).optional(),
    preview_url: z.string().url().nullable().optional(),
    active: z.boolean().optional(),
    position_x: z.number().optional(),
    position_y: z.number().optional(),
    position_z: z.number().optional(),
    rotation_y: z.number().optional(),
    scale: z.number().min(0.1).max(5).optional(),
  }),
});

export const updatePreviewDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("preview_devices")
      .update(data.patch)
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { device: row };
  });

export const deletePreviewDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("preview_devices")
      .delete()
      .eq("id", data.id)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
