
-- Phase 3 P5: Background agent schedules + proposals
CREATE TABLE public.agent_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  goal text NOT NULL,
  cron text NOT NULL,
  roles text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_schedules TO authenticated;
GRANT ALL ON public.agent_schedules TO service_role;
ALTER TABLE public.agent_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedules_view" ON public.agent_schedules FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "schedules_write" ON public.agent_schedules FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND user_id = auth.uid());
CREATE POLICY "schedules_update" ON public.agent_schedules FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "schedules_delete" ON public.agent_schedules FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER trg_agent_schedules_updated BEFORE UPDATE ON public.agent_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_schedules_due ON public.agent_schedules(next_run_at) WHERE enabled = true;
CREATE INDEX idx_schedules_project ON public.agent_schedules(project_id);

CREATE TABLE public.agent_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES public.agent_schedules(id) ON DELETE SET NULL,
  title text NOT NULL,
  summary text NOT NULL,
  diff jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','applied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_proposals TO authenticated;
GRANT ALL ON public.agent_proposals TO service_role;
ALTER TABLE public.agent_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposals_view" ON public.agent_proposals FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "proposals_write" ON public.agent_proposals FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "proposals_update" ON public.agent_proposals FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "proposals_delete" ON public.agent_proposals FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER trg_agent_proposals_updated BEFORE UPDATE ON public.agent_proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_proposals_project ON public.agent_proposals(project_id, created_at DESC);

-- Phase 3 P6: Multi-model routing
CREATE TABLE public.model_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_kind text NOT NULL CHECK (task_kind IN ('chat','code','reasoning','cheap','vision','embedding')),
  preferred_model text NOT NULL,
  fallback_models text[] NOT NULL DEFAULT '{}',
  max_cost_usd numeric(10,4) NOT NULL DEFAULT 0.10,
  quality_tier text NOT NULL DEFAULT 'balanced' CHECK (quality_tier IN ('low','balanced','high')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, task_kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.model_routes TO authenticated;
GRANT ALL ON public.model_routes TO service_role;
ALTER TABLE public.model_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "routes_view" ON public.model_routes FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "routes_write" ON public.model_routes FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "routes_update" ON public.model_routes FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "routes_delete" ON public.model_routes FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE TRIGGER trg_model_routes_updated BEFORE UPDATE ON public.model_routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
