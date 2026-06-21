
-- =================== P29 Asset compression pipeline ===================
CREATE TABLE public.asset_compression_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('image','font','js','css','other')),
  output_format TEXT NOT NULL CHECK (output_format IN ('webp','avif','jpeg','png','woff2','gzip','brotli','passthrough')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','skipped')),
  original_bytes BIGINT NOT NULL DEFAULT 0,
  compressed_bytes BIGINT NOT NULL DEFAULT 0,
  savings_bytes BIGINT GENERATED ALWAYS AS (GREATEST(original_bytes - compressed_bytes, 0)) STORED,
  quality INT,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_path TEXT,
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX asset_jobs_project_status_idx ON public.asset_compression_jobs(project_id, status, created_at DESC);
CREATE INDEX asset_jobs_queued_idx ON public.asset_compression_jobs(created_at) WHERE status = 'queued';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_compression_jobs TO authenticated;
GRANT ALL ON public.asset_compression_jobs TO service_role;

ALTER TABLE public.asset_compression_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_jobs viewer read" ON public.asset_compression_jobs
  FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "asset_jobs editor write" ON public.asset_compression_jobs
  FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "asset_jobs editor update" ON public.asset_compression_jobs
  FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "asset_jobs editor delete" ON public.asset_compression_jobs
  FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER asset_jobs_touch BEFORE UPDATE ON public.asset_compression_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =================== P30 Edge cache & CDN ===================
CREATE TABLE public.edge_cache_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  hostname TEXT NOT NULL,
  default_ttl_seconds INT NOT NULL DEFAULT 60 CHECK (default_ttl_seconds BETWEEN 0 AND 31536000),
  stale_while_revalidate_seconds INT NOT NULL DEFAULT 60 CHECK (stale_while_revalidate_seconds BETWEEN 0 AND 31536000),
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, hostname)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edge_cache_zones TO authenticated;
GRANT ALL ON public.edge_cache_zones TO service_role;

ALTER TABLE public.edge_cache_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edge_zones viewer read" ON public.edge_cache_zones
  FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "edge_zones editor write" ON public.edge_cache_zones
  FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "edge_zones editor update" ON public.edge_cache_zones
  FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "edge_zones editor delete" ON public.edge_cache_zones
  FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER edge_zones_touch BEFORE UPDATE ON public.edge_cache_zones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.edge_cache_purges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.edge_cache_zones(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('paths','prefix','tag','everything')),
  targets JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','partial')),
  purged_count INT NOT NULL DEFAULT 0,
  detail TEXT,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX edge_purges_zone_idx ON public.edge_cache_purges(zone_id, created_at DESC);
CREATE INDEX edge_purges_project_idx ON public.edge_cache_purges(project_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.edge_cache_purges TO authenticated;
GRANT ALL ON public.edge_cache_purges TO service_role;

ALTER TABLE public.edge_cache_purges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edge_purges viewer read" ON public.edge_cache_purges
  FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "edge_purges editor write" ON public.edge_cache_purges
  FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "edge_purges editor update" ON public.edge_cache_purges
  FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
