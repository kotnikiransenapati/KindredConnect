import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProjectIdInput = z.object({ projectId: z.string().uuid() });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proj, error: pe } = await supabase
      .from("projects").select("id").eq("id", data.projectId).eq("owner_id", userId).maybeSingle();
    if (pe || !proj) throw new Error("Project not found");
    const { data: rows, error } = await supabase
      .from("messages").select("id, role, parts, created_at")
      .eq("project_id", data.projectId).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { messages: rows ?? [] };
  });

export const listProjectFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: proj } = await supabase
      .from("projects").select("id").eq("id", data.projectId).eq("owner_id", userId).maybeSingle();
    if (!proj) throw new Error("Project not found");
    const { data: rows, error } = await supabase
      .from("project_files").select("id, path, content, language, version, updated_at")
      .eq("project_id", data.projectId).order("path", { ascending: true });
    if (error) throw new Error(error.message);
    return { files: rows ?? [] };
  });
