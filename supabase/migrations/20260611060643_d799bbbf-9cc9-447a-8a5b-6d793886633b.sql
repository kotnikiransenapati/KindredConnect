
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, interval, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, text, interval, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, public.project_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_project_role(uuid, uuid, public.project_role) TO authenticated, service_role;
