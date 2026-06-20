
-- ============ OTA BUNDLES ============
CREATE TABLE public.ota_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version integer NOT NULL,
  channel text NOT NULL DEFAULT 'production',
  storage_path text NOT NULL,
  size_bytes integer NOT NULL,
  sha256 text NOT NULL,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, channel, version)
);
CREATE INDEX ota_bundles_project_idx ON public.ota_bundles(project_id, channel, version DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ota_bundles TO authenticated;
GRANT ALL ON public.ota_bundles TO service_role;
ALTER TABLE public.ota_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view ota bundles" ON public.ota_bundles
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors insert ota bundles" ON public.ota_bundles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND published_by = auth.uid());
CREATE POLICY "editors delete ota bundles" ON public.ota_bundles
  FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));

-- ============ QUALITY REPORTS ============
CREATE TABLE public.quality_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('qa','security','performance')),
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  status text NOT NULL CHECK (status IN ('pass','warn','fail')),
  findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quality_reports_project_idx ON public.quality_reports(project_id, kind, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quality_reports TO authenticated;
GRANT ALL ON public.quality_reports TO service_role;
ALTER TABLE public.quality_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members view quality reports" ON public.quality_reports
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors insert quality reports" ON public.quality_reports
  FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());

-- ============ STORAGE POLICIES for ota-bundles ============
-- Path convention: <project_id>/<channel>/<version>.zip
CREATE POLICY "ota read members" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ota-bundles'
    AND public.has_project_role(((storage.foldername(name))[1])::uuid, auth.uid(), 'viewer')
  );
CREATE POLICY "ota insert editors" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ota-bundles'
    AND public.has_project_role(((storage.foldername(name))[1])::uuid, auth.uid(), 'editor')
  );
CREATE POLICY "ota delete editors" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ota-bundles'
    AND public.has_project_role(((storage.foldername(name))[1])::uuid, auth.uid(), 'editor')
  );
