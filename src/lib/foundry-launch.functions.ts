// Phase G2/G3/G4 — server functions for Foundry v2 Launch Center.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  ALL_ARTIFACT_KINDS,
  ALL_DOC_KINDS,
  ALL_RUNBOOK_SCENARIOS,
  synthesizeMarketplaceBundle,
  synthesizeProductDocs,
  synthesizeRunbook,
  type ArtifactKind,
  type DocKind,
  type RunbookScenario,
} from "./foundry-launch.shared";

const ProjectId = z.string().uuid();

async function requireRole(ctx: { userId: string }, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data: allowed, error } = await supabaseAdmin.rpc("has_project_role", { _project_id: projectId, _user_id: ctx.userId, _min_role: role });
  if (error || !allowed) throw new Error("Forbidden");
}

async function loadProjectSummary(projectId: string) {
  const { data, error } = await supabaseAdmin.from("projects").select("id,name,slug,description").eq("id", projectId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Project not found");
  return { name: String(data.name), slug: String(data.slug ?? data.id), description: (data.description as string | null) ?? null };
}

// ---------- G2: Docs ----------
export const listProductDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const { data: rows, error } = await supabaseAdmin.from("foundry_product_docs").select("*").eq("project_id", data.projectId).order("kind");
    if (error) throw new Error(error.message);
    return { docs: rows ?? [] };
  });

export const generateProductDocs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; targets?: string[]; adapters?: string[] }) => ({
    projectId: ProjectId.parse(d.projectId),
    targets: d.targets ?? ["web", "mobile"],
    adapters: d.adapters ?? [],
  }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const proj = await loadProjectSummary(data.projectId);
    const docs = synthesizeProductDocs({ ...proj, targets: data.targets, adapters: data.adapters });
    const rows = docs.map((d) => ({
      project_id: data.projectId, kind: d.kind, slug: d.slug, title: d.title,
      content_md: d.contentMd, word_count: d.wordCount, source: "generated", created_by: context.userId,
    }));
    const { error } = await supabaseAdmin.from("foundry_product_docs").upsert(rows, { onConflict: "project_id,kind,slug" });
    if (error) throw new Error(error.message);
    return { generated: docs.length };
  });

export const updateProductDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; docId: string; contentMd: string }) => ({
    projectId: ProjectId.parse(d.projectId),
    docId: z.string().uuid().parse(d.docId),
    contentMd: z.string().min(1).max(200000).parse(d.contentMd),
  }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const wordCount = data.contentMd.trim().split(/\s+/).filter(Boolean).length;
    const { error } = await supabaseAdmin.from("foundry_product_docs")
      .update({ content_md: data.contentMd, word_count: wordCount, source: "manual" })
      .eq("id", data.docId).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- G3: Marketplace ----------
export const listMarketplaceListings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const { data: rows, error } = await supabaseAdmin.from("foundry_marketplace_listings")
      .select("*").eq("project_id", data.projectId).order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { listings: rows ?? [] };
  });

export const createMarketplaceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; artifactKind: ArtifactKind; name: string; slug: string; version?: string; visibility?: "private" | "org" | "public"; capabilities?: string[]; permissions?: string[]; targets?: string[] }) => ({
    projectId: ProjectId.parse(d.projectId),
    artifactKind: z.enum(ALL_ARTIFACT_KINDS as [ArtifactKind, ...ArtifactKind[]]).parse(d.artifactKind),
    name: z.string().min(2).max(120).parse(d.name),
    slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/).parse(d.slug),
    version: z.string().regex(/^\d+\.\d+\.\d+$/).parse(d.version ?? "0.1.0"),
    visibility: z.enum(["private", "org", "public"]).parse(d.visibility ?? "private"),
    capabilities: (d.capabilities ?? []).slice(0, 32),
    permissions: (d.permissions ?? []).slice(0, 32),
    targets: (d.targets ?? ["web"]).slice(0, 8),
  }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const bundle = synthesizeMarketplaceBundle({
      artifactKind: data.artifactKind, name: data.name, slug: data.slug, version: data.version,
      capabilities: data.capabilities, permissions: data.permissions, targets: data.targets,
    });
    const { data: row, error } = await supabaseAdmin.from("foundry_marketplace_listings").insert({
      project_id: data.projectId, artifact_kind: data.artifactKind, slug: data.slug, name: data.name,
      version: data.version, visibility: data.visibility, manifest: bundle.manifest as unknown as Json, bundle: bundle as unknown as Json,
      status: "draft", created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { listing: row };
  });

export const publishMarketplaceListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; listingId: string; status: "draft" | "review" | "published" | "deprecated" }) => ({
    projectId: ProjectId.parse(d.projectId),
    listingId: z.string().uuid().parse(d.listingId),
    status: z.enum(["draft", "review", "published", "deprecated"]).parse(d.status),
  }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "owner");
    const { error } = await supabaseAdmin.from("foundry_marketplace_listings")
      .update({ status: data.status }).eq("id", data.listingId).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- G4: Launch Runbooks ----------
export const listLaunchRunbooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const { data: rows, error } = await supabaseAdmin.from("foundry_launch_runbooks")
      .select("*").eq("project_id", data.projectId).order("severity");
    if (error) throw new Error(error.message);
    return { runbooks: rows ?? [] };
  });

export const seedLaunchRunbooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const rows = ALL_RUNBOOK_SCENARIOS.map((s) => {
      const tpl = synthesizeRunbook(s);
      return {
        project_id: data.projectId, scenario: tpl.scenario, severity: tpl.severity, title: tpl.title,
        steps: tpl.steps as unknown as Record<string, unknown>[], owners: [] as unknown as Record<string, unknown>[],
        escalation: tpl.escalation as unknown as Record<string, unknown>, sla_minutes: tpl.slaMinutes, created_by: context.userId,
      };
    });
    const { error } = await supabaseAdmin.from("foundry_launch_runbooks").insert(rows);
    if (error) throw new Error(error.message);
    return { seeded: rows.length };
  });

export const recordRunbookDrill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; runbookId: string }) => ({
    projectId: ProjectId.parse(d.projectId),
    runbookId: z.string().uuid().parse(d.runbookId),
  }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const { error } = await supabaseAdmin.from("foundry_launch_runbooks")
      .update({ last_drilled_at: new Date().toISOString() })
      .eq("id", data.runbookId).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type { ArtifactKind, DocKind, RunbookScenario };
