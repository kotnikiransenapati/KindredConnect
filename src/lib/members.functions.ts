import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RoleSchema = z.enum(["editor", "viewer"]);

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: members, error } = await supabase
      .from("project_members")
      .select("id, user_id, role, created_at")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);

    // Hydrate emails/display_names via profiles
    const ids = (members ?? []).map((m) => m.user_id);
    const { data: profs } = ids.length
      ? await supabase.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as Array<{ id: string; display_name: string | null }> };
    const profMap = new Map((profs ?? []).map((p) => [p.id, p.display_name] as const));
    return {
      members: (members ?? []).map((m) => ({ ...m, display_name: profMap.get(m.user_id) ?? null })),
    };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    email: z.string().trim().email().max(255),
    role: RoleSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertRateLimit } = await import("@/lib/rate-limit.server");
    await assertRateLimit(userId, "invite_day", "1 day", 50);
    // verify owner
    const { data: proj } = await supabase
      .from("projects").select("id").eq("id", data.projectId).eq("owner_id", userId).maybeSingle();
    if (!proj) throw new Error("Only the owner can invite members");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: lookup, error: lookupErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1, perPage: 200,
    });
    if (lookupErr) throw new Error(lookupErr.message);
    const target = lookup.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!target) throw new Error("No Foundry account with that email. Ask them to sign up first.");
    if (target.id === userId) throw new Error("You are already the owner.");

    const { data: row, error } = await supabase.from("project_members").insert({
      project_id: data.projectId,
      user_id: target.id,
      role: data.role,
      invited_by: userId,
    }).select("id, user_id, role, created_at").single();
    if (error) {
      if (error.code === "23505") throw new Error("That user is already a member.");
      throw new Error(error.message);
    }

    // Notify invitee + log activity (admin client bypasses RLS).
    const { data: projInfo } = await supabaseAdmin
      .from("projects").select("name").eq("id", data.projectId).maybeSingle();
    await supabaseAdmin.from("notifications").insert({
      user_id: target.id,
      kind: "project.invited",
      title: `You were added to "${projInfo?.name ?? "a project"}"`,
      body: `Role: ${data.role}`,
      link: `/app/${data.projectId}`,
      project_id: data.projectId,
    } as never);
    await supabaseAdmin.from("activity_log").insert({
      project_id: data.projectId,
      actor_id: userId,
      action: "member.invited",
      target: data.email,
      metadata: { role: data.role } as never,
    } as never);
    return row;
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    memberId: z.string().uuid(), role: RoleSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_members")
      .update({ role: data.role }).eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("project_members").delete().eq("id", data.memberId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("ai_usage").select("model, prompt_chars, response_chars, tool_calls, created_at")
      .eq("user_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    const total = (data ?? []).reduce((a, r) => ({
      messages: a.messages + 1,
      prompt: a.prompt + r.prompt_chars,
      response: a.response + r.response_chars,
      tools: a.tools + r.tool_calls,
    }), { messages: 0, prompt: 0, response: 0, tools: 0 });
    return { total, recent: data ?? [] };
  });
