CREATE TABLE public.foundry_security_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE UNIQUE,
  profile text NOT NULL DEFAULT 'strict' CHECK (profile IN ('standard','strict','regulated')),
  csp_preset text NOT NULL DEFAULT 'strict' CHECK (csp_preset IN ('balanced','strict','embedded')),
  rate_limit_tier text NOT NULL DEFAULT 'scale' CHECK (rate_limit_tier IN ('starter','scale','enterprise')),
  secret_rotation_days integer NOT NULL DEFAULT 60 CHECK (secret_rotation_days BETWEEN 7 AND 365),
  dependency_gate_enabled boolean NOT NULL DEFAULT true,
  rls_required boolean NOT NULL DEFAULT true,
  audit_required boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_security_policies TO authenticated;
GRANT ALL ON public.foundry_security_policies TO service_role;
ALTER TABLE public.foundry_security_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "foundry_security_policies_read" ON public.foundry_security_policies FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "foundry_security_policies_insert" ON public.foundry_security_policies FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "foundry_security_policies_update" ON public.foundry_security_policies FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "foundry_security_policies_delete" ON public.foundry_security_policies FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER foundry_security_policies_updated_at BEFORE UPDATE ON public.foundry_security_policies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.foundry_telemetry_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE UNIQUE,
  provider text NOT NULL DEFAULT 'otlp' CHECK (provider IN ('otlp','honeycomb','datadog','grafana-cloud','self-hosted')),
  endpoint text NOT NULL DEFAULT '',
  service_name text NOT NULL DEFAULT 'generated-app',
  sample_rate numeric NOT NULL DEFAULT 0.25 CHECK (sample_rate >= 0 AND sample_rate <= 1),
  traces_enabled boolean NOT NULL DEFAULT true,
  metrics_enabled boolean NOT NULL DEFAULT true,
  logs_enabled boolean NOT NULL DEFAULT true,
  headers_secret_ref text,
  status text NOT NULL DEFAULT 'configured' CHECK (status IN ('configured','degraded','disabled')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_telemetry_configs TO authenticated;
GRANT ALL ON public.foundry_telemetry_configs TO service_role;
ALTER TABLE public.foundry_telemetry_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "foundry_telemetry_configs_read" ON public.foundry_telemetry_configs FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "foundry_telemetry_configs_insert" ON public.foundry_telemetry_configs FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "foundry_telemetry_configs_update" ON public.foundry_telemetry_configs FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "foundry_telemetry_configs_delete" ON public.foundry_telemetry_configs FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER foundry_telemetry_configs_updated_at BEFORE UPDATE ON public.foundry_telemetry_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.foundry_compliance_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  profile text NOT NULL CHECK (profile IN ('soc2','hipaa','gdpr','pci','iso27001','custom')),
  enabled_controls text[] NOT NULL DEFAULT '{}',
  retention_days integer NOT NULL DEFAULT 365 CHECK (retention_days BETWEEN 30 AND 3650),
  residency_required boolean NOT NULL DEFAULT false,
  pii_classes jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','disabled','draft')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, profile)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_compliance_profiles TO authenticated;
GRANT ALL ON public.foundry_compliance_profiles TO service_role;
ALTER TABLE public.foundry_compliance_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "foundry_compliance_profiles_read" ON public.foundry_compliance_profiles FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "foundry_compliance_profiles_insert" ON public.foundry_compliance_profiles FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "foundry_compliance_profiles_update" ON public.foundry_compliance_profiles FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "foundry_compliance_profiles_delete" ON public.foundry_compliance_profiles FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX foundry_compliance_profiles_project_idx ON public.foundry_compliance_profiles(project_id, profile);
CREATE TRIGGER foundry_compliance_profiles_updated_at BEFORE UPDATE ON public.foundry_compliance_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.foundry_readiness_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  grade text NOT NULL CHECK (grade IN ('A','B','C','D')),
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_readiness_assessments TO authenticated;
GRANT ALL ON public.foundry_readiness_assessments TO service_role;
ALTER TABLE public.foundry_readiness_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "foundry_readiness_assessments_read" ON public.foundry_readiness_assessments FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "foundry_readiness_assessments_insert" ON public.foundry_readiness_assessments FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor') AND created_by = auth.uid());
CREATE POLICY "foundry_readiness_assessments_update" ON public.foundry_readiness_assessments FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "foundry_readiness_assessments_delete" ON public.foundry_readiness_assessments FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX foundry_readiness_assessments_project_idx ON public.foundry_readiness_assessments(project_id, created_at DESC);