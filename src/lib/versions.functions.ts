import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProjectIdInput = z.object({ projectId: z.string().uuid() });

async function assertOwner(supabase: any, userId: string, projectId: string) {
  const { data } = await supabase.from("projects").select("id").eq("id", projectId).eq("owner_id", userId).maybeSingle();
  if (!data) throw new Error("Project not found");
}

export const snapshotProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    label: z.string().trim().max(80).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId, data.projectId);
    const { data: files, error } = await supabase
      .from("project_files").select("path, content, language")
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    const { data: row, error: insErr } = await supabase.from("project_versions").insert({
      project_id: data.projectId,
      owner_id: userId,
      label: data.label ?? null,
      snapshot: files ?? [],
      file_count: files?.length ?? 0,
    }).select("id, label, file_count, created_at").single();
    if (insErr) throw new Error(insErr.message);
    return row;
  });

export const listVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("project_versions").select("id, label, file_count, created_at")
      .eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return { versions: rows ?? [] };
  });

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    versionId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId, data.projectId);
    const { data: ver } = await supabase.from("project_versions")
      .select("snapshot").eq("id", data.versionId).eq("project_id", data.projectId).maybeSingle();
    if (!ver) throw new Error("Version not found");
    const snapshot = ver.snapshot as Array<{ path: string; content: string; language: string | null }>;

    await supabase.from("project_files").delete().eq("project_id", data.projectId);
    if (snapshot.length > 0) {
      const rows = snapshot.map((f) => ({
        project_id: data.projectId,
        path: f.path,
        content: f.content,
        language: f.language ?? null,
      }));
      const { error } = await supabase.from("project_files").insert(rows);
      if (error) throw new Error(error.message);
    }
    return { restored: snapshot.length };
  });

export const toggleShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    enabled: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId, data.projectId);
    let token: string | null = null;
    if (data.enabled) {
      const { data: existing } = await supabase.from("projects")
        .select("public_share_token").eq("id", data.projectId).maybeSingle();
      token = existing?.public_share_token ?? crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    }
    const { error } = await supabase.from("projects")
      .update({ is_public: data.enabled, public_share_token: token })
      .eq("id", data.projectId);
    if (error) throw new Error(error.message);
    return { is_public: data.enabled, share_token: token };
  });

export const getPublicProject = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(8).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project } = await supabaseAdmin.from("projects")
      .select("id, name, description, slug, created_at")
      .eq("public_share_token", data.token).eq("is_public", true).maybeSingle();
    if (!project) throw new Error("Share link not found");
    const { data: files } = await supabaseAdmin.from("project_files")
      .select("path, content, language").eq("project_id", project.id).order("path");
    return { project, files: files ?? [] };
  });

type SnapFile = { path: string; content: string; language: string | null };

export const getVersionDiff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    fromVersionId: z.string().uuid(),
    toVersionId: z.string().uuid().optional(), // omit = compare against current files
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId, data.projectId);

    const { data: from } = await supabase.from("project_versions")
      .select("snapshot, label, created_at")
      .eq("id", data.fromVersionId).eq("project_id", data.projectId).maybeSingle();
    if (!from) throw new Error("Source version not found");

    let toFiles: SnapFile[];
    let toMeta: { label: string | null; created_at: string } = { label: "Current", created_at: new Date().toISOString() };
    if (data.toVersionId) {
      const { data: to } = await supabase.from("project_versions")
        .select("snapshot, label, created_at")
        .eq("id", data.toVersionId).eq("project_id", data.projectId).maybeSingle();
      if (!to) throw new Error("Target version not found");
      toFiles = to.snapshot as SnapFile[];
      toMeta = { label: to.label, created_at: to.created_at };
    } else {
      const { data: cur } = await supabase.from("project_files")
        .select("path, content, language").eq("project_id", data.projectId);
      toFiles = (cur ?? []) as SnapFile[];
    }

    const fromMap = new Map((from.snapshot as SnapFile[]).map((f) => [f.path, f]));
    const toMap = new Map(toFiles.map((f) => [f.path, f]));
    const allPaths = Array.from(new Set([...fromMap.keys(), ...toMap.keys()])).sort();

    const files = allPaths.map((path) => {
      const a = fromMap.get(path);
      const b = toMap.get(path);
      if (!a) return { path, status: "added" as const, added: (b!.content.match(/\n/g)?.length ?? 0) + 1, removed: 0 };
      if (!b) return { path, status: "removed" as const, added: 0, removed: (a.content.match(/\n/g)?.length ?? 0) + 1 };
      if (a.content === b.content) return { path, status: "unchanged" as const, added: 0, removed: 0 };
      const aLines = a.content.split("\n");
      const bLines = b.content.split("\n");
      // Lightweight stat: lines in b not in a, lines in a not in b (multiset).
      const aSet = new Map<string, number>();
      aLines.forEach((l) => aSet.set(l, (aSet.get(l) ?? 0) + 1));
      let removed = 0, added = 0;
      const bSeen = new Map<string, number>();
      bLines.forEach((l) => bSeen.set(l, (bSeen.get(l) ?? 0) + 1));
      for (const [l, c] of aSet) {
        const bc = bSeen.get(l) ?? 0;
        if (bc < c) removed += c - bc;
      }
      for (const [l, c] of bSeen) {
        const ac = aSet.get(l) ?? 0;
        if (ac < c) added += c - ac;
      }
      return { path, status: "modified" as const, added, removed };
    });

    const totals = files.reduce((a, f) => ({ added: a.added + f.added, removed: a.removed + f.removed }), { added: 0, removed: 0 });
    return { from: { label: from.label, created_at: from.created_at }, to: toMeta, files, totals };
  });

export const getFileDiff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    fromVersionId: z.string().uuid(),
    toVersionId: z.string().uuid().optional(),
    path: z.string().min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertOwner(supabase, userId, data.projectId);
    const { diffLines } = await import("diff");

    const { data: from } = await supabase.from("project_versions")
      .select("snapshot").eq("id", data.fromVersionId).eq("project_id", data.projectId).maybeSingle();
    if (!from) throw new Error("Source version not found");
    const fromFile = (from.snapshot as SnapFile[]).find((f) => f.path === data.path);

    let toContent = "";
    if (data.toVersionId) {
      const { data: to } = await supabase.from("project_versions")
        .select("snapshot").eq("id", data.toVersionId).eq("project_id", data.projectId).maybeSingle();
      const toFile = (to?.snapshot as SnapFile[] | undefined)?.find((f) => f.path === data.path);
      toContent = toFile?.content ?? "";
    } else {
      const { data: cur } = await supabase.from("project_files")
        .select("content").eq("project_id", data.projectId).eq("path", data.path).maybeSingle();
      toContent = cur?.content ?? "";
    }

    const hunks = diffLines(fromFile?.content ?? "", toContent);
    return { hunks: hunks.map((h) => ({ value: h.value, added: !!h.added, removed: !!h.removed })) };
  });
