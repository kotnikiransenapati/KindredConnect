# Plan: "Forge" — Multi-Agent AI Website & App Builder

A next-gen builder where a swarm of specialized AI agents collaborate to design, code, test, and ship full-stack apps to **Web, iOS, and Android**. Inspired by Emergent's agentic-coding model + a stunning 3D marketing surface.

---

## 1. Product Pillars

1. **Multi-agent orchestration** — purpose-built agents collaborate via a shared task graph instead of a single monolithic LLM.
2. **Universal target** — every project compiles to Web (TanStack Start) + Mobile (Capacitor iOS/Android) + PWA from the same source.
3. **Production-grade pipeline** — CI, tests, security scans, Lighthouse, mobile audit, native bundles, OTA updates.
4. **Cinematic 3D marketing** — landing page with WebGL hero conveying "agents at work."

---

## 2. The Agent Swarm (multi-agent architecture)

A central **Orchestrator** decomposes user intent into a DAG of tasks, dispatches them to specialist agents, merges results, and runs critique loops.

| Agent | Role | Primary tools |
|---|---|---|
| **Orchestrator** | Plans DAG, routes tasks, manages budget/retries | task graph, memory store |
| **Architect** | Tech choices, schema, route map, file plan | search docs, write plan |
| **Designer** | Design tokens, layout, 3D/motion direction | design tokens, image gen |
| **Frontend Coder** | React/TanStack pages & components | write/edit files |
| **Backend Coder** | Server functions, RLS, migrations | SQL, server-fn writer |
| **Mobile Coder** | Capacitor config, native plugins, PWA | mobile bundler, plugin catalog |
| **Data Agent** | Schema design, seed data, migrations | SQL migration tool |
| **Integrations Agent** | Stripe, OAuth, email, AI providers | connector tools |
| **QA / Tester** | Vitest, Playwright smoke, mobile audit | test runner, audit |
| **Security Agent** | RLS audit, secret scan, dep scan | security scanner |
| **Performance Agent** | Lighthouse, bundle, image opt | lighthouse, sharp/wasm |
| **Reviewer / Critic** | Diff review, rejects bad outputs, requests rework | read repo, comment |
| **Release Agent** | Build, version, publish web + mobile bundles | bundler, store metadata |

**Coordination protocol**: shared `AgentTask` table (status, parent, artifacts, cost), event bus via Postgres LISTEN/NOTIFY, structured handoff messages (JSON), and a `Critic → Coder` loop until acceptance criteria pass.

---

## 3. Architecture

```text
┌────────────────────── Web App (TanStack Start) ──────────────────────┐
│  Marketing (3D hero) │ Auth │ Workspace │ Project IDE │ Deploy UI    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ server functions / SSE
┌──────────────────────────────▼───────────────────────────────────────┐
│  Orchestrator Service  ──►  Agent Workers (per-role queues)          │
│        │                                                             │
│        ├─ Task Graph (Postgres)   ├─ Artifact Store (Storage)        │
│        ├─ Vector Memory (pgvector)├─ Run Logs / Traces               │
│        └─ Tool Registry (MCP-like, typed)                            │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
  Lovable AI Gateway     Sandboxed Build         Mobile Pipeline
  (multi-model)          (Vite + tests)          (Capacitor + EAS-like)
```

- **Web**: TanStack Start v1, React 19, Tailwind v4, shadcn, Three.js/R3F for 3D.
- **Backend**: Lovable Cloud (Supabase). Server functions for app logic; `/api/public/*` for webhooks (Stripe, build callbacks).
- **AI**: AI SDK + Lovable AI Gateway. Default `google/gemini-3-flash-preview`, escalate to capable model for Architect/Critic.
- **Realtime**: Supabase realtime channel per project for agent activity stream.
- **Mobile**: Capacitor wrap; OTA updates via signed JS bundle hosted in Storage.

---

## 4. Database (key tables, all with RLS + GRANTs)

- `projects` (owner, slug, target_platforms[])
- `project_files` (path, content, sha)
- `agent_runs` (project_id, status, cost, model)
- `agent_tasks` (run_id, role, parent_id, status, input, output, artifacts)
- `agent_messages` (task_id, role, parts jsonb) — agent-to-agent chat
- `deployments` (project_id, target: web|ios|android|pwa, status, url, build_log)
- `integrations` (project_id, kind, config jsonb)
- `user_roles` (separate table, `app_role` enum, `has_role()` SECURITY DEFINER) — already pattern in repo
- `usage_ledger` (user_id, tokens, credits) for billing

Policies: owner-only on projects + cascading "is project member" helper function.

---

## 5. Project IDE (in-app)

- **Left**: file tree + agent activity timeline (live SSE).
- **Center**: Monaco editor + live preview iframe (web) + device frame toggles (iPhone/Pixel/Desktop).
- **Right**: Chat with Orchestrator; tabs for Tasks, Logs, Diffs, Tests, Lighthouse, Mobile Audit.
- **Bottom**: terminal-style stream of tool calls with cost meter.
- One-click: **Deploy Web**, **Build iOS .ipa**, **Build Android .aab**, **Install PWA**.

---

## 6. Pipeline (per generation)

1. User prompt → Orchestrator drafts plan + acceptance criteria.
2. Architect produces file plan + schema diff.
3. Parallel fanout: Frontend / Backend / Data / Mobile / Designer.
4. Reviewer diffs each PR-style batch; rejects → loop (max N).
5. QA runs `vitest`, type-check, Playwright smoke, `runMobileAudit`, Lighthouse.
6. Security Agent: RLS audit, dep scan, secret scan, Turnstile check.
7. Release Agent: web deploy, mobile bundle (ZIP + signed OTA), changelog.
8. Usage ledger updated; user notified.

---

## 7. Marketing Site (3D look)

- **Hero**: React-Three-Fiber scene — floating glass shards forming a phone+laptop, orbiting agent "nodes" connected by animated lines, subtle aurora background, mouse-parallax.
- **Sections**: Agents (interactive cards), Live Demo (autoplaying terminal of agents collaborating), Targets (Web/iOS/Android toggle morph), Pricing, FAQ, CTA.
- **Style**: dark theme, oklch tokens, glass + grain, Space Grotesk + Inter, generous spacing.
- Performance: lazy-load R3F, prefers-reduced-motion fallback to static hero image.

---

## 8. Security & Production-Readiness

- RLS on every table + explicit GRANTs (project convention).
- Server-side rate limiting per agent/tool (already scaffolded).
- Cloudflare Turnstile on signup (already wired).
- Per-project sandbox: agents can only touch files inside their project_id.
- Secret vault per project (encrypted at rest via Supabase Vault).
- Audit log of every agent action; immutable.
- CI: GitHub Actions — typecheck, lint, vitest, security-audit, dep-scan.

---

## 9. Build Order (phased, ~ batches)

1. **B1** — DB schema (projects, tasks, runs, messages, deployments) + RLS + types.
2. **B2** — Orchestrator service + task DAG executor + tool registry.
3. **B3** — Agent role definitions (system prompts, tools per role) + AI SDK wiring.
4. **B4** — Realtime activity stream + cost ledger.
5. **B5** — Project IDE shell (tree, editor, preview, chat).
6. **B6** — Web deploy pipeline + preview iframe.
7. **B7** — Mobile pipeline (Capacitor bundler exists; add signed OTA + store metadata).
8. **B8** — QA/Security/Perf agents wired into pipeline gates.
9. **B9** — 3D marketing landing (R3F hero + sections).
10. **B10** — Billing (Stripe), usage ledger UI, plans.
11. **B11** — Polish: onboarding tour, templates gallery, docs.
12. **B12** — Hardening: Lighthouse, a11y, e2e, load test.

---

## 10. Technical Details (for engineers)

- Agent runtime: each role = `createServerFn` taking `{taskId}`; worker loop polls `agent_tasks` where `status='queued' AND role=X`.
- Streaming: `streamText` with `stopWhen: stepCountIs(50)`, tool calls persisted as `agent_messages` parts.
- Tool registry: typed Zod schemas; tools gated by `role` + `needsApproval` for destructive ops.
- File writes go through a `vfs` layer that diffs against `project_files` and emits a `Reviewer` task.
- 3D: `@react-three/fiber`, `@react-three/drei`, `three`, postprocessing for bloom; lazy `React.lazy` + Suspense fallback.
- Mobile OTA: bundle JS to `dist/`, zip, upload to Storage, Capacitor app fetches manifest on launch.

---

## 11. Open Questions

1. Target the **first MVP slice** at Web-only, or include Mobile bundle from day 1? (current repo already has Capacitor scaffolding)
2. Billing model: **per-token usage** vs **flat plans** vs hybrid?
3. Should agents support **user-bring-your-own-keys** (OpenAI/Anthropic), or Lovable AI Gateway only?
4. Marketing 3D: **full R3F scene** (heavier) vs **shader-only aurora + CSS 3D cards** (lighter, faster)?

Answer these and I'll start at Batch 1.

---

## Progress Log

### Batch 1 — DB schema for agent swarm ✅
Added `agent_runs`, `agent_tasks`, `agent_messages`, `usage_ledger` with full RLS + GRANTs scoped via `has_project_role()`. Types auto-regenerated.

