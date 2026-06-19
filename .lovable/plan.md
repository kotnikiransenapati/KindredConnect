# Foundry — Emergent-class AI Website Builder Roadmap

Goal: ship a Lovable / Emergent-class autonomous web app builder — natural-language prompt → multi-step agent that plans, writes, lints, previews, deploys, and learns from a per-project knowledge base.

## Done ✅
- Auth (email + Google OAuth), profiles, RLS-scoped projects
- Streaming chat with tool calls (writeFile, deleteFile, readFile, listFiles, searchFiles, renameFile, lintFile)
- Agent loop via `stopWhen: stepCountIs(50)` + Babel-based lint + auto-fix retry guidance
- Per-message unified-diff viewer with lint status badges
- File tree, file viewer, Sandpack live preview, project versions + restore, share links
- Members + roles (`has_project_role`), invites, activity log, notifications
- Templates gallery + fork
- Razorpay subscription scaffold (inactive — keys pending)
- AI usage metering + plan quota
- **Phase 8A** ✅ pgvector knowledge base + per-project chunks
- **Phase 8B** ✅ RAG retrieval into system prompt + URL/note ingestion UI
- **Phase 8C** ✅ auto-embed `project_files` on writeFile (fire-and-forget), multimodal image attachments in chat, Capacitor mobile-shell `scaffoldCapacitor` tool
- **Phase 9A/B** ✅ `deployments` table + versioned public URLs (`/p/$slug`, `/p/$slug/$version`) + deploy / rollback UI
- **Phase 10A** ✅ Supabase Realtime presence: live avatars of collaborators viewing the same project
- **Phase 10B** ✅ comments + @mentions: per-project + per-file threads, realtime sync, mention → notification fan-out
- **Phase 11A** ✅ public template marketplace: publish project → template, public `/marketplace`, 1–5 star ratings with trigger-maintained averages
- **Phase 11B** ✅ integrations catalog (Stripe / Resend / OpenAI / Maps / PostHog) + `installIntegration` agent tool + sidebar Install panel
- **Phase 12A (part)** ✅ shared `assertRateLimit` helper + rate limits on deploy / invite / ingest / publish-template (chat already limited); CI RLS/anon-access audit script
- **Phase 8 (remaining)** ✅ diversity rerank pass on top-20 vector hits → top-6; long-term per-user `user_preferences` memory injected into every chat
- **Phase 12B (part)** ✅ `/docs` site with sectioned content; first-run onboarding tour in project workspace
- **Phase M (parts 3–4)** ✅ `bundleMobileProject` server fn (zips project → downloadable iOS/Android source), `MobileBuilderPanel` UI, `addCapacitorPlugin` agent tool with snippets for 12 native plugins
- **Phase 12B (final)** ✅ Cloudflare Turnstile widget + `verifyTurnstile` server fn on sign-up (auto no-ops when `VITE_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` unset)

## Phase M — Mobile (iOS / Android) track
1. Capacitor wrapper produced by the agent: `capacitor.config.ts` + `/docs/MOBILE.md` with exact `npx cap add ios/android` steps (done as a tool).
2. Mobile-first design rules baked into the system prompt (44px tap targets, safe-area insets, no hover-only states).
3. Future: one-click "Download Xcode/Android Studio project" — server bundles `dist/` + `ios/` + `android/` into a zip via storage.
4. Future: native plugin catalog tool (`addCapacitorPlugin('camera'|'push'|'geolocation'|...)`).
5. Future: EAS-style cloud build webhook (Codemagic or Bitrise) so users get `.ipa`/`.aab` without a local toolchain.

## Phase 8 — Knowledge & retrieval (remaining)
1. Re-ranker pass: top-20 vector hits → rerank via cheap LLM judge → top-6 into prompt.
2. Long-term memory: per-user "preferences" namespace (writing style, framework choice).

## Phase 9 — Real preview & deploy
1. Server-side bundle pipeline using esbuild-wasm in a Worker (Sandpack stays for instant inner-loop preview).
2. Storage bucket `published/{project_slug}/{version}/` for static output.
3. Public route `/p/$slug` proxies storage; CDN-style cache headers.
4. `deployments` table + rollback UI; per-version preview URLs at `/p/$slug/$version`.
5. Future: `{slug}.foundry.app` subdomain mapping table.

## Phase 10 — Collaboration & realtime
1. Supabase Realtime channel per project: presence + live cursors.
2. CRDT-lite file co-editing: broadcast last-writer-wins patches keyed by path + version.
3. Thread comments anchored to files / chat messages.
4. @mentions → in-app notification + email (Resend via Lovable Email).

## Phase 11 — Marketplace & extensions
1. Public template marketplace: publish/rate/fork counters.
2. Integrations catalog: pre-wired Stripe/Resend/OpenAI/Maps snippets the agent can install.
3. Component installer tool: `addShadcnComponent(name)` calls a server task.
4. Plugin SDK for community tools (sandboxed via JSON-schema input + RLS-scoped DB).

## Phase 12 — Security, ops & polish
1. Rate limits via `check_rate_limit` on chat, publish, invite, ingest.
2. Cloudflare Turnstile on signup + abuse log.
3. RLS audit script in CI; deny new `TO anon` policies unless flagged.
4. Observability: server-fn structured logs → activity table; client error reporting wired.
5. Performance: route-level code split, image opt, Lighthouse ≥ 95.
6. `/docs` site with MDX (lazy).
7. First-run onboarding tour, prompt-chip suggestions, polished empty states.

## Architectural commitments
- **Server logic**: every app-internal call is a `createServerFn` + `requireSupabaseAuth`; admin client only behind explicit role checks.
- **Database**: every public table → `GRANT` + RLS + policies scoped to `auth.uid()` or `has_project_role`; pgvector lives in `extensions` schema.
- **AI**: AI Gateway via `@ai-sdk/openai-compatible`; chat = `google/gemini-3-flash-preview`, embeddings = `google/text-embedding-004`; `LOVABLE_API_KEY` server-only.
- **Streaming**: `streamText` + `toUIMessageStreamResponse`; tool parts rendered via `message.parts`.
- **Storage**: `project-assets` (user uploads), `published` (built bundles).
- **Billing**: Razorpay stays inactive until user provides keys; quota enforced via `get_user_plan`.

## Execution order (2 batches at a time)
- **Batch 7A** ✅ agent tools + step-limited loop + tool-part rendering
- **Batch 7B** ✅ lint tool + auto-fix loop + diff viewer
- **Batch 8A** ✅ pgvector `knowledge_chunks` + match RPC
- **Batch 8B** ✅ retrieval into prompt + URL/note ingestion UI
- **Batch 8C** ⏭ auto-embed on writeFile + multimodal image input
- **Batch 9A** server bundle + `published` bucket + `/p/$slug/*`
- **Batch 9B** deployments table + rollback UI + versioned preview URLs
- **Batch 10A** realtime presence + cursors
- **Batch 10B** comments + @mentions + email
- **Batch 11A** public template marketplace (publish + ratings)
- **Batch 11B** integrations catalog + component installer tool
- **Batch 12A** rate limits + Turnstile + RLS audit fixes
- **Batch 12B** docs site + onboarding tour + Lighthouse pass
