# Foundry — Advanced AI Website Builder Roadmap

A lot is already in place: auth, projects, chat→code (Gemini 3 Flash), file tree, Sandpack live preview, versions, share links, members/roles, usage metering, Razorpay billing (inactive), templates, notifications, activity feed. This plan layers the remaining advanced capabilities to reach parity with Lovable.

## Current state (✅ done)
- Auth + profiles + Google OAuth
- Projects CRUD, slugs, RLS, owner+member roles (`has_project_role`)
- Streaming chat → file edit tool-calls (AI Gateway, Gemini 3 Flash)
- `project_files`, `project_versions`, restore, share tokens
- Sandpack live preview (desktop/mobile)
- Members invites, activity log, notifications bell
- Templates gallery + fork
- Razorpay subscription scaffold (keys pending)
- AI usage metering + plan quota function

## Phase 7 — Agentic build pipeline (next, this turn)
Make the AI actually feel like Lovable: multi-step, tool-using, self-correcting.
1. **Agent loop**: switch chat handler to `streamText` + `tool()` + `stopWhen: stepCountIs(50)`.
2. **Tools** (server-side, RLS-scoped):
   - `write_file(path, content)` / `delete_file(path)` / `rename_file`
   - `read_file(path)` (for context recall)
   - `list_files()` (truncated)
   - `search_files(query)` (ILIKE over content)
   - `run_lint(path)` → returns parser errors (esbuild transform check)
   - `propose_plan(steps[])` → renders as a checklist in chat
3. **Context window manager**: trim message history to last N + always-pinned file index + selected files (token budget aware).
4. **Streaming UI parts**: render tool calls/results as collapsible cards in `ChatPanel` (AI SDK `parts`).
5. **Auto-fix loop**: after each `write_file`, run `run_lint`; if errors, feed back to model up to 3 retries.
6. **Diff view**: per message, show unified diff (jsdiff) per file touched, accept/reject per hunk.

## Phase 8 — Knowledge & retrieval
1. **Per-project knowledge base**: `knowledge_chunks` table with `pgvector` embeddings (Gemini embedding model via AI Gateway).
2. **Auto-index** project files on save (debounced server fn).
3. **Retrieve top-K** chunks into system prompt before each agent step.
4. **URL ingestion**: user pastes docs URL → fetch, chunk, embed.
5. **Image references**: drag image into chat → store in Lovable Cloud storage → pass as multimodal input to Gemini.

## Phase 9 — Real preview & deploy
1. **Sandpack → WebContainer-style**: keep Sandpack for instant preview; add a "build" step that bundles project to static HTML/JS via esbuild-wasm in browser.
2. **Publish pipeline**:
   - Bundle on server (esbuild via Worker-compatible build).
   - Upload to Supabase Storage bucket `published/{project_slug}/`.
   - Public route `/p/$slug/*` serves files from storage (signed-URL redirect or proxy).
   - Custom subdomain mapping table (future: `{slug}.foundry.app`).
3. **Versioned deploys**: each publish = `deployments` row with snapshot id, rollback button.
4. **Preview environments**: every PR-style branch gets its own URL.

## Phase 10 — Collaboration & realtime
1. **Realtime presence**: Supabase Realtime channel per project — cursors, who's editing.
2. **Live file co-editing**: broadcast file content patches (CRDT-lite: last-writer-wins per path + version bump).
3. **Comments**: thread comments anchored to files or chat messages.
4. **@mentions** in chat → notification + email (Resend via Lovable Email).

## Phase 11 — Marketplace & extensions
1. **Public template marketplace**: community publishes templates, rating, forks counter.
2. **Integrations catalog**: pre-wired connectors (Stripe, Resend, OpenAI, Maps) — one-click adds env placeholders + sample code via agent tool.
3. **Component library injector**: agent can install shadcn components on demand.

## Phase 12 — Security, ops & polish
1. **Rate limits** via `check_rate_limit` on chat, publish, invite endpoints.
2. **Abuse log** + Cloudflare Turnstile on signup.
3. **Audit**: re-run Supabase linter, RLS audit script, ensure no `TO anon` on private tables.
4. **Observability**: server fn logs → activity table; error boundary with Sentry-style report capture (`lovable-error-reporting` already wired).
5. **Performance**: route-level code split, image opt (already), Lighthouse pass ≥ 95.
6. **Docs site** at `/docs` with MDX (lazy).
7. **Onboarding**: first-run tour, sample prompt chips, empty states polished.

## Technical commitments
- All server logic in `createServerFn` + `requireSupabaseAuth`; admin client only behind verified caller checks.
- Every public table: `GRANT` + RLS + policies scoped to `auth.uid()` or `has_project_role`.
- Zod validation on every server fn input (min/max, regex).
- AI calls via `@ai-sdk/openai-compatible` → Lovable AI Gateway; never expose `LOVABLE_API_KEY`.
- Streaming with `toUIMessageStreamResponse`; tool parts rendered via `message.parts`.
- Embeddings: `google/text-embedding-004` (or current Gemini embedding).
- Storage: Supabase Storage buckets (`project-assets`, `published`).
- Razorpay: stays inactive until user provides keys; gating already in place via `get_user_plan`.

## Execution order (2 batches at a time)
- **Batch 7A**: agent tools (`write_file`, `delete_file`, `read_file`, `list_files`) + `stopWhen` loop + tool-part rendering in ChatPanel.
- **Batch 7B**: lint tool + auto-fix retry + per-message diff viewer.
- **Batch 8A**: `knowledge_chunks` table + pgvector + embed-on-save server fn.
- **Batch 8B**: retrieval into prompt + URL ingestion + multimodal image input.
- **Batch 9A**: server-side bundle + `published` storage bucket + `/p/$slug/*` route.
- **Batch 9B**: `deployments` table + rollback UI + per-version preview URL.
- **Batch 10A**: Realtime presence + cursors.
- **Batch 10B**: comments + @mentions + email notifications.
- **Batch 11A**: public template marketplace (publish flow + ratings).
- **Batch 11B**: integrations catalog + component installer tool.
- **Batch 12A**: rate limits + Turnstile + RLS audit fixes.
- **Batch 12B**: docs site + onboarding tour + Lighthouse pass.

Approve and I'll start Batch 7A + 7B immediately.
