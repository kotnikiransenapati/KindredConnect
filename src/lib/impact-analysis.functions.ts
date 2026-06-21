// P45 — Impact analysis bot server functions.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { analyzeChanges, assertProjectRole, enforceRateLimit, type FileChange } from "./impact-analysis.server";

const db = (ctx: any) => ctx.supabase as any;

const FileChangeZ = z.object({
  path: z.string().min(1).max(500),
  additions: z.number().int().min(0).max(100_000).default(0),
  deletions: z.number().int().min(0).max(100_000).default(0),
});

export const listScans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("impact_scans")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const createScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    title: z.string().min(2).max(200),
    branch: z.string().max(120).optional(),
    files: z.array(FileChangeZ).min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "editor");
    await enforceRateLimit(context, "scan", 20);

    const analysis = analyzeChanges(data.files as FileChange[]);
    const { data: scan, error } = await db(context).from("impact_scans").insert({
      project_id: data.projectId, title: data.title, branch: data.branch ?? null,
      changed_files: data.files, risk_score: analysis.riskScore, risk_level: analysis.riskLevel,
      summary: analysis.summary, status: "completed",
      reviewer_suggestions: analysis.reviewerSuggestions,
    }).select("*").single();
    if (error) throw new Error(error.message);

    if (analysis.findings.length) {
      const rows = analysis.findings.map((f) => ({
        scan_id: scan.id, project_id: data.projectId,
        file_path: f.filePath, component: f.component, severity: f.severity,
        blast_radius: f.blastRadius, message: f.message, affected_routes: f.affectedRoutes,
      }));
      const { error: fErr } = await db(context).from("impact_findings").insert(rows);
      if (fErr) throw new Error(fErr.message);
    }
    return scan;
  });

export const getScanFindings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), scanId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "viewer");
    const { data: rows, error } = await db(context).from("impact_findings")
      .select("*").eq("scan_id", data.scanId).eq("project_id", data.projectId)
      .order("blast_radius", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

export const deleteScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertProjectRole(context, data.projectId, "owner");
    const { error } = await db(context).from("impact_scans").delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
