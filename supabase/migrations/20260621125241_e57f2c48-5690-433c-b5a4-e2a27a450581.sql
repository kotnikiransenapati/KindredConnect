
CREATE TABLE public.collab_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  document_path TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked','archived')),
  base_version BIGINT NOT NULL DEFAULT 0,
  head_version BIGINT NOT NULL DEFAULT 0,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, document_path)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collab_sessions TO authenticated;
GRANT ALL ON public.collab_sessions TO service_role;
ALTER TABLE public.collab_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs viewer read" ON public.collab_sessions FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "cs editor write" ON public.collab_sessions FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.collab_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.collab_sessions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  cursor JSONB NOT NULL DEFAULT '{}'::jsonb,
  selection JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online','idle','offline')),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collab_participants TO authenticated;
GRANT ALL ON public.collab_participants TO service_role;
ALTER TABLE public.collab_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp viewer read" ON public.collab_participants FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "cp editor write" ON public.collab_participants FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.collab_ops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.collab_sessions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version BIGINT NOT NULL,
  op_kind TEXT NOT NULL CHECK (op_kind IN ('insert','delete','retain','format','annotation')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  parent_version BIGINT NOT NULL DEFAULT 0,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, version)
);
CREATE INDEX collab_ops_session_version_idx ON public.collab_ops(session_id, version DESC);
GRANT SELECT, INSERT ON public.collab_ops TO authenticated;
GRANT ALL ON public.collab_ops TO service_role;
ALTER TABLE public.collab_ops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "co viewer read" ON public.collab_ops FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "co editor insert" ON public.collab_ops FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.collab_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.collab_sessions(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  anchor JSONB NOT NULL DEFAULT '{}'::jsonb,
  body TEXT NOT NULL,
  resolved_at TIMESTAMPTZ,
  parent_id UUID REFERENCES public.collab_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.collab_comments TO authenticated;
GRANT ALL ON public.collab_comments TO service_role;
ALTER TABLE public.collab_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cc viewer read" ON public.collab_comments FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "cc editor write" ON public.collab_comments FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER collab_sessions_set_updated_at BEFORE UPDATE ON public.collab_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER collab_comments_set_updated_at BEFORE UPDATE ON public.collab_comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.build_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual','push','schedule','webhook','release')),
  schedule_cron TEXT,
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT true,
  concurrency INTEGER NOT NULL DEFAULT 1 CHECK (concurrency BETWEEN 1 AND 20),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_pipelines TO authenticated;
GRANT ALL ON public.build_pipelines TO service_role;
ALTER TABLE public.build_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp viewer read" ON public.build_pipelines FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "bp editor write" ON public.build_pipelines FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.build_pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.build_pipelines(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  run_number BIGINT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled','timed_out')),
  commit_sha TEXT,
  ref TEXT,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, run_number)
);
CREATE INDEX bpr_project_idx ON public.build_pipeline_runs(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_pipeline_runs TO authenticated;
GRANT ALL ON public.build_pipeline_runs TO service_role;
ALTER TABLE public.build_pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bpr viewer read" ON public.build_pipeline_runs FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "bpr editor write" ON public.build_pipeline_runs FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.build_pipeline_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.build_pipeline_runs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  depends_on TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','queued','running','succeeded','failed','skipped','cancelled')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 5),
  logs_excerpt TEXT,
  exit_code INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, stage_key)
);
CREATE INDEX bpj_run_idx ON public.build_pipeline_jobs(run_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_pipeline_jobs TO authenticated;
GRANT ALL ON public.build_pipeline_jobs TO service_role;
ALTER TABLE public.build_pipeline_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bpj viewer read" ON public.build_pipeline_jobs FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "bpj editor write" ON public.build_pipeline_jobs FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.build_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.build_pipeline_runs(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  job_id UUID REFERENCES public.build_pipeline_jobs(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('apk','aab','ipa','zip','wasm','image','log','sbom','source-map','other')),
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  checksum TEXT,
  storage_path TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 30 CHECK (retention_days BETWEEN 1 AND 3650),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ba_run_idx ON public.build_artifacts(run_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.build_artifacts TO authenticated;
GRANT ALL ON public.build_artifacts TO service_role;
ALTER TABLE public.build_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ba viewer read" ON public.build_artifacts FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "ba editor write" ON public.build_artifacts FOR ALL TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER build_pipelines_set_updated_at BEFORE UPDATE ON public.build_pipelines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
