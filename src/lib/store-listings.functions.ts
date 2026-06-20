// Phase-2 P4: App Store / Play Store metadata + screenshot generator + submission checklist.
//
// `runStoreChecklist` validates required fields, store-specific length limits,
// privacy/support URLs, and screenshot coverage; the resulting JSON is also
// the input for `exportStoreManifest`, which writes Fastlane-compatible
// metadata into the project as `fastlane/metadata/...`.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const platform = z.enum(["ios", "android"]);

const STORE_LIMITS = {
  ios: { title: 30, subtitle: 30, shortDescription: 0, fullDescription: 4000, keywords: 100, requiredScreens: 3 },
  android: { title: 30, subtitle: 0, shortDescription: 80, fullDescription: 4000, keywords: 0, requiredScreens: 2 },
} as const;

export const getStoreListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; platform: "ios" | "android" }) =>
    z.object({ projectId: z.string().uuid(), platform }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("store_listings").select("*")
      .eq("project_id", data.projectId).eq("platform", data.platform).maybeSingle();
    return { listing: row };
  });

export const upsertStoreListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    projectId: string; platform: "ios" | "android";
    title?: string; subtitle?: string; shortDescription?: string; fullDescription?: string;
    keywords?: string[]; category?: string; contactEmail?: string;
    supportUrl?: string; privacyUrl?: string; ageRating?: string;
    screenshots?: Array<{ url: string; label?: string }>;
  }) => z.object({
    projectId: z.string().uuid(),
    platform,
    title: z.string().max(50).default(""),
    subtitle: z.string().max(50).default(""),
    shortDescription: z.string().max(80).default(""),
    fullDescription: z.string().max(4000).default(""),
    keywords: z.array(z.string().max(40)).max(40).default([]),
    category: z.string().max(40).optional(),
    contactEmail: z.string().email().optional().or(z.literal("")),
    supportUrl: z.string().url().optional().or(z.literal("")),
    privacyUrl: z.string().url().optional().or(z.literal("")),
    ageRating: z.string().max(8).default("4+"),
    screenshots: z.array(z.object({ url: z.string().url(), label: z.string().max(40).optional() })).max(20).default([]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      project_id: data.projectId, platform: data.platform,
      title: data.title, subtitle: data.subtitle,
      short_description: data.shortDescription, full_description: data.fullDescription,
      keywords: data.keywords, category: data.category ?? null,
      contact_email: data.contactEmail || null,
      support_url: data.supportUrl || null,
      privacy_url: data.privacyUrl || null,
      age_rating: data.ageRating,
      screenshots: data.screenshots as never,
    };
    const { error } = await context.supabase
      .from("store_listings")
      .upsert(payload, { onConflict: "project_id,platform" });
    if (error) throw error;
    return { ok: true };
  });

type Issue = { field: string; severity: "error" | "warn"; message: string };

export const runStoreChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; platform: "ios" | "android" }) =>
    z.object({ projectId: z.string().uuid(), platform }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: l } = await context.supabase
      .from("store_listings").select("*")
      .eq("project_id", data.projectId).eq("platform", data.platform).maybeSingle();
    if (!l) throw new Error("No listing yet — save one first.");
    const limits = STORE_LIMITS[data.platform];
    const issues: Issue[] = [];
    const req = (field: string, value: unknown, message: string) => {
      if (!value || (typeof value === "string" && !value.trim())) issues.push({ field, severity: "error", message });
    };

    req("title", l.title, "Title is required");
    if (l.title && l.title.length > limits.title) issues.push({ field: "title", severity: "error", message: `Max ${limits.title} characters` });
    if (data.platform === "ios") {
      if (l.subtitle && l.subtitle.length > limits.subtitle) issues.push({ field: "subtitle", severity: "warn", message: `Max ${limits.subtitle} chars` });
      if ((l.keywords ?? []).join(",").length > limits.keywords) issues.push({ field: "keywords", severity: "error", message: `Total keyword string > ${limits.keywords} chars` });
    } else {
      req("short_description", l.short_description, "Short description is required for Play Store");
      if (l.short_description && l.short_description.length > limits.shortDescription) issues.push({ field: "short_description", severity: "error", message: `Max ${limits.shortDescription} chars` });
    }
    req("full_description", l.full_description, "Full description is required");
    req("privacy_url", l.privacy_url, "Privacy policy URL is required");
    req("contact_email", l.contact_email, "Contact email is required");
    req("support_url", l.support_url, "Support URL is recommended");
    req("category", l.category, "Category is required");
    const shots = Array.isArray(l.screenshots) ? (l.screenshots as Array<{ url: string }>) : [];
    if (shots.length < limits.requiredScreens) issues.push({ field: "screenshots", severity: "error", message: `Need at least ${limits.requiredScreens} screenshots` });

    const errors = issues.filter((i) => i.severity === "error").length;
    const warns = issues.filter((i) => i.severity === "warn").length;
    const status = errors === 0 ? "ready" : "blocked";
    const score = Math.max(0, 100 - errors * 15 - warns * 4);

    await context.supabase.from("store_listings").update({
      checklist: { status, score, errors, warns, issues } as never,
      status,
    }).eq("project_id", data.projectId).eq("platform", data.platform);

    return { status, score, errors, warns, issues };
  });

export const exportStoreManifest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string; platform: "ios" | "android" }) =>
    z.object({ projectId: z.string().uuid(), platform }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: l } = await context.supabase
      .from("store_listings").select("*")
      .eq("project_id", data.projectId).eq("platform", data.platform).maybeSingle();
    if (!l) throw new Error("No listing");

    const base = `fastlane/metadata/${data.platform}/en-US`;
    const files: { path: string; content: string }[] = [
      { path: `${base}/name.txt`, content: l.title ?? "" },
      { path: `${base}/subtitle.txt`, content: l.subtitle ?? "" },
      { path: `${base}/description.txt`, content: l.full_description ?? "" },
      { path: `${base}/keywords.txt`, content: (l.keywords ?? []).join(", ") },
      { path: `${base}/privacy_url.txt`, content: l.privacy_url ?? "" },
      { path: `${base}/support_url.txt`, content: l.support_url ?? "" },
      { path: `${base}/marketing_url.txt`, content: "" },
      { path: `${base}/release_notes.txt`, content: `v${new Date().toISOString().slice(0, 10)} — automated release.` },
    ];
    if (data.platform === "android") {
      files.push({ path: `${base}/short_description.txt`, content: l.short_description ?? "" });
    }
    for (const f of files) {
      const { error } = await context.supabase.from("project_files")
        .upsert({ project_id: data.projectId, path: f.path, content: f.content }, { onConflict: "project_id,path" });
      if (error) throw error;
    }
    return { written: files.map((f) => f.path) };
  });
