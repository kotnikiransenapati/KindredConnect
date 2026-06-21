
-- ============ P31 Passkeys / WebAuthn ============
CREATE TABLE public.passkey_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] NOT NULL DEFAULT '{}',
  device_label TEXT,
  aaguid TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, credential_id)
);
CREATE INDEX passkey_user_idx ON public.passkey_credentials(project_id, user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passkey_credentials TO authenticated;
GRANT ALL ON public.passkey_credentials TO service_role;
ALTER TABLE public.passkey_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passkeys owner read" ON public.passkey_credentials
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "passkeys owner write" ON public.passkey_credentials
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "passkeys owner update" ON public.passkey_credentials
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (user_id = auth.uid() OR public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "passkeys owner delete" ON public.passkey_credentials
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER passkey_touch BEFORE UPDATE ON public.passkey_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.passkey_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('register','authenticate')),
  rp_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX passkey_challenge_lookup ON public.passkey_challenges(project_id, challenge);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.passkey_challenges TO authenticated;
GRANT ALL ON public.passkey_challenges TO service_role;
ALTER TABLE public.passkey_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passkey_challenges owner" ON public.passkey_challenges
  FOR ALL TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid())
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- ============ P32 In-app review prompts ============
CREATE TABLE public.review_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('on_open','after_event','after_purchase','after_session_count','manual')),
  trigger_event TEXT,
  min_sessions INT NOT NULL DEFAULT 3 CHECK (min_sessions BETWEEN 0 AND 10000),
  cooldown_days INT NOT NULL DEFAULT 90 CHECK (cooldown_days BETWEEN 0 AND 3650),
  sentiment_threshold INT NOT NULL DEFAULT 4 CHECK (sentiment_threshold BETWEEN 1 AND 5),
  copy JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX review_prompts_project_idx ON public.review_prompts(project_id, enabled);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_prompts TO authenticated;
GRANT ALL ON public.review_prompts TO service_role;
ALTER TABLE public.review_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_prompts viewer read" ON public.review_prompts
  FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "review_prompts editor write" ON public.review_prompts
  FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "review_prompts editor update" ON public.review_prompts
  FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'))
  WITH CHECK (public.has_project_role(project_id, auth.uid(), 'editor'));
CREATE POLICY "review_prompts editor delete" ON public.review_prompts
  FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'editor'));

CREATE TRIGGER review_prompts_touch BEFORE UPDATE ON public.review_prompts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.review_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  prompt_id UUID REFERENCES public.review_prompts(id) ON DELETE SET NULL,
  subject_id TEXT NOT NULL,
  rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  sentiment NUMERIC(4,3),
  routed_to TEXT NOT NULL CHECK (routed_to IN ('store','support','dismissed')),
  platform TEXT CHECK (platform IN ('ios','android','web')),
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX review_resp_project_idx ON public.review_responses(project_id, created_at DESC);
CREATE INDEX review_resp_routed_idx ON public.review_responses(project_id, routed_to);

GRANT SELECT, INSERT ON public.review_responses TO authenticated;
GRANT ALL ON public.review_responses TO service_role;
ALTER TABLE public.review_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "review_resp viewer read" ON public.review_responses
  FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(), 'viewer'));
CREATE POLICY "review_resp viewer insert" ON public.review_responses
  FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(), 'viewer'));
