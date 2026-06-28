
CREATE TABLE public.node_inspector_props (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES public.spatial_nodes(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('style','a11y','data','layout','event')),
  prop_key text NOT NULL,
  prop_type text NOT NULL CHECK (prop_type IN ('string','number','boolean','color','json')),
  prop_value jsonb NOT NULL DEFAULT 'null'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id, category, prop_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.node_inspector_props TO authenticated;
GRANT ALL ON public.node_inspector_props TO service_role;
ALTER TABLE public.node_inspector_props ENABLE ROW LEVEL SECURITY;
CREATE POLICY "props_read" ON public.node_inspector_props FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "props_write" ON public.node_inspector_props FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "props_update" ON public.node_inspector_props FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "props_delete" ON public.node_inspector_props FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE INDEX idx_props_node ON public.node_inspector_props(node_id);
CREATE TRIGGER trg_props_updated BEFORE UPDATE ON public.node_inspector_props FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.node_animations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES public.spatial_nodes(id) ON DELETE CASCADE,
  name text NOT NULL,
  property text NOT NULL,
  duration_ms integer NOT NULL DEFAULT 1000 CHECK (duration_ms > 0 AND duration_ms <= 600000),
  loop_mode text NOT NULL DEFAULT 'once' CHECK (loop_mode IN ('once','loop','pingpong')),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.node_animations TO authenticated;
GRANT ALL ON public.node_animations TO service_role;
ALTER TABLE public.node_animations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anim_read" ON public.node_animations FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "anim_write" ON public.node_animations FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "anim_update" ON public.node_animations FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "anim_delete" ON public.node_animations FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE INDEX idx_anim_node ON public.node_animations(node_id);
CREATE TRIGGER trg_anim_updated BEFORE UPDATE ON public.node_animations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.node_keyframes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  animation_id uuid NOT NULL REFERENCES public.node_animations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  time_ms integer NOT NULL CHECK (time_ms >= 0),
  value jsonb NOT NULL,
  easing text NOT NULL DEFAULT 'easeInOut' CHECK (easing IN ('linear','easeIn','easeOut','easeInOut','spring','step')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (animation_id, time_ms)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.node_keyframes TO authenticated;
GRANT ALL ON public.node_keyframes TO service_role;
ALTER TABLE public.node_keyframes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kf_read" ON public.node_keyframes FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "kf_write" ON public.node_keyframes FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "kf_update" ON public.node_keyframes FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor')) WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "kf_delete" ON public.node_keyframes FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE INDEX idx_kf_anim ON public.node_keyframes(animation_id, time_ms);
