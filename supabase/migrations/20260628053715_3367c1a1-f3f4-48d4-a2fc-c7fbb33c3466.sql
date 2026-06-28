CREATE TABLE public.ir_patch_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  base_ir_hash text NOT NULL DEFAULT '',
  target_ir_hash text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewing', 'applied', 'rejected')),
  summary text NOT NULL DEFAULT '',
  files jsonb NOT NULL DEFAULT '[]'::jsonb,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ir_patch_sets TO authenticated;
GRANT ALL ON public.ir_patch_sets TO service_role;
ALTER TABLE public.ir_patch_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patch_sets_read" ON public.ir_patch_sets FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "patch_sets_insert" ON public.ir_patch_sets FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "patch_sets_update" ON public.ir_patch_sets FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "patch_sets_delete" ON public.ir_patch_sets FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX ir_patch_sets_project_idx ON public.ir_patch_sets(project_id, created_at DESC);
CREATE TRIGGER ir_patch_sets_updated_at BEFORE UPDATE ON public.ir_patch_sets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.pipeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id text NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  stage text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'blocked', 'skipped')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warn', 'error')),
  message text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_events TO authenticated;
GRANT ALL ON public.pipeline_events TO service_role;
ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipeline_events_read" ON public.pipeline_events FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "pipeline_events_insert" ON public.pipeline_events FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND actor_id = auth.uid());
CREATE POLICY "pipeline_events_update" ON public.pipeline_events FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "pipeline_events_delete" ON public.pipeline_events FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE UNIQUE INDEX pipeline_events_run_seq_idx ON public.pipeline_events(project_id, run_id, sequence);
CREATE INDEX pipeline_events_project_created_idx ON public.pipeline_events(project_id, created_at DESC);

CREATE TABLE public.runtime_adapter_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('auth', 'database', 'storage', 'functions', 'ai', 'payments', 'email', 'push')),
  provider text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'configured', 'healthy', 'degraded', 'blocked')),
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, category)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.runtime_adapter_configs TO authenticated;
GRANT ALL ON public.runtime_adapter_configs TO service_role;
ALTER TABLE public.runtime_adapter_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adapter_configs_read" ON public.runtime_adapter_configs FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "adapter_configs_insert" ON public.runtime_adapter_configs FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "adapter_configs_update" ON public.runtime_adapter_configs FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "adapter_configs_delete" ON public.runtime_adapter_configs FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX runtime_adapter_configs_project_idx ON public.runtime_adapter_configs(project_id, category);
CREATE TRIGGER runtime_adapter_configs_updated_at BEFORE UPDATE ON public.runtime_adapter_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.runtime_adapter_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  adapter_config_id uuid REFERENCES public.runtime_adapter_configs(id) ON DELETE SET NULL,
  action text NOT NULL,
  summary text NOT NULL DEFAULT '',
  before_state jsonb,
  after_state jsonb,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.runtime_adapter_audits TO authenticated;
GRANT ALL ON public.runtime_adapter_audits TO service_role;
ALTER TABLE public.runtime_adapter_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "adapter_audits_read" ON public.runtime_adapter_audits FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "adapter_audits_insert" ON public.runtime_adapter_audits FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND actor_id = auth.uid());
CREATE POLICY "adapter_audits_update" ON public.runtime_adapter_audits FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE POLICY "adapter_audits_delete" ON public.runtime_adapter_audits FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX runtime_adapter_audits_project_idx ON public.runtime_adapter_audits(project_id, created_at DESC);