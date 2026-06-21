REVOKE EXECUTE ON FUNCTION public.usage_period_totals(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.usage_period_totals(uuid, date, date) TO authenticated;