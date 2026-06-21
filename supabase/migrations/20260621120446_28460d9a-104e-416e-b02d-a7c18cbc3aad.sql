
CREATE TABLE public.app_clips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  platform TEXT NOT NULL DEFAULT 'both' CHECK (platform IN ('ios','android','both')),
  invocation_url TEXT NOT NULL,
  bundle_size_kb INTEGER NOT NULL DEFAULT 0 CHECK (bundle_size_kb >= 0 AND bundle_size_kb <= 15360),
  entry_route TEXT NOT NULL DEFAULT '/',
  advance_experience BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','building','ready','published','archived')),
  associations JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, slug)
);
CREATE INDEX idx_app_clips_project ON public.app_clips(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_clips TO authenticated;
GRANT ALL ON public.app_clips TO service_role;
ALTER TABLE public.app_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewers read app_clips" ON public.app_clips FOR SELECT TO authenticated
  USING (public.has_project_role(auth.uid(), project_id, 'viewer'));
CREATE POLICY "editors insert app_clips" ON public.app_clips FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(auth.uid(), project_id, 'editor'));
CREATE POLICY "editors update app_clips" ON public.app_clips FOR UPDATE TO authenticated
  USING (public.has_project_role(auth.uid(), project_id, 'editor'))
  WITH CHECK (public.has_project_role(auth.uid(), project_id, 'editor'));
CREATE POLICY "owners delete app_clips" ON public.app_clips FOR DELETE TO authenticated
  USING (public.has_project_role(auth.uid(), project_id, 'owner'));

CREATE TRIGGER app_clips_set_updated_at BEFORE UPDATE ON public.app_clips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.app_clip_invocations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clip_id UUID NOT NULL REFERENCES public.app_clips(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android')),
  source TEXT NOT NULL CHECK (source IN ('qr','nfc','link','share','smart_banner','other')),
  country TEXT,
  device_model TEXT,
  converted_to_install BOOLEAN NOT NULL DEFAULT false,
  session_ms INTEGER NOT NULL DEFAULT 0 CHECK (session_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_app_clip_inv_clip ON public.app_clip_invocations(clip_id, created_at DESC);
CREATE INDEX idx_app_clip_inv_project ON public.app_clip_invocations(project_id, created_at DESC);

GRANT SELECT, INSERT ON public.app_clip_invocations TO authenticated;
GRANT ALL ON public.app_clip_invocations TO service_role;
ALTER TABLE public.app_clip_invocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewers read app_clip_invocations" ON public.app_clip_invocations FOR SELECT TO authenticated
  USING (public.has_project_role(auth.uid(), project_id, 'viewer'));
CREATE POLICY "editors insert app_clip_invocations" ON public.app_clip_invocations FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(auth.uid(), project_id, 'editor'));
