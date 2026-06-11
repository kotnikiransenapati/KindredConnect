import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, stepCountIs, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM_PROMPT = `You are Foundry, an expert AI software engineer that builds web apps inside a sandboxed workspace.

RULES:
- You can read and write files in the user's project using the provided tools.
- Always prefer writing complete, runnable files. Use React + TypeScript + Tailwind unless asked otherwise.
- Entry file is /App.tsx. Keep components small and focused.
- After making edits, briefly explain what you changed in 1-3 sentences.
- Never invent or call tools other than the ones provided.
- Never include secrets, API keys, or backend code unless the user asks.`;

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
            description: "Create or overwrite a file in the project. Use complete file contents.",
            inputSchema: z.object({
              path: z.string().min(1).max(255).describe("Absolute path starting with /"),
              content: z.string().max(200_000),
              language: z.string().max(40).optional(),
            }),
            execute: async ({ path, content, language }) => {
              const normalized = path.startsWith("/") ? path : `/${path}`;
              const { data: existing } = await supabase
                .from("project_files").select("id, version")
                .eq("project_id", projectId).eq("path", normalized).maybeSingle();
              if (existing) {
                const { error } = await supabase.from("project_files")
                  .update({ content, language: language ?? null, version: existing.version + 1 })
                  .eq("id", existing.id);
                if (error) return { ok: false, error: error.message };
                return { ok: true, path: normalized, action: "updated", version: existing.version + 1 };
              }
              const { error } = await supabase.from("project_files").insert({
                project_id: projectId, path: normalized, content, language: language ?? null,
              });
              if (error) return { ok: false, error: error.message };
              return { ok: true, path: normalized, action: "created", version: 1 };
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
        };

        const result = streamText({
          model,
          system: SYSTEM_PROMPT,
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
