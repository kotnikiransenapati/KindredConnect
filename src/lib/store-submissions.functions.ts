// P24 — Store submission automation.
// End-to-end App Store / Play Store submission tracker: draft → validation → submission
// → in-review → approved/rejected → released. Validates the linked store_listing against
// platform-specific requirements before allowing submission, records every status
// transition in store_submission_events.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PlatformZ = z.enum(["ios", "android"]);
const TrackZ = z.enum(["production", "beta", "internal", "alpha", "testflight"]);
const StatusZ = z.enum([
  "draft", "validating", "validation_failed", "submitted",
  "in_review", "approved", "rejected", "released", "withdrawn",
]);

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["validating", "withdrawn"],
  validating: ["validation_failed", "submitted", "draft"],
  validation_failed: ["draft", "validating"],
  submitted: ["in_review", "rejected", "withdrawn"],
  in_review: ["approved", "rejected", "withdrawn"],
  approved: ["released", "withdrawn"],
  rejected: ["draft", "withdrawn"],
  released: [],
  withdrawn: ["draft"],
};

type Finding = { severity: "error" | "warning" | "info"; message: string; field?: string };

async function recordEvent(
  supabase: any, submissionId: string, projectId: string, event: string,
  status: string | null, detail: string | null, actorId: string,
  metadata: Record<string, any> = {},
) {
  await supabase.from("store_submission_events").insert({
    submission_id: submissionId, project_id: projectId, event,
    status, detail, actor_id: actorId, metadata,
  });
}

/* ----------------------------- Queries ------------------------------ */
export const listSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("store_submissions")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return { items: rows ?? [] };
  });

export const listSubmissionEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("store_submission_events")
      .select("*").eq("submission_id", data.submissionId)
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return { items: rows ?? [] };
  });

/* ----------------------------- Create / mutate ------------------------------ */
export const createSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    platform: PlatformZ,
    track: TrackZ.default("production"),
    versionName: z.string().regex(/^\d+\.\d+(\.\d+)?(-[A-Za-z0-9.-]+)?$/),
    versionCode: z.string().max(20).optional(),
    listingId: z.string().uuid().optional(),
    buildId: z.string().uuid().optional(),
    releaseNotes: z.string().max(4000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "store_submission_create", _window: "00:01:00", _max: 6,
    });
    if (ok.error) throw ok.error;
    if (ok.data === false) throw new Error("Rate limit exceeded");

    const { data: row, error } = await context.supabase.from("store_submissions").insert({
      project_id: data.projectId, platform: data.platform, track: data.track,
      version_name: data.versionName, version_code: data.versionCode ?? null,
      listing_id: data.listingId ?? null, build_id: data.buildId ?? null,
      release_notes: data.releaseNotes ?? null, status: "draft",
      created_by: context.userId,
    }).select("*").single();
    if (error) throw error;
    await recordEvent(context.supabase, row.id, data.projectId, "created", "draft", null, context.userId);
    return { submission: row };
  });

/** Platform-aware validation: re-checks the linked listing + build + release notes. */
async function validateSubmission(supabase: any, sub: any): Promise<{ findings: Finding[]; ok: boolean }> {
  const findings: Finding[] = [];
  // Listing checks
  let listing: any = null;
  if (sub.listing_id) {
    const { data } = await supabase.from("store_listings").select("*").eq("id", sub.listing_id).maybeSingle();
    listing = data;
  }
  if (!listing) findings.push({ severity: "error", message: "No store listing attached. Create one in Store Listings first.", field: "listing_id" });
  else {
    if (!listing.title || listing.title.length < 2) findings.push({ severity: "error", message: "Listing title is empty.", field: "title" });
    if (sub.platform === "ios" && (listing.title?.length ?? 0) > 30) findings.push({ severity: "error", message: "iOS title must be ≤30 chars.", field: "title" });
    if (sub.platform === "android" && (listing.title?.length ?? 0) > 30) findings.push({ severity: "error", message: "Play title must be ≤30 chars.", field: "title" });
    if (!listing.full_description) findings.push({ severity: "error", message: "Full description is required.", field: "full_description" });
    if (sub.platform === "ios" && (listing.full_description?.length ?? 0) > 4000) findings.push({ severity: "error", message: "iOS description must be ≤4000 chars.", field: "full_description" });
    if (sub.platform === "android" && (listing.full_description?.length ?? 0) > 4000) findings.push({ severity: "error", message: "Play description must be ≤4000 chars.", field: "full_description" });
    if (!listing.privacy_url) findings.push({ severity: "error", message: "Privacy policy URL is required.", field: "privacy_url" });
    if (!listing.contact_email) findings.push({ severity: "error", message: "Contact email is required.", field: "contact_email" });
    const minScreens = sub.platform === "ios" ? 3 : 2;
    const screens = Array.isArray(listing.screenshots) ? listing.screenshots.length : 0;
    if (screens < minScreens) findings.push({ severity: "error", message: `Need at least ${minScreens} screenshots for ${sub.platform}.`, field: "screenshots" });
    if (sub.platform === "ios") {
      const kw = Array.isArray(listing.keywords) ? listing.keywords.join(",") : "";
      if (kw.length > 100) findings.push({ severity: "error", message: "iOS keyword string exceeds 100 chars.", field: "keywords" });
    }
  }
  // Build link
  if (!sub.build_id) findings.push({ severity: "warning", message: "No build attached. Attach a successful release build before submitting." });
  else {
    const { data: b } = await supabase.from("mobile_builds").select("status,platform,build_type,version_name").eq("id", sub.build_id).maybeSingle();
    if (!b) findings.push({ severity: "error", message: "Attached build not found.", field: "build_id" });
    else {
      if (b.platform !== sub.platform) findings.push({ severity: "error", message: `Build platform (${b.platform}) does not match submission (${sub.platform}).` });
      if (b.status !== "success") findings.push({ severity: "error", message: `Build status is "${b.status}", must be "success".` });
      if (b.build_type !== "release") findings.push({ severity: "error", message: `Build is "${b.build_type}", release submissions require a release build.` });
      if (b.version_name !== sub.version_name) findings.push({ severity: "warning", message: `Submission version (${sub.version_name}) differs from build version (${b.version_name}).` });
    }
  }
  // Release notes
  if (!sub.release_notes) findings.push({ severity: "warning", message: "Release notes are empty." });
  else if (sub.release_notes.length > 4000) findings.push({ severity: "error", message: "Release notes exceed 4000 chars." });

  const ok = !findings.some((f) => f.severity === "error");
  return { findings, ok };
}

