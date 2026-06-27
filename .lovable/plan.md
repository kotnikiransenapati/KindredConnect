
# Foundry v2 — 3D-Native, Platform-Agnostic Website & App Builder

A complete re-architecture brief. The current product has ~80 workspace panels but the builder itself is conventional 2D + scaffolded templates. v2 makes the *entire authoring surface* spatial 3D, ships a real generation pipeline that produces hostable artifacts, and decouples every runtime concern (hosting, auth, DB, payments, storage, AI) behind portable adapters so the output runs on any cloud or self-host target.

---

## 1. Product Pillars

1. **3D-native workspace** — the canvas, file tree, component library, preview, and inspector live inside a single WebGPU scene. Not decorative — it *is* the editor.
2. **Real generation pipeline** — prompt → IR (intermediate representation) → codegen → typecheck → build → preview → deploy. Deterministic, resumable, inspectable at every stage.
3. **Portable runtime** — every backend capability (auth, db, storage, functions, payments, email, push, AI) goes through an adapter interface. Switch Supabase ↔ Firebase ↔ self-hosted Postgres without rewriting app code.
4. **One source, many targets** — same project compiles to Web (SSR/SSG/SPA), iOS, Android, Desktop (Tauri), PWA, and embeddable widget.
5. **Hosting-agnostic deploys** — Vercel, Cloudflare, Netlify, Fly, Render, Railway, AWS, GCP, Azure, or Docker/Kubernetes via a unified deploy adapter.

---

## 2. The 3D Workspace (Phase A — 8 batches)

Stack: **WebGPU** (fallback WebGL2) via **three.js r170** + **@react-three/fiber 9** + **drei** + **rapier** for physics-based interactions. UI in 3D via **@react-three/uikit** for crisp text/forms inside the scene. **Yjs** for CRDT collab.

### A1 — Scene foundation
- Single persistent `<Canvas>` mounted at workspace root, infinite grid floor, HDRI environment, post-processing (SSAO, bloom, TAA), orthographic toggle for precise layout.
- Camera rig: orbit + first-person + "dolly to selection" with cinematic transitions (damped springs).
- Performance budget: 60fps @ 1440p on M1 / RTX 3060; auto-degrade tier (disable SSAO → drop shadows → WebGL2 → 2D fallback).

### A2 — Spatial file system
- Files materialize as floating cards arranged in a force-directed graph; folders are clustered nebulae; imports drawn as glowing edges. Click → camera dollies in, card expands to Monaco editor projected onto a curved plane.

### A3 — Component palette as a physical library
- Left wall = shelves of 3D component "blocks" (Button, Card, Form, Hero…). Drag a block out → it floats, snap-aligns to the canvas grid, drops into the page tree with haptic-style spring.

### A4 — Live preview as a 3D device
- Right side renders the live app inside a 3D iPhone / iPad / laptop / desktop mesh (real GLB models). Tilt/rotate the device; preview updates in real time via iframe-texture. Multi-device side-by-side.

### A5 — Inspector as a holographic HUD
- Selecting a node spawns a floating uikit panel anchored to it. Props, styles, a11y, data bindings, animation timeline — all in-scene, no DOM overlay.

### A6 — Timeline & animation editor in 3D
- Z-axis = time. Keyframes are nodes you grab and drag. Scrub by walking the camera along Z.

### A7 — Collaboration presence
- Each collaborator = an avatar with a name tag and a laser-pointer cursor in the scene. Voice via WebRTC mesh, spatial audio (pan by avatar position). Yjs syncs scene graph + code.

### A8 — Accessibility & 2D fallback
- Full keyboard nav (tab cycles selectable nodes with camera focus). Screen-reader mode flattens to a semantic DOM tree. `?ui=flat` query param forces 2D editor for low-power devices. **Non-negotiable** — 3D is the default, not a wall.

---

## 3. Generation Pipeline (Phase B — 7 batches)

Replace the "AI writes files directly" model with a typed IR.

```text
 Prompt ──► Planner LLM ──► Spec (JSON)
                              │
                              ▼
                         Project IR
              ┌─────────────────────────────┐
              │ pages[], components[],      │
              │ data models[], routes[],    │
              │ flows[], integrations[],    │
              │ theme, i18n, perms          │
              └─────────────────────────────┘
                              │
              ┌───────────────┼────────────────┐
              ▼               ▼                ▼
         Web codegen    Mobile codegen   Backend codegen
         (TanStack)     (Expo/RN +       (adapters: SQL
                         Capacitor)        migrations,
                                          functions,
                                          policies)
                              │
                              ▼
                    tsc + eslint + vitest
                              │
                              ▼
                    Build (turbo, esbuild)
                              │
                              ▼
                     Sandboxed preview
                              │
                              ▼
                    Deploy adapter(s)
```

### B1 — IR schema + validator (Zod) + round-trip (IR ⇄ files).
### B2 — Planner agent (Gemini 2.5 Pro) emits Spec; Critic agent validates against schema + heuristics; loop until valid.
### B3 — Deterministic codegen (handlebars-style templates per target) — same IR always produces byte-identical output.
### B4 — Sandboxed build worker (isolated container per project; turbo cache keyed on IR hash).
### B5 — Live preview via per-project sub-domain on Cloudflare Workers + R2; HMR over WebSocket back into the 3D device.
### B6 — Diff-and-patch: edits to the IR generate minimal file diffs, not full rewrites; user reviews in a 3D diff viewer.
### B7 — Pipeline observability — every stage emits structured events; replayable timeline panel.

---

