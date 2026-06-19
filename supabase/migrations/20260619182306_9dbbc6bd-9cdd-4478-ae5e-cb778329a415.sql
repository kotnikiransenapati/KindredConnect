revoke execute on function public.next_deployment_version(text) from anon, public;
grant execute on function public.next_deployment_version(text) to authenticated, service_role;