export const runValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: sub, error } = await context.supabase.from("store_submissions").select("*").eq("id", data.submissionId).single();
    if (error) throw error;
    await context.supabase.from("store_submissions").update({ status: "validating" }).eq("id", sub.id);
    await recordEvent(context.supabase, sub.id, sub.project_id, "validation_start", "validating", null, context.userId);
    const { findings, ok } = await validateSubmission(context.supabase, sub);
    const nextStatus = ok ? "draft" : "validation_failed";
    await context.supabase.from("store_submissions").update({
      status: nextStatus, validation_report: { findings, ran_at: new Date().toISOString(), ok },
    }).eq("id", sub.id);
    await recordEvent(context.supabase, sub.id, sub.project_id, "validation_complete", nextStatus,
      `${findings.length} findings (${findings.filter((f) => f.severity === "error").length} errors)`,
      context.userId, { findings });
    return { ok, findings };
  });

export const submitToStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    submissionId: z.string().uuid(),
    externalSubmissionId: z.string().max(120).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: sub, error } = await context.supabase.from("store_submissions").select("*").eq("id", data.submissionId).single();
    if (error) throw error;
    const report = (sub.validation_report ?? {}) as { ok?: boolean };
    if (!report.ok) throw new Error("Submission has not passed validation.");
    if (!ALLOWED_TRANSITIONS.draft.includes("submitted") && sub.status !== "draft") {
      throw new Error(`Cannot submit from status "${sub.status}".`);
    }
    const now = new Date().toISOString();
    const { error: e2 } = await context.supabase.from("store_submissions").update({
      status: "submitted", submitted_at: now,
      external_submission_id: data.externalSubmissionId ?? null,
    }).eq("id", sub.id);
    if (e2) throw e2;
    await recordEvent(context.supabase, sub.id, sub.project_id, "submitted", "submitted",
      data.externalSubmissionId ? `External ID: ${data.externalSubmissionId}` : null, context.userId);
    return { ok: true };
  });

export const transitionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    submissionId: z.string().uuid(),
    nextStatus: StatusZ,
    reviewerNotes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: sub, error } = await context.supabase.from("store_submissions").select("*").eq("id", data.submissionId).single();
    if (error) throw error;
    const allowed = ALLOWED_TRANSITIONS[sub.status] ?? [];
    if (!allowed.includes(data.nextStatus)) {
      throw new Error(`Cannot transition ${sub.status} → ${data.nextStatus}`);
    }
    const patch: { status: typeof data.nextStatus; reviewed_at?: string; reviewer_notes?: string | null } = { status: data.nextStatus };
    if (["in_review", "approved", "rejected"].includes(data.nextStatus)) patch.reviewed_at = new Date().toISOString();
    if (data.reviewerNotes !== undefined) patch.reviewer_notes = data.reviewerNotes;
    const { error: e2 } = await context.supabase.from("store_submissions").update(patch).eq("id", sub.id);
    if (e2) throw e2;
    await recordEvent(context.supabase, sub.id, sub.project_id, `status:${data.nextStatus}`, data.nextStatus, data.reviewerNotes ?? null, context.userId);
    return { ok: true };
  });

export const deleteSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ submissionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("store_submissions").delete().eq("id", data.submissionId);
    if (error) throw error;
    return { ok: true };
  });
