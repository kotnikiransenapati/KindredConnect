
-- ============ P15: SCIM 2.0 ============
CREATE TABLE public.scim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_prefix text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scim_tokens_org_idx ON public.scim_tokens(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scim_tokens TO authenticated;
GRANT ALL ON public.scim_tokens TO service_role;
ALTER TABLE public.scim_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scim tokens readable by org admins" ON public.scim_tokens FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "scim tokens insertable by org admins" ON public.scim_tokens FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY "scim tokens updatable by org admins" ON public.scim_tokens FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "scim tokens deletable by org owners" ON public.scim_tokens FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner'));

CREATE TABLE public.scim_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.scim_tokens(id) ON DELETE SET NULL,
  method text NOT NULL,
  path text NOT NULL,
  status_code int NOT NULL,
  external_id text,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scim_audit_org_idx ON public.scim_audit(org_id, created_at DESC);
GRANT SELECT ON public.scim_audit TO authenticated;
GRANT ALL ON public.scim_audit TO service_role;
ALTER TABLE public.scim_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scim audit readable by org admins" ON public.scim_audit FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE TABLE public.scim_provisioned_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  display_name text,
  active boolean NOT NULL DEFAULT true,
  raw jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, external_id)
);
CREATE INDEX scim_prov_users_email_idx ON public.scim_provisioned_users(org_id, lower(email));
GRANT SELECT ON public.scim_provisioned_users TO authenticated;
GRANT ALL ON public.scim_provisioned_users TO service_role;
ALTER TABLE public.scim_provisioned_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scim users readable by org admins" ON public.scim_provisioned_users FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE TRIGGER trg_scim_prov_users_updated BEFORE UPDATE ON public.scim_provisioned_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ P16: Marketplace monetization ============
CREATE TABLE public.template_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL UNIQUE REFERENCES public.templates(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_minor int NOT NULL CHECK (price_minor >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  payout_pct numeric(5,2) NOT NULL DEFAULT 80.00 CHECK (payout_pct BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_listings TO authenticated;
GRANT ALL ON public.template_listings TO service_role;
ALTER TABLE public.template_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings readable by signed-in users" ON public.template_listings FOR SELECT TO authenticated
  USING (status = 'active' OR author_id = auth.uid());
CREATE POLICY "listings managed by author" ON public.template_listings FOR ALL TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE TRIGGER trg_template_listings_updated BEFORE UPDATE ON public.template_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.template_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.template_listings(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.templates(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'stripe',
  intent_id text NOT NULL,
  amount_minor int NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded')),
  refunded boolean NOT NULL DEFAULT false,
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, intent_id)
);
CREATE INDEX tpurchases_buyer_idx ON public.template_purchases(buyer_id, created_at DESC);
CREATE INDEX tpurchases_author_idx ON public.template_purchases(author_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.template_purchases TO authenticated;
GRANT ALL ON public.template_purchases TO service_role;
ALTER TABLE public.template_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases readable by buyer or author" ON public.template_purchases FOR SELECT TO authenticated
  USING (buyer_id = auth.uid() OR author_id = auth.uid());
CREATE POLICY "purchases insertable by buyer" ON public.template_purchases FOR INSERT TO authenticated
  WITH CHECK (buyer_id = auth.uid());
CREATE TRIGGER trg_template_purchases_updated BEFORE UPDATE ON public.template_purchases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.template_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL UNIQUE REFERENCES public.template_purchases(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gross_minor int NOT NULL,
  fee_minor int NOT NULL,
  net_minor int NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','paid','reversed')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tpayouts_author_idx ON public.template_payouts(author_id, created_at DESC);
GRANT SELECT ON public.template_payouts TO authenticated;
GRANT ALL ON public.template_payouts TO service_role;
ALTER TABLE public.template_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payouts readable by author" ON public.template_payouts FOR SELECT TO authenticated
  USING (author_id = auth.uid());
