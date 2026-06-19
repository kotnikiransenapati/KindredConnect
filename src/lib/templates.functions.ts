// Template gallery + fork-to-project + community publish + ratings.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export interface TemplateRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  thumbnail_url: string | null;
  initial_prompt: string | null;
  is_featured: boolean;
  is_public?: boolean;
  use_count: number;
  sort_order: number;
  avg_rating?: number;
  rating_count?: number;
  author_id?: string | null;
}

const TEMPLATE_COLUMNS =
  "id, slug, name, description, category, thumbnail_url, initial_prompt, is_featured, is_public, use_count, sort_order, avg_rating, rating_count, author_id";

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("templates")
      .select(TEMPLATE_COLUMNS)
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("avg_rating", { ascending: false })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { templates: (data ?? []) as TemplateRow[] };
  });

// PUBLIC: marketplace browse (no auth required)
export const listPublicTemplates = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    q: z.string().trim().max(80).optional(),
    category: z.string().trim().max(40).optional(),
  }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const sb = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    let q = sb.from("templates").select(TEMPLATE_COLUMNS)
      .eq("is_active", true).eq("is_public", true);
    if (data.category) q = q.eq("category", data.category);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await q
      .order("avg_rating", { ascending: false })
      .order("use_count", { ascending: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return { templates: (rows ?? []) as TemplateRow[] };
  });

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "").slice(0, 48) || "template";

export const publishProjectAsTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().min(2).max(400),
    category: z.string().trim().min(2).max(40).default("Community"),
    thumbnailUrl: z.string().url().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Must be project owner
    const { data: proj } = await supabase
      .from("projects").select("id, initial_prompt")
      .eq("id", data.projectId).eq("owner_id", userId).maybeSingle();
    if (!proj) throw new Error("Only the project owner can publish it");

    const { data: files, error: fErr } = await supabase
      .from("project_files").select("path, content").eq("project_id", data.projectId);
    if (fErr) throw new Error(fErr.message);
    if (!files || files.length === 0) throw new Error("Project is empty");

    // Unique slug
    const base = slugify(data.name);
    let slug = base;
    for (let i = 1; i < 50; i++) {
      const { data: existing } = await supabase.from("templates").select("id").eq("slug", slug).maybeSingle();
      if (!existing) break;
      slug = `${base}-${i}`;
    }

    const { data: tpl, error } = await supabase.from("templates").insert({
      author_id: userId,
      slug,
      name: data.name,
      description: data.description,
      category: data.category,
      thumbnail_url: data.thumbnailUrl ?? null,
      initial_prompt: proj.initial_prompt ?? null,
      files: files.slice(0, 500) as never,
      is_active: true,
      is_public: true,
    } as never).select("id, slug, name").single();
    if (error) throw new Error(error.message);
    return { template: tpl };
  });

export const rateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    templateId: z.string().uuid(),
    rating: z.number().int().min(1).max(5),
    review: z.string().trim().max(1000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("template_ratings").upsert({
      template_id: data.templateId,
      user_id: userId,
      rating: data.rating,
      review: data.review ?? null,
    } as never, { onConflict: "template_id,user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listTemplateRatings = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ templateId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows, error } = await sb
      .from("template_ratings")
      .select("id, rating, review, created_at, user_id")
      .eq("template_id", data.templateId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { ratings: rows ?? [] };
  });

const ForkInput = z.object({
  templateId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
});

export const createProjectFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ForkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: tpl, error: tplErr } = await supabase
      .from("templates")
      .select("id, name, files, initial_prompt")
      .eq("id", data.templateId)
      .eq("is_active", true)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl) throw new Error("Template not found");

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

    const files = (tpl.files as Array<{ path: string; content: string }> | null) ?? [];
    if (files.length > 0) {
      const rows = files
        .filter((f) => f && typeof f.path === "string" && typeof f.content === "string")
        .slice(0, 500)
        .map((f) => ({
          project_id: project.id,
          path: f.path.slice(0, 512),
          content: f.content.slice(0, 200_000),
          created_by: userId,
        }));
      if (rows.length > 0) await supabase.from("project_files").insert(rows as never);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cur } = await supabaseAdmin.from("templates").select("use_count").eq("id", tpl.id).maybeSingle();
    await supabaseAdmin.from("templates").update({ use_count: (cur?.use_count ?? 0) + 1 } as never).eq("id", tpl.id);

    await supabaseAdmin.from("activity_log").insert({
      project_id: project.id,
      actor_id: userId,
      action: "project.created_from_template",
      target: tpl.id,
      metadata: { template_name: tpl.name } as never,
    } as never);

    return { project };
  });
