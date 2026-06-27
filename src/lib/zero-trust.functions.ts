// Zero-Trust authorization: policies, capability tokens, decision log.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function genToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "zt_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Glob matcher: supports * (segment) and ** (greedy). Pattern segments split on ":".
function globMatch(pattern: string, value: string): boolean {
  const re = new RegExp(
    "^" +
      pattern
        .split("")
        .map((c) => {
          if (c === "*") return "§§";
          return c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
        })
        .join("")
        .replace(/§§§§/g, ".*")
        .replace(/§§/g, "[^:/]*") +
      "$",
  );
  return re.test(value);
}

async function assertOrgRole(supabase: any, orgId: string, userId: string, min: "admin" | "owner") {
  const { data, error } = await supabase.rpc("has_org_role", { _org_id: orgId, _user_id: userId, _min_role: min });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

// ---------- Policies ----------
const policyInput = z.object({
  orgId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  effect: z.enum(["allow", "deny"]).default("allow"),
  subject: z.record(z.any()).default({}),
  resourcePattern: z.string().min(1).max(200),
  actionPattern: z.string().min(1).max(80),
  conditions: z.record(z.any()).default({}),
  priority: z.number().int().min(0).max(1000).default(100),
  enabled: z.boolean().default(true),
});

export const listPolicies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("zt_policies").select("*").eq("org_id", data.orgId)
      .order("priority", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => policyInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, data.orgId, context.userId, "admin");
    const payload = {
      id: data.id,
      org_id: data.orgId,
      name: data.name,
      description: data.description ?? null,
      effect: data.effect,
      subject: data.subject,
      resource_pattern: data.resourcePattern,
      action_pattern: data.actionPattern,
      conditions: data.conditions,
      priority: data.priority,
      enabled: data.enabled,
      created_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("zt_policies").upsert(payload, { onConflict: "org_id,name" }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deletePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, data.orgId, context.userId, "owner");
    const { error } = await context.supabase.from("zt_policies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Capability tokens ----------
export const issueAccessToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      issuedToUserId: z.string().uuid(),
      label: z.string().min(1).max(80),
      scope: z.array(z.string().min(1).max(64)).min(1).max(32),
      resourcePattern: z.string().min(1).max(200),
      ttlMinutes: z.number().int().min(1).max(60 * 24 * 7).default(60),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, data.orgId, context.userId, "admin");
    const token = genToken();
    const hash = await sha256Hex(token);
    const expires_at = new Date(Date.now() + data.ttlMinutes * 60_000).toISOString();
    const { data: row, error } = await context.supabase.from("zt_access_tokens").insert({
      org_id: data.orgId,
      issued_to_user_id: data.issuedToUserId,
      label: data.label,
      scope: data.scope,
      resource_pattern: data.resourcePattern,
      token_hash: hash,
      token_hint: token.slice(0, 8) + "…" + token.slice(-4),
      expires_at,
      created_by: context.userId,
    }).select().single();
    if (error) throw new Error(error.message);
    const { recordAudit } = await import("@/lib/audit.server"); await recordAudit(context.supabase, context.userId, {
      action: "secret.create", resourceType: "zt_token", resourceId: row.id,
      orgId: data.orgId, metadata: { label: data.label, scope: data.scope },
    });
    return { ...row, token }; // shown once
  });

export const listAccessTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("zt_access_tokens").select("id, label, scope, resource_pattern, token_hint, expires_at, revoked_at, last_used_at, use_count, issued_to_user_id, created_at")
      .eq("org_id", data.orgId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const revokeAccessToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, data.orgId, context.userId, "admin");
    const { error } = await context.supabase.from("zt_access_tokens")
      .update({ revoked_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    const { recordAudit } = await import("@/lib/audit.server"); await recordAudit(context.supabase, context.userId, {
      action: "secret.delete", resourceType: "zt_token", resourceId: data.id, orgId: data.orgId,
    });
    return { ok: true };
  });

