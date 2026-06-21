
-- Phase 12 / P25 — In-app A/B Experiments + Feature Flags
CREATE TABLE public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_percent INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ff read" ON public.feature_flags FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "ff write" ON public.feature_flags FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE TRIGGER ff_updated BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TYPE public.experiment_status AS ENUM ('draft','running','paused','completed','archived');

CREATE TABLE public.experiments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  hypothesis TEXT,
  primary_metric TEXT NOT NULL,
  status public.experiment_status NOT NULL DEFAULT 'draft',
  traffic_percent INTEGER NOT NULL DEFAULT 100 CHECK (traffic_percent BETWEEN 0 AND 100),
  variants JSONB NOT NULL DEFAULT '[{"key":"control","weight":50},{"key":"treatment","weight":50}]'::jsonb,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.experiments TO authenticated;
GRANT ALL ON public.experiments TO service_role;
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exp read" ON public.experiments FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "exp write" ON public.experiments FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE TRIGGER exp_updated BEFORE UPDATE ON public.experiments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.experiment_assignments (
  id BIGSERIAL PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (experiment_id, subject_id)
);
CREATE INDEX exp_assign_proj_idx ON public.experiment_assignments(project_id, experiment_id);
GRANT SELECT, INSERT ON public.experiment_assignments TO authenticated;
GRANT USAGE ON SEQUENCE public.experiment_assignments_id_seq TO authenticated;
GRANT ALL ON public.experiment_assignments TO service_role;
GRANT ALL ON SEQUENCE public.experiment_assignments_id_seq TO service_role;
ALTER TABLE public.experiment_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ea read" ON public.experiment_assignments FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "ea insert" ON public.experiment_assignments FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.experiment_exposures (
  id BIGSERIAL PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL,
  variant TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  metric_value NUMERIC NOT NULL DEFAULT 1,
  is_conversion BOOLEAN NOT NULL DEFAULT false,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  properties JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX exp_expo_proj_exp_idx ON public.experiment_exposures(project_id, experiment_id, occurred_at DESC);
CREATE INDEX exp_expo_metric_idx ON public.experiment_exposures(experiment_id, metric_key);
GRANT SELECT, INSERT ON public.experiment_exposures TO authenticated;
GRANT USAGE ON SEQUENCE public.experiment_exposures_id_seq TO authenticated;
GRANT ALL ON public.experiment_exposures TO service_role;
GRANT ALL ON SEQUENCE public.experiment_exposures_id_seq TO service_role;
ALTER TABLE public.experiment_exposures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ee read" ON public.experiment_exposures FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "ee insert" ON public.experiment_exposures FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE OR REPLACE FUNCTION public.experiment_results(_exp_id UUID, _user_id UUID)
RETURNS TABLE(variant TEXT, exposures BIGINT, conversions BIGINT, conversion_rate NUMERIC, total_value NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.variant,
    COUNT(*)::bigint AS exposures,
    COUNT(*) FILTER (WHERE e.is_conversion)::bigint AS conversions,
    CASE WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND(((COUNT(*) FILTER (WHERE e.is_conversion))::numeric * 100) / COUNT(*)::numeric, 4) END AS conversion_rate,
    COALESCE(SUM(e.metric_value),0)::numeric AS total_value
  FROM public.experiment_exposures e
  JOIN public.experiments x ON x.id = e.experiment_id
  WHERE e.experiment_id = _exp_id
    AND public.has_project_role(x.project_id, _user_id, 'viewer')
  GROUP BY e.variant
  ORDER BY e.variant;
$$;

-- Phase 12 / P26 — App-size optimizer (bundle analysis)
CREATE TABLE public.bundle_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  version_name TEXT NOT NULL,
  build_number INTEGER,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  download_bytes BIGINT,
  install_bytes BIGINT,
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bs_proj_idx ON public.bundle_snapshots(project_id, platform, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bundle_snapshots TO authenticated;
GRANT ALL ON public.bundle_snapshots TO service_role;
ALTER TABLE public.bundle_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bs read" ON public.bundle_snapshots FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "bs write" ON public.bundle_snapshots FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.bundle_assets (
  id BIGSERIAL PRIMARY KEY,
  snapshot_id UUID NOT NULL REFERENCES public.bundle_snapshots(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('js','image','font','native','asset','other')),
  bytes BIGINT NOT NULL DEFAULT 0,
  compressed_bytes BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ba_snap_idx ON public.bundle_assets(snapshot_id, bytes DESC);
GRANT SELECT, INSERT, DELETE ON public.bundle_assets TO authenticated;
GRANT USAGE ON SEQUENCE public.bundle_assets_id_seq TO authenticated;
GRANT ALL ON public.bundle_assets TO service_role;
GRANT ALL ON SEQUENCE public.bundle_assets_id_seq TO service_role;
ALTER TABLE public.bundle_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba read" ON public.bundle_assets FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "ba write" ON public.bundle_assets FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