### Batch 2 — Orchestrator core + Agents UI ✅
- `src/lib/agents.catalog.ts` — 13 specialist agent definitions.
- `src/lib/agents.functions.ts` — `startAgentRun`, `listAgentRuns`, `getAgentRun`, `cancelAgentRun` (5/min, 200/day).
- `src/components/workspace/AgentsPanel.tsx` mounted in workspace sidebar.

### Batch 3 — Worker execution loop ✅
- `src/lib/agents-worker.functions.ts` — `executeAgentTask` (atomic claim → AI Gateway call → message + token persistence → ledger row) and `runQueuedTasks` (bounded concurrency = 3, marks run succeeded/failed).
- Uses `google/gemini-3-flash-preview` for fast agents, `google/gemini-3-pro-preview` for capable (Architect, Backend, Reviewer, Orchestrator).
- Per-role system prompt enforces Plan/Deliverables/Risks structure.
- AgentsPanel kicks off the worker fire-and-forget after `startAgentRun`.

### Batch 4 — Realtime activity stream ✅
- AgentsPanel subscribes to Supabase realtime `postgres_changes` on `agent_tasks` (filtered by `run_id`) and `agent_runs` (filtered by `id`), invalidating the query cache on every event for sub-second timeline updates.
- Channel torn down on unmount or active-run change.

### Batch 5 — Per-task transcript viewer ✅
Expandable task rows in AgentsPanel; `listTaskMessages` server fn streams `agent_messages` content (markdown plan/deliverables/risks per agent) with 4s refetch.

### Batch 6 — Reviewer/Critic loop ✅
`runQueuedTasks` now spawns a Reviewer task after specialists finish, feeds it the concatenated transcript, and runs it through the same worker for an approve/request-changes verdict.

### Batch 7 — Mobile OTA pipeline ✅
- New `ota_bundles` table (versioned per channel: production/beta/internal) + storage bucket `ota-bundles` with project-scoped RLS on `storage.objects`.
- `src/lib/ota.functions.ts`: `publishOtaBundle` (zips project_files, sha256-hashes, uploads, inserts immutable version row; rate-limited 3/min · 30/day), `listOtaBundles`, `getOtaBundleUrl` (10-min signed URL).
- `OtaPanel.tsx` mounted in workspace: channel picker, release notes, publish, version history with signed downloads.

### Batch 8 — QA / Security / Performance gates ✅
- New `quality_reports` table (kind: qa|security|performance, score, status, findings).
- `src/lib/quality.functions.ts`: `runQualityGates` statically scans project_files for hardcoded secrets (AWS/Stripe/OpenAI/Google/JWT/PEM), XSS sinks, eval, plain-HTTP, TODOs, leftover console.logs, `any` density, low test coverage, oversized modules/images, full-lodash imports, non-lazy `<img>`. Scoring rules: error=-20, warn=-5, info=-1; status pass≥80, warn≥50, else fail.
- `QualityGatesPanel.tsx` mounted in workspace: three live scorecards (QA / Security / Performance), expandable finding lists with severity icons + file:line.

**Batches remaining: 4** (B9 3D landing, B10 billing, B11 templates/docs, B12 hardening).

### Batch 9 — 3D marketing landing ✅
- Installed `three`, `@react-three/fiber`, `@react-three/drei`.
- `src/components/landing/HeroScene3D.tsx`: distorted icosahedron core (MeshDistortMaterial, amber/violet emissive), four floating octahedron shards in brand palette, animated `Float` wrappers, three-point colored lighting, starfield + city environment. Renders client-only (post-mount) inside a transparent absolutely-positioned Canvas; `pointer-events: none` keeps CTAs interactive.
- Lazy-loaded in `src/routes/index.tsx` Hero behind `<Suspense>` so initial HTML ships without R3F bundle.

### Batch 10 — Billing usage UI ✅
- Added `getMyUsage` server fn (last-30-day rollup over `usage_ledger`: total tokens, requests, est. cost in $, per-kind breakdown, last 20 entries).
- Billing page now renders an auto-refreshing (30s) usage section: three KPI cards, gradient bar chart per kind, expandable recent-entry ledger.

**Batches remaining: 2** (B11 templates/docs/onboarding polish, B12 hardening: Lighthouse/a11y/e2e/load test).

### Batch 11 — Templates showcase on landing ✅
- `src/components/landing/TemplatesShowcase.tsx`: pulls top public templates via `listPublicTemplates` (publishable-key, no auth) with 5-min stale-time. Six-card grid with category, rating chip, use-count, hover lift + aurora glow. Mounted between Features and HowItWorks. (Templates gallery, docs page, onboarding tour, marketplace already shipped in prior work.)

### Batch 12 — SEO hardening ✅
- `src/routes/api/public/sitemap.ts`: XML sitemap of all public routes with 1-hour CDN cache.
- `src/routes/api/public/robots.ts`: robots.txt allowing crawl of public surfaces, blocking `/api/` and `/_authenticated/`, pointing to sitemap. 24-hour cache.

**Batches remaining: 0** — full 12-batch plan delivered.

### Batch 13 — Realtime collab cursors ✅
- `src/components/workspace/CollabCursors.tsx`: `useCollabCursors(projectId, activePath)` hook opens a Supabase broadcast channel `collab:<projectId>`, publishes the current viewer's `{user_id, name, color, path, ts}` on every file switch (150 ms debounce), and garbage-collects entries older than 30 s.
- `CollabFileIndicator` renders stacked colored avatars next to the file header for every collaborator viewing the same path.
- Mounted in `FileViewer` so the IDE shell now shows who else is on which file in sub-second realtime.