## 4. Portable Runtime Adapters (Phase C — 6 batches)

Every generated app imports from `@app/runtime`, never from a vendor SDK directly.

```ts
// generated app code — vendor-free
import { auth, db, storage, fn, ai, pay, mail, push } from "@app/runtime";
```

`@app/runtime` resolves at build time to the chosen adapter set via `foundry.config.ts`.

### C1 — Auth adapter
Interfaces: `signIn`, `signUp`, `signOut`, `getUser`, `onAuthChange`, `oauth(provider)`, `mfa`, `passkey`.
Implementations: Supabase, Firebase, Auth0, Clerk, Cognito, Keycloak, **self-hosted (Lucia + Postgres)**.

### C2 — Database adapter
Query builder modeled on Drizzle. Schema in IR → migrations per backend.
Implementations: Postgres (Supabase, Neon, RDS, self-host), MySQL (PlanetScale), SQLite (Turso, D1), Firestore, DynamoDB.

### C3 — Storage adapter
S3-compatible API surface. Implementations: S3, R2, GCS, Azure Blob, Supabase Storage, MinIO (self-host).

### C4 — Functions/edge adapter
Same handler signature compiled to: Cloudflare Workers, Vercel Functions, Netlify Functions, AWS Lambda, GCP Cloud Functions, Deno Deploy, Node/Express (self-host).

### C5 — AI adapter
Lovable AI Gateway by default; pluggable to OpenAI, Anthropic, Google, Bedrock, Ollama (self-host), vLLM.

### C6 — Payments / Email / Push adapters
Payments: Stripe, Paddle, Razorpay, LemonSqueezy. Email: Resend, Postmark, SES, SendGrid. Push: FCM, APNs, OneSignal, Web Push (VAPID self-host).

---

## 5. Cross-Platform Targets (Phase D — 5 batches)

### D1 — Web target
TanStack Start (SSR/SSG/SPA modes). Output: static bundle OR Docker image OR adapter-specific zip (Vercel, CF Pages, Netlify).

### D2 — Mobile target
Expo SDK 54 + React Native 0.78 + **Capacitor 7** fallback for web-wrapped pages. Generates Xcode + Android Studio projects, signs with user-supplied certs, submits via Fastlane to App Store Connect + Play Console (already partially scaffolded — wire to real pipeline).

### D3 — Desktop target
Tauri 2 (Rust shell) — same React UI, native menus/tray/notifications, ~8MB binary. Windows/macOS/Linux.

### D4 — PWA target
Installable, offline-first via Workbox-generated SW, push via VAPID, share target, file handlers.

### D5 — Embeddable widget target
Single `<script>` tag → mounts into any host page in a shadow DOM, talks to the same backend adapters.

---

## 6. Deploy Orchestrator (Phase E — 4 batches)

### E1 — Deploy adapter interface (`plan`, `apply`, `rollback`, `status`, `logs`).
### E2 — Bring-your-own-cloud — user pastes provider tokens; Foundry stores in KMS-encrypted vault (already built), uses them to provision.
### E3 — Self-host export — one-click "Download Docker Compose / Helm Chart / Terraform" that recreates the full stack (app + db + storage + functions) on user's own infra.
### E4 — Multi-region + canary — leverage existing failover + canary panels to drive real traffic shifts via the deploy adapter.

---

## 7. Security, Observability, Governance (Phase F — 3 batches)

### F1 — Generated apps ship with: RLS on every table, CSP headers, rate limiting middleware, audit log, secret rotation, dependency scanning gate in the pipeline.
### F2 — OpenTelemetry by default — traces/metrics/logs exported to user's collector (Honeycomb, Datadog, Grafana Cloud, self-host Tempo/Loki).
### F3 — Compliance bundles — SOC2/HIPAA/GDPR profiles toggle stricter defaults (PII tagging, retention, residency pinning — wire to existing residency panel).

---

## 8. Batch Plan (38 batches total)

| Phase | Batches | Focus |
|-------|---------|-------|
| A | 8 | 3D workspace |
| B | 7 | Generation pipeline |
| C | 6 | Runtime adapters |
| D | 5 | Cross-platform targets |
| E | 4 | Deploy orchestrator |
| F | 3 | Security/observability |
| **+** | 5 | Polish, docs, marketplace v2, billing, onboarding |

I'll execute **3 batches per turn**, in order A→F, posting remaining count after each turn. Each batch ships: migrations + server fns + UI panel + adapter code + tests + plan.md update.

---

## 9. Technical Decisions (non-negotiable)

- **WebGPU primary, WebGL2 fallback** — no Babylon, no Unity Web.
- **IR is the source of truth** — files are derived; never hand-edited as the canonical state (hand edits round-trip back into IR via parser).
- **Adapters live in `packages/runtime-*` workspaces** — generated apps depend on `@app/runtime` only.
- **No vendor lock-in in generated code** — grep for `supabase`/`firebase` in a generated app should return zero hits outside the adapter package.
- **Reproducible builds** — IR hash → build cache → deploy artifact, all content-addressable.

---

## 10. What stays / what changes

**Keeps** (already strong): auth scaffolding, KMS vault, residency, canary, failover, plugin runtime, evidence vault, build pipeline orchestrator, AI test generator, anomaly detection, cost guardrails — these become *capabilities of the generated apps too*, not just the builder.

**Replaces**: current 2D workspace shell, "AI writes files directly" loop, Supabase-coupled generated code, single-target (web only) output.

---

Approve and I'll start with **Phase A, Batches A1–A3** (scene foundation, spatial file system, component palette) — 35 batches remaining after that.
