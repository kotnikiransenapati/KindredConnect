import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProjectIdInput = z.object({ projectId: z.string().uuid() });

async function assertOwner(supabase: any, userId: string, projectId: string) {
  const { data } = await supabase.from("projects").select("id").eq("id", projectId).eq("owner_id", userId).maybeSingle();
  if (!data) throw new Error("Project not found");
}

export const snapshotProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    label: z.string().trim().max(80).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId, data.projectId);
    const { data: files, error } = await supabase
      .from("project_files").select("path, content, language")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    const { data: row, error: insErr } = await supabase.from("project_versions").insert({
      project_id: data.projectId,
      owner_id: userId,
      label: data.label ?? null,
      snapshot: files ?? [],
      file_count: files?.length ?? 0,
    }).select("id, label, file_count, created_at").single();
    if (insErr) throw new Error(insErr.message);
    return row;
  });

export const listVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("project_versions").select("id, label, file_count, created_at")
      .eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return { versions: rows ?? [] };
  });

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    versionId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId, data.projectId);
    const { data: ver } = await supabase.from("project_versions")
      .select("snapshot").eq("id", data.versionId).eq("project_id", data.projectId).maybeSingle();
    if (!ver) throw new Error("Version not found");
    const snapshot = ver.snapshot as Array<{ path: string; content: string; language: string | null }>;

    await supabase.from("project_files").delete().eq("project_id", data.projectId);
    if (snapshot.length > 0) {
      const rows = snapshot.map((f) => ({
        project_id: data.projectId,
        path: f.path,
        content: f.content,
        language: f.language ?? null,
      }));
      const { error } = await supabase.from("project_files").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { restored: snapshot.length };
  });

export const toggleShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    enabled: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId, data.projectId);
    let token: string | null = null;
    if (data.enabled) {
      const { data: existing } = await supabase.from("projects")
        .select("public_share_token").eq("id", data.projectId).maybeSingle();
      token = existing?.public_share_token ?? crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    }
    const { error } = await supabase.from("projects")
      .update({ is_public: data.enabled, public_share_token: token })
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { is_public: data.enabled, share_token: token };
  });

export const getPublicProject = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project } = await supabaseAdmin.from("projects")
      .select("id, name, description, slug, created_at")
      .eq("public_share_token", data.token).eq("is_public", true).maybeSingle();
    if (!project) throw new Error("Share link not found");
    const { data: files } = await supabaseAdmin.from("project_files")
      .select("path, content, language").eq("project_id", project.id).order("path");
    return { project, files: files ?? [] };
  });
