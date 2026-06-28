// B5 — Materialize IR → project_files (deterministic). Upserts generated paths,
// removes stale auto-generated ones, leaves user-authored files alone.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { EMPTY_IR, IrSchema, generateFilesFromIr, hashIr, type Ir } from "./ir.shared";

const AUTO_PREFIXES = ["src/routes/", "src/theme.css", "src/ir.json", "db/models/", "foundry.config.json", "README.md"] as const;
const isAuto = (p: string) => AUTO_PREFIXES.some((pref) => p === pref || p.startsWith(pref));
const langFor = (p: string) =>
  p.endsWith(".tsx") ? "tsx" : p.endsWith(".ts") ? "ts" : p.endsWith(".css") ? "css" : p.endsWith(".sql") ? "sql" : p.endsWith(".json") ? "json" : "text";

const Input = z.object({ projectId: z.string().uuid() });

export const materializeIr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // 1. Verify caller has editor rights (RLS would block anyway, but fail fast).
    const { data: allowed } = await supabase.rpc("has_project_role", {
      _project_id: data.projectId, _user_id: context.userId, _min_role: "editor",
    });
    if (!allowed) throw new Error("Forbidden");

    // 2. Load IR.
    const { data: irRow } = await supabase
      .from("project_ir" as never).select("ir")
      .eq("project_id" as never, data.projectId as never).maybeSingle();
    const ir: Ir = IrSchema.parse((irRow as unknown as { ir: unknown } | null)?.ir ?? EMPTY_IR);

    const files = generateFilesFromIr(ir);
    const targetPaths = new Set(files.map((f) => f.path));

    // 3. Diff against existing auto-generated files.
    const { data: existing } = await supabase
      .from("project_files" as never).select("id, path, content")
      .eq("project_id" as never, data.projectId as never);
    const existingMap = new Map<string, { id: string; content: string }>();
    for (const r of (existing ?? []) as Array<{ id: string; path: string; content: string }>) {
      existingMap.set(r.path, { id: r.id, content: r.content });
    }

    let written = 0, deleted = 0, unchanged = 0;

    // 4. Upsert generated files.
    const upserts = files.map((f) => {
      const prev = existingMap.get(f.path);
      if (prev && prev.content === f.content) { unchanged++; return null; }
      written++;
      return { project_id: data.projectId, path: f.path, content: f.content, language: langFor(f.path) };
    }).filter(Boolean) as Array<Record<string, unknown>>;

    if (upserts.length > 0) {
      const { error } = await supabase
        .from("project_files" as never)
        .upsert(upserts as never, { onConflict: "project_id,path" } as never);
      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }

    // 5. Delete auto-generated files that no longer exist in the IR output.
    const toDelete = Array.from(existingMap.keys()).filter((p) => isAuto(p) && !targetPaths.has(p));
    if (toDelete.length > 0) {
      const { error } = await supabase
        .from("project_files" as never).delete()
        .eq("project_id" as never, data.projectId as never)
        .in("path" as never, toDelete as never);
      if (error) throw new Error(`Cleanup failed: ${error.message}`);
      deleted = toDelete.length;
    }

    return { ok: true, written, deleted, unchanged, ir_hash: hashIr(ir), total: files.length };
  });
