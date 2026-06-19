import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const ProjectIdInput = z.object({ projectId: z.string().uuid() });

export const createDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    label: z.string().trim().max(80).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { assertRateLimit } = await import("@/lib/rate-limit.server");
    await assertRateLimit(userId, "deploy_day", "1 day", 30);
    await assertRateLimit(userId, "deploy_min", "1 minute", 3);

    // Verify editor+
    const { data: roleOk } = await supabase.rpc("has_project_role", {
      _project_id: data.projectId, _user_id: userId, _min_role: "editor",
    });
    if (!roleOk) throw new Error("Forbidden");

    const { data: proj, error: pErr } = await supabase
      .from("projects").select("id, slug").eq("id", data.projectId).maybeSingle();
    if (pErr || !proj) throw new Error("Project not found");

    const { data: files, error: fErr } = await supabase
      .from("project_files").select("path, content, language")
      .eq("project_id", data.projectId);
    if (fErr) throw new Error(fErr.message);
    if (!files || files.length === 0) throw new Error("No files to deploy");

    const { data: nextV, error: vErr } = await supabase.rpc("next_deployment_version", { _slug: proj.slug });
    if (vErr) throw new Error(vErr.message);
    const versionNum = nextV as unknown as number;

    // Demote previous current
    await supabase.from("deployments")
      .update({ is_current: false })
      .eq("project_id", data.projectId)
      .eq("is_current", true);

    const { data: dep, error: dErr } = await supabase.from("deployments").insert({
      project_id: data.projectId,
      created_by: userId,
      slug: proj.slug,
      version_num: versionNum,
      label: data.label ?? null,
      snapshot: files,
      file_count: files.length,
      status: "ready",
      is_current: true,
    }).select("id, version_num, slug, label, file_count, created_at, is_current").single();
    if (dErr) throw new Error(dErr.message);
    return dep;
  });

export const listDeployments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProjectIdInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleOk } = await supabase.rpc("has_project_role", {
      _project_id: data.projectId, _user_id: userId, _min_role: "viewer",
    });
    if (!roleOk) throw new Error("Forbidden");
    const { data: rows, error } = await supabase.from("deployments")
      .select("id, version_num, slug, label, file_count, created_at, is_current, status")
      .eq("project_id", data.projectId)
      .order("version_num", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { deployments: rows ?? [] };
  });

export const rollbackDeployment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    deploymentId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleOk } = await supabase.rpc("has_project_role", {
      _project_id: data.projectId, _user_id: userId, _min_role: "editor",
    });
    if (!roleOk) throw new Error("Forbidden");
    await supabase.from("deployments")
      .update({ is_current: false })
      .eq("project_id", data.projectId)
      .eq("is_current", true);
    const { error } = await supabase.from("deployments")
      .update({ is_current: true })
      .eq("id", data.deploymentId)
      .eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// PUBLIC — anyone can fetch a deployment by slug (current) or slug+version
export const getPublicDeployment = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({
    slug: z.string().min(1).max(80),
    version: z.number().int().positive().optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const sb = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    let q = sb.from("deployments")
      .select("id, slug, version_num, label, snapshot, file_count, created_at, is_current, project_id")
      .eq("slug", data.slug);
    q = data.version ? q.eq("version_num", data.version) : q.eq("is_current", true);
    const { data: dep, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!dep) throw new Error("Deployment not found");
    const { data: proj } = await sb.from("projects")
      .select("name, description").eq("id", dep.project_id).maybeSingle();
    return {
      deployment: {
        id: dep.id, slug: dep.slug, version_num: dep.version_num, label: dep.label,
        file_count: dep.file_count, created_at: dep.created_at, is_current: dep.is_current,
      },
      project: proj ?? { name: dep.slug, description: null },
      files: (dep.snapshot as Array<{ path: string; content: string; language: string | null }>) ?? [],
    };
  });
