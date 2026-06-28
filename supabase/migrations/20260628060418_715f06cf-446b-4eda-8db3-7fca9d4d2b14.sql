REVOKE EXECUTE ON FUNCTION public.analytics_daily_counts(uuid, uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.experiment_results(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.org_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, public.project_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_deployment_version(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.usage_period_totals(uuid, date, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.analytics_daily_counts(uuid, uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.experiment_results(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(uuid, uuid, public.org_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, public.project_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_deployment_version(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.usage_period_totals(uuid, date, date) TO authenticated;