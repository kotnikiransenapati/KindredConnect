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
