// P33 — AI release-notes generator.
// Takes commit/changelog input + tone/language/platform context and produces
// structured release notes (markdown summary, highlight bullets, breaking
// changes). Uses the Lovable AI Gateway when available, with a deterministic
// heuristic fallback so the pipeline always works offline.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ChannelZ = z.enum(["production","beta","internal"]);
const PlatformZ = z.enum(["ios","android","web","all"]);
const ToneZ = z.enum(["friendly","formal","playful","technical"]);
const StatusZ = z.enum(["draft","approved","published","archived"]);

const CommitZ = z.object({
  sha: z.string().min(4).max(64).optional(),
  message: z.string().min(1).max(500),
  author: z.string().max(120).optional(),
  type: z.string().max(32).optional(),
});

async function assertEditor(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "editor",
  });
  if (error || !data) throw new Error("Forbidden");
}
async function assertViewer(ctx: any, projectId: string) {
  const { data, error } = await ctx.supabase.rpc("has_project_role", {
    _project_id: projectId, _user_id: ctx.userId, _min_role: "viewer",
  });
  if (error || !data) throw new Error("Forbidden");
}
async function rateLimit(ctx: any, bucket: string, max: number) {
  const { data, error } = await ctx.supabase.rpc("check_rate_limit", {
    _user_id: ctx.userId, _bucket: bucket, _window: "1 minute", _max: max,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Rate limit exceeded");
}

// ---------- Classification heuristics ----------
const FEAT_RE = /^(feat|feature|add|new)[\(:\s]/i;
const FIX_RE = /^(fix|bug|patch|hotfix)[\(:\s]/i;
const PERF_RE = /^(perf|performance|optimi[sz]e)[\(:\s]/i;
const BREAK_RE = /(breaking|!:)/i;
const CHORE_RE = /^(chore|refactor|style|docs|test|ci|build)[\(:\s]/i;

type Commit = z.infer<typeof CommitZ>;
type Classified = { kind: "feat"|"fix"|"perf"|"breaking"|"chore"|"other"; text: string; sha?: string };

function classify(commits: Commit[]): Classified[] {
  return commits.map((c) => {
    const m = c.message.trim();
    let kind: Classified["kind"] = "other";
    if (BREAK_RE.test(m)) kind = "breaking";
    else if (FEAT_RE.test(m)) kind = "feat";
    else if (FIX_RE.test(m)) kind = "fix";
    else if (PERF_RE.test(m)) kind = "perf";
    else if (CHORE_RE.test(m)) kind = "chore";
    // Strip conventional prefix for cleaner copy.
    const text = m.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, "").replace(/\s+/g, " ").trim();
    return { kind, text, sha: c.sha };
  });
}

const TONE_OPENERS: Record<string, string[]> = {
  friendly: ["Heads up — here's what's new.", "Fresh updates just landed!", "A little update, a lot to love."],
  formal:   ["This release introduces the following changes.", "Summary of changes in this release."],
  playful:  ["Buckle up — new stuff inside!", "Shiny new things ✨"],
  technical:["Release summary, by change type."],
};

function pickOpener(tone: string, seed: string) {
  const arr = TONE_OPENERS[tone] ?? TONE_OPENERS.friendly;
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return arr[h % arr.length];
}

function heuristicGenerate(args: {
  commits: Commit[]; version: string; platform: string; channel: string; tone: string;
}): { summary_md: string; highlights: string[]; breaking: string[] } {
  const cls = classify(args.commits);
  const features = cls.filter(c => c.kind === "feat");
  const fixes = cls.filter(c => c.kind === "fix");
  const perf = cls.filter(c => c.kind === "perf");
  const breaking = cls.filter(c => c.kind === "breaking");
  const opener = pickOpener(args.tone, `${args.version}|${args.platform}`);

  const highlights: string[] = [];
  for (const c of features.slice(0, 6)) highlights.push(`✨ ${c.text}`);
  for (const c of perf.slice(0, 3)) highlights.push(`⚡ ${c.text}`);
  for (const c of fixes.slice(0, 4)) highlights.push(`🐛 ${c.text}`);
  if (!highlights.length && cls.length) highlights.push(...cls.slice(0, 5).map(c => `• ${c.text}`));

  const breakingList = breaking.map(b => b.text);

  const lines: string[] = [];
  lines.push(`# ${args.version}`);
  lines.push("");
  lines.push(`_${opener}_`);
  lines.push("");
  if (features.length) {
    lines.push("## New features");
    for (const f of features) lines.push(`- ${f.text}`);
    lines.push("");
  }
  if (perf.length) {
    lines.push("## Performance");
    for (const p of perf) lines.push(`- ${p.text}`);
    lines.push("");
  }
  if (fixes.length) {
    lines.push("## Fixes");
    for (const f of fixes) lines.push(`- ${f.text}`);
    lines.push("");
  }
  if (breakingList.length) {
    lines.push("## ⚠️ Breaking changes");
    for (const b of breakingList) lines.push(`- ${b}`);
    lines.push("");
  }
  lines.push(`_Channel: ${args.channel} · Platform: ${args.platform}_`);
  return { summary_md: lines.join("\n").trim(), highlights, breaking: breakingList };
}

// Optional Lovable AI Gateway path (best-effort, falls back on failure).
async function aiGenerate(args: {
  commits: Commit[]; version: string; platform: string; channel: string; tone: string; language: string;
}): Promise<{ summary_md: string; highlights: string[]; breaking: string[] } | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  const prompt = [
    `You write product release notes. Output strict JSON: {"summary_md":string,"highlights":string[],"breaking":string[]}.`,
    `Version: ${args.version}. Channel: ${args.channel}. Platform: ${args.platform}. Tone: ${args.tone}. Language: ${args.language}.`,
    `Group by features / performance / fixes / breaking. Use short user-facing language. No marketing fluff.`,
    `Commits:`,
    ...args.commits.slice(0, 80).map((c, i) => `${i + 1}. ${c.message}`),
  ].join("\n");
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You generate JSON-only release notes. Never include prose outside JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const txt: string = j?.choices?.[0]?.message?.content ?? "";
    const match = txt.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.summary_md !== "string") return null;
    return {
      summary_md: String(parsed.summary_md),
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights.slice(0, 20).map(String) : [],
      breaking: Array.isArray(parsed.breaking) ? parsed.breaking.slice(0, 20).map(String) : [],
    };
  } catch { return null; }
}

// ---------- Server functions ----------
export const generateReleaseNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    projectId: z.string().uuid(),
    version: z.string().min(1).max(40),
    channel: ChannelZ.default("production"),
    platform: PlatformZ.default("all"),
    tone: ToneZ.default("friendly"),
    language: z.string().min(2).max(10).default("en"),
    commits: z.array(CommitZ).min(1).max(200),
    persistAsDraft: z.boolean().default(true),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    await rateLimit(context, "release_notes_gen", 20);
    const ai = await aiGenerate(data);
    const out = ai ?? heuristicGenerate(data);
    let row = null;
    if (data.persistAsDraft) {
      const { data: ins, error } = await context.supabase.from("release_notes").insert({
        project_id: data.projectId,
        version: data.version,
        channel: data.channel,
        platform: data.platform,
        tone: data.tone,
        language: data.language,
        source_commits: data.commits,
        summary_md: out.summary_md,
        highlights: out.highlights,
        breaking: out.breaking,
        status: "draft",
        created_by: context.userId,
      }).select("*").single();
      if (error) throw new Error(error.message);
      row = ins;
    }
    return { generated: out, draft: row, provider: ai ? "ai" : "heuristic" };
  });

export const listReleaseNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    projectId: z.string().uuid(),
    status: StatusZ.optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertViewer(context, data.projectId);
    let q = context.supabase.from("release_notes").select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateReleaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    summary_md: z.string().max(20000).optional(),
    highlights: z.array(z.string().max(280)).max(40).optional(),
    breaking: z.array(z.string().max(280)).max(40).optional(),
    status: StatusZ.optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const patch: {
      summary_md?: string; highlights?: string[]; breaking?: string[];
      status?: "draft"|"approved"|"published"|"archived"; published_at?: string;
    } = {};
    if (data.summary_md !== undefined) patch.summary_md = data.summary_md;
    if (data.highlights !== undefined) patch.highlights = data.highlights;
    if (data.breaking !== undefined) patch.breaking = data.breaking;
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "published") patch.published_at = new Date().toISOString();
    }
    const { data: row, error } = await context.supabase.from("release_notes")
      .update(patch).eq("id", data.id).eq("project_id", data.projectId)
      .select("*").single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteReleaseNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(), projectId: z.string().uuid(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await assertEditor(context, data.projectId);
    const { error } = await context.supabase.from("release_notes")
      .delete().eq("id", data.id).eq("project_id", data.projectId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
