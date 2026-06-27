// P51 — Changelog pipeline server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertProjectRole, enforceRateLimit } from "./_phase23.shared";
import { bumpVersion, classify, summarize } from "./ai-changelog.shared";

const db = (ctx: any) => ctx.supabase as any;
const KindZ = z.enum(["commit", "pr", "issue", "deploy", "manual"]);

export const ingestSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    kind: KindZ, ref: z.string().min(1).max(120),
    title: z.string().min(1).max(240),
    body: z.string().max(8000).optional(),
    author: z.string().max(120).optional(),
    labels: z.array(z.string().max(40)).max(20).default([]),
    occurredAt: z.string().datetime().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "cl:ingest", 240);
    const { data: saved, error } = await db(context).from("changelog_sources").insert({
      project_id: data.projectId, kind: data.kind, ref: data.ref, title: data.title,
      body: data.body ?? null, author: data.author ?? null, labels: data.labels,
      occurred_at: data.occurredAt ?? new Date().toISOString(),
    }).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const listSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), onlyUnconsumed: z.boolean().default(false) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    let q = db(context).from("changelog_sources").select("*").eq("project_id", data.projectId);
    if (data.onlyUnconsumed) q = q.is("consumed_at", null);
    const { data: rows, error } = await q.order("occurred_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const generateEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "cl:gen", 30);
    const { data: sources } = await db(context).from("changelog_sources")
      .select("*").eq("project_id", data.projectId).is("consumed_at", null)
      .order("occurred_at", { ascending: false }).limit(50);
    const list = (sources ?? []) as any[];
    if (!list.length) throw new Error("No unconsumed sources to summarize");

    const { data: prev } = await db(context).from("changelog_entries")
      .select("version").eq("project_id", data.projectId).eq("status", "published")
      .order("published_at", { ascending: false }).limit(1).maybeSingle();
    const prevVersion = prev?.version ?? "0.0.0";

    // Pick highest impact across sources
    const classified = list.map((s) => ({ ...classify(s), src: s }));
    const order = ["patch", "minor", "major", "breaking"];
    const top = classified.reduce((acc, c) => order.indexOf(c.impact) > order.indexOf(acc.impact) ? c : acc, classified[0]);
    const { title, summary } = summarize(list);
    const nextVersion = bumpVersion(prevVersion, top.impact);

    const { data: entry, error } = await db(context).from("changelog_entries").insert({
      project_id: data.projectId, version: nextVersion, title, summary,
      category: top.category, audience: top.audience, impact: top.impact,
      sources: list.map((s) => ({ id: s.id, kind: s.kind, ref: s.ref })),
      status: "draft",
    }).select("*").single();
    if (error) throw new Error(error.message);

    await db(context).from("changelog_sources").update({ consumed_at: new Date().toISOString() })
      .in("id", list.map((s) => s.id));
    return entry;
  });

export const listEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("changelog_entries")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const setEntryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), id: z.string().uuid(),
    status: z.enum(["draft", "review", "published", "archived"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    const patch: any = { status: data.status };
    if (data.status === "published") patch.published_at = new Date().toISOString();
    const { data: saved, error } = await db(context).from("changelog_entries")
      .update(patch).eq("id", data.id).eq("project_id", data.projectId).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });

export const editEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(), id: z.string().uuid(),
    title: z.string().min(1).max(240).optional(),
    summary: z.string().min(1).max(8000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    const patch: any = {};
    if (data.title) patch.title = data.title;
    if (data.summary) patch.summary = data.summary;
    const { data: saved, error } = await db(context).from("changelog_entries")
      .update(patch).eq("id", data.id).eq("project_id", data.projectId).select("*").single();
    if (error) throw new Error(error.message);
    return saved;
  });
