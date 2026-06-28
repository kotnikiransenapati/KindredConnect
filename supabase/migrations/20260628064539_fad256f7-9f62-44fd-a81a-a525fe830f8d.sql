
-- G2: Product docs
CREATE TABLE public.foundry_product_docs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('readme','user-guide','api-reference','architecture','runbook','changelog')),
  title text not null,
  slug text not null,
  content_md text not null,
  format text not null default 'markdown',
  source text not null default 'generated' check (source in ('generated','manual','imported')),
  version int not null default 1,
  word_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, kind, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_product_docs TO authenticated;
GRANT ALL ON public.foundry_product_docs TO service_role;
ALTER TABLE public.foundry_product_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docs viewable by project viewers" ON public.foundry_product_docs FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "docs writable by project editors" ON public.foundry_product_docs FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "docs updatable by project editors" ON public.foundry_product_docs FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "docs deletable by project owners" ON public.foundry_product_docs FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER trg_foundry_product_docs_updated BEFORE UPDATE ON public.foundry_product_docs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_foundry_product_docs_project_kind ON public.foundry_product_docs(project_id, kind);

-- G3: Marketplace v2 listings (extensions, SDKs, templates beyond template_listings)
CREATE TABLE public.foundry_marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  artifact_kind text not null check (artifact_kind in ('extension','sdk','block-pack','adapter','template')),
  slug text not null,
  name text not null,
  summary text,
  version text not null default '0.1.0',
  manifest jsonb not null default '{}'::jsonb,
  bundle jsonb not null default '{}'::jsonb,
  visibility text not null default 'private' check (visibility in ('private','org','public')),
  pricing jsonb not null default '{"model":"free"}'::jsonb,
  status text not null default 'draft' check (status in ('draft','review','published','deprecated')),
  install_count int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, artifact_kind, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_marketplace_listings TO authenticated;
GRANT ALL ON public.foundry_marketplace_listings TO service_role;
ALTER TABLE public.foundry_marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mp viewable by viewers or public" ON public.foundry_marketplace_listings FOR SELECT TO authenticated USING (visibility = 'public' OR public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "mp writable by project editors" ON public.foundry_marketplace_listings FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "mp updatable by project editors" ON public.foundry_marketplace_listings FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "mp deletable by project owners" ON public.foundry_marketplace_listings FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER trg_foundry_mp_listings_updated BEFORE UPDATE ON public.foundry_marketplace_listings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_foundry_mp_project_kind ON public.foundry_marketplace_listings(project_id, artifact_kind);

-- G4: Launch runbooks (incident response, on-call, launch checklists)
CREATE TABLE public.foundry_launch_runbooks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scenario text not null check (scenario in ('launch','incident','rollback','scale-up','data-loss','security-breach','perf-degradation')),
  severity text not null default 'sev2' check (severity in ('sev1','sev2','sev3','sev4')),
  title text not null,
  steps jsonb not null default '[]'::jsonb,
  owners jsonb not null default '[]'::jsonb,
  escalation jsonb not null default '{}'::jsonb,
  sla_minutes int not null default 60,
  last_drilled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_launch_runbooks TO authenticated;
GRANT ALL ON public.foundry_launch_runbooks TO service_role;
ALTER TABLE public.foundry_launch_runbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rb viewable by viewers" ON public.foundry_launch_runbooks FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "rb writable by editors" ON public.foundry_launch_runbooks FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "rb updatable by editors" ON public.foundry_launch_runbooks FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "rb deletable by owners" ON public.foundry_launch_runbooks FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER trg_foundry_runbooks_updated BEFORE UPDATE ON public.foundry_launch_runbooks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_foundry_runbooks_project ON public.foundry_launch_runbooks(project_id, scenario);
