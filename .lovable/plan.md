
# Lovable-like Platform — Phased Build

A full clone is multi-week work. I'll ship it in phases so each phase is usable and reviewable. You confirm at each checkpoint.

## Product scope (target end state)

An AI app builder where signed-in users can:
1. Create "projects" from a prompt.
2. Chat with an AI that proposes/edits a virtual file tree per project.
3. See a live in-browser preview of the generated app (sandboxed).
4. Manage versions, share/publish, manage billing.

## Phases

### Phase 1 — Foundations (this turn)
- Enable Lovable Cloud (Postgres + auth + AI Gateway).
- Brand + design system: pick one strong direction (I'll design it, no proxy dependency on Three.js/etc.), oklch tokens, gradients, motion-ready.
- Marketing routes: `/` (hero, features, how-it-works, pricing teaser, footer), `/pricing`, `/docs` (placeholder), `/auth`.
- Email/password + Google auth via Lovable Cloud.
- Protected `/app` dashboard: list projects, create project (name + initial prompt), delete, open.
- DB: `profiles` (auto-created on signup via trigger), `projects` (owner-scoped, RLS).
- SEO metadata per route, semantic HTML, accessible.

### Phase 2 — Chat-to-code MVP
- Project workspace route `/app/$projectId` with chat panel + file tree + code viewer (read-only Monaco).
- `messages` and `project_files` tables (RLS).
- Streaming chat server route wired to Lovable AI Gateway (Gemini 3 Flash) with a system prompt that returns file edit operations (JSON tool-call schema).
- Apply edits server-side, persist file versions, render diff per message.

### Phase 3 — Live preview sandbox
- Integrate Sandpack (CodeSandbox in-browser bundler) to render generated React apps live in an iframe.
- Per-project "Preview" tab; hot-update on file changes.
- Mobile/desktop viewport toggle.

### Phase 4 — Versioning, sharing, publishing
- Snapshot history per project, restore.
- Public share link (`/p/$slug`) renders read-only preview.
- "Publish" packages files into a static bundle served from a public route.

### Phase 5 — Collaboration & billing
- Workspaces, member invites, roles (admin/member via `user_roles` + `has_role`).
- Stripe-based subscription tiers (free / pro), credit accounting for AI calls.
- Usage dashboard.

### Phase 6 — Hardening
- Rate limits on chat endpoint, abuse logging.
- E2E security pass (RLS audit, secret review, input validation with Zod everywhere).
- Performance: code-split, image optimization, Lighthouse pass.

## Technical notes
- Stack: TanStack Start (already scaffolded), Tailwind v4, shadcn, Lovable Cloud (Supabase under the hood), Lovable AI Gateway.
- Auth: email/password + Google OAuth (Lovable broker). Roles in separate `user_roles` table with `has_role()` security-definer fn (added when roles are needed in Phase 5).
- AI: server route `/api/chat` streaming via AI SDK; `LOVABLE_API_KEY` stays server-side.
- Sandbox: `@codesandbox/sandpack-react` (works in Workers/edge as it bundles client-side).
- All user input validated with Zod on the server.

## What I'll build right now (Phase 1)
1. Enable Lovable Cloud.
2. Migration: `profiles` table + signup trigger; `projects` table with RLS + grants.
3. Design tokens + brand (distinct from lovable.dev — original premium AI-builder feel).
4. Routes: `__root` shell with nav/footer, `/`, `/pricing`, `/auth`, `/_authenticated/app` (dashboard), `/_authenticated/app/$projectId` (stub workspace).
5. Auth page: email/password + Google.
6. Dashboard: create/list/delete projects.
7. SEO metadata per route.

Approve and I'll start Phase 1.
