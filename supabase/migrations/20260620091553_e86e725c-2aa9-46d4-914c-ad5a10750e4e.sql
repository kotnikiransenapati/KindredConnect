
-- =====================================================================
-- Multi-agent orchestration tables
-- =====================================================================

-- agent_runs ----------------------------------------------------------
CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  goal text NOT NULL,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued', -- queued|running|succeeded|failed|cancelled
  model text,
  total_tokens integer NOT NULL DEFAULT 0,
  total_cost_cents integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_runs_project ON public.agent_runs(project_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view runs if project viewer" ON public.agent_runs
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "insert runs if project editor" ON public.agent_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND user_id = auth.uid());
CREATE POLICY "update runs if project editor" ON public.agent_runs
  FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "delete runs if project owner" ON public.agent_runs
  FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TRIGGER agent_runs_set_updated_at BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- agent_tasks ---------------------------------------------------------
CREATE TABLE public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_task_id uuid REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  role text NOT NULL, -- orchestrator|architect|designer|frontend|backend|mobile|data|integrations|qa|security|perf|reviewer|release
  title text NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued|running|succeeded|failed|skipped|needs_review
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  artifacts jsonb NOT NULL DEFAULT '[]'::jsonb,
  tokens integer NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  attempt integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_tasks_run ON public.agent_tasks(run_id, created_at);
CREATE INDEX idx_agent_tasks_status ON public.agent_tasks(status, role);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_tasks TO authenticated;
GRANT ALL ON public.agent_tasks TO service_role;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view tasks if project viewer" ON public.agent_tasks
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "insert tasks if project editor" ON public.agent_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "update tasks if project editor" ON public.agent_tasks
  FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER agent_tasks_set_updated_at BEFORE UPDATE ON public.agent_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- agent_messages ------------------------------------------------------
CREATE TABLE public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role text NOT NULL, -- system|user|assistant|tool
  parts jsonb NOT NULL DEFAULT '[]'::jsonb,
  tokens integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_messages_task ON public.agent_messages(task_id, created_at);

GRANT SELECT, INSERT ON public.agent_messages TO authenticated;
GRANT ALL ON public.agent_messages TO service_role;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view msgs if project viewer" ON public.agent_messages
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "insert msgs if project editor" ON public.agent_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

-- usage_ledger --------------------------------------------------------
CREATE TABLE public.usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  kind text NOT NULL, -- ai_tokens|ai_request|build|deploy
  tokens integer NOT NULL DEFAULT 0,
  cost_cents integer NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_usage_ledger_user ON public.usage_ledger(user_id, created_at DESC);

GRANT SELECT ON public.usage_ledger TO authenticated;
GRANT ALL ON public.usage_ledger TO service_role;
ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view own usage" ON public.usage_ledger
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
