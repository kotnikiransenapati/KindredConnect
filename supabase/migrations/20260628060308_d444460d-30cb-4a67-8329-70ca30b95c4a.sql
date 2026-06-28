CREATE TABLE public.target_build_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('web', 'mobile')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'configured', 'ready', 'blocked')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  readiness jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, target)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_build_configs TO authenticated;
GRANT ALL ON public.target_build_configs TO service_role;
ALTER TABLE public.target_build_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "target_configs_read" ON public.target_build_configs FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "target_configs_insert" ON public.target_build_configs FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "target_configs_update" ON public.target_build_configs FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "target_configs_delete" ON public.target_build_configs FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX target_build_configs_project_idx ON public.target_build_configs(project_id, target);
CREATE TRIGGER target_build_configs_updated_at BEFORE UPDATE ON public.target_build_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.target_build_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('web', 'mobile')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed', 'blocked', 'cancelled')),
  ir_hash text NOT NULL DEFAULT '',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  artifact_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  logs text NOT NULL DEFAULT '',
  duration_ms integer,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_build_runs TO authenticated;
GRANT ALL ON public.target_build_runs TO service_role;
ALTER TABLE public.target_build_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "target_runs_read" ON public.target_build_runs FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "target_runs_insert" ON public.target_build_runs FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND triggered_by = auth.uid());
CREATE POLICY "target_runs_update" ON public.target_build_runs FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "target_runs_delete" ON public.target_build_runs FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX target_build_runs_project_idx ON public.target_build_runs(project_id, created_at DESC);
CREATE TRIGGER target_build_runs_updated_at BEFORE UPDATE ON public.target_build_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();