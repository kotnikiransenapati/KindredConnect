-- Per-project encrypted secrets vault + custom domains
CREATE TABLE public.project_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  last_four text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
CREATE INDEX idx_project_secrets_project ON public.project_secrets(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_secrets TO authenticated;
GRANT ALL ON public.project_secrets TO service_role;
ALTER TABLE public.project_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "secrets read by editors" ON public.project_secrets
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "secrets write by editors" ON public.project_secrets
  FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "secrets update by editors" ON public.project_secrets
  FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "secrets delete by owner" ON public.project_secrets
  FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TRIGGER trg_project_secrets_updated_at
  BEFORE UPDATE ON public.project_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Custom domains
CREATE TABLE public.project_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  hostname text NOT NULL UNIQUE,
  verification_token text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|verified|failed
  region text NOT NULL DEFAULT 'global',  -- global|us|eu|ap
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  last_checked_at timestamptz
);
CREATE INDEX idx_project_domains_project ON public.project_domains(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_domains TO authenticated;
GRANT ALL ON public.project_domains TO service_role;
ALTER TABLE public.project_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "domains read by viewers" ON public.project_domains
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "domains write by editors" ON public.project_domains
  FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "domains update by editors" ON public.project_domains
  FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "domains delete by owner" ON public.project_domains
  FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));