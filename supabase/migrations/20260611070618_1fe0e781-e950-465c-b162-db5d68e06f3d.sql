
-- PLANS (publicly readable catalog)
CREATE TABLE public.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_inr_paise integer NOT NULL DEFAULT 0,
  interval text NOT NULL DEFAULT 'monthly' CHECK (interval IN ('monthly','yearly','none')),
  ai_message_quota integer NOT NULL DEFAULT 100,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  razorpay_plan_id text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plans TO anon, authenticated;
GRANT ALL ON public.plans TO service_role;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Plans are publicly readable" ON public.plans FOR SELECT USING (is_active = true);
CREATE TRIGGER plans_set_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- SUBSCRIPTIONS (per-user)
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.plans(id),
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive','pending','active','past_due','canceled','halted')),
  razorpay_customer_id text,
  razorpay_subscription_id text UNIQUE,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX subscriptions_status_idx ON public.subscriptions(status);

-- PAYMENT EVENTS (webhook idempotency log, server-only)
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'razorpay',
  event_id text NOT NULL,
  event_type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
GRANT ALL ON public.payment_events TO service_role;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
-- No policies: service_role only.

-- Helper: get active subscription quota for a user
CREATE OR REPLACE FUNCTION public.get_user_plan(_user_id uuid)
RETURNS TABLE(plan_id text, ai_message_quota integer, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.plan_id, 'hobby') AS plan_id,
         COALESCE(p.ai_message_quota, 100) AS ai_message_quota,
         COALESCE(s.status, 'inactive') AS status
  FROM (SELECT _user_id AS uid) base
  LEFT JOIN public.subscriptions s ON s.user_id = base.uid AND s.status = 'active'
  LEFT JOIN public.plans p ON p.id = COALESCE(s.plan_id, 'hobby');
$$;

-- Seed default plans
INSERT INTO public.plans (id, name, price_inr_paise, interval, ai_message_quota, features, sort_order) VALUES
  ('hobby', 'Hobby', 0,      'none',    100,  '["100 AI messages / month","Unlimited public projects","Live preview","Community support"]'::jsonb, 1),
  ('pro',   'Pro',   199900, 'monthly', 3000, '["3,000 AI messages / month","Unlimited private projects","Custom domains","Version history","Priority support"]'::jsonb, 2),
  ('team',  'Team',  649900, 'monthly', 10000,'["Everything in Pro","Shared workspaces","Roles & permissions","Audit log","SSO"]'::jsonb, 3);
