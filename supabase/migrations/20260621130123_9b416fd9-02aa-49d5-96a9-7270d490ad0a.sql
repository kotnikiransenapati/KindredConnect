
CREATE TABLE public.ai_test_suites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_url TEXT,
  target TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_test_suites TO authenticated;
GRANT ALL ON public.ai_test_suites TO service_role;
ALTER TABLE public.ai_test_suites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ats v" ON public.ai_test_suites FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "ats e" ON public.ai_test_suites FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.ai_test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suite_id UUID NOT NULL REFERENCES public.ai_test_suites(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  user_story TEXT NOT NULL,
  spec_code TEXT NOT NULL DEFAULT '',
  selector_strategy TEXT NOT NULL DEFAULT 'role' CHECK (selector_strategy IN ('role','testid','text','css','auto')),
  max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 8),
  last_status TEXT NOT NULL DEFAULT 'pending' CHECK (last_status IN ('pending','passed','failed','flaky','healed')),
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX atc_suite_idx ON public.ai_test_cases(suite_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_test_cases TO authenticated;
GRANT ALL ON public.ai_test_cases TO service_role;
ALTER TABLE public.ai_test_cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atc v" ON public.ai_test_cases FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "atc e" ON public.ai_test_cases FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.ai_test_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.ai_test_cases(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('passed','failed','healed','skipped')),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  healed_locators JSONB NOT NULL DEFAULT '[]'::jsonb,
  logs_excerpt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX atr_case_idx ON public.ai_test_runs(case_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_test_runs TO authenticated;
GRANT ALL ON public.ai_test_runs TO service_role;
ALTER TABLE public.ai_test_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "atr v" ON public.ai_test_runs FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "atr e" ON public.ai_test_runs FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER ats_set_updated_at BEFORE UPDATE ON public.ai_test_suites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER atc_set_updated_at BEFORE UPDATE ON public.ai_test_cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.failover_regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'replica' CHECK (role IN ('primary','replica','standby','observer')),
  status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy','degraded','down','draining')),
  latency_ms INTEGER NOT NULL DEFAULT 0,
  last_check TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.failover_regions TO authenticated;
GRANT ALL ON public.failover_regions TO service_role;
ALTER TABLE public.failover_regions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fr v" ON public.failover_regions FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "fr e" ON public.failover_regions FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.failover_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  strategy TEXT NOT NULL DEFAULT 'active-passive' CHECK (strategy IN ('active-active','active-passive','geo','weighted')),
  health_threshold INTEGER NOT NULL DEFAULT 2 CHECK (health_threshold BETWEEN 1 AND 10),
  cooldown_minutes INTEGER NOT NULL DEFAULT 5 CHECK (cooldown_minutes BETWEEN 0 AND 1440),
  traffic_weights JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.failover_policies TO authenticated;
GRANT ALL ON public.failover_policies TO service_role;
ALTER TABLE public.failover_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fp v" ON public.failover_policies FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "fp e" ON public.failover_policies FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.failover_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID REFERENCES public.failover_policies(id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('health-check','promotion','demotion','failover','rollback','drain','restore')),
  from_region TEXT,
  to_region TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fe_project_idx ON public.failover_events(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.failover_events TO authenticated;
GRANT ALL ON public.failover_events TO service_role;
ALTER TABLE public.failover_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fe v" ON public.failover_events FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "fe e" ON public.failover_events FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER fr_set_updated_at BEFORE UPDATE ON public.failover_regions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER fp_set_updated_at BEFORE UPDATE ON public.failover_policies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.provenance_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.build_pipeline_runs(id) ON DELETE SET NULL,
  subject_name TEXT NOT NULL,
  subject_digest TEXT NOT NULL,
  builder_id TEXT NOT NULL,
  source_uri TEXT,
  source_digest TEXT,
  predicate_type TEXT NOT NULL DEFAULT 'https://slsa.dev/provenance/v1',
  dsse_envelope JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('verified','unverified','failed','revoked')),
  verified_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pa_project_idx ON public.provenance_attestations(project_id, created_at DESC);
CREATE INDEX pa_digest_idx ON public.provenance_attestations(subject_digest);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.provenance_attestations TO authenticated;
GRANT ALL ON public.provenance_attestations TO service_role;
ALTER TABLE public.provenance_attestations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pa v" ON public.provenance_attestations FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "pa e" ON public.provenance_attestations FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.sbom_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.build_pipeline_runs(id) ON DELETE SET NULL,
  attestation_id UUID REFERENCES public.provenance_attestations(id) ON DELETE SET NULL,
  format TEXT NOT NULL CHECK (format IN ('spdx','cyclonedx','syft-json')),
  component_count INTEGER NOT NULL DEFAULT 0 CHECK (component_count >= 0),
  vulnerabilities_count INTEGER NOT NULL DEFAULT 0 CHECK (vulnerabilities_count >= 0),
  severity_rollup JSONB NOT NULL DEFAULT '{}'::jsonb,
  document JSONB NOT NULL DEFAULT '{}'::jsonb,
  signed BOOLEAN NOT NULL DEFAULT false,
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sb_project_idx ON public.sbom_documents(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sbom_documents TO authenticated;
GRANT ALL ON public.sbom_documents TO service_role;
ALTER TABLE public.sbom_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sb v" ON public.sbom_documents FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "sb e" ON public.sbom_documents FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
