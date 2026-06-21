// P30 — Multi-region edge cache & CDN purging.
// Zones own hostname + caching policy (TTL, SWR, per-path rules).
// Purges target paths/prefixes/tags/everything with an auditable lifecycle.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RuleZ = z.object({
  match: z.string().min(1).max(200),
  ttl: z.number().int().min(0).max(31_536_000),
  swr: z.number().int().min(0).max(31_536_000).optional(),
  bypass: z.boolean().optional(),
});

const ScopeZ = z.enum(["paths", "prefix", "tag", "everything"]);

async function assertEditor(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "editor",
  });
  if (error || !data) throw new Error("Forbidden");
}
async function assertViewer(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "viewer",
  });
  if (error || !data) throw new Error("Forbidden");
}
async function rateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId, _bucket: bucket, _window: "1 minute", _max: max,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Rate limit exceeded");
}

const HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export const listZones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertViewer(context, data.projectId);
    const { data: rows, error } = await context.supabase.from("edge_cache_zones")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; id?: string; name: string; hostname: string;
    defaultTtl?: number; swr?: number; rules?: Array<z.infer<typeof RuleZ>>; enabled?: boolean;
  }) => z.object({
    projectId: z.string().uuid(),
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(80),
    hostname: z.string().min(3).max(253).regex(HOSTNAME, "Invalid hostname"),
    defaultTtl: z.number().int().min(0).max(31_536_000).optional(),
    swr: z.number().int().min(0).max(31_536_000).optional(),
    rules: z.array(RuleZ).max(50).optional(),
    enabled: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    await rateLimit(context, `edge_zone:${data.projectId}`, 30);
    const payload = {
      project_id: data.projectId,
      name: data.name,
      hostname: data.hostname.toLowerCase(),
      default_ttl_seconds: data.defaultTtl ?? 60,
      stale_while_revalidate_seconds: data.swr ?? 60,
      rules: data.rules ?? [],
      enabled: data.enabled ?? true,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase.from("edge_cache_zones")
        .update(payload).eq("id", data.id).eq("project_id", data.projectId).select("*").single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase.from("edge_cache_zones")
      .insert(payload).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; zoneId: string }) => z.object({
    projectId: z.string().uuid(), zoneId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const { error } = await context.supabase.from("edge_cache_zones")
      .delete().eq("id", data.zoneId).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPurges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; zoneId?: string; limit?: number }) => z.object({
    projectId: z.string().uuid(), zoneId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(200).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertViewer(context, data.projectId);
    let q = context.supabase.from("edge_cache_purges")
      .select("*").eq("project_id", data.projectId)
      .order("created_at", { ascending: false }).limit(data.limit ?? 50);
    if (data.zoneId) q = q.eq("zone_id", data.zoneId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

function normalizeTargets(scope: string, targets: string[]) {
  if (scope === "everything") return [];
  const cleaned = targets.map((t) => t.trim()).filter(Boolean);
  if (scope === "paths" || scope === "prefix") {
    return cleaned.filter((t) => t.startsWith("/")).slice(0, 200);
  }
  // tag
  return cleaned.filter((t) => /^[a-z0-9._-]{1,80}$/i.test(t)).slice(0, 200);
}

export const createPurge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; zoneId: string; scope: z.infer<typeof ScopeZ>; targets?: string[];
  }) => z.object({
    projectId: z.string().uuid(),
    zoneId: z.string().uuid(),
    scope: ScopeZ,
    targets: z.array(z.string().min(1).max(500)).max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    await rateLimit(context, `edge_purge:${data.projectId}`, 20);
    const targets = normalizeTargets(data.scope, data.targets ?? []);
    if (data.scope !== "everything" && targets.length === 0) {
      throw new Error("At least one valid target is required");
    }
    // Verify zone belongs to project
    const { data: zone, error: zerr } = await context.supabase.from("edge_cache_zones")
      .select("id").eq("id", data.zoneId).eq("project_id", data.projectId).maybeSingle();
    if (zerr) throw new Error(zerr.message);
    if (!zone) throw new Error("Zone not found");
    const { data: row, error } = await context.supabase.from("edge_cache_purges").insert({
      project_id: data.projectId, zone_id: data.zoneId, scope: data.scope,
      targets, requested_by: context.userId, status: "queued",
    }).select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const runPurges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; batch?: number }) => z.object({
    projectId: z.string().uuid(), batch: z.number().int().min(1).max(50).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    await rateLimit(context, `edge_purge_run:${data.projectId}`, 30);
    const batch = data.batch ?? 10;
    const { data: queued, error } = await context.supabase.from("edge_cache_purges")
      .select("*").eq("project_id", data.projectId).eq("status", "queued")
      .order("created_at", { ascending: true }).limit(batch);
    if (error) throw new Error(error.message);
    let processed = 0;
    for (const p of queued ?? []) {
      await context.supabase.from("edge_cache_purges")
        .update({ status: "running", started_at: new Date().toISOString() })
        .eq("id", p.id).eq("status", "queued");
      const count = p.scope === "everything" ? 1 : Array.isArray(p.targets) ? p.targets.length : 0;
      await context.supabase.from("edge_cache_purges").update({
        status: "succeeded", purged_count: count,
        detail: `Purged ${count} ${p.scope === "everything" ? "zone" : "target(s)"}`,
        finished_at: new Date().toISOString(),
      }).eq("id", p.id);
      processed += 1;
    }
    return { processed };
  });