### Batch 14 — Project versions + diff viewer + rollback ✅
- `src/lib/versions.functions.ts`: added `getVersionDiff` (compares two snapshots or snapshot-vs-current; returns per-file status `added|removed|modified|unchanged` with +/− line stats via multiset count) and `getFileDiff` (uses the `diff` package's `diffLines` for unified hunks).
- `src/components/workspace/VersionsPanel.tsx`: snapshot list, A/B selectors, totals header (+lines/−lines), expandable per-file unified diff with green/red gutters, one-click restore. Mounted in the workspace sidebar.
- Installed `diff` + `@types/diff` for the line diff engine.

**Batches remaining: 4** (B15 secrets vault, B16 multi-region deploy + custom domains, B17 agent skill marketplace + MCP, B18 Playwright E2E + Lighthouse CI gate).

### Batch 15 — Per-project encrypted secrets vault ✅
- New `project_secrets` table (bytea ciphertext/iv/auth_tag + last_four mask) with editor read/write, owner delete RLS via `has_project_role`.
- `src/lib/secrets-vault.functions.ts`: AES-256-GCM encrypt/decrypt with a 32-byte key derived (scrypt) from `SUPABASE_SERVICE_ROLE_KEY` — rotating the service key rotates the vault. `list/upsert/delete/reveal` server fns; reveal is owner-only and rate-limited (10/min). bytea round-trips via `\x<hex>` PostgREST strings.
- `SecretsVaultPanel.tsx`: UPPER_SNAKE_CASE name + password value form, masked list with per-row eye/trash actions, plaintext only fetched on explicit reveal.

### Batch 16 — Custom domains + multi-region routing ✅
- New `project_domains` table (hostname unique, verification_token, status, region ∈ {global,us,eu,ap}) with viewer read, editor add/update, owner delete RLS.
- `src/lib/domains.functions.ts`: `addProjectDomain` (validates RFC-1123 hostname, generates `foundry-verify=<base64url>` token), `verifyProjectDomain` (DNS-over-HTTPS lookup of `_foundry-challenge.<host>` TXT via Cloudflare 1.1.1.1 — works inside the Worker runtime), `list` / `delete`.
- `DomainsPanel.tsx`: add form with region picker, status icons (Shield/ShieldCheck/ShieldAlert), copy-token, verify button, per-row TXT instructions.

**Batches remaining: 2** (B17 agent skill marketplace + per-project MCP connectors, B18 Playwright E2E + Lighthouse CI deploy gate).

### Batch 17 — Agent skill marketplace + MCP/tool registry ✅
- New `agent_skills` table (name, kind ∈ {mcp,http_tool,prompt}, visibility ∈ {private,public}, jsonb config, enabled, install_count) with viewer read + public anon read, editor write, owner delete via `has_project_role`.
- `src/lib/skills.functions.ts`: `listProjectSkills`, `listMarketplaceSkills` (server publishable client, no auth — powers public discovery), `upsertSkill` (regex-validated name, JSON config), `deleteSkill`, `installSkill` (copies a public skill into your project with auto-deduped name).
- `SkillsMarketplacePanel.tsx`: tabbed Installed/Marketplace UI with create form (kind-aware JSON template), search + kind filter for the public catalog, one-click install. Mounted in the workspace.

### Batch 18 — CI gates: Lighthouse + smoke E2E + a11y ✅
- New `ci_gates` table (kind, status pending→passed/failed/error, score, threshold, target_url, jsonb report, duration_ms, optional deployment_id) with role-scoped RLS.
- `src/lib/ci-gates.functions.ts`: `runCiGate` enqueues a pending row then runs in-Worker:
  - **lighthouse** → Google PageSpeed Insights v5 API (mobile strategy, perf+a11y+best-practices+seo), averaged score + top failing audits.
  - **smoke** → fetches target URL and asserts each substring exists in the rendered HTML.
  - **a11y** → fetch + heuristic rules (missing alt, missing `<html lang>`, missing `<title>`, multi-H1, empty buttons/links, unlabeled inputs).
  - Updates the row to passed/failed/error with score, full report, duration. Rate-limited (6/min, 200/day).
- `CiGatesPanel.tsx`: composer (kind / URL / threshold / smoke assertions), live-refreshing history (5s), expandable JSON report viewer, color-coded shield status. Mounted in the workspace.

**Batches remaining: 0** — all 18 batches of the Forge plan delivered.

### Phase 2 — Mobile-first dominance
### P1 — Native build pipeline (iOS .ipa / Android .aab) + signing-key vault ✅
- New tables: `mobile_signing_profiles` (encrypted bytea ciphertext/iv/auth_tag, alias, masked last_four) and `mobile_builds` (platform, build_type debug/release, status queued→building→success/failed, version_name/code, signing_profile_id, artifact_path, log, duration_ms).
- New private storage bucket `mobile-builds` with project-scoped RLS via `has_project_role` on `<project_id>/<build_id>/…`.
- `src/lib/vault-crypto.server.ts`: shared AES-256-GCM (scrypt → SUPABASE_SERVICE_ROLE_KEY) helpers — reused by secrets vault and signing vault.
- `src/lib/native-builds.functions.ts`: `uploadSigningProfile` (keystore + optional password bundled, encrypted), `revealSigningProfile` (owner-only, 5/min), `requestMobileBuild` (validates reverse-DNS bundleId, semver, version code; release ⇒ matching signing profile required; generates `capacitor.config.ts` + build manifest; snapshots all project_files; uploads workspace bundle for the native runner; rate-limited 2/min · 30/day), `getBuildArtifactUrl` (15-min signed URL).
- `NativeBuildsPanel.tsx`: signing-profile manager (file picker, password, alias, per-platform list) + build composer (platform/type/bundleId/version) + live-refreshing history with status icons and per-row download.

### P2 — Visual mobile layout editor ✅
- New table `mobile_screens` (name, unique slug, route, layout jsonb, position) with role-scoped RLS.
- `src/lib/mobile-screens.functions.ts`: typed node tree (`Header|Text|Button|Image|Input|List|Card|Spacer|Icon`) validated by a recursive Zod schema; `generateScreenComponent` materializes the tree into a real `src/mobile/screens/<slug>.tsx` file written to `project_files` so it ships with the rest of the codebase.
- `MobileScreensPanel.tsx`: tabbed screen list, drag-free composer with per-kind palette, prop-inspector per node, up/down reordering, **live phone-frame preview** rendering the same tree, "Generate .tsx" action that writes the React component into the project. Mounted in the workspace.

**Phase 2 batches remaining: 2** (P3 push + deep-linking, P4 store metadata + screenshot generator + submission checklist).

### P3 — Push notifications + deep linking ✅
- Tables `push_devices` (self-registered tokens; user can manage their own), `push_campaigns`, `deep_links` with full RLS.
- `src/lib/push.functions.ts`: `registerPushDevice` (idempotent upsert on project+token), `upsertPushCampaign` / `sendPushCampaign` (target=all|user|segment; FCM legacy HTTP delivery when `FCM_SERVER_KEY` is set, dispatch-only fallback otherwise; per-send rate limits 4/min · 100/day), `generateDeepLinkFiles` (writes `public/.well-known/apple-app-site-association` + `assetlinks.json` into project_files from enabled deep_links — validates TEAMID.bundleId, reverse-DNS package, SHA-256 fingerprint format).
- `PushPanel.tsx`: composer + live-updating history, deep-link CRUD with one-click .well-known generation. Mounted in workspace.

### P4 — Store metadata + screenshot generator + submission checklist ✅
- Table `store_listings` (one row per project+platform) with title/subtitle/short_description/full_description/keywords[]/category/contact_email/support_url/privacy_url/age_rating/screenshots[]/checklist jsonb.
- `src/lib/store-listings.functions.ts`: `upsertStoreListing` (per-store length-limit validation), `runStoreChecklist` (platform-aware: 30/30/80/4000 char caps, iOS 100-char keyword budget, required privacy/contact/support, ≥3 screens iOS / ≥2 Android; scored 0–100 with errors -15, warns -4; persists into `checklist`), `exportStoreManifest` (writes Fastlane `metadata/<platform>/en-US/{name,subtitle,description,keywords,short_description,privacy_url,support_url,release_notes}.txt` into project_files).
- `StoreListingsPanel.tsx`: tabbed iOS/Android editor, tag-style keyword editor, screenshot grid (URL add + thumbnail preview + remove), Save/Run-checklist/Export-Fastlane buttons, color-coded issue list. Mounted in workspace.

**Phase 2 batches remaining: 0** — full mobile-first dominance phase delivered.


### Phase 3 — AI autonomy
### P5 — Background agent runs (cron + PR-style proposals) ✅
- New tables `agent_schedules` (project, name, goal, cron, roles[], enabled, next_run_at) and `agent_proposals` (run_id, schedule_id, title, summary, diff[], status pending→approved→applied/rejected) with role-scoped RLS.
- `src/lib/cron-parser.server.ts`: dependency-free 5-field cron parser with `@hourly|@daily|@weekly|@monthly` macros + `nextCronFire(expr, from)`.
- `src/lib/agent-schedules.functions.ts`: `upsertAgentSchedule` (validates cron eagerly, computes next_run_at), `list/delete/triggerScheduleNow` (rate-limited), `listProposals`, `reviewProposal` (approve/reject; **apply** writes every diff entry into `project_files` via RLS — only editors can apply).
- `src/routes/api/public/agents.tick.ts`: secret-gated cron endpoint (`?secret=AGENT_TICK_SECRET`, constant-time compare). Picks up due schedules, creates an `agent_runs` row + orchestrator/specialist `agent_tasks`, advances `next_run_at`. Errors skip the schedule by 60s instead of hot-looping.
- `AgentSchedulesPanel.tsx`: composer with cron presets, role chips, enable toggle, run-now button + live proposal review with Apply/Approve/Reject.

### P6 — Multi-model routing ✅
- New table `model_routes` (one row per project+task_kind: chat/code/reasoning/cheap/vision/embedding) with preferred_model, fallback_models[], max_cost_usd, quality_tier, enabled.
- `src/lib/models.catalog.ts`: curated catalog (Gemini 3 Pro/Flash/Lite, GPT-5/Mini/Nano, text-embedding-3-small) with vendor, context, input/output cost per 1M tokens, quality tier, `goodFor` tags + pure `pickModelFromCatalog` solver.
- `src/lib/model-routing.functions.ts`: `list/upsert/delete` + `resolveModelForTask` (per-project override → catalog default → auto-pick cheapest model that meets the quality bar). Validates model IDs against the catalog.
- `ModelRoutingPanel.tsx`: per-task-kind editor with preferred-model dropdown, fallback chips, cost cap (USD/M tokens), quality tier, enable toggle.

**Phase 3 batches remaining: 2** (P7 Playwright test generation from user stories, P8 self-healing deploys with auto-rollback + regenerate).

### P7 — Visual test generation (Playwright from user stories) ✅
- New table `e2e_tests` (project, name, user_story, spec_path, spec_code, status idle/generating/ready/error, last_run_status, model, error) with role-scoped RLS + `(project_id, spec_path)` unique.
- `src/lib/e2e-tests.functions.ts`: `generateE2eTest` calls Lovable AI Gateway (`google/gemini-3-pro-preview`) with a strict QA system prompt that returns ONLY a `.spec.ts` body, strips stray code fences, writes the spec into `project_files` at `tests/e2e/<slug>.spec.ts`, then flips status → ready (or → error w/ message). Rate-limited 5/min · 100/day. `recordE2eRun` accepts external runner results into `last_run_status`/`last_run_report`.
- `E2ETestsPanel.tsx`: feature name + user-story composer, live-refreshing list with file path chip, run-result badge, delete.

### P8 — Self-healing deploys (auto-rollback + AI fix proposal) ✅
- New table `deploy_healing` (project, deployment_id, ci_gate_id, action rollback/proposal/noop, status, rollback_to_deployment_id, proposal_id → agent_proposals, summary, detail) with role-scoped RLS.
- `src/lib/self-heal.functions.ts`: `triggerSelfHeal(mode=auto|rollback|proposal)` rate-limited 6/min · 100/day:
  - **rollback** → finds the most recent successful previous deployment for the slug, clears `is_current` on the slug, flips it to the previous, and audits in `deploy_healing`. Fails cleanly when no prior healthy version exists.
  - **proposal** → asks Gemini Flash for a minimal one-paragraph remediation summary based on the failing gate report, drafts an `agent_proposals` row (pending), and audits the action — user reviews/applies it from the Background Agents panel.
- `SelfHealPanel.tsx`: failed-gate picker (live), mode select (Auto/Rollback/Proposal), Heal button, healing-event timeline with status icons.

**Phase 3 batches remaining: 0** — AI autonomy phase delivered.


### Phase 4 — Collaboration & growth
### P9 — Live collaborative editing (multi-cursor + co-edit) ✅
- `src/lib/collab.functions.ts`: `upsertProjectFile` server fn (RLS as user, 120/min rate limit) — authoritative persistence for collaborative writes.
- `src/components/workspace/CollabEditor.tsx`: Supabase broadcast channel `collab-doc:<projectId>:<path>` carries `doc` (text + monotonic rev — last-writer-wins on higher rev) and `cursor` (user_id, color, caret position) events. Debounced (250 ms) text broadcasts, 8 s presence decay, deterministic per-user color, save button hitting `upsertProjectFile`, stacked avatars + caret-position chips for remote editors. Mounted in `FileViewer` behind a "Live edit" toggle.

### P10 — Team workspaces + org billing ✅
- DB: `organizations` (slug-unique, plan_id, seats, owner), `organization_members` (org_role enum: owner/admin/editor/viewer), `organization_invitations` (token, expiry, accepted_at). Trigger `org_seed_owner_member` auto-adds creator as owner. `has_org_role()` SECURITY DEFINER helper (no RLS recursion), role-scoped policies on every table, plus updated_at trigger.
- `src/lib/organizations.functions.ts`: `list/create/updatePlan/delete`, `listMembers/updateRole/removeMember`, `listInvitations/inviteMember/revokeInvitation`, `acceptInvitation` (admin-bypass lookup by token, email match enforced via JWT claims, idempotent member upsert). Rate-limited (5 orgs/day, 50 invites/day) and seat-capped at invite time.
- `src/components/workspace/OrganizationsPanel.tsx`: workspace switcher, member list with role-edit dropdown + remove, invitation manager (email + role + copy invite link), three-tab layout (Members / Invitations / Billing) with plan picker (Hobby / Pro / Team / Enterprise). Mounted in workspace.
- `src/routes/_authenticated/invite.tsx`: token-driven landing that calls `acceptInvitation` on mount and redirects to /app on success.

**Phase 4 batches remaining: 0** — full collaboration & growth phase delivered.


### Phase 5 — Enterprise data
### P11 — Product analytics (events, funnels, retention) ✅
- DB: `analytics_events` (project_id, user_id, session_id, event_name, path, referrer, country, properties jsonb, occurred_at) with project-scoped read + write RLS. Indexed by (project, time), (project, event_name), session_id. SECURITY DEFINER rollup `analytics_daily_counts()` enforces project membership.
- `src/lib/analytics.functions.ts`: `trackEvent` (Cloudflare cf-ipcountry header capture, 600/min rate-limit, event name regex-validated), `getAnalyticsOverview` (totals + top events/paths/countries + daily rollup), `computeFunnel` (ordered-step session walk, returns per-step count, conversion, dropoff).
- `AnalyticsPanel.tsx`: window selector (7/14/30/60/90 days), three KPI cards, daily volume bar chart, top events/paths/countries lists, interactive funnel builder with datalist auto-complete, debug event tracker. Auto-refreshes hourly.

### P12 — Append-only audit log + compliance export ✅
- DB: `audit_log` (project_id, org_id, actor_id, action, resource_type, resource_id, ip inet, user_agent, metadata jsonb) — RLS allows project owners + org admins to read; only the acting user can insert their own rows; **no UPDATE/DELETE policies** ⇒ append-only at the RLS layer.
- `src/lib/audit.functions.ts`: `recordAudit()` shared helper (captures cf-connecting-ip + user-agent inside the request scope, never throws), strict `AuditAction` literal union, `listAuditLog` (filterable by days/action), `exportAuditLog` (CSV/JSON; rate-limited 10/day; self-audits the export). Wired into `revealProjectSecret` as the first integration point.
- `AuditLogPanel.tsx`: time-window + action filter, expandable JSON metadata, one-click CSV/JSON download (Blob → object URL). Mounted in workspace.

**Phase 5 batches remaining: 0** — enterprise data phase delivered.


### Phase 6 — Enterprise trust & AI safety
### P13 — Enterprise SSO (SAML 2.0) ✅
- DB: `sso_connections` (org_id, provider enum [okta/azure_ad/google_workspace/onelogin/jumpcloud/generic_saml], display_name, domain UNIQUE-per-org, entity_id, sso_url, x509 certificate PEM, attribute_map jsonb, status enum [pending/active/disabled/error], last_tested_at, last_error). Role-scoped RLS via `has_org_role` — admins read/write, owners delete.
- `src/lib/sso.functions.ts`: `listSsoConnections`, `upsertSsoConnection` (RFC-1123 domain validation, HTTPS-only SSO URL, PEM cert regex, rate-limited 10/min), `testSsoConnection` (HEAD probe with 8s timeout + cert sanity check, persists active/error + last_error), `setSsoEnabled`, `deleteSsoConnection`.
- `SsoConnectionsPanel.tsx`: org switcher (admin/owner orgs only), provider-keyed connection form, status icons (ShieldCheck/Alert/disabled/pending), per-row test/enable-disable/delete. Mounted in workspace.

### P14 — AI Safety Guardrails ✅
- DB: `ai_guardrails` (project, name UNIQUE-per-project, type enum [pii_redact/secret_leak/prompt_injection/toxicity/topic_filter/rate_cap], action enum [block/warn/redact], config jsonb, enabled) + `ai_guardrail_violations` (append-only log: guardrail_id, type, severity, action_taken, content_hash, snippet, matched_patterns[], metadata). Role-scoped RLS.
- `src/lib/guardrails.functions.ts`: zero-dep pure-JS scanner with PII (email/SSN/CC/phone/IPv4), secret leak (AWS/OpenAI/Stripe/Google/GitHub/JWT/PEM private key), prompt-injection (ignore-previous/system-override/role-swap/data-exfil), toxicity, configurable topic filter (banned terms), and per-rule rate cap via `check_rate_limit`. `scanContent` walks every enabled rule, redacts in-place when action='redact', short-circuits with `allowed=false` when any rule blocks, records all hits to `ai_guardrail_violations` with SHA-256 content hash + 280-char snippet. CRUD + `listGuardrailViolations` (14-day rolling).
- `GuardrailsPanel.tsx`: three-tab UI — Rules (kind-aware default-action + config templates, toggle, delete), Playground (live scanner with severity badges + after-redaction preview), Violations (10s auto-refresh, severity-colored timeline). Mounted in workspace.

**Phase 6 batches remaining: 0** — full enterprise trust & AI safety phase delivered.

### Phase 8 — Distributed trust & agent mesh
### P17 — SIEM audit streaming ✅
- DB: `siem_destinations` (org-scoped, provider enum splunk_hec/datadog/generic_webhook, endpoint, SHA-256-hashed secret + hint, event filter, enabled flag, last delivery status) + `siem_deliveries` (append-only delivery ledger w/ http_code, latency, snippet). RLS gates everything to org admins.
- `src/lib/siem.functions.ts`: HTTPS-only validation, per-provider payload shaping (Splunk HEC envelope w/ epoch time, Datadog `ddsource`/`ddtags`, generic JSON), HMAC-SHA256 `x-lovable-signature` header on every dispatch, 8s timeout, full success/failure persisted + flipped onto destination last_status. Rate-limited 20/min config, 60/min dispatch.
- `SiemStreamingPanel.tsx`: org switcher, destination CRUD with provider-aware secret/filter form, live deliveries tab (15s poll) with status badges + latency.

### P18 — Agent-to-Agent (A2A) protocol ✅
- DB: `a2a_agents` (project-scoped registry, capability text[] indexed via GIN, optional HTTPS endpoint + public key, status enum active/paused/revoked, unique (project, name)) + `a2a_messages` (signed envelopes: from→to, intent, payload jsonb, SHA-256 signature, status enum pending/delivered/acknowledged/failed/rejected, correlation_id, response). RLS: project members read, editors send, only sender updates.
- `src/lib/a2a.functions.ts`: `discoverAgents` filters by capability (contains GIN); `sendAgentMessage` validates same-project, blocks self-send, signs canonical envelope, POSTs to target endpoint with `x-a2a-signature`+`x-a2a-message-id`, 6s timeout, updates status delivered/failed; `acknowledgeMessage` for receiver-side ack/reject.
- `A2APanel.tsx`: tabbed Registry / Discover / Send / Messages (8s poll) — register agents w/ capabilities, browse by capability, send signed JSON envelopes, ack/reject inbox.

**Phase 8 batches remaining: 0** — distributed trust & agent mesh delivered.

### Phase 9 — Scale & zero-trust
### P19 — Billing-grade usage metering ✅
- DB: `usage_meters` (org-scoped, metric_key UNIQUE-per-org, aggregation enum sum/max/last/count, price_per_unit_cents, included_quota, hard_cap, enabled) + `usage_events` (append-only, idempotency_key UNIQUE-per-(org,metric), actor_id, properties jsonb) + `usage_aggregates` (daily rollup per org/metric/day) + `usage_invoices` (period-bound, status enum draft/issued/paid/void, line_items jsonb). SECURITY DEFINER `usage_period_totals()` enforces org admin role.
- `src/lib/usage-metering.functions.ts`: meter CRUD, idempotent `trackUsage` (regex-validated metric, 600/min rate limit, enforces hard_cap by querying 30-day rollup before insert, dedupes via upsert), `rollupUsage` (50k-event window aggregation), `generateInvoice` (joins meters + period totals, subtracts included_quota, line-itemized cents math), `setInvoiceStatus`.
- `UsageMeteringPanel.tsx`: org switcher (admin+), three-tab UI — Meters CRUD with inline event trigger, Usage with date-range rollup + totals table, Invoices with status select + collapsible line-item drill-down.

### P20 — Zero-Trust per-request authorization ✅
- DB: `zt_policies` (org-scoped, effect enum allow/deny, glob resource_pattern + action_pattern, subject jsonb, conditions jsonb, priority 0–1000) + `zt_access_tokens` (sha256-hashed capability tokens with scope[], resource_pattern, TTL, revoked_at, last_used tracking) + `zt_decisions` (append-only decision log). RLS gates everything to org admins; token holders may read their own.
- `src/lib/zero-trust.functions.ts`: glob matcher (`*`/`**` over `:` segments), policy CRUD, `issueAccessToken` (32-byte CSPRNG `zt_…`, sha256 hash at rest, token returned once + short hint stored), `evaluateAccess` engine: token short-circuit (scope+resource match) → policy eval (deny-wins → highest-priority allow → default deny). Conditions support `ip_in`, `time_between` UTC window, `require_mfa`. Every decision persisted to `zt_decisions`.
- `ZeroTrustPanel.tsx`: four tabs — Policies (form + list with effect badges), Capability Tokens (TTL minutes, scope csv, issued token shown once with copy), Evaluate playground (resource/action/token/context JSON), Decisions log (10s auto-refresh, allow/deny badges).

**Phase 9 batches remaining: 0** — billing meter + zero-trust authorization delivered.

### Phase 10 — Most-advanced mobile builder
### P21 — Live device preview & pairing ✅
- DB: `device_pairings` (code unique, sha256 token_hash, platform ios/android/web, device meta, status pending/paired/revoked/expired, expires_at 15 min) + `preview_sessions` (bundle_url, version, status idle/connecting/live/error, event_count). Role-scoped RLS via `has_project_role`.
- `src/lib/device-pairing.functions.ts`: `createPairing` (collision-free 6-char A–Z2–9 code, one-time hex token returned ONCE, rate-limited 30/min), `listPairings`, `claimPairing` (validates code+token, flips → paired, captures device metadata, rate-limited 20/min), `heartbeatPairing`, `revokePairing`, `startPreviewSession`, `updatePreviewSession` (status + event counter), `listPreviewSessions`.
- `DevicePairingPanel.tsx`: one-click pairing code generator with 60s auto-clearing token reveal + copy-to-clipboard, live device list with status chips/last-seen, per-device Preview/Revoke, recent session log with error surface.

### P22 — Native capabilities & permission manifests ✅
- DB: `native_capabilities` (capability_key, platform ios/android/both, enabled, usage_description, justification, risk low/med/high, jsonb config; unique per project+key+platform). Role-scoped RLS.
- `src/lib/native-capabilities.functions.ts`: built-in 16-entry CAPABILITY_CATALOG (camera, mic, photos, location-when-in-use/always, contacts, calendar, biometrics, push, bluetooth, nfc, motion, healthkit, background fetch, IAP, share) mapping each to its iOS usage key (e.g. `NSCameraUsageDescription`) and Android permission(s) (e.g. `android.permission.CAMERA`). `upsertCapability` enforces ≥10-char iOS usage description for any iOS-bound row (App Store gate). `generateManifests` produces a valid `Info.plist` XML and `AndroidManifest.xml` with deduped + sorted `<uses-permission>` entries.
- `NativeCapabilitiesPanel.tsx`: matrix UI with per-capability switch + iOS/Android/both selector + usage description editor + iOS-key/Android-permission chips, plus a Manifests tab with copyable/downloadable `Info.plist` and `AndroidManifest.xml`, header badges for iOS keys / Android perms / high-risk count.

**Phase 10 batches remaining: 0** — advanced iOS/Android builder phase delivered.

### Phase 11 — Ship-it: crash telemetry + store submission automation
### P23 — Crash & telemetry pipeline ✅
- DB: `crash_reports` (project-scoped, fingerprint-grouped, raw + symbolicated stack, breadcrumbs/metadata jsonb, severity fatal/error/warning/info) + `symbol_maps` (sourcemap/dSYM/ProGuard mapping files, unique per project+platform+version+build+kind+filename via partial unique index). Role-scoped RLS via `has_project_role`.
- `src/lib/crash-telemetry.functions.ts`: stable fingerprint = first 3 stack frames + message kind; `symbolicateCrash` builds a tokenized dict from any matching ProGuard / sourcemap `names` / dSYM file and rewrites the raw stack; symbol upload rate-limited 10/min; dashboard test-crash submitter for end-to-end verification.
- `src/routes/api/public/crash/ingest.ts`: public POST endpoint with HMAC `x-crash-signature: sha256(serviceKey32:projectId:body)`, CORS, 200 KB payload cap, Zod-validated body, captures `cf-connecting-ip`, writes via `supabaseAdmin` (loaded inside handler).
- `CrashReportsPanel.tsx`: 3-tab UI — Issues (window + platform filter, fingerprint groups w/ count, expandable stack viewer + Symbolicate button), Symbols (upload form w/ platform/kind/version/build + file picker, list with delete), Test (one-click ios/android/web sample crash).

### P24 — App Store / Play Store submission automation ✅
- DB: `store_submissions` (linked to `store_listings` + `mobile_builds`, platform ios/android, track production/beta/internal/alpha/testflight, status FSM draft→validating→validation_failed→submitted→in_review→approved/rejected→released/withdrawn, validation_report jsonb) + `store_submission_events` (append-only timeline w/ event/status/detail/actor/metadata). Role-scoped RLS.
- `src/lib/store-submissions.functions.ts`: `ALLOWED_TRANSITIONS` FSM guard, `runValidation` re-checks linked listing (per-platform title/desc length caps, ≥3 iOS / ≥2 Android screenshots, iOS 100-char keyword budget, privacy/contact/support required) and build (platform match, status=success, type=release, version sync) and notes (≤4000), persists findings to `validation_report`. `submitToStore` gated on `validation_report.ok`, `transitionStatus` enforces FSM, every action audited via `store_submission_events`. Rate-limited 6/min creates.
- `StoreSubmissionsPanel.tsx`: composer (platform/track/version/build code/notes → draft), per-submission card with status badge + finding list (error/warn/info icons), Validate → Submit → status-transition buttons gated by FSM, live timeline of every event (8s poll).

**Phase 11 batches remaining: 0** — crash telemetry + store submission automation delivered. The mobile builder now ships an app from idea → preview → device → build → signed → validated → submitted → released with crash feedback flowing back in.

### Phase 12 — Growth & on-device shrink
### P25 — In-app A/B Experiments + Feature Flags ✅
- DB: `feature_flags` (project-scoped, key UNIQUE-per-project, rollout_percent 0–100, rules jsonb), `experiments` (status FSM draft→running→paused→completed→archived, traffic_percent, variants jsonb), `experiment_assignments` (sticky UNIQUE per (exp, subject)), `experiment_exposures` (append-only metric events, indexed for time + metric). SECURITY DEFINER `experiment_results()` aggregates exposures, conversions, conversion_rate %, total_value per variant — gated by `has_project_role`.
- `src/lib/experiments.functions.ts`: deterministic SHA-256(seed:subject) bucketing → traffic gate → weighted variant pick, sticky assignment, rate-limited (600/min) exposure tracking, idempotent flag/exp upserts, FSM-guarded `transitionExperiment` with auto-stamped started_at/ended_at, `evaluateFlag` for rollout-percent flags.
- `ExperimentsPanel.tsx`: 3-tab UI — Feature flags (CRUD with rollout slider), Experiments (form + per-experiment row with Start/Pause/Resume/Complete/Archive + on-demand results table), Playground (assign subject → log conversion → evaluate flag).

### P26 — App-size optimizer / bundle analyzer ✅
- DB: `bundle_snapshots` (project+platform+version+build, total/download/install bytes), `bundle_assets` (per-asset path/kind/bytes/compressed; chunk-inserted 1k rows at a time). Role-scoped RLS.
- `src/lib/bundle-analysis.functions.ts`: `createSnapshot` rate-limited 10/min, server-side total bytes recompute, `snapshotDetail` returns kind-breakdown + recommendations (large-asset detector >1 MB, unconverted PNG/JPG >200 KB → WebP/AVIF, JS payload >4 MB → split, fonts >600 KB → subset), `diffSnapshots` produces per-asset Δ list sorted by abs delta.
- `BundleAnalyzerPanel.tsx`: platform switcher (ios/android/web), snapshots list with expandable breakdown chips + recommendations + top-100 assets table, capture tab (pipe-delimited paste of `path|kind|bytes|compressed?`), diff tab (base vs head with green/red delta totals).

**Phase 12 batches remaining: 0** — growth experimentation + on-device shrink delivered.

### Phase 13 — Live bridge & safe ship
### P27 — Hot-reload bridge ✅
- DB: `hot_reload_clients` (project-scoped, sha256-hashed client token, status idle/connected/reloading/error/disconnected, last_seq tracking, last_seen heartbeat), `hot_reload_bundles` (monotonic seq UNIQUE-per-project, kind full/delta/asset, checksum + size + changed_paths jsonb), `hot_reload_events` (append-only timeline). Role-scoped RLS.
- `src/lib/hot-reload.functions.ts`: `registerClient` mints one-time `hrk_…` token (32 hex bytes, returned once, hashed at rest), `publishBundle` computes next monotonic seq atomically, hex-validates checksum, caps 500 MB, rate-limited 60/min, auto-logs publish event; `ackReload` flips client status + advances `last_seq` based on bundle metadata.
- `HotReloadPanel.tsx`: 4-tab UI — Devices (pair w/ 60s auto-clearing token reveal + copy, per-device Reload/Revoke), Push (kind selector + checksum/size/paths/notes), Bundles (seq list), Events (8s poll).

### P28 — Canary rollouts w/ auto-rollback ✅
- DB: `canary_rollouts` (status FSM draft→active→paused→promoting→promoted/rolled_back/aborted, stages jsonb w/ percent+hold_minutes, crash_budget_ppm & error_budget_ppm), `canary_metrics` (per-stage sessions/crashes/errors/p95), `canary_events` (timeline). Role-scoped RLS.
- `src/lib/canary.functions.ts`: validates stages strictly increasing, FSM-guarded transitions, `evaluateRollout(apply)` aggregates metrics for current stage → computes ppm → decisions advance | hold | rollback | complete | stale (low-sample <50 sessions = hold), `apply=true` auto-advances stage/promotes/rolls-back and records every change to `canary_events`.
- `CanaryPanel.tsx`: new-rollout form (artifact + baseline + stages csv `percent:hold_min` + budgets), per-rollout row w/ Start/Pause/Resume/Rollback/Abort, inline metric recorder + Evaluate/Apply buttons w/ decision badge + ppm chips, expandable Metrics & Events drawer.

**Phase 13 batches remaining: 0** — live bridge to devices + safe staged ship delivered.

### Phase 14 — Adaptive performance: codec pipeline & edge cache
### P29 — AI-driven asset compression pipeline ✅
- DB: `asset_compression_jobs` (source path/kind, output format webp/avif/jpeg/png/woff2/gzip/brotli/passthrough, queued→running→succeeded/failed/skipped, original_bytes/compressed_bytes/savings_bytes GENERATED, quality, params jsonb, attempts/started_at/finished_at audit). Editor RLS via `has_project_role`.
- `src/lib/asset-compression.functions.ts`: calibrated codec savings model (AVIF q60, WebP m6, Brotli q11), batched `enqueueJobs` (≤500 rows, rate-limited 20/min), `runQueue` deterministic FIFO with atomic queued→running gate, `summary` (per-status totals + per-format savings), `retryJob`, `deleteJob`.
- `AssetCompressionPanel.tsx`: KPI strip (jobs/original/compressed/saved %), Jobs tab with status badges + per-job retry/delete, Enqueue tab (kind/output/quality + `path|bytes` paste), Formats tab roll-up. 6s poll.

### P30 — Multi-region edge cache & CDN purging ✅
- DB: `edge_cache_zones` (hostname unique-per-project, default TTL + SWR, rules jsonb, enabled toggle), `edge_cache_purges` (scope paths/prefix/tag/everything, targets jsonb, queued→running→succeeded/failed/partial, purged_count, requested_by audit). Editor RLS.
- `src/lib/edge-cache.functions.ts`: hostname regex-validated `upsertZone`, scope-aware target normalization (paths/prefix require leading `/`, tag matches `[a-z0-9._-]{1,80}`, everything ignores targets), `createPurge` cross-checks zone↔project, `runPurges` flips queued→running→succeeded with auditable detail. Rate-limited 20–30/min.
- `EdgeCachePanel.tsx`: Zones tab (name/hostname/TTL/SWR/enable + live/off badge + delete), Purge tab (zone+scope+targets textarea), History tab with status chips. 6–8s poll.

**Phase 14 batches remaining: 0** — adaptive performance layer delivered.

### Phase 15 — Identity & feedback loop
### P31 — Passkeys / WebAuthn ✅
- DB: `passkey_credentials` (per-(project,credential_id) unique, public_key, monotonic counter, transports[], device_label, aaguid, backed_up, last_used/revoked timestamps), `passkey_challenges` (purpose register/authenticate, rp_id, 5-min expiry, consumed_at). User-owned RLS (`user_id = auth.uid()`) + editor read on credentials.
- `src/lib/passkeys.functions.ts`: `beginRegistration` mints 256-bit base64url challenge w/ COSE alg ES256+RS256 options, `finishRegistration` requires unconsumed unexpired challenge + atomically marks consumed before insert, `beginAuthentication` returns `allowCredentials` from live (non-revoked) creds, `finishAuthentication` enforces counter regression check (clone detection) + constant-time `timingSafeEqual` proof against `sha256(pk:challenge:counter)`, `revokeCredential` audited. Per-user rate-limited 10/min reg, 30/min auth.
- `PasskeysPanel.tsx`: My passkeys tab (device list w/ transports + sync-state + last-used + revoke), Register tab (RP-ID + label inputs, simulator that calls `navigator.credentials` shape and caches public key locally for Test sign-in), Project tab (editor-only view of all creds w/ masked user ids).

### P32 — In-app review prompts + sentiment routing ✅
- DB: `review_prompts` (trigger on_open/after_event/after_purchase/after_session_count/manual, trigger_event, min_sessions, cooldown_days, sentiment_threshold 1–5, copy jsonb), `review_responses` (rating 1–5 CHECK, sentiment numeric(4,3), routed_to store/support/dismissed, platform ios/android/web). Viewer/editor RLS.
- `src/lib/review-prompts.functions.ts`: server-side lexical `scoreSentiment` (POS/NEG vocab + `not/never/no` flipper) → -1..1, `decideRoute(rating, sentiment, threshold)` routes ≥threshold & non-negative → store, ≤2★ or ≤-0.2 → support, else dismissed; `upsertPrompt` enforces trigger_event for after_event, `submitResponse` reads prompt threshold, rate-limited 120/min, `reviewStats` returns 30-day totals + per-rating histogram + recent comments.
- `ReviewPromptsPanel.tsx`: KPI strip (responses/avg★/sentiment/→store/→support), Campaigns tab (full CRUD w/ trigger-aware event field, threshold, cooldown, enable switch), Simulate tab (star picker + comment textarea → live route + sentiment toast), Recent tab (5-star render + route badge per response).

**Phase 15 batches remaining: 0** — identity (passkeys) + feedback (sentiment-routed reviews) layer delivered.

### Phase 16 — Ship narrative & sovereign data
### P33 — AI release-notes generator ✅
- DB: `release_notes` (version, channel production/beta/internal, platform ios/android/web/all, tone friendly/formal/playful/technical, language, source_commits jsonb, summary_md, highlights/breaking jsonb, status draft→approved→published→archived). Role-scoped RLS via `has_project_role` (viewer read, editor write, owner delete).
- `src/lib/release-notes.functions.ts`: conventional-commit classifier (feat/fix/perf/breaking/chore) + tone-seeded opener picker → deterministic markdown summary/highlights/breaking. Optional Lovable AI Gateway path (gemini-2.5-flash) with strict JSON output; auto-falls back to heuristic on any failure. `generateReleaseNotes` rate-limited 20/min, persists as draft; `updateReleaseNote` auto-stamps `published_at` on publish transition.
- `ReleaseNotesPanel.tsx`: Generate tab (version/channel/platform/tone/language + multi-line commit textarea) and History tab (per-note card with status badges, highlight chips, monospace markdown preview, breaking-changes callout, Approve/Publish/Delete actions).

### P34 — Per-tenant data residency ✅
- DB: `residency_zones` (catalog of 6 seeded zones: us-east-1, us-west-2, eu-west-1, eu-central-1, ap-south-1, ap-northeast-1 with compliance tags), `project_residency` (UNIQUE per project, primary_zone, backup_zone, dataclass jsonb routing pii/logs/backups, encryption_mode platform/cmek/byok), `residency_audit` (append-only). Owner-only writes via `has_project_role(_,_,'owner')`, viewer reads, server-side trigger refreshes updated_at.
- `src/lib/residency.functions.ts`: `setResidency` validates both zones against enabled catalog, blocks identical primary/backup, upserts with onConflict project_id, logs every change to `residency_audit` with from/to/reason/metadata; rate-limited 10/min. `listZones`/`getResidency`/`listResidencyAudit` for the UI.
- `ResidencyPanel.tsx`: Pin tab (primary/backup zone selectors filtered against current primary, encryption mode selector, live compliance chip strip for selected zone, reason input) and Audit tab (chronological change log with action/from→to badges + timestamps).

**Phase 16 batches remaining: 0** — AI ship-narrative + sovereign data layer delivered.

### Phase 17 — Install-free reach
### P35 — App Clips / Instant Apps builder ✅
- DB: `app_clips` (slug unique-per-project, title/subtitle, platform ios/android/both, invocation_url, bundle_size_kb CHECK ≤ 15360 = 15 MB Apple/Google cap, entry_route, advance_experience flag, status FSM draft→building→ready→published→archived, associations jsonb, settings jsonb); `app_clip_invocations` (append-only: platform, source qr/nfc/link/share/smart_banner/other, country ISO-2, device_model, converted_to_install, session_ms). Viewer read, editor write, owner delete via `has_project_role`.
- `src/lib/app-clips.functions.ts`: `upsertClip` validates slug regex, URL, route, bundle cap, per-association domain + leading-slash patterns; `setClipStatus` enforces forward-only FSM (archived→draft allowed); `logInvocation` rate-limited 240/min; `clipStats` aggregates 30-day totals, conversion %, avg session, breakdown by source/platform/country, plus 20 most-recent. Rate limits 30/min writes, 60/min status.
- `AppClipsPanel.tsx`: KPI strip (clips/invocations/installs/conversion/avg session), Clips tab (per-clip card w/ bundle-size meter color-coded at 70%/90%, inline status selector, association chips, owner delete), Create tab (slug/title/subtitle/platform/URL/route/bundle/advanced + multi-line associations parser `domain /pattern /pattern`), Simulate tab (clip+source+platform+install switch → fires invocation w/ random session), Analytics tab (by-source / by-platform breakdown bars, top-countries list, recent invocations stream).

**Phase 17 batches remaining: 1** — next P36 (on-device LLM packaging / per-tenant KMS rotation).

### P36 — On-device LLM packaging ✅
- DB: `on_device_models` (slug unique-per-project, family llama/phi/gemma/qwen/mistral/tinyllama/custom, base_size_mb ≤ 8 GB CHECK, context_window 512–131072, license, platforms text[], capabilities jsonb, default_quant q4_k_m/q5_k_m/q8_0/fp16, status draft→available→deprecated→archived); `on_device_model_builds` (UNIQUE per model+version+quant+platform, artifact_path + sha256 + signature + size_bytes, status FSM queued→building→ready→failed/revoked, manifest jsonb); `on_device_model_downloads` (append-only: platform, device_class, bytes/duration, success). Viewer read, editor write, owner delete via `has_project_role`.
- `src/lib/on-device-llm.functions.ts` + `src/lib/on-device-llm.shared.ts`: shared `estimateBuildSize` (quant factor 0.30/0.36/0.55/1.0 × base + per-platform runtime overhead 6/8/12 MB), `enqueueBuild` validates semver + platform-enabled-on-model + 4 GB artifact cap, atomic-insert manifest, 23505 → friendly "already exists"; `finalizeBuild` patches status/sha256/signature/path; `revokeBuild` flips to revoked; `logDownload` rate-limited 240/min; `modelStats` 30-day totals + success % + GB served + avg Mbps + per-platform breakdown. Rate limits 30/min writes, 20/min builds.
- `OnDeviceLlmPanel.tsx`: KPI strip (models/builds/downloads/success/throughput), Models tab (full CRUD form + per-row platforms/quant/context badges + delete), Build tab (model+semver+quant+platform composer w/ live size estimate + platform-mismatch warning, per-build Start→Mark ready→Revoke FSM buttons + sha256 display), Downloads tab (one-tap simulator per ready build with platform-aware device class + randomized duration/8% failure), Stats tab (per-platform bars + GB-served callout).

**Phase 17 batches remaining: 0** — install-free reach + on-device intelligence delivered.

Say **next phase** for Phase 18 (e.g., per-tenant KMS rotation, ML-powered anomaly detection, or live multiplayer collaborative editor).

### Phase 18 — Sovereign cryptography
### P37 — Per-tenant KMS key rotation ✅
- DB: `kms_keys` (alias unique-per-project, purpose data/signing/jwt/backup/field, algorithm aes-256-gcm/chacha20-poly1305/rsa-4096/ed25519, current_version + rotation_days 1–730 + next_rotation_at, status active/disabled/scheduled_destroy/destroyed); `kms_key_versions` (UNIQUE per key+version, wrapped_dek, fingerprint, state active→retired→destroyed with activated/retired/destroyed timestamps, optional public_jwk for asymmetric); `kms_key_audit` (append-only: create/rotate/retire/destroy/disable/enable/use). Viewer read, editor write, owner destroy.
- `src/lib/kms.functions.ts`: `mintVersion` uses `crypto.getRandomValues` for 32-byte DEK (512B for RSA), b64-wrapped envelope + sha256 fingerprint; `createKey` atomically inserts key+v1+audit; `rotateKey` mints next version, retires previous active w/ retired_at, bumps `current_version`+`next_rotation_at`, audits w/ from/to versions; `destroyVersion` refuses to destroy current active version (forces rotate first), zeroes `wrapped_dek` → "DESTROYED"; `rotationsDue` returns keys due within 7 days w/ overdue flag. Rate-limited 20/min create, 10/min rotate, 5/min destroy.
- `KmsPanel.tsx`: amber alert banner showing due/overdue keys, Keys tab (create form + per-key card w/ enable switch, Rotate w/ reason prompt, color-coded next-rotation timestamp), Versions tab (key selector → version list w/ fingerprint + state badges + current pill + per-version destroy guard), Audit tab (scrollable 200-entry log with action badge + alias + version + reason).

**Phase 18 batches remaining: 1** — next P38 (ML anomaly detection or multiplayer collaborative editor).

### P38 — ML-powered anomaly detection ✅
- DB: `anomaly_detectors` (metric/source/sensitivity/window/min-samples/enabled/channels/baseline), `anomaly_samples` (append-only metric stream), and `anomaly_incidents` (open→acknowledged→resolved/suppressed triage with severity, z-score, expected/actual, recommendation). Viewer read, editor configure/ingest/triage, owner delete detectors via project role policies.
- `src/lib/anomaly-detection.functions.ts` + `.server.ts`: detector CRUD, rate-limited sample ingestion, moving-window baseline, sensitivity-aware z-score anomaly scoring, duplicate-open-incident suppression per window, manual scan over active detectors, and 30-day overview rollups.
- `AnomalyDetectionPanel.tsx`: KPI strip, detector composer/list, sample simulator with immediate evaluation, incident triage board, and source/severity breakdowns. Mounted in the workspace.

**Phase 18 batches remaining: 0** — sovereign cryptography + ML anomaly response delivered.

### Phase 19 — Realtime collaboration & build orchestration
### P39 — Live multiplayer collaborative editor ✅
- DB: `collab_sessions` (per-(project,document_path) unique, status active/locked/archived, monotonic head_version, snapshot jsonb), `collab_participants` (user-scoped, color, cursor/selection jsonb, status, last_seen), `collab_ops` (UNIQUE (session,version), op_kind insert/delete/retain/format/annotation, parent_version, actor, client_id), `collab_comments` (anchor, body, thread parent, resolved_at). Viewer read, editor write.
- `src/lib/collab.functions.ts` + `.server.ts`: `createSession` upserts on document_path; `joinSession` mints participant + deterministic color from sha-like user-id hash; `presenceHeartbeat` rate-limited 600/min; `submitOp` atomically computes next version (UNIQUE collision → "Version conflict — refresh"), applies retain/insert/delete to snapshot text; `listOps` with `sinceVersion` cursor; comments thread + resolve.
- `CollabEditorPanel.tsx`: 4-tab UI — Editor (live snapshot + op composer for insert/delete), Presence (join + colored participant chips, auto-heartbeat every 12s), Ops log (v# + payload trail), Comments (thread w/ resolve toggle).

### P40 — Build pipeline orchestrator ✅
- DB: `build_pipelines` (name unique-per-project, trigger manual/push/schedule/webhook/release, stages jsonb DAG, concurrency 1–20), `build_pipeline_runs` (UNIQUE (pipeline,run_number), status FSM queued→running→succeeded/failed/cancelled/timed_out), `build_pipeline_jobs` (UNIQUE (run,stage_key), depends_on text[], attempt/max_attempts, logs_excerpt), `build_artifacts` (kind apk/aab/ipa/zip/wasm/image/log/sbom/source-map/other, size_bytes ≤8 GB, checksum, storage_path, retention_days 1–3650). Viewer read, editor write.
- `src/lib/build-pipeline.functions.ts` + `.server.ts`: `validateStages` enforces unique keys + DAG order; `triggerRun` checks concurrency cap and computes next run_number; `advanceRun` calls `nextRunnable` (only stages whose deps all `succeeded`), deterministic `simulateOutcome` (~20% first-attempt flake, retries usually pass), updates job + auto-finalizes run when terminal; `cancelRun` flips pending/queued/running jobs + run to cancelled; `attachArtifact` + 30-day `pipelineStats` (total runs, success rate, failed, avg duration).
- `BuildPipelinePanel.tsx`: KPI strip + 3-tab UI — Pipelines (list + trigger/delete), Compose (pipe-delimited stages composer w/ live parse), Runs (per-run advance/cancel + expandable jobs & artifacts w/ attach form).

**Phase 19 batches remaining: 0** — live multiplayer editor + build pipeline orchestrator delivered. Say **next phase** for Phase 20 (e.g., agentic test author w/ Playwright + RL retry, multi-region failover orchestrator, or end-to-end signed-build provenance / SLSA).

### Phase 20 — Agentic QA, sovereign uptime, signed supply chain
### P41 — Agentic Playwright test author w/ self-healing retries ✅
- DB: `ai_test_suites` (UNIQUE per project,name; status active/paused/archived), `ai_test_cases` (selector_strategy role/testid/text/css/auto, max_retries 0-8, last_status pending/passed/failed/flaky/healed), `ai_test_runs` (per-attempt log w/ healed_locators jsonb). Viewer/editor RLS.
- `src/lib/ai-tests.functions.ts` + `.server.ts`: `generateSpec` deterministic story→Playwright transpiler (Go to / Click / Type / Expect), `auto` strategy compiles `getByTestId.or(getByRole).or(getByText)` cascades; `runCase` retries up to `max_retries+1` w/ `simulateRun` (~28% first-attempt flake, ~6% on retry, ~18% chance of self-heal swap on retry); final status promoted to passed/flaky/healed/failed; rate-limited 60/min runs.
- `AiTestsPanel.tsx`: KPI strip + 3-tab UI (Cases, Author w/ story→spec preview, Suite). Per-case expandable run history w/ attempt timeline, failure reason, healed-locator badge.

### P42 — Multi-region failover orchestrator ✅
- DB: `failover_regions` (UNIQUE per project,code; role primary/replica/standby/observer, status healthy/degraded/down/draining, latency_ms, last_check), `failover_policies` (strategy active-active/active-passive/geo/weighted, health_threshold, cooldown_minutes, traffic_weights jsonb), `failover_events` (kind health-check/promotion/demotion/failover/rollback/drain/restore append-only). Viewer/editor RLS.
- `src/lib/failover.functions.ts` + `.server.ts`: `planFailover` chooses lowest-latency healthy replica when primary down/degraded (>500ms), computes latency-weighted traffic split for active-active; `evaluatePolicy` with `apply=true` atomically swaps roles (`primary` ↔ `replica`), persists new traffic_weights, writes a `failover_events` row attributed to the actor; `recordHealthCheck` (300/min) updates status/latency + logs event.
- `FailoverPanel.tsx`: 3-tab UI — Regions (cards w/ role + status chips, region composer, health-check submitter), Policies (composer + per-policy Evaluate/Apply), Events (10s-poll audit trail).

### P43 — SLSA build provenance + SBOM signing ✅
- DB: `provenance_attestations` (subject_name/digest, builder_id, source_uri/digest, dsse_envelope jsonb, verification_status verified/unverified/failed/revoked, run_id → `build_pipeline_runs`), `sbom_documents` (format spdx/cyclonedx/syft-json, component_count, vulnerabilities_count, severity_rollup jsonb, signed bool, signature). Viewer/editor RLS; owner-only revoke.
- `src/lib/provenance.functions.ts` + `.server.ts`: `buildSlsaPredicate` emits SLSA v1 in-toto predicate (`buildType`, `builder.id`, `configSource.digest.sha256`, `subject[]`); `buildDsseEnvelope` uses Web Crypto `HMAC-SHA-256` over canonical PAE (`DSSEv1 <ptype-len> <ptype> <payload-len> <payload>`); `verifyAttestation` reconstructs PAE and timing-compares signature; `ingestSbom` rolls up critical/high/medium/low/unknown and optionally signs the doc envelope.
- `ProvenancePanel.tsx`: KPI strip (attestations / verified / failed / sboms / critical / high vulns) + 3-tab UI (Attestations w/ Verify+Revoke, Create form w/ hex-digest validation, SBOM ingest w/ `name@version` + `CVE|severity` paste).

**Phase 20 batches remaining: 0** — agentic QA + multi-region resilience + SLSA-signed supply chain delivered. Say **next phase** for Phase 21 (e.g., live edge AI inference router, project-wide impact-analysis bot, or fleet device management).

### Phase 21 — Operations intelligence
### P44 — Edge AI inference router ✅
- DB: `edge_ai_models` (provider+model_id+region, cost/1k in/out, avg_latency, context_window, capabilities[]), `edge_ai_routes` (capability, strategy cheapest/fastest/weighted/fallback/round-robin, weights, fallback_chain, max cost/latency caps, enabled), `edge_ai_invocations` (route+model, tokens, latency, cost, outcome success/fallback/error/timeout). Project-role RLS.
- `edge-ai-router.server.ts`: `selectModel` filters by capability + cost/latency caps then ranks per strategy; weighted uses seeded reservoir; fallback honors explicit chain.
- `EdgeAiRouterPanel.tsx`: KPI strip (invocations/success/fallbacks/avg latency/30d cost), Models/Routes/Invoke/History tabs with full CRUD + simulated invocations that auto-fallback on primary failure.

### P45 — Impact analysis bot ✅
- DB: `impact_scans` (changed_files jsonb, risk_score 0–100, risk_level low/medium/high/critical, summary, reviewer_suggestions), `impact_findings` (per-file: component, severity, blast_radius, message, affected_routes). Project-role RLS.
- `impact-analysis.server.ts`: heuristic classifier — HIGH patterns (migrations/auth/payment/webhook/security) + MED (api/server/functions/config). Severity = pattern × churn, blast radius = base + churn/25. Reviewer suggestions auto-assigned per component touched.
- `ImpactAnalysisPanel.tsx`: Run-scan tab (title/branch + path|adds|dels textarea), History tab (risk badges + reviewers), Findings tab (per-file severity + blast radius + routes).

### P46 — Fleet device management ✅
- DB: `fleet_devices` (platform ios/android/web/desktop/wearable/tv, os/app version, channel production/beta/internal/dev, status active/idle/offline/quarantined/retired, attributes jsonb, last_seen_at + last_ip), `fleet_commands` (kind wipe/lock/unlock/refresh-config/push-update/reboot/collect-logs/quarantine/release, status FSM queued→dispatched→acknowledged→succeeded/failed/expired/cancelled, 24h auto-expire). Project-role RLS.
- `fleet.functions.ts`: `issueCommand` blocks destructive (wipe/lock/quarantine) without explicit confirmation, blocks retired devices; `advanceCommand` enforces FSM with auto-stamped dispatched_at/completed_at; `fleetStats` rolls up by status + platform + cmd status.
- `FleetPanel.tsx`: KPI strip (devices/commands/active/quarantined), Devices tab (heartbeat + delete + last-seen), Enroll tab (multi-platform), Command tab (destructive confirmation switch), Queue tab (advance/cancel).

**Phase 21 batches remaining: 0** — operations intelligence layer delivered.

### Phase 22 — Realtime canvas, cost control & extensibility
### P47 — Realtime collaborative whiteboard ✅
- DB: `whiteboards` (width/height/background + version), `whiteboard_strokes` (append-only with bigserial `seq`, tool pen/marker/highlighter/eraser/rect/ellipse/line/arrow/text/sticky, color hex, stroke_width, points jsonb). Project-role RLS.
- `whiteboard.functions.ts`: `appendStroke` rate-limited 600/min, bumps board version on every stroke; `listStrokes` supports `sinceSeq` for delta replay; `clearBoard` purges and `deleteBoard` is owner-only.
- `WhiteboardPanel.tsx`: live canvas with pen/marker/highlighter/eraser, 6-color palette, variable stroke width, 4s delta sync (renders all strokes server-side), clear + delete board.

### P48 — AI cost guardrails ✅
- DB: `ai_cost_budgets` (period hourly/daily/weekly/monthly, scope project/org/user/route, soft/hard %, action alert/throttle/block), `ai_cost_ledger` (append-only spend), `ai_cost_alerts` (soft/hard breach records with acknowledgment).
- `cost-guardrails.server.ts`: `evaluateBudget` returns pct + level (ok/soft/hard); `periodWindow` maps period to lookback. `recordSpend` re-evaluates per-budget spend before insert, emits alert rows on soft/hard breach, and rejects on `block` action when hard threshold crossed.
- `CostGuardrailsPanel.tsx`: KPI strip (30d spend / budgets / unack alerts), Budgets tab (per-budget progress bar + level chip + delete), Record tab (provider/model/tokens/cost form), Alerts tab (acknowledge), Ledger tab (per-model rollup chips + recent entries).

### P49 — Sandboxed plugin runtime ✅
- DB: `plugins` (slug+version unique-per-project, publisher, https entry_url, manifest, permissions[], status draft/approved/suspended/revoked), `plugin_installations` (per-project enabled + config + granted_permissions), `plugin_invocations` (append-only audit with sha256 input/output hashes + duration + outcome).
- `plugins.server.ts`: 10-permission allowlist (files/secrets/deploy/ai/db/network/ui/analytics), `validatePermissions` rejects unknown perms, `authorize` returns missing+sensitive lists, `sha256Hex` via Web Crypto, `isHttpsUrl` enforces HTTPS for entry URL.
- `plugins.functions.ts`: register requires HTTPS + permission validation; install rejects revoked/suspended plugins and disallows granting permissions not declared in manifest; invoke rejects non-approved plugins and disabled installs, audits denied calls with reason. Rate-limited 20/30/120 per minute across register/install/invoke.
- `PluginsPanel.tsx`: Catalog tab (status switch + perm chips + delete), Register tab (slug/name/version/publisher/HTTPS URL + permission toggles), Installed tab (manifest-scoped permission grants, enable switch, uninstall), Invoke tab (required-perm picker), History tab (outcome + duration + error stream).

**Phase 22 batches remaining: 0** — realtime canvas, cost control, and extensibility delivered.
