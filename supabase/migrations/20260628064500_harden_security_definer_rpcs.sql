-- Foundry v2 security fix: keep role-recursion helpers out of the exposed public RPC surface.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_project_role(_project_id uuid, _user_id uuid, _min_role public.project_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.owner_id = _user_id)
  OR EXISTS (
    SELECT 1 FROM public.project_members m
    WHERE m.project_id = _project_id AND m.user_id = _user_id
      AND (_min_role = 'viewer' OR (_min_role = 'editor' AND m.role IN ('editor','owner')) OR (_min_role = 'owner' AND m.role = 'owner'))
  );
$$;
REVOKE ALL ON FUNCTION private.has_project_role(uuid, uuid, public.project_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_project_role(uuid, uuid, public.project_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_project_role(_project_id uuid, _user_id uuid, _min_role public.project_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, private
AS $$
  SELECT CASE
    WHEN _project_id IS NULL OR _user_id IS NULL THEN false
    WHEN auth.role() = 'service_role' THEN private.has_project_role(_project_id, _user_id, _min_role)
    WHEN auth.uid() = _user_id THEN private.has_project_role(_project_id, _user_id, _min_role)
    ELSE false
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, public.project_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, public.project_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_org_role(_org_id uuid, _user_id uuid, _min_role public.org_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _org_id AND o.owner_id = _user_id)
  OR EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.org_id = _org_id AND m.user_id = _user_id
      AND (_min_role = 'viewer' OR (_min_role = 'editor' AND m.role IN ('editor','admin','owner')) OR (_min_role = 'admin' AND m.role IN ('admin','owner')) OR (_min_role = 'owner' AND m.role = 'owner'))
  );
$$;
REVOKE ALL ON FUNCTION private.has_org_role(uuid, uuid, public.org_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid, uuid, public.org_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _user_id uuid, _min_role public.org_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, private
AS $$
  SELECT CASE
    WHEN _org_id IS NULL OR _user_id IS NULL THEN false
    WHEN auth.role() = 'service_role' THEN private.has_org_role(_org_id, _user_id, _min_role)
    WHEN auth.uid() = _user_id THEN private.has_org_role(_org_id, _user_id, _min_role)
    ELSE false
  END;
$$;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.org_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.org_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.analytics_daily_counts(_project_id uuid, _user_id uuid, _from timestamptz, _to timestamptz)
RETURNS TABLE(day date, event_name text, count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT date_trunc('day', occurred_at)::date, event_name, count(*)::bigint
  FROM public.analytics_events
  WHERE project_id = _project_id AND occurred_at BETWEEN _from AND _to AND public.has_project_role(_project_id, _user_id, 'viewer')
  GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.analytics_daily_counts(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_daily_counts(uuid, uuid, timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.experiment_results(_exp_id uuid, _user_id uuid)
RETURNS TABLE(variant text, exposures bigint, conversions bigint, conversion_rate numeric, total_value numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.variant, COUNT(*)::bigint, COUNT(*) FILTER (WHERE e.is_conversion)::bigint,
    CASE WHEN COUNT(*) = 0 THEN 0 ELSE ROUND(((COUNT(*) FILTER (WHERE e.is_conversion))::numeric * 100) / COUNT(*)::numeric, 4) END,
    COALESCE(SUM(e.metric_value),0)::numeric
  FROM public.experiment_exposures e JOIN public.experiments x ON x.id = e.experiment_id
  WHERE e.experiment_id = _exp_id AND public.has_project_role(x.project_id, _user_id, 'viewer')
  GROUP BY e.variant ORDER BY e.variant;
$$;
REVOKE EXECUTE ON FUNCTION public.experiment_results(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.experiment_results(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.next_deployment_version(_slug text)
RETURNS integer
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$ SELECT coalesce(max(version_num), 0) + 1 FROM public.deployments WHERE slug = _slug; $$;
REVOKE EXECUTE ON FUNCTION public.next_deployment_version(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_deployment_version(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.usage_period_totals(_org_id uuid, _from date, _to date)
RETURNS TABLE(metric_key text, total numeric, event_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT e.metric_key, COALESCE(SUM(e.quantity),0)::numeric, COUNT(*)::bigint
  FROM public.usage_events e
  WHERE e.org_id = _org_id AND e.occurred_at >= _from::timestamptz AND e.occurred_at < (_to + 1)::timestamptz
    AND public.has_org_role(_org_id, auth.uid(), 'admin')
  GROUP BY e.metric_key ORDER BY total DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.usage_period_totals(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usage_period_totals(uuid, date, date) TO authenticated, service_role;
