// P23 — Crash & telemetry pipeline
// Ingest crash reports from shipped iOS / Android / Web apps, symbolicate stack traces
// using uploaded source-maps / dSYM / ProGuard mappings, group by fingerprint, and
// surface a live console for editors. Public ingest endpoint lives at
// /api/public/crash/ingest (HMAC-signed).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PlatformZ = z.enum(["ios", "android", "web"]);
const SeverityZ = z.enum(["fatal", "error", "warning", "info"]);
const KindZ = z.enum(["sourcemap", "dsym", "proguard"]);

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Stable per-issue fingerprint = first 3 stack frames + message kind. */
export function computeFingerprint(message: string, stackRaw: string) {
  const head = (stackRaw || "").split(/\r?\n/).slice(0, 3).join("|").replace(/0x[0-9a-f]+/gi, "0x?").replace(/:\d+:\d+/g, "");
  return (message.split(/[:\n]/)[0] || "error").trim().slice(0, 80) + "::" + head.slice(0, 240);
}

/* ------------------------------- Symbol maps ------------------------------ */
export const listSymbolMaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("symbol_maps")
      .select("id,platform,app_version,build_number,kind,file_name,size_bytes,created_at")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { items: rows ?? [] };
  });

export const uploadSymbolMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    platform: PlatformZ,
    appVersion: z.string().regex(/^\d+\.\d+(\.\d+)?(-[A-Za-z0-9.-]+)?$/, "Use semver, e.g. 1.2.3"),
    buildNumber: z.string().max(40).optional(),
    kind: KindZ,
    fileName: z.string().min(1).max(200),
    content: z.string().min(1).max(8_000_000),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("check_rate_limit", {
      _user_id: context.userId, _bucket: "symbol_upload", _window: "00:01:00", _max: 10,
    });
    if (ok.error) throw ok.error;
    if (ok.data === false) throw new Error("Rate limit exceeded");
    const { data: row, error } = await context.supabase
      .from("symbol_maps")
      .insert({
        project_id: data.projectId, platform: data.platform, app_version: data.appVersion,
        build_number: data.buildNumber ?? null, kind: data.kind, file_name: data.fileName,
        size_bytes: data.content.length, content: data.content, uploaded_by: context.userId,
      })
      .select("id").single();
    if (error) throw error;
    return { id: row.id };
  });

export const deleteSymbolMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("symbol_maps").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ------------------------------ Crash reports ----------------------------- */
export const listCrashReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    days: z.number().int().min(1).max(90).default(14),
    platform: PlatformZ.optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    let q = context.supabase.from("crash_reports").select("*")
      .eq("project_id", data.projectId).gte("occurred_at", since)
      .order("occurred_at", { ascending: false }).limit(300);
    if (data.platform) q = q.eq("platform", data.platform);
    const { data: rows, error } = await q;
    if (error) throw error;
    // group by fingerprint
    const groups = new Map<string, { fingerprint: string; count: number; last: string; sample: any }>();
    for (const r of rows ?? []) {
      const g = groups.get(r.fingerprint);
      if (g) { g.count++; if (r.occurred_at > g.last) { g.last = r.occurred_at; g.sample = r; } }
      else groups.set(r.fingerprint, { fingerprint: r.fingerprint, count: 1, last: r.occurred_at, sample: r });
    }
    return { items: rows ?? [], groups: Array.from(groups.values()).sort((a, b) => b.count - a.count) };
  });

/** Tiny heuristic symbolicator: rewrite frames using the most-recent matching map. */
async function symbolicateStack(
  raw: string,
  maps: Array<{ kind: string; content: string }>,
): Promise<string> {
  if (!maps.length) return raw;
  // Build a flat name→pretty map from any uploaded mapping file.
  // Supports ProGuard `a.b -> com.app.Foo:` / `a -> realMethod:` and Sourcemap JSON `names`.
  const dict = new Map<string, string>();
  for (const m of maps) {
    if (m.kind === "proguard") {
      for (const line of m.content.split(/\r?\n/)) {
        const mm = line.match(/^\s*([A-Za-z0-9_$.]+)\s*->\s*([A-Za-z0-9_$.]+)\s*:?\s*$/);
        if (mm) dict.set(mm[2], mm[1]);
        const mn = line.match(/^\s*\d+:\d+:[^:]+\s+([A-Za-z0-9_$<>]+)\(.*\)\s+->\s+([A-Za-z0-9_$<>]+)/);
        if (mn) dict.set(mn[2], mn[1]);
      }
    } else if (m.kind === "sourcemap") {
      try {
        const j = JSON.parse(m.content);
        const names: string[] = Array.isArray(j?.names) ? j.names : [];
        for (const n of names) if (typeof n === "string" && n.length > 1) dict.set(n, n);
      } catch { /* ignore */ }
    } else if (m.kind === "dsym") {
      for (const line of m.content.split(/\r?\n/)) {
        const mm = line.match(/0x[0-9a-fA-F]+\s+([A-Za-z_][A-Za-z0-9_$:\.]+)/);
        if (mm) dict.set(mm[0].split(/\s+/)[0], mm[1]);
      }
    }
  }
  if (!dict.size) return raw;
  return raw.replace(/[A-Za-z_$][A-Za-z0-9_$.]{2,}/g, (tok) => dict.get(tok) ?? tok);
}

export const symbolicateCrash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("crash_reports").select("*").eq("id", data.id).single();
    if (error) throw error;
    const { data: maps } = await context.supabase
      .from("symbol_maps")
      .select("kind,content,build_number")
      .eq("project_id", row.project_id).eq("platform", row.platform).eq("app_version", row.app_version)
      .limit(20);
    const symbolicated = await symbolicateStack(row.stack_raw, (maps ?? []) as any);
    const { error: e2 } = await context.supabase.from("crash_reports")
      .update({ stack_symbolicated: symbolicated, symbolicated: true }).eq("id", data.id);
    if (e2) throw e2;
    return { ok: true, stack: symbolicated };
  });

export const deleteCrashReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("crash_reports").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Submit a test crash from the dashboard (so editors can verify the pipeline). */
export const submitTestCrash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    projectId: z.string().uuid(),
    platform: PlatformZ,
    appVersion: z.string().default("1.0.0"),
    message: z.string().default("TestException: dashboard-triggered crash"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const stack = `at MainActivity.onCreate(MainActivity.java:42)\nat com.app.Foo.bar(Foo.kt:18)\nat Runtime.invoke(Runtime.cpp:120)`;
    const fp = computeFingerprint(data.message, stack);
    const { error } = await context.supabase.from("crash_reports").insert({
      project_id: data.projectId, platform: data.platform, app_version: data.appVersion,
      fingerprint: fp, message: data.message, stack_raw: stack, severity: "error",
      device_model: "Dashboard Test", os_version: "n/a",
      metadata: { source: "dashboard", actor: context.userId },
    });
    if (error) throw error;
    return { ok: true, fingerprint: fp };
  });

// Re-export internal helper used by public ingest route.
export const _ingest = { sha256Hex, computeFingerprint };
