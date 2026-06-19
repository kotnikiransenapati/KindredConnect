import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { INTEGRATIONS, getIntegration } from "@/lib/integrations.catalog";

export const listIntegrations = createServerFn({ method: "GET" })
  .handler(async () =>
    INTEGRATIONS.map((i) => ({
      slug: i.slug,
      name: i.name,
      category: i.category,
      description: i.description,
      envVars: i.envVars,
      fileCount: i.files.length,
    })),
  );

export const installIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      slug: z.string().min(1).max(80),
      overwrite: z.boolean().default(false),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: allowed, error: roleErr } = await supabase.rpc("has_project_role", {
      _project_id: data.projectId, _user_id: userId, _min_role: "editor",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!allowed) throw new Error("Forbidden");

    const integration = getIntegration(data.slug);
    if (!integration) throw new Error(`Unknown integration: ${data.slug}`);

    const written: string[] = [];
    const skipped: string[] = [];

    for (const f of integration.files) {
      const { data: existing } = await supabase
        .from("project_files")
        .select("id, version")
        .eq("project_id", data.projectId)
        .eq("path", f.path)
        .maybeSingle();

      if (existing && !data.overwrite) {
        skipped.push(f.path);
        continue;
      }
      if (existing) {
        const { error } = await supabase
          .from("project_files")
          .update({ content: f.content, version: existing.version + 1 })
          .eq("id", existing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("project_files")
          .insert({ project_id: data.projectId, path: f.path, content: f.content });
        if (error) throw new Error(error.message);
      }
      written.push(f.path);
    }

    return {
      ok: true,
      slug: integration.slug,
      name: integration.name,
      written,
      skipped,
      envVars: integration.envVars,
    };
  });
