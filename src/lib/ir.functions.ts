// B1 — IR server functions: load/save/revisions + deterministic codegen preview.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPTY_IR, IrSchema, hashIr, generateFilesFromIr, lintIr, type Ir } from "./ir.shared";

const ProjectIdInput = z.object({ projectId: z.string().uuid() });

export const getProjectIr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ProjectIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("project_ir" as never)
      .select("*")
      .eq("project_id" as never, data.projectId as never)
      .maybeSingle();
    if (!row) {
      return { ir: EMPTY_IR, version: 0, ir_hash: "", updated_at: null as string | null };
    }
    const r = row as unknown as { ir: unknown; version: number; ir_hash: string; updated_at: string };
    return { ir: IrSchema.parse(r.ir) as Ir, version: r.version, ir_hash: r.ir_hash, updated_at: r.updated_at };
  });

const SaveIrInput = z.object({
  projectId: z.string().uuid(),
  ir: z.unknown(),
  note: z.string().max(500).optional(),
  source: z.enum(["manual", "planner", "import"]).default("manual"),
});

export const saveProjectIr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof SaveIrInput>) => SaveIrInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const parsed = IrSchema.parse(data.ir);
    const issues = lintIr(parsed);
    const blocking = issues.filter((i) => i.severity === "error");
    if (blocking.length > 0) {
      return { ok: false, issues, version: 0 };
    }
    const ir_hash = hashIr(parsed);

    const { data: existing } = await supabase
      .from("project_ir" as never)
      .select("version")
      .eq("project_id" as never, data.projectId as never)
      .maybeSingle();
    const nextVersion = ((existing as unknown as { version: number } | null)?.version ?? 0) + 1;

    await supabase.from("project_ir" as never).upsert({
      project_id: data.projectId,
      ir: parsed,
      ir_hash,
      version: nextVersion,
      updated_by: userId,
    } as never, { onConflict: "project_id" } as never);

    const { data: rev } = await supabase
      .from("ir_revisions" as never)
      .insert({
        project_id: data.projectId,
        version: nextVersion,
        ir: parsed,
        ir_hash,
        source: data.source,
        author_id: userId,
        note: data.note ?? null,
      } as never)
      .select("id")
      .maybeSingle();

    return { ok: true, version: nextVersion, ir_hash, revisionId: (rev as { id?: string } | null)?.id, issues };
  });

export const listIrRevisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ProjectIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("ir_revisions" as never)
      .select("id, version, ir_hash, source, note, created_at, author_id")
      .eq("project_id" as never, data.projectId as never)
      .order("version" as never, { ascending: false })
      .limit(50);
    return { revisions: (rows ?? []) as Array<{ id: string; version: number; ir_hash: string; source: string; note: string | null; created_at: string; author_id: string | null }> };
  });

export const previewIrCodegen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ProjectIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("project_ir" as never)
      .select("ir")
      .eq("project_id" as never, data.projectId as never)
      .maybeSingle();
    const ir = IrSchema.parse((row as unknown as { ir: unknown } | null)?.ir ?? EMPTY_IR);
    const files = generateFilesFromIr(ir);
    return { files, count: files.length, ir_hash: hashIr(ir) };
  });
