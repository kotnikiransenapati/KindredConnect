
CREATE TABLE public.kms_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'data' CHECK (purpose IN ('data','signing','jwt','backup','field')),
  algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm' CHECK (algorithm IN ('aes-256-gcm','chacha20-poly1305','rsa-4096','ed25519')),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  rotation_days INTEGER NOT NULL DEFAULT 90 CHECK (rotation_days BETWEEN 1 AND 730),
  next_rotation_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','scheduled_destroy','destroyed')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, alias)
);
CREATE INDEX idx_kms_keys_project ON public.kms_keys(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kms_keys TO authenticated;
GRANT ALL ON public.kms_keys TO service_role;
ALTER TABLE public.kms_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewers read kms_keys" ON public.kms_keys FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors write kms_keys" ON public.kms_keys FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "editors update kms_keys" ON public.kms_keys FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "owners delete kms_keys" ON public.kms_keys FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TRIGGER kms_keys_set_updated_at BEFORE UPDATE ON public.kms_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.kms_key_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_id UUID NOT NULL REFERENCES public.kms_keys(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  algorithm TEXT NOT NULL,
  wrapped_dek TEXT NOT NULL,
  public_jwk JSONB,
  fingerprint TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active','retired','destroyed')),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  destroyed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key_id, version)
);
CREATE INDEX idx_kms_kv_key ON public.kms_key_versions(key_id, version DESC);

GRANT SELECT, INSERT, UPDATE ON public.kms_key_versions TO authenticated;
GRANT ALL ON public.kms_key_versions TO service_role;
ALTER TABLE public.kms_key_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewers read kms_kv" ON public.kms_key_versions FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors write kms_kv" ON public.kms_key_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "editors update kms_kv" ON public.kms_key_versions FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));


CREATE TABLE public.kms_key_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_id UUID NOT NULL REFERENCES public.kms_keys(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create','rotate','retire','destroy','disable','enable','use')),
  version INTEGER,
  actor UUID REFERENCES auth.users(id),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kms_audit_key ON public.kms_key_audit(key_id, created_at DESC);
CREATE INDEX idx_kms_audit_project ON public.kms_key_audit(project_id, created_at DESC);

GRANT SELECT, INSERT ON public.kms_key_audit TO authenticated;
GRANT ALL ON public.kms_key_audit TO service_role;
ALTER TABLE public.kms_key_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewers read kms_audit" ON public.kms_key_audit FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors write kms_audit" ON public.kms_key_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
