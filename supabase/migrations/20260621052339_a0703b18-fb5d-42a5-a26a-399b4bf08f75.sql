
-- ============ P19: USAGE METERING ============
CREATE TYPE public.usage_aggregation AS ENUM ('sum','max','last','count');
CREATE TYPE public.invoice_status AS ENUM ('draft','issued','paid','void');

CREATE TABLE public.usage_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_key text NOT NULL CHECK (metric_key ~ '^[a-z][a-z0-9_.]{1,63}$'),
  display_name text NOT NULL,
  unit text NOT NULL DEFAULT 'unit',
  aggregation public.usage_aggregation NOT NULL DEFAULT 'sum',
  price_per_unit_cents integer NOT NULL DEFAULT 0 CHECK (price_per_unit_cents >= 0),
  included_quota numeric NOT NULL DEFAULT 0 CHECK (included_quota >= 0),
  hard_cap numeric,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, metric_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_meters TO authenticated;
GRANT ALL ON public.usage_meters TO service_role;
ALTER TABLE public.usage_meters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meters_read_members" ON public.usage_meters FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'viewer'));
CREATE POLICY "meters_write_admin" ON public.usage_meters FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "meters_update_admin" ON public.usage_meters FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "meters_delete_owner" ON public.usage_meters FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner'));
CREATE TRIGGER usage_meters_updated BEFORE UPDATE ON public.usage_meters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  metric_key text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity >= 0),
  idempotency_key text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, metric_key, idempotency_key)
);
CREATE INDEX usage_events_org_metric_time ON public.usage_events (org_id, metric_key, occurred_at DESC);
CREATE INDEX usage_events_project_time ON public.usage_events (project_id, occurred_at DESC);
GRANT SELECT, INSERT ON public.usage_events TO authenticated;
GRANT ALL ON public.usage_events TO service_role;
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_read_members" ON public.usage_events FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'viewer'));
CREATE POLICY "events_insert_members" ON public.usage_events FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'viewer') AND actor_id = auth.uid());

CREATE TABLE public.usage_aggregates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  day date NOT NULL,
  total numeric NOT NULL DEFAULT 0,
  event_count integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, metric_key, day)
);
CREATE INDEX usage_agg_org_day ON public.usage_aggregates (org_id, day DESC);
GRANT SELECT ON public.usage_aggregates TO authenticated;
GRANT ALL ON public.usage_aggregates TO service_role;
ALTER TABLE public.usage_aggregates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agg_read_admin" ON public.usage_aggregates FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE TABLE public.usage_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  subtotal_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, period_start, period_end)
);
GRANT SELECT, INSERT, UPDATE ON public.usage_invoices TO authenticated;
GRANT ALL ON public.usage_invoices TO service_role;
ALTER TABLE public.usage_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice_read_admin" ON public.usage_invoices FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "invoice_write_admin" ON public.usage_invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "invoice_update_admin" ON public.usage_invoices FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE TRIGGER usage_invoices_updated BEFORE UPDATE ON public.usage_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ P20: ZERO-TRUST AUTHZ ============
CREATE TYPE public.policy_effect AS ENUM ('allow','deny');

CREATE TABLE public.zt_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  effect public.policy_effect NOT NULL DEFAULT 'allow',
  subject jsonb NOT NULL DEFAULT '{}'::jsonb,
  resource_pattern text NOT NULL,
  action_pattern text NOT NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 100 CHECK (priority BETWEEN 0 AND 1000),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);
CREATE INDEX zt_policies_org_priority ON public.zt_policies (org_id, priority DESC) WHERE enabled = true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zt_policies TO authenticated;
GRANT ALL ON public.zt_policies TO service_role;
ALTER TABLE public.zt_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zt_pol_read_admin" ON public.zt_policies FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "zt_pol_write_admin" ON public.zt_policies FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "zt_pol_update_admin" ON public.zt_policies FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "zt_pol_delete_owner" ON public.zt_policies FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner'));
CREATE TRIGGER zt_policies_updated BEFORE UPDATE ON public.zt_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.zt_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  issued_to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  scope text[] NOT NULL DEFAULT '{}'::text[],
  resource_pattern text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_hint text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX zt_tokens_org_active ON public.zt_access_tokens (org_id) WHERE revoked_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON public.zt_access_tokens TO authenticated;
GRANT ALL ON public.zt_access_tokens TO service_role;
ALTER TABLE public.zt_access_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zt_tok_read" ON public.zt_access_tokens FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin') OR issued_to_user_id = auth.uid());
CREATE POLICY "zt_tok_write_admin" ON public.zt_access_tokens FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "zt_tok_update_admin" ON public.zt_access_tokens FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE TABLE public.zt_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  subject_id uuid,
  subject_kind text NOT NULL DEFAULT 'user',
  resource text NOT NULL,
  action text NOT NULL,
  decision public.policy_effect NOT NULL,
  matched_policy_id uuid REFERENCES public.zt_policies(id) ON DELETE SET NULL,
  reason text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX zt_dec_org_time ON public.zt_decisions (org_id, occurred_at DESC);
GRANT SELECT, INSERT ON public.zt_decisions TO authenticated;
GRANT ALL ON public.zt_decisions TO service_role;
ALTER TABLE public.zt_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zt_dec_read_admin" ON public.zt_decisions FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "zt_dec_insert_self" ON public.zt_decisions FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'viewer'));

-- Helper RPC: aggregate usage for a period (admin-gated)
CREATE OR REPLACE FUNCTION public.usage_period_totals(_org_id uuid, _from date, _to date)
RETURNS TABLE(metric_key text, total numeric, event_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.metric_key,
         COALESCE(SUM(e.quantity),0)::numeric AS total,
         COUNT(*)::bigint AS event_count
  FROM public.usage_events e
  WHERE e.org_id = _org_id
    AND e.occurred_at >= _from::timestamptz
    AND e.occurred_at <  (_to + 1)::timestamptz
    AND public.has_org_role(_org_id, auth.uid(), 'admin')
  GROUP BY e.metric_key
  ORDER BY total DESC;
$$;
