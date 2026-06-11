
-- Roles enum
CREATE TYPE public.project_role AS ENUM ('owner','editor','viewer');

-- project_members
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.project_role NOT NULL DEFAULT 'viewer',
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Security-definer helper (no recursion)
CREATE OR REPLACE FUNCTION public.has_project_role(_project_id uuid, _user_id uuid, _min_role public.project_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.owner_id = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.project_members m
      WHERE m.project_id = _project_id AND m.user_id = _user_id
      AND (
        _min_role = 'viewer'
        OR (_min_role = 'editor' AND m.role IN ('editor','owner'))
        OR (_min_role = 'owner' AND m.role = 'owner')
      )
    );
$$;

CREATE POLICY "Members read members" ON public.project_members FOR SELECT
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "Owners manage members ins" ON public.project_members FOR INSERT
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE POLICY "Owners manage members upd" ON public.project_members FOR UPDATE
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));
CREATE POLICY "Owners manage members del" ON public.project_members FOR DELETE
  USING (public.has_project_role(project_id, auth.uid(), 'owner'));

-- Extend project visibility to members
CREATE POLICY "Members read projects" ON public.projects FOR SELECT
  USING (public.has_project_role(id, auth.uid(), 'viewer'));

-- Extend files/messages access to editors+
CREATE POLICY "Members read files" ON public.project_files FOR SELECT
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "Editors write files" ON public.project_files FOR INSERT
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "Editors update files" ON public.project_files FOR UPDATE
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "Editors delete files" ON public.project_files FOR DELETE
  USING (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE POLICY "Members read messages" ON public.messages FOR SELECT
  USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "Editors insert messages" ON public.messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND public.has_project_role(project_id, auth.uid(), 'editor'));

-- AI usage tracking
CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model text NOT NULL,
  prompt_chars integer NOT NULL DEFAULT 0,
  response_chars integer NOT NULL DEFAULT 0,
  tool_calls integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_usage TO authenticated;
GRANT ALL ON public.ai_usage TO service_role;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own usage" ON public.ai_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own usage" ON public.ai_usage FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_ai_usage_user_time ON public.ai_usage(user_id, created_at DESC);

-- Rate limit counter (sliding window)
CREATE TABLE public.rate_limits (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, window_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rate_limits TO authenticated;
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own rl" ON public.rate_limits FOR SELECT USING (auth.uid() = user_id);

-- Atomic increment-and-check rate limit fn (service-role bypasses RLS)
CREATE OR REPLACE FUNCTION public.check_rate_limit(_user_id uuid, _bucket text, _window interval, _max integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _start timestamptz; _cnt integer;
BEGIN
  _start := date_trunc('minute', now());
  IF _window > interval '1 minute' THEN _start := date_trunc('day', now()); END IF;
  INSERT INTO public.rate_limits(user_id, bucket, window_start, count)
    VALUES (_user_id, _bucket, _start, 1)
    ON CONFLICT (user_id, bucket, window_start) DO UPDATE SET count = public.rate_limits.count + 1
    RETURNING count INTO _cnt;
  RETURN _cnt <= _max;
END $$;
