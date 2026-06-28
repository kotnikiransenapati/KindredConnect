
CREATE TABLE public.project_ir (
  project_id uuid PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  ir jsonb NOT NULL DEFAULT '{}'::jsonb,
  ir_hash text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ir TO authenticated;
GRANT ALL ON public.project_ir TO service_role;
ALTER TABLE public.project_ir ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ir view" ON public.project_ir FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "ir write" ON public.project_ir FOR ALL TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.ir_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version integer NOT NULL,
  ir jsonb NOT NULL,
  ir_hash text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ir_revisions_project_idx ON public.ir_revisions(project_id, version DESC);
GRANT SELECT, INSERT ON public.ir_revisions TO authenticated;
GRANT ALL ON public.ir_revisions TO service_role;
ALTER TABLE public.ir_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ir_rev view" ON public.ir_revisions FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "ir_rev insert" ON public.ir_revisions FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TABLE public.ir_plan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  spec jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  applied_revision_id uuid REFERENCES public.ir_revisions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ir_plan_runs_project_idx ON public.ir_plan_runs(project_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.ir_plan_runs TO authenticated;
GRANT ALL ON public.ir_plan_runs TO service_role;
ALTER TABLE public.ir_plan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ir_plan view" ON public.ir_plan_runs FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "ir_plan write" ON public.ir_plan_runs FOR ALL TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER ir_set_updated BEFORE UPDATE ON public.project_ir
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER ir_plan_set_updated BEFORE UPDATE ON public.ir_plan_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
