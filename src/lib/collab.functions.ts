// Server fn for collab editor: upserts a project file as the signed-in user
// (RLS enforces project membership via existing project_files policies).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const upsertProjectFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      path: z.string().min(1).max(400),
      content: z.string().max(2_000_000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Rate limit per user (~120/min — collaborative saves can be frequent).
    const rl = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "file_upsert", _window: "1 minute", _max: 120,
    });
    if (rl.data === false) throw new Error("Rate limit exceeded on file saves.");

    const { error } = await context.supabase
      .from("project_files")
      .upsert(
        { project_id: data.projectId, path: data.path, content: data.content },
        { onConflict: "project_id,path" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
