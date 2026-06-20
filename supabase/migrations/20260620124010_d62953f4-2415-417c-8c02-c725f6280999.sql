
-- Product analytics events
CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,
  event_name text NOT NULL,
  path text,
  referrer text,
  country text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_project_time_idx ON public.analytics_events(project_id, occurred_at DESC);
CREATE INDEX analytics_events_project_name_idx ON public.analytics_events(project_id, event_name);
CREATE INDEX analytics_events_session_idx ON public.analytics_events(session_id);

GRANT SELECT, INSERT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics readable by project viewers" ON public.analytics_events
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));

CREATE POLICY "analytics inserts by project viewers" ON public.analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'viewer'));

-- Append-only audit log
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  ip inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_project_idx ON public.audit_log(project_id, created_at DESC);
CREATE INDEX audit_log_org_idx ON public.audit_log(org_id, created_at DESC);
CREATE INDEX audit_log_action_idx ON public.audit_log(action);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Project admins (owners + editors in this project model) can read project-scoped audit rows
CREATE POLICY "audit project readable by owners" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    (project_id IS NOT NULL AND public.has_project_role(project_id, auth.uid(), 'owner'))
    OR (org_id IS NOT NULL AND public.has_org_role(org_id, auth.uid(), 'admin'))
  );

-- Any signed-in user can insert their own audit rows (server fns set actor_id = auth.uid())
CREATE POLICY "audit inserts by actor" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- No UPDATE/DELETE policies => append-only at RLS layer.

-- Convenience rollup function: events per day for a project
CREATE OR REPLACE FUNCTION public.analytics_daily_counts(
  _project_id uuid, _user_id uuid, _from timestamptz, _to timestamptz
) RETURNS TABLE(day date, event_name text, count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT date_trunc('day', occurred_at)::date AS day,
         event_name,
         count(*)::bigint
  FROM public.analytics_events
  WHERE project_id = _project_id
    AND occurred_at BETWEEN _from AND _to
    AND public.has_project_role(_project_id, _user_id, 'viewer')
  GROUP BY 1, 2
  ORDER BY 1 DESC, 3 DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.analytics_daily_counts(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_daily_counts(uuid, uuid, timestamptz, timestamptz) TO authenticated;
