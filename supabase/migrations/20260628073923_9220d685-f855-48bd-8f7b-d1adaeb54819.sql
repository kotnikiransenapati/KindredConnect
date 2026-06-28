CREATE TABLE IF NOT EXISTS public.foundry_product_blueprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'superseded')),
  surfaces jsonb NOT NULL DEFAULT '[]'::jsonb,
  personas jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_model jsonb NOT NULL DEFAULT '[]'::jsonb,
  integrations jsonb NOT NULL DEFAULT '[]'::jsonb,
  security_controls jsonb NOT NULL DEFAULT '[]'::jsonb,
  release_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  readiness_score integer NOT NULL DEFAULT 0 CHECK (readiness_score >= 0 AND readiness_score <= 100),
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  source text NOT NULL DEFAULT 'generated' CHECK (source IN ('generated', 'manual', 'imported')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_product_blueprints TO authenticated;
GRANT ALL ON public.foundry_product_blueprints TO service_role;
ALTER TABLE public.foundry_product_blueprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blueprints viewable by project viewers" ON public.foundry_product_blueprints FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "blueprints insertable by project editors" ON public.foundry_product_blueprints FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "blueprints updatable by project editors" ON public.foundry_product_blueprints FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "blueprints deletable by project owners" ON public.foundry_product_blueprints FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX IF NOT EXISTS idx_foundry_blueprints_project_created ON public.foundry_product_blueprints(project_id, created_at DESC);
CREATE TRIGGER trg_foundry_product_blueprints_updated BEFORE UPDATE ON public.foundry_product_blueprints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.foundry_artifact_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  blueprint_id uuid REFERENCES public.foundry_product_blueprints(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'materialized', 'blocked', 'superseded')),
  target_matrix jsonb NOT NULL DEFAULT '{}'::jsonb,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  gates jsonb NOT NULL DEFAULT '[]'::jsonb,
  outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  risk_register jsonb NOT NULL DEFAULT '[]'::jsonb,
  pipeline_hash text NOT NULL,
  generated_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundry_artifact_plans TO authenticated;
GRANT ALL ON public.foundry_artifact_plans TO service_role;
ALTER TABLE public.foundry_artifact_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "artifact plans viewable by project viewers" ON public.foundry_artifact_plans FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "artifact plans insertable by project editors" ON public.foundry_artifact_plans FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "artifact plans updatable by project editors" ON public.foundry_artifact_plans FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "artifact plans deletable by project owners" ON public.foundry_artifact_plans FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX IF NOT EXISTS idx_foundry_artifact_plans_project_created ON public.foundry_artifact_plans(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_foundry_artifact_plans_blueprint ON public.foundry_artifact_plans(blueprint_id);
CREATE TRIGGER trg_foundry_artifact_plans_updated BEFORE UPDATE ON public.foundry_artifact_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();