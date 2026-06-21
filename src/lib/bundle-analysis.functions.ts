// P26 — App-size optimizer / bundle analyzer.
// Captures per-asset bundle snapshots, computes breakdowns and savings hints,
// and diffs two snapshots (e.g. current vs previous release) so iOS/Android
// teams can ship under-cellular-cap.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PlatformZ = z.enum(["ios", "android", "web"]);
const KindZ = z.enum(["js", "image", "font", "native", "asset", "other"]);

const AssetZ = z.object({
  path: z.string().min(1).max(500),
  kind: KindZ,
  bytes: z.number().int().min(0).max(2_000_000_000),
  compressedBytes: z.number().int().min(0).max(2_000_000_000).optional(),
  metadata: z.record(z.any()).optional(),
});

async function assertEditor(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "editor",
  });
  if (error || !data) throw new Error("Forbidden");
}

export const listSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; platform?: z.infer<typeof PlatformZ> }) =>
    z.object({ projectId: z.string().uuid(), platform: PlatformZ.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("bundle_snapshots").select("*")
      .eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(100);
    if (data.platform) q = q.eq("platform", data.platform);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; platform: z.infer<typeof PlatformZ>;
    versionName: string; buildNumber?: number; downloadBytes?: number; installBytes?: number;
    notes?: string; source?: string; assets: Array<z.infer<typeof AssetZ>>;
  }) => z.object({
    projectId: z.string().uuid(), platform: PlatformZ,
    versionName: z.string().min(1).max(40), buildNumber: z.number().int().min(1).max(10_000_000).optional(),
    downloadBytes: z.number().int().min(0).optional(),
    installBytes: z.number().int().min(0).optional(),
    notes: z.string().max(1000).optional(),
    source: z.string().max(40).optional(),
    assets: z.array(AssetZ).max(20000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "bundle_snap", _window: "1 minute", _max: 10,
    });
    if (ok.error || ok.data === false) throw new Error("Rate limited");

    const total = data.assets.reduce((s, a) => s + (a.bytes || 0), 0);
    const { data: snap, error } = await context.supabase.from("bundle_snapshots").insert({
      project_id: data.projectId, platform: data.platform,
      version_name: data.versionName, build_number: data.buildNumber ?? null,
      total_bytes: total, download_bytes: data.downloadBytes ?? null,
      install_bytes: data.installBytes ?? null, source: data.source ?? "manual",
      notes: data.notes ?? null, created_by: context.userId,
    }).select().single();
    if (error) throw new Error(error.message);

    if (data.assets.length) {
      // chunk to avoid payload limits
      const rows = data.assets.map((a) => ({
        snapshot_id: snap.id, project_id: data.projectId,
        path: a.path, kind: a.kind, bytes: a.bytes,
        compressed_bytes: a.compressedBytes ?? null, metadata: a.metadata ?? {},
      }));
      for (let i = 0; i < rows.length; i += 1000) {
        const { error: e2 } = await context.supabase.from("bundle_assets").insert(rows.slice(i, i + 1000));
        if (e2) throw new Error(e2.message);
      }
    }
    return snap;
  });

export const deleteSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; projectId: string }) =>
    z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const { error } = await context.supabase.from("bundle_snapshots")
      .delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type Asset = { path: string; kind: string; bytes: number; compressed_bytes: number | null; metadata: any };

function buildRecommendations(assets: Asset[]) {
  const recs: Array<{ severity: "warn" | "info"; message: string; bytes?: number; path?: string }> = [];
  const big = assets.filter((a) => a.bytes > 1_000_000).sort((a, b) => b.bytes - a.bytes).slice(0, 10);
  for (const a of big) {
    recs.push({ severity: "warn", path: a.path, bytes: a.bytes,
      message: `Large ${a.kind} asset (${(a.bytes / 1_048_576).toFixed(2)} MB) — consider splitting or lazy-loading.` });
  }
  const uncompressedImages = assets.filter((a) => a.kind === "image" && a.bytes > 200_000 &&
    !/\.(webp|avif)$/i.test(a.path));
  for (const a of uncompressedImages.slice(0, 10)) {
    recs.push({ severity: "info", path: a.path, bytes: a.bytes,
      message: `Image ${a.path} is ${(a.bytes / 1024).toFixed(0)} KB — convert to WebP/AVIF for ~30-60% savings.` });
  }
  const jsTotal = assets.filter((a) => a.kind === "js").reduce((s, a) => s + a.bytes, 0);
  if (jsTotal > 4_000_000) {
    recs.push({ severity: "warn", bytes: jsTotal,
      message: `Total JS payload is ${(jsTotal / 1_048_576).toFixed(2)} MB — enable code-splitting & dynamic imports.` });
  }
  const fontTotal = assets.filter((a) => a.kind === "font").reduce((s, a) => s + a.bytes, 0);
  if (fontTotal > 600_000) {
    recs.push({ severity: "info", bytes: fontTotal,
      message: `Fonts total ${(fontTotal / 1024).toFixed(0)} KB — subset glyphs or drop unused weights.` });
  }
  return recs;
}

export const snapshotDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: snap, error } = await context.supabase.from("bundle_snapshots")
      .select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const { data: assets } = await context.supabase.from("bundle_assets")
      .select("path,kind,bytes,compressed_bytes,metadata")
      .eq("snapshot_id", data.id).order("bytes", { ascending: false }).limit(2000);
    const list = (assets ?? []) as Asset[];
    const breakdown: Record<string, { count: number; bytes: number }> = {};
    for (const a of list) {
      const k = a.kind || "other";
      if (!breakdown[k]) breakdown[k] = { count: 0, bytes: 0 };
      breakdown[k].count += 1;
      breakdown[k].bytes += a.bytes;
    }
    return { snapshot: snap, assets: list, breakdown, recommendations: buildRecommendations(list) };
  });

export const diffSnapshots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { baseId: string; headId: string }) =>
    z.object({ baseId: z.string().uuid(), headId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: base }, { data: head }] = await Promise.all([
      context.supabase.from("bundle_snapshots").select("*").eq("id", data.baseId).single(),
      context.supabase.from("bundle_snapshots").select("*").eq("id", data.headId).single(),
    ]);
    if (!base || !head) throw new Error("Snapshot missing");
    const [{ data: ba }, { data: ha }] = await Promise.all([
      context.supabase.from("bundle_assets").select("path,kind,bytes").eq("snapshot_id", data.baseId).limit(5000),
      context.supabase.from("bundle_assets").select("path,kind,bytes").eq("snapshot_id", data.headId).limit(5000),
    ]);
    const map = new Map<string, { base?: number; head?: number; kind: string }>();
    for (const a of (ba ?? []) as Asset[]) map.set(a.path, { base: a.bytes, kind: a.kind });
    for (const a of (ha ?? []) as Asset[]) {
      const cur = map.get(a.path);
      if (cur) { cur.head = a.bytes; } else map.set(a.path, { head: a.bytes, kind: a.kind });
    }
    const changes = Array.from(map.entries()).map(([path, v]) => ({
      path, kind: v.kind, base: v.base ?? 0, head: v.head ?? 0,
      delta: (v.head ?? 0) - (v.base ?? 0),
    })).filter((c) => c.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 200);
    return {
      base, head,
      totalDelta: (head as any).total_bytes - (base as any).total_bytes,
      changes,
    };
  });
