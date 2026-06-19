import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { parse as babelParse } from "@babel/parser";
import { createTwoFilesPatch } from "diff";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

/** Parse JS/TS/JSX/TSX with Babel — returns syntax errors (no type-checking). */
function lintSource(path: string, content: string): { ok: boolean; errors: { line: number; column: number; message: string }[] } {
  const isTs = /\.(ts|tsx)$/.test(path);
  const isJsx = /\.(jsx|tsx)$/.test(path);
  if (!/\.(jsx?|tsx?|mjs|cjs)$/.test(path)) return { ok: true, errors: [] };
  try {
    babelParse(content, {
      sourceType: "module",
      allowReturnOutsideFunction: false,
      errorRecovery: true,
      plugins: [
        isJsx ? "jsx" : null,
        isTs ? "typescript" : null,
        "decorators-legacy",
        "classProperties",
        "topLevelAwait",
      ].filter(Boolean) as never,
    });
    return { ok: true, errors: [] };
  } catch (e) {
    const err = e as { loc?: { line: number; column: number }; message?: string };
    return {
      ok: false,
      errors: [{ line: err.loc?.line ?? 0, column: err.loc?.column ?? 0, message: err.message ?? "Parse error" }],
    };
  }
}

function makePatch(path: string, oldContent: string, newContent: string): string {
  const patch = createTwoFilesPatch(path, path, oldContent, newContent, "", "", { context: 3 });
  return patch.length > 16_000 ? patch.slice(0, 16_000) + "\n... (truncated)" : patch;
}

const SYSTEM_PROMPT_BASE = `You are Foundry, an expert AI software engineer that builds web apps inside a sandboxed workspace.

PIPELINE (follow strictly):
1. Plan: briefly state your intent in one sentence before tool calls.
2. Read: if a file likely exists, call readFile before overwriting blindly.
3. Search: use searchFiles to discover where a symbol/text lives.
4. Write: produce COMPLETE, runnable files. Never use ellipsis/placeholders/"... rest unchanged".
5. Verify: after edits, summarize what changed in 1-3 sentences.

STACK:
- React 18 + TypeScript + Tailwind utility classes. Entry: /App.tsx.
- Use functional components, hooks, semantic HTML, accessible markup.
- Keep components small (<200 lines), split into /components/* when appropriate.
- No secrets, no backend code, no network calls to private APIs.

TOOL DISCIPLINE:
- Never invent tools. Only call the provided tool names.
- Prefer writeFile over deleteFile+writeFile. Use renameFile for moves.
- After writeFile, inspect the returned 'lint' object. If lint.ok is false, immediately call writeFile again with corrected content. Repeat until clean (max 3 attempts per file).
- Stop calling tools once the user's request is satisfied and all touched files lint cleanly.`;

