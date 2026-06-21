
CREATE TABLE public.crash_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios','android','web')),
  app_version text NOT NULL,
  build_number text,
  os_version text,
  device_model text,
  user_id_external text,
  fingerprint text NOT NULL,
  message text NOT NULL,
  stack_raw text NOT NULL,
  stack_symbolicated text,
  symbolicated boolean NOT NULL DEFAULT false,
  severity text NOT NULL DEFAULT 'error' CHECK (severity IN ('fatal','error','warning','info')),
  breadcrumbs jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crash_reports_project_time ON public.crash_reports(project_id, occurred_at DESC);
CREATE INDEX crash_reports_fingerprint ON public.crash_reports(project_id, fingerprint);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crash_reports TO authenticated;
GRANT ALL ON public.crash_reports TO service_role;
ALTER TABLE public.crash_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read crash reports" ON public.crash_reports FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors insert crash reports" ON public.crash_reports FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "editors update crash reports" ON public.crash_reports FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "owners delete crash reports" ON public.crash_reports FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TABLE public.symbol_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios','android','web')),
  app_version text NOT NULL,
  build_number text,
  kind text NOT NULL CHECK (kind IN ('sourcemap','dsym','proguard')),
  file_name text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  content text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX symbol_maps_lookup ON public.symbol_maps(project_id, platform, app_version);
CREATE UNIQUE INDEX symbol_maps_unique ON public.symbol_maps(project_id, platform, app_version, COALESCE(build_number,''), kind, file_name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.symbol_maps TO authenticated;
GRANT ALL ON public.symbol_maps TO service_role;
ALTER TABLE public.symbol_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read symbols" ON public.symbol_maps FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors write symbols" ON public.symbol_maps FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "owners delete symbols" ON public.symbol_maps FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TABLE public.store_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.store_listings(id) ON DELETE SET NULL,
  build_id uuid REFERENCES public.mobile_builds(id) ON DELETE SET NULL,
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  track text NOT NULL DEFAULT 'production' CHECK (track IN ('production','beta','internal','alpha','testflight')),
  version_name text NOT NULL,
  version_code text,
  release_notes text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validating','validation_failed','submitted','in_review','approved','rejected','released','withdrawn')),
  validation_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewer_notes text,
  external_submission_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX store_submissions_project ON public.store_submissions(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_submissions TO authenticated;
GRANT ALL ON public.store_submissions TO service_role;
ALTER TABLE public.store_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read submissions" ON public.store_submissions FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors insert submissions" ON public.store_submissions FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "editors update submissions" ON public.store_submissions FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "owners delete submissions" ON public.store_submissions FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER store_submissions_updated_at BEFORE UPDATE ON public.store_submissions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.store_submission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES public.store_submissions(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event text NOT NULL,
  status text,
  detail text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX submission_events_submission ON public.store_submission_events(submission_id, created_at DESC);
GRANT SELECT, INSERT ON public.store_submission_events TO authenticated;
GRANT ALL ON public.store_submission_events TO service_role;
ALTER TABLE public.store_submission_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read submission events" ON public.store_submission_events FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors append submission events" ON public.store_submission_events FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
