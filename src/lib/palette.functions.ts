import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const projectInput = z.object({ projectId: z.string().uuid() });

const DEFAULT_BLOCKS: Array<{ category: string; name: string; description: string; icon: string; color: string; props: Record<string, unknown> }> = [
  { category: "layout", name: "Hero Section", description: "Full-width hero with headline + CTA", icon: "LayoutTemplate", color: "#6366f1", props: { headline: "Build the future", cta: "Get started" } },
  { category: "layout", name: "Feature Grid", description: "3-col responsive feature cards", icon: "Grid3x3", color: "#0ea5e9", props: { columns: 3 } },
  { category: "layout", name: "Pricing Table", description: "Tier comparison table", icon: "Table2", color: "#10b981", props: { tiers: 3 } },
  { category: "input", name: "Button", description: "Primary action button", icon: "MousePointerClick", color: "#f59e0b", props: { variant: "default" } },
  { category: "input", name: "Form", description: "Auto-validated form scaffold", icon: "FormInput", color: "#ef4444", props: {} },
  { category: "data", name: "Data Table", description: "Sortable / paginated table", icon: "Table", color: "#8b5cf6", props: { paginated: true } },
  { category: "data", name: "Chart", description: "Recharts-powered chart", icon: "BarChart3", color: "#ec4899", props: { type: "bar" } },
  { category: "media", name: "Image Gallery", description: "Lightbox gallery", icon: "Images", color: "#14b8a6", props: { columns: 4 } },
  { category: "media", name: "Video Player", description: "Adaptive video player", icon: "Video", color: "#f43f5e", props: {} },
];

export const listPaletteBlocks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => projectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("palette_blocks")
      .select("*")
      .eq("project_id", data.projectId)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { blocks: rows ?? [] };
  });

export const seedDefaultBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => projectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("palette_blocks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.projectId);
    if ((count ?? 0) > 0) return { inserted: 0 };
    const rows = DEFAULT_BLOCKS.map((b, i) => ({
      project_id: data.projectId,
      category: b.category,
      name: b.name,
      description: b.description,
      icon: b.icon,
      thumbnail_color: b.color,
      default_props: b.props,
      sort_order: i,
      created_by: context.userId,
    }));
    const { error } = await context.supabase.from("palette_blocks").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

const instantiateSchema = z.object({
  projectId: z.string().uuid(),
  blockId: z.string().uuid(),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
});

export const instantiateBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => instantiateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: block, error: be } = await context.supabase
      .from("palette_blocks")
      .select("*")
      .eq("id", data.blockId)
      .eq("project_id", data.projectId)
      .maybeSingle();
    if (be) throw new Error(be.message);
    if (!block) throw new Error("Block not found");
    const { data: node, error } = await context.supabase
      .from("spatial_nodes")
      .insert({
        project_id: data.projectId,
        kind: "component",
        label: block.name,
        color: block.thumbnail_color,
        position_x: data.position.x,
        position_y: data.position.y,
        position_z: data.position.z,
        metadata: { source_block_id: block.id, category: block.category, props: block.default_props },
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { node };
  });

const createBlockSchema = z.object({
  projectId: z.string().uuid(),
  category: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  description: z.string().max(200).optional(),
  icon: z.string().max(40).default("Box"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6366f1"),
});

export const createPaletteBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createBlockSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("palette_blocks")
      .insert({
        project_id: data.projectId,
        category: data.category,
        name: data.name,
        description: data.description ?? null,
        icon: data.icon,
        thumbnail_color: data.color,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { block: row };
  });

export const deletePaletteBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("palette_blocks")
      .delete()
      .eq("id", data.id)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
