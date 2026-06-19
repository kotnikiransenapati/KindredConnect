
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('file','url','note')),
  source_path TEXT NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  embedding vector(768),
  tokens INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_chunks TO authenticated;
GRANT ALL ON public.knowledge_chunks TO service_role;

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kc: project members can read"
  ON public.knowledge_chunks FOR SELECT TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));

CREATE POLICY "kc: editors can write"
  ON public.knowledge_chunks FOR INSERT TO authenticated
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE POLICY "kc: editors can update"
  ON public.knowledge_chunks FOR UPDATE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE POLICY "kc: editors can delete"
  ON public.knowledge_chunks FOR DELETE TO authenticated
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE INDEX knowledge_chunks_project_idx ON public.knowledge_chunks(project_id);
CREATE INDEX knowledge_chunks_source_idx ON public.knowledge_chunks(project_id, source_type, source_path);
CREATE INDEX knowledge_chunks_embed_idx ON public.knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TRIGGER knowledge_chunks_updated_at
  BEFORE UPDATE ON public.knowledge_chunks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Vector similarity search RPC (security-definer for fast access; gated by has_project_role)
CREATE OR REPLACE FUNCTION public.match_knowledge(
  _project_id UUID, _user_id UUID, _query vector(768), _k INT DEFAULT 6
) RETURNS TABLE(id UUID, source_type TEXT, source_path TEXT, content TEXT, similarity FLOAT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT kc.id, kc.source_type, kc.source_path, kc.content,
         1 - (kc.embedding <=> _query) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.project_id = _project_id
    AND public.has_project_role(_project_id, _user_id, 'viewer')
    AND kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> _query
  LIMIT GREATEST(1, LEAST(_k, 20));
$$;
