
-- Versions table
CREATE TABLE public.project_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text,
  snapshot jsonb NOT NULL,
  file_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.project_versions TO authenticated;
GRANT ALL ON public.project_versions TO service_role;
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read versions" ON public.project_versions FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Owners insert versions" ON public.project_versions FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owners delete versions" ON public.project_versions FOR DELETE USING (auth.uid() = owner_id);
CREATE INDEX idx_versions_project_created ON public.project_versions(project_id, created_at DESC);

-- Sharing columns on projects
ALTER TABLE public.projects
  ADD COLUMN is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN public_share_token text UNIQUE;

-- Public read policies (anon can read shared projects + their files)
CREATE POLICY "Public read shared projects" ON public.projects FOR SELECT
  TO anon, authenticated
  USING (is_public = true);

CREATE POLICY "Public read shared files" ON public.project_files FOR SELECT
  TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.is_public = true));

GRANT SELECT ON public.projects TO anon;
GRANT SELECT ON public.project_files TO anon;
