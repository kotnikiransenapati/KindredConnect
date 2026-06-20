
CREATE TABLE public.e2e_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  user_story text NOT NULL,
  spec_path text NOT NULL,
  spec_code text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','generating','ready','error')),
  last_run_status text CHECK (last_run_status IN ('passed','failed','error')),
  last_run_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, spec_path)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.e2e_tests TO authenticated;
GRANT ALL ON public.e2e_tests TO service_role;
ALTER TABLE public.e2e_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "e2e_view" ON public.e2e_tests FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "e2e_insert" ON public.e2e_tests FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "e2e_update" ON public.e2e_tests FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "e2e_delete" ON public.e2e_tests FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER trg_e2e_updated BEFORE UPDATE ON public.e2e_tests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_e2e_project ON public.e2e_tests(project_id, created_at DESC);

CREATE TABLE public.deploy_healing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  deployment_id uuid REFERENCES public.deployments(id) ON DELETE SET NULL,
  ci_gate_id uuid REFERENCES public.ci_gates(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('rollback','proposal','noop')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  rollback_to_deployment_id uuid REFERENCES public.deployments(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.agent_proposals(id) ON DELETE SET NULL,
  summary text NOT NULL DEFAULT '',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deploy_healing TO authenticated;
GRANT ALL ON public.deploy_healing TO service_role;
ALTER TABLE public.deploy_healing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "heal_view" ON public.deploy_healing FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "heal_insert" ON public.deploy_healing FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "heal_update" ON public.deploy_healing FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "heal_delete" ON public.deploy_healing FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER trg_heal_updated BEFORE UPDATE ON public.deploy_healing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_heal_project ON public.deploy_healing(project_id, created_at DESC);
