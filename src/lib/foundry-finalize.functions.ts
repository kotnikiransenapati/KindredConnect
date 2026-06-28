// Phase G5/G6/G7 — server functions for monetization plans, onboarding journeys,
// and final-polish health reports.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import {
  DEFAULT_JOURNEYS,
  DEFAULT_PLAN_TEMPLATES,
  computePolishReport,
  type PolishInput,
} from "./foundry-finalize.shared";

const ProjectId = z.string().uuid();

async function requireRole(ctx: { userId: string }, projectId: string, role: "viewer" | "editor" | "owner") {
  const { data: allowed, error } = await supabaseAdmin.rpc("has_project_role", { _project_id: projectId, _user_id: ctx.userId, _min_role: role });
  if (error || !allowed) throw new Error("Forbidden");
}

// ---------- G5: monetization ----------
export const listMonetizationPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const { data: rows, error } = await supabaseAdmin.from("foundry_monetization_plans")
      .select("*").eq("project_id", data.projectId).order("price_cents", { ascending: true });
    if (error) throw new Error(error.message);
    return { plans: rows ?? [] };
  });

export const seedDefaultMonetizationPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const rows = DEFAULT_PLAN_TEMPLATES.map((p) => ({
      project_id: data.projectId, code: p.code, name: p.name, price_cents: p.priceCents,
      currency: p.currency, interval: p.interval,
      features: p.features as unknown as Json, quotas: p.quotas as unknown as Json,
      status: "active", created_by: context.userId,
    }));
    const { error } = await supabaseAdmin.from("foundry_monetization_plans")
      .upsert(rows, { onConflict: "project_id,code" });
    if (error) throw new Error(error.message);
    return { seeded: rows.length };
  });

export const setPlanStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; planId: string; status: "draft" | "active" | "archived" }) => ({
    projectId: ProjectId.parse(d.projectId),
    planId: z.string().uuid().parse(d.planId),
    status: z.enum(["draft", "active", "archived"]).parse(d.status),
  }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const { error } = await supabaseAdmin.from("foundry_monetization_plans")
      .update({ status: data.status }).eq("id", data.planId).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- G6: onboarding ----------
export const listOnboardingJourneys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const { data: rows, error } = await supabaseAdmin.from("foundry_onboarding_journeys")
      .select("*").eq("project_id", data.projectId).order("slug");
    if (error) throw new Error(error.message);
    return { journeys: rows ?? [] };
  });

export const seedDefaultJourneys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const rows = DEFAULT_JOURNEYS.map((j) => ({
      project_id: data.projectId, slug: j.slug, name: j.name, audience: j.audience,
      steps: j.steps as unknown as Json, completion_goal: j.completionGoal,
      enabled: true, created_by: context.userId,
    }));
    const { error } = await supabaseAdmin.from("foundry_onboarding_journeys")
      .upsert(rows, { onConflict: "project_id,slug" });
    if (error) throw new Error(error.message);
    return { seeded: rows.length };
  });

export const toggleJourney = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; journeyId: string; enabled: boolean }) => ({
    projectId: ProjectId.parse(d.projectId),
    journeyId: z.string().uuid().parse(d.journeyId),
    enabled: z.boolean().parse(d.enabled),
  }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");
    const { error } = await supabaseAdmin.from("foundry_onboarding_journeys")
      .update({ enabled: data.enabled }).eq("id", data.journeyId).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- G7: polish health ----------
export const listPolishReports = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "viewer");
    const { data: rows, error } = await supabaseAdmin.from("foundry_polish_reports")
      .select("*").eq("project_id", data.projectId).order("created_at", { ascending: false }).limit(10);
    if (error) throw new Error(error.message);
    return { reports: rows ?? [] };
  });

export const runPolishAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => ({ projectId: ProjectId.parse(d.projectId) }))
  .handler(async ({ data, context }) => {
    await requireRole(context, data.projectId, "editor");

    const [filesRes, runtimeRes, deployRes, securityRes, telemetryRes, complianceRes, journeysRes, plansRes] = await Promise.all([
      supabaseAdmin.from("project_files").select("path", { count: "exact", head: true }).eq("project_id", data.projectId),
      supabaseAdmin.from("runtime_adapter_configs").select("id", { count: "exact", head: true }).eq("project_id", data.projectId),
      supabaseAdmin.from("deploy_adapters").select("id", { count: "exact", head: true }).eq("project_id", data.projectId),
      supabaseAdmin.from("foundry_security_policies").select("id").eq("project_id", data.projectId).maybeSingle(),
      supabaseAdmin.from("foundry_telemetry_configs").select("id").eq("project_id", data.projectId).maybeSingle(),
      supabaseAdmin.from("foundry_compliance_profiles").select("id").eq("project_id", data.projectId).limit(1),
      supabaseAdmin.from("foundry_onboarding_journeys").select("id").eq("project_id", data.projectId).eq("enabled", true).limit(1),
      supabaseAdmin.from("foundry_monetization_plans").select("id").eq("project_id", data.projectId).eq("status", "active").limit(1),
    ]);

    const pathProbe = await supabaseAdmin.from("project_files").select("path").eq("project_id", data.projectId).in("path", ["public/robots.txt", "public/sitemap.xml", "public/manifest.webmanifest"]);

    const paths = new Set((pathProbe.data ?? []).map((r) => r.path as string));
    const input: PolishInput = {
      generatedFileCount: filesRes.count ?? 0,
      hasManifest: paths.has("public/manifest.webmanifest"),
      hasRobots: paths.has("public/robots.txt"),
      hasSitemap: paths.has("public/sitemap.xml"),
      hasAccessibilityFallback: true,
      hasTelemetry: Boolean(telemetryRes.data),
      hasSecurityBaseline: Boolean(securityRes.data),
      hasComplianceProfile: (complianceRes.data ?? []).length > 0,
      hasOnboardingJourney: (journeysRes.data ?? []).length > 0,
      hasMonetizationPlan: (plansRes.data ?? []).length > 0,
      deployAdapterCount: deployRes.count ?? 0,
      runtimeAdapterCount: runtimeRes.count ?? 0,
    };

    const report = computePolishReport(input);
    const { data: saved, error } = await supabaseAdmin.from("foundry_polish_reports").insert({
      project_id: data.projectId, score: report.score, grade: report.grade,
      category_scores: report.categoryScores as unknown as Json,
      findings: report.findings as unknown as Json,
      recommendations: report.recommendations as unknown as Json,
      created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    return { report: saved, computed: report };
  });
