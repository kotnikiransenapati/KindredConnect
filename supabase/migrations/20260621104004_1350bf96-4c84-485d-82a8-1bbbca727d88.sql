
-- P27 — Hot-reload bridge
CREATE TABLE public.hot_reload_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_token_hash TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  device_label TEXT,
  current_bundle_id UUID,
  last_seq INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','connected','reloading','error','disconnected')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hrc_proj_idx ON public.hot_reload_clients(project_id, last_seen_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hot_reload_clients TO authenticated;
GRANT ALL ON public.hot_reload_clients TO service_role;
ALTER TABLE public.hot_reload_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrc read" ON public.hot_reload_clients FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "hrc write" ON public.hot_reload_clients FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.hot_reload_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('full','delta','asset')),
  bundle_url TEXT,
  checksum TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  changed_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, seq)
);
CREATE INDEX hrb_proj_idx ON public.hot_reload_bundles(project_id, seq DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hot_reload_bundles TO authenticated;
GRANT ALL ON public.hot_reload_bundles TO service_role;
ALTER TABLE public.hot_reload_bundles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hrb read" ON public.hot_reload_bundles FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "hrb write" ON public.hot_reload_bundles FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.hot_reload_events (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.hot_reload_clients(id) ON DELETE SET NULL,
  bundle_id UUID REFERENCES public.hot_reload_bundles(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  detail TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX hre_proj_idx ON public.hot_reload_events(project_id, occurred_at DESC);
GRANT SELECT, INSERT ON public.hot_reload_events TO authenticated;
GRANT USAGE ON SEQUENCE public.hot_reload_events_id_seq TO authenticated;
GRANT ALL ON public.hot_reload_events TO service_role;
GRANT ALL ON SEQUENCE public.hot_reload_events_id_seq TO service_role;
ALTER TABLE public.hot_reload_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hree read" ON public.hot_reload_events FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "hree insert" ON public.hot_reload_events FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

-- P28 — Canary rollouts
CREATE TYPE public.canary_status AS ENUM ('draft','active','paused','promoting','promoted','rolled_back','aborted');

CREATE TABLE public.canary_rollouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  artifact_ref TEXT NOT NULL,
  baseline_ref TEXT,
  status public.canary_status NOT NULL DEFAULT 'draft',
  stages JSONB NOT NULL DEFAULT '[{"percent":5,"hold_minutes":15},{"percent":25,"hold_minutes":30},{"percent":100,"hold_minutes":0}]'::jsonb,
  current_stage INTEGER NOT NULL DEFAULT 0,
  crash_budget_ppm INTEGER NOT NULL DEFAULT 5000,
  error_budget_ppm INTEGER NOT NULL DEFAULT 20000,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cr_proj_idx ON public.canary_rollouts(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.canary_rollouts TO authenticated;
GRANT ALL ON public.canary_rollouts TO service_role;
ALTER TABLE public.canary_rollouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cr read" ON public.canary_rollouts FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "cr write" ON public.canary_rollouts FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE TRIGGER cr_updated BEFORE UPDATE ON public.canary_rollouts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.canary_metrics (
  id BIGSERIAL PRIMARY KEY,
  rollout_id UUID NOT NULL REFERENCES public.canary_rollouts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage INTEGER NOT NULL,
  sessions BIGINT NOT NULL DEFAULT 0,
  crashes BIGINT NOT NULL DEFAULT 0,
  errors BIGINT NOT NULL DEFAULT 0,
  p95_latency_ms NUMERIC,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'manual'
);
CREATE INDEX cm_roll_idx ON public.canary_metrics(rollout_id, recorded_at DESC);
GRANT SELECT, INSERT ON public.canary_metrics TO authenticated;
GRANT USAGE ON SEQUENCE public.canary_metrics_id_seq TO authenticated;
GRANT ALL ON public.canary_metrics TO service_role;
GRANT ALL ON SEQUENCE public.canary_metrics_id_seq TO service_role;
ALTER TABLE public.canary_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cm read" ON public.canary_metrics FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "cm insert" ON public.canary_metrics FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.canary_events (
  id BIGSERIAL PRIMARY KEY,
  rollout_id UUID NOT NULL REFERENCES public.canary_rollouts(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  stage INTEGER,
  status public.canary_status,
  detail TEXT,
  actor_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ce_roll_idx ON public.canary_events(rollout_id, occurred_at DESC);
GRANT SELECT, INSERT ON public.canary_events TO authenticated;
GRANT USAGE ON SEQUENCE public.canary_events_id_seq TO authenticated;
GRANT ALL ON public.canary_events TO service_role;
GRANT ALL ON SEQUENCE public.canary_events_id_seq TO service_role;
ALTER TABLE public.canary_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ce read" ON public.canary_events FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "ce insert" ON public.canary_events FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
