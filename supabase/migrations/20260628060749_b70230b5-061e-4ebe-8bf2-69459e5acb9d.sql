
-- Extend target build kinds to include desktop, pwa, widget
ALTER TABLE public.target_build_configs DROP CONSTRAINT IF EXISTS target_build_configs_target_check;
ALTER TABLE public.target_build_configs ADD CONSTRAINT target_build_configs_target_check CHECK (target IN ('web','mobile','desktop','pwa','widget'));
ALTER TABLE public.target_build_runs DROP CONSTRAINT IF EXISTS target_build_runs_target_check;
ALTER TABLE public.target_build_runs ADD CONSTRAINT target_build_runs_target_check CHECK (target IN ('web','mobile','desktop','pwa','widget'));

-- E1: deploy adapters
CREATE TABLE public.deploy_adapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  provider text NOT NULL,
  environment text NOT NULL DEFAULT 'production',
  region text,
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured','degraded','disabled','pending')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  credentials_ref text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, provider, environment)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deploy_adapters TO authenticated;
GRANT ALL ON public.deploy_adapters TO service_role;
ALTER TABLE public.deploy_adapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deploy_adapters_read" ON public.deploy_adapters FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "deploy_adapters_insert" ON public.deploy_adapters FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "deploy_adapters_update" ON public.deploy_adapters FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "deploy_adapters_delete" ON public.deploy_adapters FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX deploy_adapters_project_idx ON public.deploy_adapters(project_id, provider);
CREATE TRIGGER deploy_adapters_updated_at BEFORE UPDATE ON public.deploy_adapters FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- E1: deploy plans
CREATE TABLE public.deploy_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  adapter_id uuid REFERENCES public.deploy_adapters(id) ON DELETE SET NULL,
  target text NOT NULL CHECK (target IN ('web','mobile','desktop','pwa','widget')),
  provider text NOT NULL,
  environment text NOT NULL DEFAULT 'production',
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  estimated_cost_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','applied','superseded','rolled_back','failed')),
  ir_hash text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deploy_plans TO authenticated;
GRANT ALL ON public.deploy_plans TO service_role;
ALTER TABLE public.deploy_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deploy_plans_read" ON public.deploy_plans FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "deploy_plans_insert" ON public.deploy_plans FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "deploy_plans_update" ON public.deploy_plans FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "deploy_plans_delete" ON public.deploy_plans FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX deploy_plans_project_idx ON public.deploy_plans(project_id, created_at DESC);
CREATE TRIGGER deploy_plans_updated_at BEFORE UPDATE ON public.deploy_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- E1: deploy runs (apply, rollback, status, logs)
CREATE TABLE public.deploy_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.deploy_plans(id) ON DELETE SET NULL,
  adapter_id uuid REFERENCES public.deploy_adapters(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('plan','apply','rollback','status','logs')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','success','failed','cancelled')),
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  logs text NOT NULL DEFAULT '',
  duration_ms integer,
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deploy_runs TO authenticated;
GRANT ALL ON public.deploy_runs TO service_role;
ALTER TABLE public.deploy_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deploy_runs_read" ON public.deploy_runs FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "deploy_runs_insert" ON public.deploy_runs FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND triggered_by = auth.uid());
CREATE POLICY "deploy_runs_update" ON public.deploy_runs FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "deploy_runs_delete" ON public.deploy_runs FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX deploy_runs_project_idx ON public.deploy_runs(project_id, created_at DESC);
CREATE TRIGGER deploy_runs_updated_at BEFORE UPDATE ON public.deploy_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
