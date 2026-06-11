import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 48) || "project";

const CreateInput = z.object({
  name: z.string().trim().min(1).max(80),
  initial_prompt: z.string().trim().max(4000).optional(),
});

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("id, name, description, slug, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const base = slugify(data.name);
    // ensure unique slug per owner
    let slug = base;
    for (let i = 1; i < 50; i++) {
      const { data: existing } = await context.supabase
        .from("projects")
        .select("id")
        .eq("owner_id", context.userId)
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${base}-${i}`;
    }

    const { data: row, error } = await context.supabase
      .from("projects")
      .insert({
        owner_id: context.userId,
        name: data.name,
        slug,
        initial_prompt: data.initial_prompt ?? null,
        description: data.initial_prompt?.slice(0, 160) ?? null,
      })
      .select("id, name, description, slug, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const IdInput = z.object({ id: z.string().uuid() });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("projects").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getProject = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => IdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("projects")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Project not found");
    return row;
  });
