CREATE TABLE public.anomaly_detectors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'custom' CHECK (source IN ('analytics','crashes','builds','security','performance','custom')),
  sensitivity TEXT NOT NULL DEFAULT 'medium' CHECK (sensitivity IN ('low','medium','high')),
  window_minutes INTEGER NOT NULL DEFAULT 60 CHECK (window_minutes BETWEEN 5 AND 10080),
  min_samples INTEGER NOT NULL DEFAULT 12 CHECK (min_samples BETWEEN 5 AND 1000),
  enabled BOOLEAN NOT NULL DEFAULT true,
  notify_channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  baseline JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, metric_key)
);
CREATE INDEX idx_anomaly_detectors_project ON public.anomaly_detectors(project_id, enabled);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.anomaly_detectors TO authenticated;
GRANT ALL ON public.anomaly_detectors TO service_role;
ALTER TABLE public.anomaly_detectors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewers read anomaly_detectors" ON public.anomaly_detectors FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors insert anomaly_detectors" ON public.anomaly_detectors FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "editors update anomaly_detectors" ON public.anomaly_detectors FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "owners delete anomaly_detectors" ON public.anomaly_detectors FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TRIGGER anomaly_detectors_set_updated_at BEFORE UPDATE ON public.anomaly_detectors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.anomaly_samples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  detector_id UUID NOT NULL REFERENCES public.anomaly_detectors(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  metric_value NUMERIC NOT NULL,
  dimension TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_anomaly_samples_detector_time ON public.anomaly_samples(detector_id, measured_at DESC);
CREATE INDEX idx_anomaly_samples_project_time ON public.anomaly_samples(project_id, measured_at DESC);

GRANT SELECT, INSERT ON public.anomaly_samples TO authenticated;
GRANT ALL ON public.anomaly_samples TO service_role;
ALTER TABLE public.anomaly_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewers read anomaly_samples" ON public.anomaly_samples FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors insert anomaly_samples" ON public.anomaly_samples FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.anomaly_incidents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  detector_id UUID NOT NULL REFERENCES public.anomaly_detectors(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sample_id UUID REFERENCES public.anomaly_samples(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open','acknowledged','resolved','suppressed')),
  score NUMERIC NOT NULL DEFAULT 0,
  z_score NUMERIC,
  expected_value NUMERIC,
  actual_value NUMERIC NOT NULL,
  summary TEXT NOT NULL,
  recommendation TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  actor_id UUID REFERENCES auth.users(id)
);
CREATE INDEX idx_anomaly_incidents_project_state ON public.anomaly_incidents(project_id, state, detected_at DESC);
CREATE INDEX idx_anomaly_incidents_detector ON public.anomaly_incidents(detector_id, detected_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.anomaly_incidents TO authenticated;
GRANT ALL ON public.anomaly_incidents TO service_role;
ALTER TABLE public.anomaly_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewers read anomaly_incidents" ON public.anomaly_incidents FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors insert anomaly_incidents" ON public.anomaly_incidents FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "editors update anomaly_incidents" ON public.anomaly_incidents FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));