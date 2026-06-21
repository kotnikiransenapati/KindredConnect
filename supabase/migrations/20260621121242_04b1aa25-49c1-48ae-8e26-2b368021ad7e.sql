
CREATE TABLE public.on_device_models (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  family TEXT NOT NULL CHECK (family IN ('llama','phi','gemma','qwen','mistral','tinyllama','custom')),
  base_size_mb INTEGER NOT NULL CHECK (base_size_mb > 0 AND base_size_mb <= 8192),
  context_window INTEGER NOT NULL DEFAULT 4096 CHECK (context_window BETWEEN 512 AND 131072),
  license TEXT NOT NULL DEFAULT 'apache-2.0',
  platforms TEXT[] NOT NULL DEFAULT ARRAY['ios','android']::text[],
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','available','deprecated','archived')),
  default_quant TEXT NOT NULL DEFAULT 'q4_k_m' CHECK (default_quant IN ('q4_k_m','q5_k_m','q8_0','fp16')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, slug)
);
CREATE INDEX idx_odm_project ON public.on_device_models(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.on_device_models TO authenticated;
GRANT ALL ON public.on_device_models TO service_role;
ALTER TABLE public.on_device_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewers read on_device_models" ON public.on_device_models FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors write on_device_models" ON public.on_device_models FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "editors update on_device_models" ON public.on_device_models FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "owners delete on_device_models" ON public.on_device_models FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TRIGGER on_device_models_set_updated_at BEFORE UPDATE ON public.on_device_models
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.on_device_model_builds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id UUID NOT NULL REFERENCES public.on_device_models(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  quantization TEXT NOT NULL CHECK (quantization IN ('q4_k_m','q5_k_m','q8_0','fp16')),
  target_platform TEXT NOT NULL CHECK (target_platform IN ('ios','android','web')),
  artifact_path TEXT,
  sha256 TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  signature TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','building','ready','failed','revoked')),
  error TEXT,
  manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, version, quantization, target_platform)
);
CREATE INDEX idx_odm_builds_model ON public.on_device_model_builds(model_id, created_at DESC);
CREATE INDEX idx_odm_builds_project ON public.on_device_model_builds(project_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.on_device_model_builds TO authenticated;
GRANT ALL ON public.on_device_model_builds TO service_role;
ALTER TABLE public.on_device_model_builds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewers read odm_builds" ON public.on_device_model_builds FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors write odm_builds" ON public.on_device_model_builds FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "editors update odm_builds" ON public.on_device_model_builds FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "owners delete odm_builds" ON public.on_device_model_builds FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

CREATE TRIGGER odm_builds_set_updated_at BEFORE UPDATE ON public.on_device_model_builds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.on_device_model_downloads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  build_id UUID NOT NULL REFERENCES public.on_device_model_builds(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  device_class TEXT,
  bytes_transferred BIGINT NOT NULL DEFAULT 0 CHECK (bytes_transferred >= 0),
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  success BOOLEAN NOT NULL DEFAULT true,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_odm_dl_build ON public.on_device_model_downloads(build_id, created_at DESC);
CREATE INDEX idx_odm_dl_project ON public.on_device_model_downloads(project_id, created_at DESC);

GRANT SELECT, INSERT ON public.on_device_model_downloads TO authenticated;
GRANT ALL ON public.on_device_model_downloads TO service_role;
ALTER TABLE public.on_device_model_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "viewers read odm_downloads" ON public.on_device_model_downloads FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "editors write odm_downloads" ON public.on_device_model_downloads FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
