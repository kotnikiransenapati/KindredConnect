
-- Enums
DO $$ BEGIN CREATE TYPE public.device_platform AS ENUM ('ios','android','web'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.pairing_status AS ENUM ('pending','paired','revoked','expired'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.preview_status AS ENUM ('idle','connecting','live','error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.cap_platform AS ENUM ('ios','android','both'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.cap_risk AS ENUM ('low','medium','high'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- device_pairings
CREATE TABLE public.device_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  token_hash text NOT NULL,
  platform public.device_platform,
  device_name text,
  device_model text,
  os_version text,
  status public.pairing_status NOT NULL DEFAULT 'pending',
  paired_at timestamptz,
  last_seen_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_pairings_project_idx ON public.device_pairings(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_pairings TO authenticated;
GRANT ALL ON public.device_pairings TO service_role;
ALTER TABLE public.device_pairings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pairings read" ON public.device_pairings FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "pairings write" ON public.device_pairings FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "pairings update" ON public.device_pairings FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "pairings delete" ON public.device_pairings FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE TRIGGER device_pairings_set_updated_at BEFORE UPDATE ON public.device_pairings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- preview_sessions
CREATE TABLE public.preview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  pairing_id uuid REFERENCES public.device_pairings(id) ON DELETE SET NULL,
  bundle_url text,
  bundle_version text,
  status public.preview_status NOT NULL DEFAULT 'idle',
  event_count integer NOT NULL DEFAULT 0,
  last_event_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX preview_sessions_project_idx ON public.preview_sessions(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preview_sessions TO authenticated;
GRANT ALL ON public.preview_sessions TO service_role;
ALTER TABLE public.preview_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "preview_sessions read" ON public.preview_sessions FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "preview_sessions write" ON public.preview_sessions FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "preview_sessions update" ON public.preview_sessions FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "preview_sessions delete" ON public.preview_sessions FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE TRIGGER preview_sessions_set_updated_at BEFORE UPDATE ON public.preview_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- native_capabilities
CREATE TABLE public.native_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  capability_key text NOT NULL,
  platform public.cap_platform NOT NULL DEFAULT 'both',
  enabled boolean NOT NULL DEFAULT false,
  usage_description text NOT NULL DEFAULT '',
  justification text,
  risk public.cap_risk NOT NULL DEFAULT 'low',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, capability_key, platform)
);
CREATE INDEX native_capabilities_project_idx ON public.native_capabilities(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.native_capabilities TO authenticated;
GRANT ALL ON public.native_capabilities TO service_role;
ALTER TABLE public.native_capabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "caps read" ON public.native_capabilities FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "caps write" ON public.native_capabilities FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "caps update" ON public.native_capabilities FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "caps delete" ON public.native_capabilities FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE TRIGGER native_capabilities_set_updated_at BEFORE UPDATE ON public.native_capabilities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
