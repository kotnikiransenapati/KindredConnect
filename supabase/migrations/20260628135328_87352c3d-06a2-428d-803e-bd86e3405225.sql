
CREATE TABLE public.foundry_backlog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  blueprint_id UUID REFERENCES public.foundry_product_blueprints(id) ON DELETE SET NULL,
  sequence INT NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK (kind IN ('feature','bug','chore','security','observability','release','docs')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner TEXT NOT NULL DEFAULT 'planner',
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  estimate_points INT NOT NULL DEFAULT 1,
  acceptance JSONB NOT NULL DEFAULT '[]'::jsonb,
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','blocked','done','dropped')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX foundry_backlog_items_project_idx ON public.foundry_backlog_items(project_id, sequence);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_backlog_items TO authenticated;
GRANT ALL ON public.foundry_backlog_items TO service_role;
ALTER TABLE public.foundry_backlog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backlog_viewer_select" ON public.foundry_backlog_items FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "backlog_editor_write" ON public.foundry_backlog_items FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE TRIGGER foundry_backlog_items_touch BEFORE UPDATE ON public.foundry_backlog_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.foundry_acceptance_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  blueprint_id UUID REFERENCES public.foundry_product_blueprints(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  surface TEXT NOT NULL,
  flow TEXT NOT NULL,
  given JSONB NOT NULL DEFAULT '[]'::jsonb,
  when_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  then_assertions JSONB NOT NULL DEFAULT '[]'::jsonb,
  fixtures JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','passing','failing','quarantined')),
  last_run_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, version, surface, flow)
);
CREATE INDEX foundry_acceptance_contracts_project_idx ON public.foundry_acceptance_contracts(project_id, version DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_acceptance_contracts TO authenticated;
GRANT ALL ON public.foundry_acceptance_contracts TO service_role;
ALTER TABLE public.foundry_acceptance_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acceptance_viewer_select" ON public.foundry_acceptance_contracts FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "acceptance_editor_write" ON public.foundry_acceptance_contracts FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE TRIGGER foundry_acceptance_contracts_touch BEFORE UPDATE ON public.foundry_acceptance_contracts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.foundry_build_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES public.foundry_artifact_plans(id) ON DELETE SET NULL,
  run_number INT NOT NULL DEFAULT 1,
  target TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  pipeline_hash TEXT NOT NULL,
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  gates JSONB NOT NULL DEFAULT '[]'::jsonb,
  artifacts JSONB NOT NULL DEFAULT '[]'::jsonb,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_ms INT NOT NULL DEFAULT 0,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX foundry_build_runs_project_idx ON public.foundry_build_runs(project_id, run_number DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_build_runs TO authenticated;
GRANT ALL ON public.foundry_build_runs TO service_role;
ALTER TABLE public.foundry_build_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "build_runs_viewer_select" ON public.foundry_build_runs FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "build_runs_editor_write" ON public.foundry_build_runs FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE TRIGGER foundry_build_runs_touch BEFORE UPDATE ON public.foundry_build_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
