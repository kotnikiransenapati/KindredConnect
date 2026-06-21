// P36 — On-device LLM packaging.
// Project owners curate small LLMs that ship inside iOS / Android / web-WASM
// builds, with quantization, signed manifests, and per-device download analytics.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { estimateBuildSize } from "./on-device-llm.shared";

const FamilyZ = z.enum(["llama","phi","gemma","qwen","mistral","tinyllama","custom"]);
const QuantZ = z.enum(["q4_k_m","q5_k_m","q8_0","fp16"]);
const PlatformZ = z.enum(["ios","android","web"]);
const StatusZ = z.enum(["draft","available","deprecated","archived"]);
const BuildStatusZ = z.enum(["queued","building","ready","failed","revoked"]);
const SlugZ = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/);
const SemverZ = z.string().regex(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/);
const Sha256Z = z.string().regex(/^[a-f0-9]{64}$/);

async function assertRole(ctx: any, projectId: string, role: "viewer"|"editor"|"owner") {
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

// ── Models ───────────────────────────────────────────────
export const listModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "viewer");
    const { data: rows, error } = await context.supabase
      .from("on_device_models").select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      projectId: z.string().uuid(),
      slug: SlugZ,
      name: z.string().min(1).max(120),
      family: FamilyZ,
      baseSizeMb: z.number().int().min(1).max(8192),
      contextWindow: z.number().int().min(512).max(131072).default(4096),
      license: z.string().max(80).default("apache-2.0"),
      platforms: z.array(PlatformZ).min(1).max(3),
      capabilities: z.array(z.string().max(40)).max(20).default([]),
      defaultQuant: QuantZ.default("q4_k_m"),
      status: StatusZ.default("draft"),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "editor");
    await rateLimit(context, "odm:write", 30);
    const row: any = {
      id: data.id,
      project_id: data.projectId,
      slug: data.slug,
      name: data.name,
      family: data.family,
      base_size_mb: data.baseSizeMb,
      context_window: data.contextWindow,
      license: data.license,
      platforms: data.platforms,
      capabilities: data.capabilities,
      default_quant: data.defaultQuant,
      status: data.status,
      ...(data.id ? {} : { created_by: context.userId }),
    };
    const { data: saved, error } = await context.supabase
      .from("on_device_models").upsert(row, { onConflict: "id" })
      .select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const deleteModel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "owner");
    const { error } = await context.supabase
      .from("on_device_models").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Builds ───────────────────────────────────────────────
export const listBuilds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), modelId: z.string().uuid().optional() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "viewer");
    let q = context.supabase
      .from("on_device_model_builds").select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false }).limit(200);
    if (data.modelId) q = q.eq("model_id", data.modelId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const enqueueBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      modelId: z.string().uuid(),
      version: SemverZ,
      quantization: QuantZ,
      targetPlatform: PlatformZ,
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "editor");
    await rateLimit(context, "odm:build", 20);

    const { data: model, error: me } = await context.supabase
      .from("on_device_models")
      .select("id, project_id, base_size_mb, platforms, slug")
      .eq("id", data.modelId).single();
    if (me) throw new Error(me.message);
    if (model.project_id !== data.projectId) throw new Error("Model/project mismatch");
    if (!(model.platforms as string[]).includes(data.targetPlatform)) {
      throw new Error(`Platform ${data.targetPlatform} not enabled for this model`);
    }

    const est = estimateBuildSize(model.base_size_mb, data.quantization, data.targetPlatform);
    if (est.mb > 4096) throw new Error(`Estimated size ${est.mb}MB exceeds 4 GB cap`);

    const manifest = {
      slug: model.slug,
      version: data.version,
      quantization: data.quantization,
      target: data.targetPlatform,
      estimated_size_mb: est.mb,
      runtime: data.targetPlatform === "web" ? "wasm-llama" : "ggml-mobile",
      created_at: new Date().toISOString(),
    };

    const { data: build, error } = await context.supabase
      .from("on_device_model_builds")
      .insert({
        model_id: data.modelId,
        project_id: data.projectId,
        version: data.version,
        quantization: data.quantization,
        target_platform: data.targetPlatform,
        size_bytes: est.bytes,
        status: "queued",
        manifest,
        created_by: context.userId,
      } as any)
      .select("*").single();
    if (error) {
      if (error.code === "23505") throw new Error("This version+quant+platform already exists");
      throw new Error(error.message);
    }
    return build;
  });

export const finalizeBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      projectId: z.string().uuid(),
      status: BuildStatusZ,
      artifactPath: z.string().max(512).optional(),
      sha256: Sha256Z.optional(),
      signature: z.string().max(512).optional(),
      sizeBytes: z.number().int().min(0).optional(),
      error: z.string().max(500).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "editor");
    await rateLimit(context, "odm:finalize", 60);
    const patch: any = { status: data.status };
    if (data.artifactPath) patch.artifact_path = data.artifactPath;
    if (data.sha256) patch.sha256 = data.sha256;
    if (data.signature) patch.signature = data.signature;
    if (data.sizeBytes !== undefined) patch.size_bytes = data.sizeBytes;
    if (data.error) patch.error = data.error;

    const { data: saved, error } = await context.supabase
      .from("on_device_model_builds")
      .update(patch).eq("id", data.id).eq("project_id", data.projectId)
      .select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const revokeBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), projectId: z.string().uuid() }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "editor");
    const { data: saved, error } = await context.supabase
      .from("on_device_model_builds")
      .update({ status: "revoked" }).eq("id", data.id)
      .eq("project_id", data.projectId).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

// ── Downloads / Stats ────────────────────────────────────
export const logDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      buildId: z.string().uuid(),
      projectId: z.string().uuid(),
      platform: PlatformZ,
      deviceClass: z.string().max(60).optional(),
      bytesTransferred: z.number().int().min(0),
      durationMs: z.number().int().min(0).max(60*60*1000),
      success: z.boolean().default(true),
      error: z.string().max(400).optional(),
    }).parse(d)
  )
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "editor");
    await rateLimit(context, "odm:dl", 240);
    const { error } = await context.supabase.from("on_device_model_downloads").insert({
      build_id: data.buildId,
      project_id: data.projectId,
      platform: data.platform,
      device_class: data.deviceClass ?? null,
      bytes_transferred: data.bytesTransferred,
      duration_ms: data.durationMs,
      success: data.success,
      error: data.error ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const modelStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRole(context, data.projectId, "viewer");
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("on_device_model_downloads")
      .select("platform, bytes_transferred, duration_ms, success, created_at")
      .eq("project_id", data.projectId)
      .gte("created_at", since)
      .order("created_at", { ascending: false }).limit(2000);
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    const total = list.length;
    const ok = list.filter((r: any) => r.success).length;
    const bytes = list.reduce((a: number, r: any) => a + (r.bytes_transferred || 0), 0);
    const ms = list.reduce((a: number, r: any) => a + (r.duration_ms || 0), 0);
    const byPlatform: Record<string, number> = {};
    for (const r of list as any[]) byPlatform[r.platform] = (byPlatform[r.platform] || 0) + 1;
    return {
      total,
      successPct: total ? Math.round((ok / total) * 1000) / 10 : 0,
      gbServed: Math.round((bytes / (1024**3)) * 100) / 100,
      avgMbps: total && ms > 0
        ? Math.round(((bytes * 8) / 1_000_000) / (ms / 1000) * 100) / 100
        : 0,
      byPlatform,
    };
  });
