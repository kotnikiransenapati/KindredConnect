import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { embedMany } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const EMBED_MODEL = "google/text-embedding-004";
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

function chunkText(text: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= CHUNK_SIZE) return clean.length > 0 ? [clean] : [];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    out.push(clean.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return out;
}

async function embed(values: string[]): Promise<number[][]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  const gateway = createLovableAiGatewayProvider(key);
  const { embeddings } = await embedMany({
    model: gateway.textEmbeddingModel(EMBED_MODEL),
    values,
  });
  return embeddings;
}

/** Index a single source (file or note) into the knowledge base for a project. */
export const indexKnowledgeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      sourceType: z.enum(["file", "url", "note"]),
      sourcePath: z.string().min(1).max(500),
      content: z.string().min(1).max(500_000),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canEdit } = await supabase.rpc("has_project_role", {
      _project_id: data.projectId, _user_id: userId, _min_role: "editor",
    });
    if (!canEdit) throw new Error("Forbidden");

    const chunks = chunkText(data.content);
    if (chunks.length === 0) return { ok: true, chunks: 0 };

    const embeddings = await embed(chunks);

    // Replace existing chunks for this source
    await supabase.from("knowledge_chunks")
      .delete()
      .eq("project_id", data.projectId)
      .eq("source_type", data.sourceType)
      .eq("source_path", data.sourcePath);

    const rows = chunks.map((content, i) => ({
      project_id: data.projectId,
      source_type: data.sourceType,
      source_path: data.sourcePath,
      chunk_index: i,
      content,
      tokens: Math.ceil(content.length / 4),
      embedding: embeddings[i] as unknown as string,
    }));
    const { error } = await supabase.from("knowledge_chunks").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, chunks: rows.length };
  });

/** Ingest a public URL — fetch, strip HTML, chunk, embed. */
export const ingestUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      url: z.string().url().refine((u) => /^https?:\/\//.test(u), "http(s) only"),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: canEdit } = await supabase.rpc("has_project_role", {
      _project_id: data.projectId, _user_id: userId, _min_role: "editor",
    });
    if (!canEdit) throw new Error("Forbidden");

    // SSRF guard: refuse private/loopback hosts
    const host = new URL(data.url).hostname.toLowerCase();
    if (
      host === "localhost" || host.endsWith(".local") ||
      /^10\./.test(host) || /^192\.168\./.test(host) || /^127\./.test(host) ||
      /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) throw new Error("URL host not allowed");

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    let html: string;
    try {
      const r = await fetch(data.url, {
        signal: ctrl.signal,
        headers: { "user-agent": "FoundryBot/1.0 (+https://foundry.app)" },
      });
      if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
      html = await r.text();
    } finally { clearTimeout(timeout); }

    // Strip scripts/styles, then tags; collapse whitespace
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200_000);

    if (!text) return { ok: false, error: "Empty content" };

    const chunks = chunkText(text);
    const embeddings = await embed(chunks);

    await supabase.from("knowledge_chunks")
      .delete()
      .eq("project_id", data.projectId)
      .eq("source_type", "url")
      .eq("source_path", data.url);

    const rows = chunks.map((content, i) => ({
      project_id: data.projectId,
      source_type: "url" as const,
      source_path: data.url,
      chunk_index: i,
      content,
      tokens: Math.ceil(content.length / 4),
      embedding: embeddings[i] as unknown as string,
    }));
    const { error } = await supabase.from("knowledge_chunks").insert(rows);
    if (error) throw new Error(error.message);
    return { ok: true, chunks: rows.length };
  });

/** List indexed sources for a project (grouped). */
export const listKnowledgeSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ projectId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("knowledge_chunks")
      .select("source_type, source_path, tokens, updated_at")
      .eq("project_id", data.projectId)
      .order("updated_at", { ascending: false });
    const grouped = new Map<string, { source_type: string; source_path: string; chunks: number; tokens: number; updated_at: string }>();
    for (const r of rows ?? []) {
      const k = `${r.source_type}:${r.source_path}`;
      const cur = grouped.get(k);
      if (cur) { cur.chunks += 1; cur.tokens += r.tokens; }
      else grouped.set(k, { source_type: r.source_type, source_path: r.source_path, chunks: 1, tokens: r.tokens, updated_at: r.updated_at });
    }
    return { sources: Array.from(grouped.values()) };
  });

/** Delete a single indexed source. */
export const deleteKnowledgeSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({
      projectId: z.string().uuid(),
      sourceType: z.enum(["file", "url", "note"]),
      sourcePath: z.string().min(1),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("knowledge_chunks")
      .delete()
      .eq("project_id", data.projectId)
      .eq("source_type", data.sourceType)
      .eq("source_path", data.sourcePath);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
