// P35 — App Clips / Instant Apps builder.
// Per-project lightweight install-free experiences (iOS App Clips,
// Android Instant Apps) with bundle-size enforcement, association URL
// patterns, and append-only invocation analytics.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PlatformZ = z.enum(["ios", "android", "both"]);
const InvPlatformZ = z.enum(["ios", "android"]);
const StatusZ = z.enum(["draft", "building", "ready", "published", "archived"]);
const SourceZ = z.enum(["qr", "nfc", "link", "share", "smart_banner", "other"]);
const SlugZ = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, "lowercase slug, 1-40 chars");
const UrlZ = z.string().url().max(2048);
const RouteZ = z.string().regex(/^\/[\w\-./:?&=%#]*$/, "must start with /").max(512);

const AssociationZ = z.object({
  domain: z.string().min(1).max(253),
  patterns: z.array(z.string().max(256)).max(20),
});

async function assertRole(ctx: any, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: role,
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

// Apple App Clip bundles ≤ 15 MB uncompressed; Android Instant Apps ≤ 15 MB.
const MAX_KB = 15 * 1024;

function validateAssociations(list: z.infer<typeof AssociationZ>[]) {
  for (const a of list) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(a.domain)) {
      throw new Error(`Invalid domain: ${a.domain}`);
    }
    for (const p of a.patterns) {
      if (!p.startsWith("/")) throw new Error(`Pattern must start with /: ${p}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Clip CRUD
// ─────────────────────────────────────────────────────────────
export const listClips = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "viewer");
    const { data: rows, error } = await context.supabase
      .from("app_clips")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      projectId: z.string().uuid(),
      slug: SlugZ,
      title: z.string().min(1).max(120),
      subtitle: z.string().max(240).optional().nullable(),
      platform: PlatformZ.default("both"),
      invocationUrl: UrlZ,
      bundleSizeKb: z.number().int().min(0).max(MAX_KB),
      entryRoute: RouteZ.default("/"),
      advanceExperience: z.boolean().default(false),
      associations: z.array(AssociationZ).max(20).default([]),
      settings: z.record(z.unknown()).default({}),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "editor");
    await rateLimit(context, "app_clips:write", 30);
    validateAssociations(data.associations);

    const row = {
      id: data.id,
      project_id: data.projectId,
      slug: data.slug,
      title: data.title,
      subtitle: data.subtitle ?? null,
      platform: data.platform,
      invocation_url: data.invocationUrl,
      bundle_size_kb: data.bundleSizeKb,
      entry_route: data.entryRoute,
      advance_experience: data.advanceExperience,
      associations: data.associations,
      settings: data.settings,
      ...(data.id ? {} : { created_by: context.userId }),
    };

    const { data: saved, error } = await context.supabase
      .from("app_clips")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const setClipStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      projectId: z.string().uuid(),
      status: StatusZ,
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "editor");
    await rateLimit(context, "app_clips:status", 60);
    // Enforce a simple forward-only FSM (archived is terminal-ish; allow re-draft from archived).
    const order = { draft: 0, building: 1, ready: 2, published: 3, archived: 4 } as const;
    const { data: cur, error: e0 } = await context.supabase
      .from("app_clips").select("status").eq("id", data.id).single();
    if (e0) throw new Error(e0.message);
    const from = cur.status as keyof typeof order;
    const to = data.status as keyof typeof order;
    const ok =
      from === to ||
      (from === "archived" && to === "draft") ||
      order[to] >= order[from];
    if (!ok) throw new Error(`Illegal status transition ${from} → ${to}`);

    const { data: saved, error } = await context.supabase
      .from("app_clips")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const deleteClip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "owner");
    const { error } = await context.supabase
      .from("app_clips").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────
// Invocations
// ─────────────────────────────────────────────────────────────
export const logInvocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      clipId: z.string().uuid(),
      projectId: z.string().uuid(),
      platform: InvPlatformZ,
      source: SourceZ,
      country: z.string().regex(/^[A-Z]{2}$/).optional(),
      deviceModel: z.string().max(120).optional(),
      convertedToInstall: z.boolean().default(false),
      sessionMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).default(0),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "editor");
    await rateLimit(context, "app_clips:invoke", 240);
    const { error } = await context.supabase.from("app_clip_invocations").insert({
      clip_id: data.clipId,
      project_id: data.projectId,
      platform: data.platform,
      source: data.source,
      country: data.country ?? null,
      device_model: data.deviceModel ?? null,
      converted_to_install: data.convertedToInstall,
      session_ms: data.sessionMs,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clipStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), clipId: z.string().uuid().optional() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "viewer");
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    let q = context.supabase
      .from("app_clip_invocations")
      .select("platform, source, converted_to_install, session_ms, country, created_at")
      .eq("project_id", data.projectId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (data.clipId) q = q.eq("clip_id", data.clipId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const total = list.length;
    const installs = list.filter((r: any) => r.converted_to_install).length;
    const avgSession = total
      ? Math.round(list.reduce((a: number, r: any) => a + (r.session_ms || 0), 0) / total)
      : 0;
    const bySource: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    for (const r of list as any[]) {
      bySource[r.source] = (bySource[r.source] || 0) + 1;
      byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1;
      if (r.country) byCountry[r.country] = (byCountry[r.country] || 0) + 1;
    }
    return {
      total,
      installs,
      conversionPct: total ? Math.round((installs / total) * 1000) / 10 : 0,
      avgSessionMs: avgSession,
      bySource,
      byPlatform,
      topCountries: Object.entries(byCountry)
        .sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([code, count]) => ({ code, count })),
      recent: list.slice(0, 20),
    };
  });
