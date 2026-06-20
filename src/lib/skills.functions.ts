import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const skillKind = z.enum(["mcp", "http_tool", "prompt"]);
const visibility = z.enum(["private", "public"]);

// MCP config: { endpoint, auth_header? }
// http_tool config: { method, url, headers?, body_template? }
// prompt config: { system, user_template, model? }
const configSchema = z.record(z.string(), z.any()).default({});

export const listProjectSkills = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("agent_skills")
      .select("id,name,description,kind,visibility,config,enabled,install_count,updated_at")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return { skills: rows ?? [] };
  });

export const listMarketplaceSkills = createServerFn({ method: "POST" })
  .inputValidator((d: { q?: string; kind?: "mcp" | "http_tool" | "prompt" }) =>
    z.object({ q: z.string().max(80).optional(), kind: skillKind.optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    let q = sb
      .from("agent_skills")
      .select("id,name,description,kind,install_count,updated_at")
      .eq("visibility", "public")
      .order("install_count", { ascending: false })
      .limit(48);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.q) q = q.ilike("name", `%${data.q}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { skills: rows ?? [] };
  });

export const upsertSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string;
    id?: string;
    name: string;
    description?: string;
    kind: "mcp" | "http_tool" | "prompt";
    visibility?: "private" | "public";
    config?: Record<string, unknown>;
    enabled?: boolean;
  }) =>
    z
      .object({
        projectId: z.string().uuid(),
        id: z.string().uuid().optional(),
        name: z.string().regex(/^[a-z0-9_\-]{2,64}$/i, "Use letters, numbers, _ or -"),
        description: z.string().max(500).default(""),
        kind: skillKind,
        visibility: visibility.default("private"),
        config: configSchema,
        enabled: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const payload = {
      project_id: data.projectId,
      name: data.name,
      description: data.description ?? "",
      kind: data.kind,
      visibility: data.visibility,
      config: data.config ?? {},
      enabled: data.enabled,
    };
    if (data.id) {
      const { error } = await context.supabase.from("agent_skills").update(payload).eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("agent_skills")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { id: row!.id };
  });

export const deleteSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agent_skills").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// Install a public skill into your own project (copies config, increments counter).
export const installSkill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sourceId: string; targetProjectId: string }) =>
    z.object({ sourceId: z.string().uuid(), targetProjectId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: src, error: sErr } = await context.supabase
      .from("agent_skills")
      .select("name,description,kind,config")
      .eq("id", data.sourceId)
      .eq("visibility", "public")
      .single();
    if (sErr || !src) throw sErr ?? new Error("Skill not found");

    // unique-name fallback
    let name = src.name;
    for (let i = 1; i < 20; i++) {
      const { data: clash } = await context.supabase
        .from("agent_skills")
        .select("id")
        .eq("project_id", data.targetProjectId)
        .eq("name", name)
        .maybeSingle();
      if (!clash) break;
      name = `${src.name}-${i}`;
    }
    const { error: iErr } = await context.supabase.from("agent_skills").insert({
      project_id: data.targetProjectId,
      name,
      description: src.description,
      kind: src.kind,
      visibility: "private",
      config: src.config,
      enabled: true,
    });
    if (iErr) throw iErr;
    return { ok: true };
  });

