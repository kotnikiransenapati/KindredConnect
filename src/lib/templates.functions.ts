// Template gallery + fork-to-project. Templates are seeded via SQL; users
// pick one and a fresh project is provisioned with its starter files.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface TemplateRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  thumbnail_url: string | null;
  initial_prompt: string | null;
  is_featured: boolean;
  use_count: number;
  sort_order: number;
}

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("templates")
      .select("id, slug, name, description, category, thumbnail_url, initial_prompt, is_featured, use_count, sort_order")
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { templates: (data ?? []) as TemplateRow[] };
  });

const ForkInput = z.object({
  templateId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
});

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "").slice(0, 48) || "project";

export const createProjectFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ForkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load template via authenticated client (RLS lets authenticated users read active templates).
    const { data: tpl, error: tplErr } = await supabase
      .from("templates")
      .select("id, name, files, initial_prompt")
      .eq("id", data.templateId)
      .eq("is_active", true)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl) throw new Error("Template not found");

    // Unique slug per owner
    const base = slugify(data.name);
    let slug = base;
    for (let i = 1; i < 50; i++) {
      const { data: existing } = await supabase
        .from("projects").select("id").eq("owner_id", userId).eq("slug", slug).maybeSingle();
      if (!existing) break;
      slug = `${base}-${i}`;
    }

    const { data: project, error: insErr } = await supabase
      .from("projects")
      .insert({
        owner_id: userId,
        name: data.name,
        slug,
        initial_prompt: tpl.initial_prompt ?? null,
        description: (tpl.initial_prompt ?? "").slice(0, 160) || null,
        template_id: tpl.id,
      } as never)
      .select("id, name, slug")
      .single();
    if (insErr || !project) throw new Error(insErr?.message ?? "Failed to create project");

    // Bulk-insert template files
    const files = (tpl.files as Array<{ path: string; content: string }> | null) ?? [];
    if (files.length > 0) {
      const rows = files
        .filter((f) => f && typeof f.path === "string" && typeof f.content === "string")
        .slice(0, 200)
        .map((f) => ({
          project_id: project.id,
          path: f.path.slice(0, 512),
          content: f.content.slice(0, 200_000),
          created_by: userId,
        }));
      if (rows.length > 0) {
        await supabase.from("project_files").insert(rows as never);
      }
    }

    // Bump template use count + log activity (admin client bypasses RLS).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cur } = await supabaseAdmin.from("templates").select("use_count").eq("id", tpl.id).maybeSingle();
    await supabaseAdmin
      .from("templates")
      .update({ use_count: (cur?.use_count ?? 0) + 1 } as never)
      .eq("id", tpl.id);

    await supabaseAdmin.from("activity_log").insert({
      project_id: project.id,
      actor_id: userId,
      action: "project.created_from_template",
      target: tpl.id,
      metadata: { template_name: tpl.name } as never,
    } as never);

    return { project };
  });