const BodySchema = z.object({
  messages: z.array(z.any()).min(1).max(200),
  projectId: z.string().uuid(),
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        if (!auth.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
        const token = auth.slice(7);

        const url = process.env.SUPABASE_URL;
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const lovableKey = process.env.LOVABLE_API_KEY;
        if (!url || !anon || !lovableKey) return new Response("Server misconfigured", { status: 500 });

        const supabase = createClient<Database>(url, anon, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims } = await supabase.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        let body: z.infer<typeof BodySchema>;
        try {
          body = BodySchema.parse(await request.json());
        } catch {
          return new Response("Invalid request body", { status: 400 });
        }
        const { messages, projectId } = body;

        // Verify access (owner OR member as editor+) via security-definer fn
        const { data: canEdit } = await supabase.rpc("has_project_role", {
          _project_id: projectId, _user_id: userId, _min_role: "editor",
        });
        if (!canEdit) return new Response("Project not found or insufficient permission", { status: 403 });

        // Rate limit: 20 messages/minute, 200/day per user (service-role bypasses RLS)
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [perMin, perDay] = await Promise.all([
          supabaseAdmin.rpc("check_rate_limit", { _user_id: userId, _bucket: "chat_min", _window: "1 minute", _max: 20 }),
          supabaseAdmin.rpc("check_rate_limit", { _user_id: userId, _bucket: "chat_day", _window: "1 day", _max: 200 }),
        ]);
        if (perMin.data === false || perDay.data === false) {
          return new Response("Rate limit exceeded. Try again later.", { status: 429 });
        }

        // Persist the latest user message
        const lastMsg = messages[messages.length - 1] as UIMessage;
        if (lastMsg?.role === "user") {
          await supabase.from("messages").insert({
            project_id: projectId, user_id: userId, role: "user",
            parts: lastMsg.parts as unknown as Database["public"]["Tables"]["messages"]["Insert"]["parts"],
          });
        }

        const promptChars = JSON.stringify(messages).length;
        const gateway = createLovableAiGatewayProvider(lovableKey);
        const modelId = "google/gemini-3-flash-preview";
        const model = gateway(modelId);


        const tools = {
          writeFile: tool({
            description: "Create or overwrite a file with COMPLETE contents. Result includes a unified diff and lint errors (if any). If lint.ok is false, FIX the syntax error and call writeFile again.",
            inputSchema: z.object({
              path: z.string().min(1).max(255).describe("Absolute path starting with /"),
              content: z.string().max(200_000),
              language: z.string().max(40).optional(),
            }),
            execute: async ({ path, content, language }) => {
              const normalized = path.startsWith("/") ? path : `/${path}`;
              const lint = lintSource(normalized, content);
              const { data: existing } = await supabase
                .from("project_files").select("id, version, content")
                .eq("project_id", projectId).eq("path", normalized).maybeSingle();
              const oldContent = existing?.content ?? "";
              const patch = makePatch(normalized, oldContent, content);
              if (existing) {
                const { error } = await supabase.from("project_files")
                  .update({ content, language: language ?? null, version: existing.version + 1 })
                  .eq("id", existing.id);
                if (error) return { ok: false, error: error.message };
                return { ok: true, path: normalized, action: "updated", version: existing.version + 1, lint, patch };
              }
              const { error } = await supabase.from("project_files").insert({
                project_id: projectId, path: normalized, content, language: language ?? null,
              });
              if (error) return { ok: false, error: error.message };
              return { ok: true, path: normalized, action: "created", version: 1, lint, patch };
            },
          }),
          lintFile: tool({
            description: "Run syntax/parse check on a file already in the project. Use to verify before declaring done.",
            inputSchema: z.object({ path: z.string().min(1).max(255) }),
            execute: async ({ path }) => {
              const normalized = path.startsWith("/") ? path : `/${path}`;
              const { data } = await supabase.from("project_files")
                .select("content").eq("project_id", projectId).eq("path", normalized).maybeSingle();
              if (!data) return { ok: false, error: "Not found" };
              return { path: normalized, ...lintSource(normalized, data.content) };
            },
          }),
          deleteFile: tool({
            description: "Delete a file from the project.",
            inputSchema: z.object({ path: z.string().min(1).max(255) }),
            execute: async ({ path }) => {
              const normalized = path.startsWith("/") ? path : `/${path}`;
              const { error } = await supabase.from("project_files")
                .delete().eq("project_id", projectId).eq("path", normalized);
              if (error) return { ok: false, error: error.message };
              return { ok: true, path: normalized, action: "deleted" };
            },
          }),
          readFile: tool({
            description: "Read an existing file from the project.",
            inputSchema: z.object({ path: z.string().min(1).max(255) }),
            execute: async ({ path }) => {
              const normalized = path.startsWith("/") ? path : `/${path}`;
              const { data } = await supabase.from("project_files")
                .select("content, language, version").eq("project_id", projectId).eq("path", normalized).maybeSingle();
              if (!data) return { ok: false, error: "Not found" };
              return { ok: true, ...data };
            },
          }),
          listFiles: tool({
            description: "List all files in the project.",
            inputSchema: z.object({}),
            execute: async () => {
              const { data } = await supabase.from("project_files")
                .select("path, version").eq("project_id", projectId).order("path");
              return { files: data ?? [] };
            },
          }),
          searchFiles: tool({
            description: "Case-insensitive substring search across file contents. Returns up to 20 matching paths with a snippet.",
            inputSchema: z.object({ query: z.string().min(1).max(200) }),
            execute: async ({ query }) => {
              const { data } = await supabase.from("project_files")
                .select("path, content")
                .eq("project_id", projectId)
                .ilike("content", `%${query}%`)
                .limit(20);
              return {
                matches: (data ?? []).map((f) => {
                  const idx = f.content.toLowerCase().indexOf(query.toLowerCase());
                  const start = Math.max(0, idx - 60);
                  const end = Math.min(f.content.length, idx + query.length + 60);
                  return { path: f.path, snippet: f.content.slice(start, end) };
                }),
              };
            },
          }),
          renameFile: tool({
            description: "Rename or move a file in the project.",
            inputSchema: z.object({
              from: z.string().min(1).max(255),
              to: z.string().min(1).max(255),
            }),
            execute: async ({ from, to }) => {
              const src = from.startsWith("/") ? from : `/${from}`;
              const dst = to.startsWith("/") ? to : `/${to}`;
              const { data: existing } = await supabase.from("project_files")
                .select("id, version").eq("project_id", projectId).eq("path", src).maybeSingle();
              if (!existing) return { ok: false, error: "Source not found" };
              const { error } = await supabase.from("project_files")
                .update({ path: dst, version: existing.version + 1 })
                .eq("id", existing.id);
              if (error) return { ok: false, error: error.message };
              return { ok: true, from: src, to: dst };
            },
          }),
        };

        // Inject current file index into the system prompt so the model has context
        const { data: fileIndex } = await supabase
          .from("project_files")
          .select("path, version")
          .eq("project_id", projectId)
          .order("path")
          .limit(200);
        const indexBlock = fileIndex && fileIndex.length > 0
          ? `\n\nCURRENT PROJECT FILES (${fileIndex.length}):\n${fileIndex.map((f) => `- ${f.path} (v${f.version})`).join("\n")}`
          : "\n\nCURRENT PROJECT FILES: (empty — start by creating /App.tsx)";

        // RAG: pull top-K knowledge chunks relevant to the latest user message
        let knowledgeBlock = "";
        try {
          const userText = (lastMsg?.parts ?? [])
            .filter((p): p is { type: "text"; text: string } => (p as { type?: string }).type === "text")
            .map((p) => p.text).join(" ").slice(0, 2000);
          if (userText && userText.trim().length > 8) {
            const { embed } = await import("ai");
            const { embedding } = await embed({
              model: gateway.textEmbeddingModel("google/text-embedding-004"),
              value: userText,
            });
            const { data: hits } = await supabaseAdmin.rpc("match_knowledge", {
              _project_id: projectId,
              _user_id: userId,
              _query: embedding as unknown as string,
              _k: 6,
            });
            if (hits && hits.length > 0) {
              knowledgeBlock = "\n\nRELEVANT KNOWLEDGE (retrieved from project KB):\n" +
                hits.map((h, i) => `[#${i + 1} ${h.source_type}:${h.source_path} sim=${h.similarity.toFixed(2)}]\n${h.content.slice(0, 800)}`).join("\n\n");
            }
          }
        } catch (e) {
          console.warn("[chat] knowledge retrieval skipped", e);
        }

        const systemPrompt = SYSTEM_PROMPT_BASE + indexBlock + knowledgeBlock;

        const result = streamText({
          model,
          system: systemPrompt,
          messages: await convertToModelMessages(messages as UIMessage[]),
          tools,
          stopWhen: stepCountIs(50),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages as UIMessage[],
          onFinish: async ({ responseMessage }) => {
            try {
              const parts = responseMessage.parts as Array<{ type: string }>;
              const toolCalls = parts.filter((p) => p.type?.startsWith("tool-")).length;
              const responseChars = JSON.stringify(parts).length;
              await Promise.all([
                supabase.from("messages").insert({
                  project_id: projectId, user_id: userId, role: "assistant",
                  parts: responseMessage.parts as unknown as Database["public"]["Tables"]["messages"]["Insert"]["parts"],
                }),
                supabase.from("ai_usage").insert({
                  project_id: projectId, user_id: userId, model: modelId,
                  prompt_chars: promptChars, response_chars: responseChars, tool_calls: toolCalls,
                }),
              ]);
            } catch (e) {
              console.error("[chat] persist failed", e);
            }
          },
        });
      },
    },
  },
});
