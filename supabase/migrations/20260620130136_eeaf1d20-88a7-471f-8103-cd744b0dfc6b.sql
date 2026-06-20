
-- ===== SSO Connections =====
CREATE TYPE public.sso_provider AS ENUM ('okta','azure_ad','google_workspace','onelogin','jumpcloud','generic_saml');
CREATE TYPE public.sso_status AS ENUM ('pending','active','disabled','error');

CREATE TABLE public.sso_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider public.sso_provider NOT NULL,
  display_name text NOT NULL,
  domain text NOT NULL,
  entity_id text NOT NULL,
  sso_url text NOT NULL,
  certificate text NOT NULL,
  attribute_map jsonb NOT NULL DEFAULT '{"email":"email","name":"name"}'::jsonb,
  status public.sso_status NOT NULL DEFAULT 'pending',
  last_tested_at timestamptz,
  last_error text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, domain)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sso_connections TO authenticated;
GRANT ALL ON public.sso_connections TO service_role;

ALTER TABLE public.sso_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sso readable by org admins" ON public.sso_connections
  FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "sso insertable by org admins" ON public.sso_connections
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "sso updatable by org admins" ON public.sso_connections
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "sso deletable by org owners" ON public.sso_connections
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'owner'));

CREATE TRIGGER trg_sso_updated_at BEFORE UPDATE ON public.sso_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_sso_org ON public.sso_connections(org_id);
CREATE INDEX idx_sso_domain ON public.sso_connections(domain);

-- ===== AI Guardrails =====
CREATE TYPE public.guardrail_type AS ENUM ('pii_redact','prompt_injection','toxicity','topic_filter','rate_cap','secret_leak');
CREATE TYPE public.guardrail_action AS ENUM ('block','warn','redact');
CREATE TYPE public.guardrail_severity AS ENUM ('low','medium','high','critical');

CREATE TABLE public.ai_guardrails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  type public.guardrail_type NOT NULL,
  action public.guardrail_action NOT NULL DEFAULT 'warn',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_guardrails TO authenticated;
GRANT ALL ON public.ai_guardrails TO service_role;

ALTER TABLE public.ai_guardrails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guardrails readable by project viewers" ON public.ai_guardrails
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));

CREATE POLICY "guardrails insertable by project editors" ON public.ai_guardrails
  FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE POLICY "guardrails updatable by project editors" ON public.ai_guardrails
  FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE POLICY "guardrails deletable by project owners" ON public.ai_guardrails
  FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TRIGGER trg_guardrails_updated_at BEFORE UPDATE ON public.ai_guardrails
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_guardrails_project ON public.ai_guardrails(project_id);

CREATE TABLE public.ai_guardrail_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  guardrail_id uuid REFERENCES public.ai_guardrails(id) ON DELETE SET NULL,
  guardrail_type public.guardrail_type NOT NULL,
  severity public.guardrail_severity NOT NULL DEFAULT 'medium',
  action_taken public.guardrail_action NOT NULL,
  content_hash text NOT NULL,
  snippet text,
  matched_patterns text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.ai_guardrail_violations TO authenticated;
GRANT ALL ON public.ai_guardrail_violations TO service_role;

ALTER TABLE public.ai_guardrail_violations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "violations readable by project viewers" ON public.ai_guardrail_violations
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));

CREATE POLICY "violations insertable by project editors" ON public.ai_guardrail_violations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE POLICY "violations deletable by project owners" ON public.ai_guardrail_violations
  FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE INDEX idx_violations_project_time ON public.ai_guardrail_violations(project_id, occurred_at DESC);
CREATE INDEX idx_violations_type ON public.ai_guardrail_violations(project_id, guardrail_type);
