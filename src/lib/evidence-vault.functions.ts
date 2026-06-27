// P52 — Compliance evidence vault server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, enforceRateLimit, sha256Hex } from "./_phase23.shared";

const db = (ctx: any) => ctx.supabase as any;
const FrameworkZ = z.enum(["soc2", "iso27001", "hipaa", "gdpr", "pci", "custom"]);
const StatusZ = z.enum(["not_started", "in_progress", "implemented", "verified", "not_applicable"]);
const KindZ = z.enum(["document", "screenshot", "log", "config", "attestation", "policy", "other"]);

export const listControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), framework: FrameworkZ.optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    let q = db(context).from("evidence_controls").select("*").eq("project_id", data.projectId);
    if (data.framework) q = q.eq("framework", data.framework);
    const { data: rows, error } = await q.order("framework").order("control_id");
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const upsertControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    projectId: z.string().uuid(),
    framework: FrameworkZ,
    controlId: z.string().min(1).max(40),
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional(),
    owner: z.string().max(120).optional(),
    status: StatusZ.default("in_progress"),
    nextReviewDays: z.number().int().min(0).max(3650).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "ev:control", 60);
    const payload: any = {
      project_id: data.projectId, framework: data.framework, control_id: data.controlId,
      title: data.title, description: data.description ?? null, owner: data.owner ?? null,
      status: data.status,
    };
    if (data.nextReviewDays) payload.next_review = new Date(Date.now() + data.nextReviewDays * 86_400_000).toISOString();
    if (data.id) payload.id = data.id;
    const { data: saved, error } = await db(context).from("evidence_controls")
      .upsert(payload, { onConflict: data.id ? "id" : "project_id,framework,control_id" }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const deleteControl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("evidence_controls")
      .delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listArtifacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), controlId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("evidence_artifacts")
      .select("*").eq("control_id", data.controlId).eq("project_id", data.projectId)
      .order("collected_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const attachArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), controlId: z.string().uuid(),
    kind: KindZ, title: z.string().min(2).max(200),
    uri: z.string().url().max(2000).optional(),
    content: z.string().min(1).max(200_000),
    retentionDays: z.number().int().min(1).max(3650).default(365),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "ev:attach", 120);
    const sha = await sha256Hex(data.content);
    const { data: saved, error } = await db(context).from("evidence_artifacts").insert({
      project_id: data.projectId, control_id: data.controlId, kind: data.kind, title: data.title,
      uri: data.uri ?? null, sha256: sha, size_bytes: new TextEncoder().encode(data.content).length,
      retention_until: new Date(Date.now() + data.retentionDays * 86_400_000).toISOString(),
      metadata: { hashed_inline: true },
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const deleteArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("evidence_artifacts")
      .delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const complianceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows } = await db(context).from("evidence_controls")
      .select("framework,status").eq("project_id", data.projectId);
    const list = (rows ?? []) as any[];
    const total = list.length;
    const verified = list.filter((r) => r.status === "verified").length;
    const implemented = list.filter((r) => r.status === "implemented").length;
    const byFramework: Record<string, { total: number; verified: number }> = {};
    list.forEach((r) => {
      byFramework[r.framework] ??= { total: 0, verified: 0 };
      byFramework[r.framework].total++;
      if (r.status === "verified") byFramework[r.framework].verified++;
    });
    const coverage = total ? Math.round(((verified + implemented * 0.5) / total) * 100) : 0;
    return { total, verified, implemented, coverage, byFramework };
  });
