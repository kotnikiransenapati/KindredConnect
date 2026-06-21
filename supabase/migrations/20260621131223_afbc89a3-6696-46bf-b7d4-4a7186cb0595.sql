
-- ===== P44: Edge AI inference router =====
CREATE TABLE public.edge_ai_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slug text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('lovable','openai','anthropic','google','azure','local','custom')),
  model_id text NOT NULL,
  region text NOT NULL DEFAULT 'global',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','degraded')),
  cost_per_1k_input numeric(10,5) NOT NULL DEFAULT 0,
  cost_per_1k_output numeric(10,5) NOT NULL DEFAULT 0,
  avg_latency_ms integer NOT NULL DEFAULT 250 CHECK (avg_latency_ms >= 0),
  context_window integer NOT NULL DEFAULT 8192,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edge_ai_models TO authenticated;
GRANT ALL ON public.edge_ai_models TO service_role;
ALTER TABLE public.edge_ai_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edge_ai_models_view" ON public.edge_ai_models FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "edge_ai_models_write" ON public.edge_ai_models FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "edge_ai_models_update" ON public.edge_ai_models FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "edge_ai_models_delete" ON public.edge_ai_models FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER edge_ai_models_updated BEFORE UPDATE ON public.edge_ai_models FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.edge_ai_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  capability text NOT NULL,
  strategy text NOT NULL DEFAULT 'cheapest' CHECK (strategy IN ('cheapest','fastest','weighted','fallback','round-robin')),
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  fallback_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_cost_per_1k numeric(10,5),
  max_latency_ms integer,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.edge_ai_routes TO authenticated;
GRANT ALL ON public.edge_ai_routes TO service_role;
ALTER TABLE public.edge_ai_routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edge_ai_routes_view" ON public.edge_ai_routes FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "edge_ai_routes_write" ON public.edge_ai_routes FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "edge_ai_routes_update" ON public.edge_ai_routes FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "edge_ai_routes_delete" ON public.edge_ai_routes FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER edge_ai_routes_updated BEFORE UPDATE ON public.edge_ai_routes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.edge_ai_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.edge_ai_routes(id) ON DELETE SET NULL,
  model_id uuid REFERENCES public.edge_ai_models(id) ON DELETE SET NULL,
  capability text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  cost numeric(10,5) NOT NULL DEFAULT 0,
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','fallback','error','timeout')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.edge_ai_invocations TO authenticated;
GRANT ALL ON public.edge_ai_invocations TO service_role;
ALTER TABLE public.edge_ai_invocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "edge_ai_invocations_view" ON public.edge_ai_invocations FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "edge_ai_invocations_write" ON public.edge_ai_invocations FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE INDEX edge_ai_invocations_project_time_idx ON public.edge_ai_invocations(project_id, created_at DESC);

-- ===== P45: Impact analysis bot =====
CREATE TABLE public.impact_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  branch text,
  changed_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_score integer NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  summary text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  reviewer_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.impact_scans TO authenticated;
GRANT ALL ON public.impact_scans TO service_role;
ALTER TABLE public.impact_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "impact_scans_view" ON public.impact_scans FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "impact_scans_write" ON public.impact_scans FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "impact_scans_update" ON public.impact_scans FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "impact_scans_delete" ON public.impact_scans FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER impact_scans_updated BEFORE UPDATE ON public.impact_scans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.impact_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.impact_scans(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  component text,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  blast_radius integer NOT NULL DEFAULT 1 CHECK (blast_radius >= 0),
  message text NOT NULL,
  affected_routes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.impact_findings TO authenticated;
GRANT ALL ON public.impact_findings TO service_role;
ALTER TABLE public.impact_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "impact_findings_view" ON public.impact_findings FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "impact_findings_write" ON public.impact_findings FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "impact_findings_delete" ON public.impact_findings FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE INDEX impact_findings_scan_idx ON public.impact_findings(scan_id);

-- ===== P46: Fleet device management =====
CREATE TABLE public.fleet_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  label text,
  platform text NOT NULL CHECK (platform IN ('ios','android','web','desktop','wearable','tv')),
  os_version text,
  app_version text,
  channel text NOT NULL DEFAULT 'production' CHECK (channel IN ('production','beta','internal','dev')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','idle','offline','quarantined','retired')),
  enrolled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_label text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at timestamptz,
  last_ip inet,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, device_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_devices TO authenticated;
GRANT ALL ON public.fleet_devices TO service_role;
ALTER TABLE public.fleet_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_devices_view" ON public.fleet_devices FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "fleet_devices_write" ON public.fleet_devices FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "fleet_devices_update" ON public.fleet_devices FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "fleet_devices_delete" ON public.fleet_devices FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER fleet_devices_updated BEFORE UPDATE ON public.fleet_devices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.fleet_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.fleet_devices(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('wipe','lock','unlock','refresh-config','push-update','reboot','collect-logs','quarantine','release')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','dispatched','acknowledged','succeeded','failed','expired','cancelled')),
  issued_by uuid NOT NULL DEFAULT auth.uid(),
  result jsonb,
  dispatched_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_commands TO authenticated;
GRANT ALL ON public.fleet_commands TO service_role;
ALTER TABLE public.fleet_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fleet_commands_view" ON public.fleet_commands FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "fleet_commands_write" ON public.fleet_commands FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "fleet_commands_update" ON public.fleet_commands FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "fleet_commands_delete" ON public.fleet_commands FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER fleet_commands_updated BEFORE UPDATE ON public.fleet_commands FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX fleet_commands_device_idx ON public.fleet_commands(device_id, created_at DESC);
