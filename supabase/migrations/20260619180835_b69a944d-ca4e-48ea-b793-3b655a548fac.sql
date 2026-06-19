
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION vector SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO authenticated, service_role, anon;

-- Recreate match_knowledge to reference extensions.vector and lock down EXECUTE
DROP FUNCTION IF EXISTS public.match_knowledge(uuid, uuid, extensions.vector, int);
DROP FUNCTION IF EXISTS public.match_knowledge(uuid, uuid, vector, int);

CREATE OR REPLACE FUNCTION public.match_knowledge(
  _project_id UUID, _user_id UUID, _query extensions.vector, _k INT DEFAULT 6
) RETURNS TABLE(id UUID, source_type TEXT, source_path TEXT, content TEXT, similarity FLOAT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT kc.id, kc.source_type, kc.source_path, kc.content,
         1 - (kc.embedding <=> _query) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.project_id = _project_id
    AND public.has_project_role(_project_id, _user_id, 'viewer')
    AND kc.embedding IS NOT NULL
  ORDER BY kc.embedding <=> _query
  LIMIT GREATEST(1, LEAST(_k, 20));
$$;

REVOKE ALL ON FUNCTION public.match_knowledge(uuid, uuid, extensions.vector, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge(uuid, uuid, extensions.vector, int) TO service_role;
