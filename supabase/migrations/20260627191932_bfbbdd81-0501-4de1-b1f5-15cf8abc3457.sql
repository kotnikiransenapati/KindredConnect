
CREATE TABLE public.spatial_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'file',
  label text NOT NULL,
  file_path text,
  pos_x double precision NOT NULL DEFAULT 0,
  pos_y double precision NOT NULL DEFAULT 0,
  pos_z double precision NOT NULL DEFAULT 0,
  scale double precision NOT NULL DEFAULT 1,
  color text NOT NULL DEFAULT '#6366f1',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_spatial_nodes_project ON public.spatial_nodes(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spatial_nodes TO authenticated;
GRANT ALL ON public.spatial_nodes TO service_role;

ALTER TABLE public.spatial_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spatial_nodes_select" ON public.spatial_nodes
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));

CREATE POLICY "spatial_nodes_insert" ON public.spatial_nodes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE POLICY "spatial_nodes_update" ON public.spatial_nodes
  FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE POLICY "spatial_nodes_delete" ON public.spatial_nodes
  FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER spatial_nodes_updated_at BEFORE UPDATE ON public.spatial_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Scene cameras (saved viewpoints, for 3D workspace navigation)
CREATE TABLE public.scene_viewpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  cam_x double precision NOT NULL DEFAULT 8,
  cam_y double precision NOT NULL DEFAULT 6,
  cam_z double precision NOT NULL DEFAULT 12,
  target_x double precision NOT NULL DEFAULT 0,
  target_y double precision NOT NULL DEFAULT 0,
  target_z double precision NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_scene_viewpoints_project ON public.scene_viewpoints(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scene_viewpoints TO authenticated;
GRANT ALL ON public.scene_viewpoints TO service_role;

ALTER TABLE public.scene_viewpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scene_viewpoints_select" ON public.scene_viewpoints
  FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));

CREATE POLICY "scene_viewpoints_modify" ON public.scene_viewpoints
  FOR ALL TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
