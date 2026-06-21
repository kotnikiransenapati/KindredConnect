// P34 — Per-tenant data residency.
// Lets project owners pin where their project's data physically lives
// (primary/backup zone, data-class routing, encryption mode). Every change
// is logged to an append-only audit table.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const EncZ = z.enum(["platform","cmek","byok"]);
const DataclassZ = z.object({
  pii: z.enum(["primary","backup","both"]).default("primary"),
  logs: z.enum(["primary","backup","both"]).default("primary"),
  backups: z.enum(["primary","backup","both"]).default("backup"),
});

async function assertOwner(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "owner",
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

async function loadZones(ctx: any) {
  const { data, error } = await ctx.supabase.from("residency_zones")
    .select("code, enabled").eq("enabled", true);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((z: any) => z.code as string));
}

export const listZones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("residency_zones")
      .select("*").order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getResidency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ projectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertViewer(context, data.projectId);
    const { data: row, error } = await context.supabase.from("project_residency")
      .select("*").eq("project_id", data.projectId).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const setResidency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    projectId: z.string().uuid(),
    primary_zone: z.string().min(2).max(64),
    backup_zone: z.string().min(2).max(64).nullable().optional(),
    dataclass: DataclassZ.optional(),
    encryption_mode: EncZ.default("cmek"),
    reason: z.string().max(500).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertOwner(context, data.projectId);
    await rateLimit(context, "residency_set", 10);
    const zones = await loadZones(context);
    if (!zones.has(data.primary_zone)) throw new Error("Unknown primary zone");
    if (data.backup_zone && !zones.has(data.backup_zone)) throw new Error("Unknown backup zone");
    if (data.backup_zone && data.backup_zone === data.primary_zone) {
      throw new Error("Backup zone must differ from primary");
    }

    const { data: prev } = await context.supabase.from("project_residency")
      .select("primary_zone").eq("project_id", data.projectId).maybeSingle();

    const payload = {
      project_id: data.projectId,
      primary_zone: data.primary_zone,
      backup_zone: data.backup_zone ?? null,
      dataclass: data.dataclass ?? { pii: "primary", logs: "primary", backups: "backup" },
      encryption_mode: data.encryption_mode,
      updated_by: context.userId,
    };
    const { data: row, error } = await context.supabase.from("project_residency")
      .upsert(payload, { onConflict: "project_id" })
      .select("*").single();
    if (error) throw new Error(error.message);

    await context.supabase.from("residency_audit").insert({
      project_id: data.projectId,
      actor: context.userId,
      action: prev ? "rezone" : "pin",
      from_zone: prev?.primary_zone ?? null,
      to_zone: data.primary_zone,
      reason: data.reason ?? null,
      metadata: { backup_zone: data.backup_zone ?? null, encryption_mode: data.encryption_mode },
    });
    return row;
  });

export const listResidencyAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    projectId: z.string().uuid(),
    limit: z.number().int().min(1).max(200).default(100),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertViewer(context, data.projectId);
    const { data: rows, error } = await context.supabase.from("residency_audit")
      .select("*").eq("project_id", data.projectId)
      .order("created_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
