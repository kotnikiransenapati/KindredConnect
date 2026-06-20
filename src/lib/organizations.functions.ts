// Team workspaces: organizations, members, invitations, billing plan.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SlugRx = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const RoleEnum = z.enum(["owner", "admin", "editor", "viewer"]);

function token() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export const listMyOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: memberships, error } = await context.supabase
      .from("organization_members")
      .select("role, org_id, organizations:org_id(id, name, slug, plan_id, seats, owner_id, created_at)")
      .eq("user_id", context.userId);
    if (error) throw error;
    return {
      organizations: (memberships ?? [])
        .map((m: any) => m.organizations ? { ...m.organizations, my_role: m.role } : null)
        .filter(Boolean),
    };
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(2).max(60),
      slug: z.string().regex(SlugRx, "lowercase letters, numbers, hyphens (3–40 chars)"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "org_create", _window: "1 day", _max: 5,
    });
    if (ok.data === false) throw new Error("Rate limit: too many organizations created today.");
    const { data: row, error } = await context.supabase
      .from("organizations").insert({ name: data.name, slug: data.slug, owner_id: context.userId })
      .select().single();
    if (error) throw new Error(error.message.includes("unique") ? "Slug already taken." : error.message);
    return { organization: row };
  });

export const updateOrganizationPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      planId: z.enum(["hobby", "pro", "team", "enterprise"]),
      seats: z.number().int().min(1).max(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("organizations").update({ plan_id: data.planId, seats: data.seats })
      .eq("id", data.orgId);
    if (error) throw error;
    return { ok: true };
  });

export const deleteOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("organizations").delete().eq("id", data.orgId);
    if (error) throw error;
    return { ok: true };
  });

export const listOrganizationMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("organization_members")
      .select("id, user_id, role, created_at, profiles:user_id(display_name, avatar_url)")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return { members: rows ?? [] };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ memberId: z.string().uuid(), role: RoleEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("organization_members").update({ role: data.role }).eq("id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ memberId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("organization_members").delete().eq("id", data.memberId);
    if (error) throw error;
    return { ok: true };
  });

export const listInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("organization_invitations")
      .select("id, email, role, token, accepted_at, expires_at, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { invitations: rows ?? [] };
  });

export const inviteMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      email: z.string().email().toLowerCase(),
      role: RoleEnum.exclude(["owner"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "org_invite", _window: "1 day", _max: 50,
    });
    if (ok.data === false) throw new Error("Rate limit: invitation cap reached for today.");

    // Seat check
    const { data: org } = await context.supabase
      .from("organizations").select("seats").eq("id", data.orgId).single();
    const { count } = await context.supabase
      .from("organization_members").select("id", { count: "exact", head: true }).eq("org_id", data.orgId);
    if (org && typeof count === "number" && count >= org.seats) {
      throw new Error(`Seat limit reached (${org.seats}). Upgrade the plan to invite more members.`);
    }

    const { data: row, error } = await context.supabase
      .from("organization_invitations")
      .insert({ org_id: data.orgId, email: data.email, role: data.role, token: token(), invited_by: context.userId })
      .select().single();
    if (error) throw error;
    return { invitation: row };
  });

export const revokeInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ invitationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("organization_invitations").delete().eq("id", data.invitationId);
    if (error) throw error;
    return { ok: true };
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(20) }).parse(d))
  .handler(async ({ data, context }) => {
    // We need to read across orgs by token; RLS allows admin only. Use service client to look up by token.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("organization_invitations")
      .select("id, org_id, email, role, accepted_at, expires_at")
      .eq("token", data.token).maybeSingle();
    if (error) throw error;
    if (!invite) throw new Error("Invitation not found.");
    if (invite.accepted_at) throw new Error("Invitation already used.");
    if (new Date(invite.expires_at).getTime() < Date.now()) throw new Error("Invitation expired.");

    // Verify the signed-in user's email matches the invite
    const email = (context.claims?.email as string | undefined)?.toLowerCase();
    if (!email || email !== invite.email.toLowerCase()) {
      throw new Error("This invitation was sent to a different email address.");
    }

    // Insert member (idempotent) and mark invitation used — service role to bypass per-row admin RLS.
    await supabaseAdmin
      .from("organization_members")
      .upsert({ org_id: invite.org_id, user_id: context.userId, role: invite.role as any }, { onConflict: "org_id,user_id" });
    await supabaseAdmin
      .from("organization_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
    return { ok: true, orgId: invite.org_id };
  });
