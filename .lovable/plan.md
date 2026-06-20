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
