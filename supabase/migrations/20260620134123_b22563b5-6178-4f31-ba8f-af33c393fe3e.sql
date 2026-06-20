-- ============ P17: SIEM streaming ============
CREATE TYPE public.siem_provider AS ENUM ('splunk_hec', 'datadog', 'generic_webhook');
CREATE TYPE public.siem_delivery_status AS ENUM ('pending','success','failed','retrying');

CREATE TABLE public.siem_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  provider public.siem_provider NOT NULL,
  endpoint_url text NOT NULL,
  secret_hash text NOT NULL,
  secret_hint text,
  event_filter text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  last_delivery_at timestamptz,
  last_status public.siem_delivery_status,
  last_error text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX siem_destinations_org_idx ON public.siem_destinations(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.siem_destinations TO authenticated;
GRANT ALL ON public.siem_destinations TO service_role;
ALTER TABLE public.siem_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "siem dest admin read" ON public.siem_destinations FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "siem dest admin insert" ON public.siem_destinations FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin') AND created_by = auth.uid());
CREATE POLICY "siem dest admin update" ON public.siem_destinations FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "siem dest owner delete" ON public.siem_destinations FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner'));

CREATE TRIGGER siem_destinations_set_updated_at BEFORE UPDATE ON public.siem_destinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.siem_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id uuid NOT NULL REFERENCES public.siem_destinations(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  audit_id uuid REFERENCES public.audit_log(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  status public.siem_delivery_status NOT NULL DEFAULT 'pending',
  http_code integer,
  response_snippet text,
  latency_ms integer,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX siem_deliveries_dest_idx ON public.siem_deliveries(destination_id, created_at DESC);
CREATE INDEX siem_deliveries_org_idx ON public.siem_deliveries(org_id, created_at DESC);

GRANT SELECT, INSERT ON public.siem_deliveries TO authenticated;
GRANT ALL ON public.siem_deliveries TO service_role;
ALTER TABLE public.siem_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "siem delivery admin read" ON public.siem_deliveries FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));
CREATE POLICY "siem delivery admin insert" ON public.siem_deliveries FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

-- ============ P18: Agent-to-Agent protocol ============
CREATE TYPE public.a2a_agent_status AS ENUM ('active','paused','revoked');
CREATE TYPE public.a2a_message_status AS ENUM ('pending','delivered','acknowledged','failed','rejected');

CREATE TABLE public.a2a_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  capabilities text[] NOT NULL DEFAULT '{}',
  endpoint_url text,
  public_key text,
  status public.a2a_agent_status NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, name)
);
CREATE INDEX a2a_agents_project_idx ON public.a2a_agents(project_id);
CREATE INDEX a2a_agents_caps_idx ON public.a2a_agents USING gin(capabilities);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.a2a_agents TO authenticated;
GRANT ALL ON public.a2a_agents TO service_role;
ALTER TABLE public.a2a_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "a2a agent read" ON public.a2a_agents FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "a2a agent insert" ON public.a2a_agents FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "a2a agent update" ON public.a2a_agents FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "a2a agent delete" ON public.a2a_agents FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TRIGGER a2a_agents_set_updated_at BEFORE UPDATE ON public.a2a_agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.a2a_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  from_agent_id uuid NOT NULL REFERENCES public.a2a_agents(id) ON DELETE CASCADE,
  to_agent_id uuid NOT NULL REFERENCES public.a2a_agents(id) ON DELETE CASCADE,
  intent text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text,
  status public.a2a_message_status NOT NULL DEFAULT 'pending',
  response jsonb,
  error text,
  correlation_id uuid,
  sent_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX a2a_messages_project_idx ON public.a2a_messages(project_id, created_at DESC);
CREATE INDEX a2a_messages_to_idx ON public.a2a_messages(to_agent_id, status);
CREATE INDEX a2a_messages_corr_idx ON public.a2a_messages(correlation_id);

GRANT SELECT, INSERT, UPDATE ON public.a2a_messages TO authenticated;
GRANT ALL ON public.a2a_messages TO service_role;
ALTER TABLE public.a2a_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "a2a msg read" ON public.a2a_messages FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "a2a msg insert" ON public.a2a_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND sent_by = auth.uid());
CREATE POLICY "a2a msg update sender" ON public.a2a_messages FOR UPDATE TO authenticated
  USING (sent_by = auth.uid() AND public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER a2a_messages_set_updated_at BEFORE UPDATE ON public.a2a_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();