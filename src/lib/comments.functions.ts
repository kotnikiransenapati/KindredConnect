import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ProjectIdInput = z.object({ projectId: z.string().uuid() });

async function assertViewer(supabase: any, userId: string, projectId: string) {
  const { data } = await supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: userId, _min_role: "viewer",
  });
  if (!data) throw new Error("Forbidden");
}

export const listComments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertViewer(supabase, userId, data.projectId);
    const { data: rows, error } = await supabase
      .from("project_comments")
      .select("id, project_id, author_id, body, anchor_path, mentions, resolved, created_at, updated_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);

    const authorIds = Array.from(new Set((rows ?? []).map((r) => r.author_id)));
    let profilesById = new Map<string, { display_name: string | null; avatar_url: string | null }>();
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles").select("id, display_name, avatar_url").in("id", authorIds);
      profilesById = new Map((profs ?? []).map((p: any) => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }]));
    }
    return {
      comments: (rows ?? []).map((r) => ({
        ...r,
        author: profilesById.get(r.author_id) ?? { display_name: "User", avatar_url: null },
      })),
    };
  });

export const postComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
    anchorPath: z.string().max(500).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Parse @mentions → resolve member display_names to user_ids
    const handles = Array.from(new Set((data.body.match(/@([a-zA-Z0-9_.-]{2,40})/g) ?? []).map((s) => s.slice(1))));
    let mentionIds: string[] = [];
    if (handles.length > 0) {
      const { data: members } = await supabase
        .from("project_members")
        .select("user_id, profiles:profiles!project_members_user_id_fkey(display_name)")
        .eq("project_id", data.projectId);
      const matched = (members ?? []).filter((m: any) => {
        const dn = (m.profiles?.display_name ?? "").toLowerCase();
        return handles.some((h) => dn === h.toLowerCase() || dn.replace(/\s+/g, "") === h.toLowerCase());
      });
      mentionIds = Array.from(new Set(matched.map((m: any) => m.user_id as string)));
    }

    const { data: inserted, error } = await supabase.from("project_comments").insert({
      project_id: data.projectId,
      author_id: userId,
      body: data.body,
      anchor_path: data.anchorPath ?? null,
      mentions: mentionIds,
    }).select("id, created_at").single();
    if (error) throw new Error(error.message);

    // Fan-out notifications for mentions
    if (mentionIds.length > 0) {
      const { data: actor } = await supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      const rows = mentionIds
        .filter((uid) => uid !== userId)
        .map((uid) => ({
          user_id: uid,
          kind: "mention",
          title: `${actor?.display_name ?? "Someone"} mentioned you`,
          body: data.body.slice(0, 200),
          link: `/app/${data.projectId}`,
          project_id: data.projectId,
        }));
      if (rows.length > 0) await supabase.from("notifications").insert(rows);
    }

    return { id: inserted.id };
  });

export const updateComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    body: z.string().trim().min(1).max(4000).optional(),
    resolved: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: { body?: string; resolved?: boolean } = {};
    if (data.body !== undefined) patch.body = data.body;
    if (data.resolved !== undefined) patch.resolved = data.resolved;
    const { error } = await context.supabase.from("project_comments").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_comments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
