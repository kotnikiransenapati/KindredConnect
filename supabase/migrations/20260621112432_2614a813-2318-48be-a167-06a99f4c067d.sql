
-- ===== Release notes =====
CREATE TABLE public.release_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'production' CHECK (channel IN ('production','beta','internal')),
  platform TEXT NOT NULL DEFAULT 'all' CHECK (platform IN ('ios','android','web','all')),
  tone TEXT NOT NULL DEFAULT 'friendly' CHECK (tone IN ('friendly','formal','playful','technical')),
  language TEXT NOT NULL DEFAULT 'en',
  source_commits JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary_md TEXT NOT NULL DEFAULT '',
  highlights JSONB NOT NULL DEFAULT '[]'::jsonb,
  breaking JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','published','archived')),
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_release_notes_project ON public.release_notes(project_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.release_notes TO authenticated;
GRANT ALL ON public.release_notes TO service_role;

ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rn_select" ON public.release_notes FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "rn_insert" ON public.release_notes FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "rn_update" ON public.release_notes FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "rn_delete" ON public.release_notes FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TRIGGER trg_release_notes_updated BEFORE UPDATE ON public.release_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Residency zones (catalog) =====
CREATE TABLE public.residency_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  country TEXT NOT NULL,
  provider TEXT NOT NULL,
  compliance JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.residency_zones TO authenticated;
GRANT ALL ON public.residency_zones TO service_role;

ALTER TABLE public.residency_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rz_select" ON public.residency_zones FOR SELECT TO authenticated USING (true);

INSERT INTO public.residency_zones(code, display_name, country, provider, compliance) VALUES
  ('us-east-1','US East (Virginia)','US','aws','["SOC2","HIPAA"]'),
  ('us-west-2','US West (Oregon)','US','aws','["SOC2"]'),
  ('eu-west-1','EU West (Ireland)','IE','aws','["GDPR","SOC2"]'),
  ('eu-central-1','EU Central (Frankfurt)','DE','aws','["GDPR","C5","SOC2"]'),
  ('ap-south-1','Asia Pacific (Mumbai)','IN','aws','["SOC2"]'),
  ('ap-northeast-1','Asia Pacific (Tokyo)','JP','aws','["ISMS","SOC2"]');

-- ===== Project residency assignment =====
CREATE TABLE public.project_residency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  primary_zone TEXT NOT NULL REFERENCES public.residency_zones(code),
  backup_zone TEXT REFERENCES public.residency_zones(code),
  dataclass JSONB NOT NULL DEFAULT '{"pii":"primary","logs":"primary","backups":"backup"}'::jsonb,
  encryption_mode TEXT NOT NULL DEFAULT 'cmek' CHECK (encryption_mode IN ('platform','cmek','byok')),
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_residency TO authenticated;
GRANT ALL ON public.project_residency TO service_role;

ALTER TABLE public.project_residency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pr_select" ON public.project_residency FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "pr_insert" ON public.project_residency FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE POLICY "pr_update" ON public.project_residency FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TRIGGER trg_project_residency_updated BEFORE UPDATE ON public.project_residency
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Residency audit =====
CREATE TABLE public.residency_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  from_zone TEXT,
  to_zone TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_residency_audit_project ON public.residency_audit(project_id, created_at DESC);

GRANT SELECT ON public.residency_audit TO authenticated;
GRANT ALL ON public.residency_audit TO service_role;

ALTER TABLE public.residency_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ra_select" ON public.residency_audit FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
