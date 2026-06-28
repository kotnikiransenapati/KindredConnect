// B6 — Reviewable IR diff-and-patch server functions.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPTY_IR, IrSchema, generateFilesFromIr, hashIr, type Ir } from "./ir.shared";
import { diffGeneratedFiles, languageForPath, type PatchFile, type PatchStats } from "./ir-diff.shared";

const ProjectInput = z.object({ projectId: z.string().uuid() });
const PatchInput = z.object({ projectId: z.string().uuid(), patchSetId: z.string().uuid() });
const CreatePatchInput = z.object({ projectId: z.string().uuid(), targetIr: z.unknown(), summary: z.string().max(500).default("IR patch proposal") });

type StoredPatchSet = {
  id: string;
  base_ir_hash: string;
  target_ir_hash: string;
  status: string;
  summary: string;
  files: PatchFile[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stats: PatchStats & { targetIr?: any };
  created_at: string;
  applied_at: string | null;
};

async function requireEditor(context: { supabase: any; userId: string }, projectId: string) {
  const { data: allowed } = await context.supabase.rpc("has_project_role", {
    _project_id: projectId,
    _user_id: context.userId,
    _min_role: "editor",
  });
  if (!allowed) throw new Error("Forbidden");
}

async function loadIr(context: { supabase: any }, projectId: string): Promise<Ir> {
  const { data: row } = await context.supabase
    .from("project_ir" as never)
    .select("ir")
    .eq("project_id" as never, projectId as never)
    .maybeSingle();
  return IrSchema.parse((row as unknown as { ir: unknown } | null)?.ir ?? EMPTY_IR);
}

export const createIrPatchSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof CreatePatchInput>) => CreatePatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context, data.projectId);
    const baseIr = await loadIr(context, data.projectId);
    const targetIr = IrSchema.parse(data.targetIr);
    const baseFiles = generateFilesFromIr(baseIr);
    const targetFiles = generateFilesFromIr(targetIr);
    const { files, stats } = diffGeneratedFiles(baseFiles, targetFiles);
    const visibleFiles = files.filter((file) => file.status !== "unchanged");

    const { data: row, error } = await context.supabase
      .from("ir_patch_sets" as never)
      .insert({
        project_id: data.projectId,
        base_ir_hash: hashIr(baseIr),
        target_ir_hash: hashIr(targetIr),
        status: "reviewing",
        summary: data.summary,
        files: visibleFiles,
        stats: { ...stats, targetIr },
        created_by: context.userId,
      } as never)
      .select("id, status, stats")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Patch set was not persisted");
    return { ok: true, patchSetId: (row as unknown as { id: string }).id, stats };
  });

export const listIrPatchSets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ProjectInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("ir_patch_sets" as never)
      .select("id, base_ir_hash, target_ir_hash, status, summary, stats, created_at, applied_at")
      .eq("project_id" as never, data.projectId as never)
      .order("created_at" as never, { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { patchSets: (rows ?? []) as Array<{ id: string; base_ir_hash: string; target_ir_hash: string; status: string; summary: string; stats: PatchStats; created_at: string; applied_at: string | null }> };
  });

export const getIrPatchSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof PatchInput>) => PatchInput.parse(d))
  .handler(async ({ data, context }) => {
    return { patchSet: await loadPatchSet(context, data.projectId, data.patchSetId) };
  });

export const applyIrPatchSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof PatchInput>) => PatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context, data.projectId);
    const patchSet = await loadPatchSet(context, data.projectId, data.patchSetId);
    if (patchSet.status === "applied") return { ok: true, written: 0, deleted: 0, version: null as number | null };

    const upserts = patchSet.files
      .filter((file) => file.status === "added" || file.status === "modified")
      .map((file) => ({ project_id: data.projectId, path: file.path, content: file.after, language: languageForPath(file.path) }));
    const removed = patchSet.files.filter((file) => file.status === "removed").map((file) => file.path);

    if (upserts.length > 0) {
      const { error } = await context.supabase
        .from("project_files" as never)
        .upsert(upserts as never, { onConflict: "project_id,path" } as never);
      if (error) throw new Error(error.message);
    }
    if (removed.length > 0) {
      const { error } = await context.supabase
        .from("project_files" as never)
        .delete()
        .eq("project_id" as never, data.projectId as never)
        .in("path" as never, removed as never);
      if (error) throw new Error(error.message);
    }

    let version: number | null = null;
    const parsedTarget = IrSchema.safeParse(patchSet.stats.targetIr);
    if (parsedTarget.success) {
      const { data: existing } = await context.supabase
        .from("project_ir" as never)
        .select("version")
        .eq("project_id" as never, data.projectId as never)
        .maybeSingle();
      version = ((existing as unknown as { version: number } | null)?.version ?? 0) + 1;
      await context.supabase.from("project_ir" as never).upsert({
        project_id: data.projectId,
        ir: parsedTarget.data,
        ir_hash: hashIr(parsedTarget.data),
        version,
        updated_by: context.userId,
      } as never, { onConflict: "project_id" } as never);
      await context.supabase.from("ir_revisions" as never).insert({
        project_id: data.projectId,
        version,
        ir: parsedTarget.data,
        ir_hash: hashIr(parsedTarget.data),
        source: "manual",
        author_id: context.userId,
        note: `Applied patch: ${patchSet.summary}`,
      } as never);
    }

    const { error } = await context.supabase
      .from("ir_patch_sets" as never)
      .update({ status: "applied", applied_by: context.userId, applied_at: new Date().toISOString() } as never)
      .eq("project_id" as never, data.projectId as never)
      .eq("id" as never, data.patchSetId as never);
    if (error) throw new Error(error.message);

    return { ok: true, written: upserts.length, deleted: removed.length, version };
  });

export const rejectIrPatchSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof PatchInput>) => PatchInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireEditor(context, data.projectId);
    const { error } = await context.supabase
      .from("ir_patch_sets" as never)
      .update({ status: "rejected" } as never)
      .eq("project_id" as never, data.projectId as never)
      .eq("id" as never, data.patchSetId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function loadPatchSet(context: { supabase: any }, projectId: string, patchSetId: string): Promise<StoredPatchSet> {
  const { data: row, error } = await context.supabase
    .from("ir_patch_sets" as never)
    .select("id, base_ir_hash, target_ir_hash, status, summary, files, stats, created_at, applied_at")
    .eq("project_id" as never, projectId as never)
    .eq("id" as never, patchSetId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Patch set not found");
  return row as unknown as StoredPatchSet;
}