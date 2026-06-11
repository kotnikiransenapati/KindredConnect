
REVOKE EXECUTE ON FUNCTION public.get_user_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO service_role;

-- payment_events: server-only, add explicit deny policy so linter is happy
CREATE POLICY "Deny all client access to payment_events"
  ON public.payment_events FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);