// ---------- Evaluation engine ----------
export const evaluateAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      subjectId: z.string().uuid().optional(),
      resource: z.string().min(1).max(200),
      action: z.string().min(1).max(80),
      context: z.record(z.any()).optional(),
      token: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const subjectId = data.subjectId ?? context.userId;
    // 1) Token short-circuit: a valid capability token bypasses policies for its scope.
    if (data.token) {
      const hash = await sha256Hex(data.token);
      const { data: tok } = await context.supabase
        .from("zt_access_tokens")
        .select("id, scope, resource_pattern, expires_at, revoked_at, org_id, issued_to_user_id, use_count")
        .eq("token_hash", hash).maybeSingle();
      const now = Date.now();
      const validToken = tok && tok.org_id === data.orgId && !tok.revoked_at && new Date(tok.expires_at).getTime() > now;
      const tokenAllows = validToken
        && (tok!.scope as string[]).some((s) => globMatch(s, data.action))
        && globMatch((tok as any).resource_pattern, data.resource);
      if (tokenAllows) {
        await context.supabase.from("zt_access_tokens").update({
          last_used_at: new Date().toISOString(),
          use_count: (tok!.use_count ?? 0) + 1,
        }).eq("id", tok!.id);
        await context.supabase.from("zt_decisions").insert({
          org_id: data.orgId, subject_id: subjectId, subject_kind: "user",
          resource: data.resource, action: data.action, decision: "allow",
          reason: "capability_token", context: { token_id: tok!.id },
        });
        return { decision: "allow" as const, reason: "capability_token", tokenId: tok!.id };
      }
    }
    // 2) Policy evaluation: deny wins, then highest priority allow.
    const { data: policies } = await context.supabase
      .from("zt_policies").select("*")
      .eq("org_id", data.orgId).eq("enabled", true)
      .order("priority", { ascending: false });
    const candidates = (policies ?? []).filter((p: any) =>
      globMatch(p.resource_pattern, data.resource) &&
      globMatch(p.action_pattern, data.action) &&
      subjectMatches(p.subject, subjectId, data.context ?? {}) &&
      conditionsMatch(p.conditions, data.context ?? {}),
    );
    const deny = candidates.find((p: any) => p.effect === "deny");
    const allow = candidates.find((p: any) => p.effect === "allow");
    const matched = deny ?? allow;
    const decision: "allow" | "deny" = deny ? "deny" : allow ? "allow" : "deny";
    const reason = deny ? "policy_deny" : allow ? "policy_allow" : "default_deny";
    await context.supabase.from("zt_decisions").insert({
      org_id: data.orgId, subject_id: subjectId, subject_kind: "user",
      resource: data.resource, action: data.action, decision,
      matched_policy_id: matched?.id ?? null, reason, context: data.context ?? {},
    });
    return { decision, reason, matchedPolicyId: matched?.id ?? null };
  });

function subjectMatches(subject: any, userId: string, ctx: Record<string, any>): boolean {
  if (!subject || Object.keys(subject).length === 0) return true;
  if (subject.user_id && subject.user_id !== userId) return false;
  if (Array.isArray(subject.user_ids) && !subject.user_ids.includes(userId)) return false;
  if (subject.role && ctx.role !== subject.role) return false;
  return true;
}

function conditionsMatch(conditions: any, ctx: Record<string, any>): boolean {
  if (!conditions || Object.keys(conditions).length === 0) return true;
  // ip_in: list of CIDR or exact IPs (exact for simplicity)
  if (Array.isArray(conditions.ip_in) && !conditions.ip_in.includes(ctx.ip)) return false;
  // time_between: ["HH:MM","HH:MM"] UTC
  if (Array.isArray(conditions.time_between)) {
    const now = new Date();
    const cur = now.getUTCHours() * 60 + now.getUTCMinutes();
    const [a, b] = conditions.time_between as [string, string];
    const toMin = (s: string) => Number(s.split(":")[0]) * 60 + Number(s.split(":")[1] ?? "0");
    if (!(cur >= toMin(a) && cur <= toMin(b))) return false;
  }
  // require_mfa: ctx.mfa === true
  if (conditions.require_mfa && ctx.mfa !== true) return false;
  return true;
}

export const listDecisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    orgId: z.string().uuid(),
    limit: z.number().int().min(1).max(500).default(100),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgRole(context.supabase, data.orgId, context.userId, "admin");
    const { data: rows, error } = await context.supabase
      .from("zt_decisions").select("*").eq("org_id", data.orgId)
      .order("occurred_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
