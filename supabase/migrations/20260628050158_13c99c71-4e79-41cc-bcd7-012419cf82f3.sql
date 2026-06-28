
CREATE TABLE public.spatial_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  color text NOT NULL DEFAULT '#7c5cff',
  pos_x double precision NOT NULL DEFAULT 0,
  pos_y double precision NOT NULL DEFAULT 0,
  pos_z double precision NOT NULL DEFAULT 0,
  target_node_id uuid REFERENCES public.spatial_nodes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'online' CHECK (status IN ('online','idle','offline')),
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spatial_presence TO authenticated;
GRANT ALL ON public.spatial_presence TO service_role;
ALTER TABLE public.spatial_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presence_read" ON public.spatial_presence FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "presence_insert" ON public.spatial_presence FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "presence_update" ON public.spatial_presence FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "presence_delete" ON public.spatial_presence FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX idx_presence_project ON public.spatial_presence(project_id, last_seen DESC);
CREATE TRIGGER trg_presence_updated BEFORE UPDATE ON public.spatial_presence
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
