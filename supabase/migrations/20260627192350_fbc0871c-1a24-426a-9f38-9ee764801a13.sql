
CREATE TABLE public.palette_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'layout',
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'Box',
  default_props JSONB NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_color TEXT NOT NULL DEFAULT '#6366f1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.palette_blocks TO authenticated;
GRANT ALL ON public.palette_blocks TO service_role;
ALTER TABLE public.palette_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pb_view" ON public.palette_blocks FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "pb_insert" ON public.palette_blocks FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "pb_update" ON public.palette_blocks FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "pb_delete" ON public.palette_blocks FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE INDEX idx_pb_project ON public.palette_blocks(project_id, category, sort_order);
CREATE TRIGGER trg_pb_updated BEFORE UPDATE ON public.palette_blocks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.preview_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'phone',
  viewport_w INTEGER NOT NULL DEFAULT 390,
  viewport_h INTEGER NOT NULL DEFAULT 844,
  scale NUMERIC NOT NULL DEFAULT 1,
  position_x NUMERIC NOT NULL DEFAULT 0,
  position_y NUMERIC NOT NULL DEFAULT 0,
  position_z NUMERIC NOT NULL DEFAULT 0,
  rotation_y NUMERIC NOT NULL DEFAULT 0,
  preview_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preview_devices TO authenticated;
GRANT ALL ON public.preview_devices TO service_role;
ALTER TABLE public.preview_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pd_view" ON public.preview_devices FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "pd_insert" ON public.preview_devices FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "pd_update" ON public.preview_devices FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "pd_delete" ON public.preview_devices FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE INDEX idx_pd_project ON public.preview_devices(project_id);
CREATE TRIGGER trg_pd_updated BEFORE UPDATE ON public.preview_devices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
