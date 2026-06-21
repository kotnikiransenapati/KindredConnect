
-- ===== P47: Realtime whiteboard =====
CREATE TABLE public.whiteboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  width integer NOT NULL DEFAULT 1920 CHECK (width BETWEEN 320 AND 8192),
  height integer NOT NULL DEFAULT 1080 CHECK (height BETWEEN 240 AND 8192),
  background text NOT NULL DEFAULT '#0b1020',
  version integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whiteboards TO authenticated;
GRANT ALL ON public.whiteboards TO service_role;
ALTER TABLE public.whiteboards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wb_view" ON public.whiteboards FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "wb_write" ON public.whiteboards FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "wb_update" ON public.whiteboards FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "wb_delete" ON public.whiteboards FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER wb_updated BEFORE UPDATE ON public.whiteboards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.whiteboard_strokes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.whiteboards(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid(),
  seq bigserial NOT NULL,
  tool text NOT NULL CHECK (tool IN ('pen','marker','highlighter','eraser','rect','ellipse','line','arrow','text','sticky')),
  color text NOT NULL DEFAULT '#ffffff',
  stroke_width integer NOT NULL DEFAULT 3 CHECK (stroke_width BETWEEN 1 AND 64),
  points jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.whiteboard_strokes TO authenticated;
GRANT ALL ON public.whiteboard_strokes TO service_role;
ALTER TABLE public.whiteboard_strokes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wbs_view" ON public.whiteboard_strokes FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "wbs_write" ON public.whiteboard_strokes FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "wbs_delete" ON public.whiteboard_strokes FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE INDEX wbs_board_seq_idx ON public.whiteboard_strokes(board_id, seq);

-- ===== P48: AI cost guardrails =====
CREATE TABLE public.ai_cost_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  scope text NOT NULL DEFAULT 'project' CHECK (scope IN ('project','org','user','route')),
  period text NOT NULL DEFAULT 'monthly' CHECK (period IN ('hourly','daily','weekly','monthly')),
  limit_usd numeric(12,4) NOT NULL CHECK (limit_usd > 0),
  soft_pct integer NOT NULL DEFAULT 80 CHECK (soft_pct BETWEEN 1 AND 100),
  hard_pct integer NOT NULL DEFAULT 100 CHECK (hard_pct BETWEEN 1 AND 200),
  action text NOT NULL DEFAULT 'throttle' CHECK (action IN ('alert','throttle','block')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_cost_budgets TO authenticated;
GRANT ALL ON public.ai_cost_budgets TO service_role;
ALTER TABLE public.ai_cost_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acb_view" ON public.ai_cost_budgets FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "acb_write" ON public.ai_cost_budgets FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE POLICY "acb_update" ON public.ai_cost_budgets FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE POLICY "acb_delete" ON public.ai_cost_budgets FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER acb_updated BEFORE UPDATE ON public.ai_cost_budgets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_cost_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budget_id uuid REFERENCES public.ai_cost_budgets(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  route text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_cost_ledger TO authenticated;
GRANT ALL ON public.ai_cost_ledger TO service_role;
ALTER TABLE public.ai_cost_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acl_view" ON public.ai_cost_ledger FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "acl_write" ON public.ai_cost_ledger FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE INDEX acl_project_time_idx ON public.ai_cost_ledger(project_id, occurred_at DESC);
CREATE INDEX acl_budget_idx ON public.ai_cost_ledger(budget_id, occurred_at DESC);

CREATE TABLE public.ai_cost_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  budget_id uuid NOT NULL REFERENCES public.ai_cost_budgets(id) ON DELETE CASCADE,
  threshold text NOT NULL CHECK (threshold IN ('soft','hard')),
  current_spend numeric(12,4) NOT NULL,
  limit_usd numeric(12,4) NOT NULL,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.ai_cost_alerts TO authenticated;
GRANT ALL ON public.ai_cost_alerts TO service_role;
ALTER TABLE public.ai_cost_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aca_view" ON public.ai_cost_alerts FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "aca_write" ON public.ai_cost_alerts FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "aca_ack" ON public.ai_cost_alerts FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));

-- ===== P49: Sandboxed plugin runtime =====
CREATE TABLE public.plugins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  version text NOT NULL DEFAULT '0.1.0',
  publisher text NOT NULL DEFAULT 'self',
  entry_url text NOT NULL,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','suspended','revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, slug, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugins TO authenticated;
GRANT ALL ON public.plugins TO service_role;
ALTER TABLE public.plugins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plg_view" ON public.plugins FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "plg_write" ON public.plugins FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE POLICY "plg_update" ON public.plugins FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE POLICY "plg_delete" ON public.plugins FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER plg_updated BEFORE UPDATE ON public.plugins FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.plugin_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  plugin_id uuid NOT NULL REFERENCES public.plugins(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  installed_by uuid NOT NULL DEFAULT auth.uid(),
  installed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, plugin_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plugin_installations TO authenticated;
GRANT ALL ON public.plugin_installations TO service_role;
ALTER TABLE public.plugin_installations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pli_view" ON public.plugin_installations FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "pli_write" ON public.plugin_installations FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "pli_update" ON public.plugin_installations FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "pli_delete" ON public.plugin_installations FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE TRIGGER pli_updated BEFORE UPDATE ON public.plugin_installations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.plugin_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL REFERENCES public.plugin_installations(id) ON DELETE CASCADE,
  action text NOT NULL,
  input_hash text,
  output_hash text,
  duration_ms integer NOT NULL DEFAULT 0,
  outcome text NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied','error','timeout','blocked')),
  error_message text,
  invoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.plugin_invocations TO authenticated;
GRANT ALL ON public.plugin_invocations TO service_role;
ALTER TABLE public.plugin_invocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plv_view" ON public.plugin_invocations FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "plv_write" ON public.plugin_invocations FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE INDEX plv_install_time_idx ON public.plugin_invocations(installation_id, created_at DESC);
