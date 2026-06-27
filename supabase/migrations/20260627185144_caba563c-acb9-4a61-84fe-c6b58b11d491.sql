-- Phase 23 — P50 AV rooms / P51 AI changelog / P52 Evidence vault
CREATE TABLE public.av_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  topic text,
  mode text NOT NULL DEFAULT 'mesh' CHECK (mode IN ('mesh','sfu')),
  max_participants integer NOT NULL DEFAULT 8 CHECK (max_participants BETWEEN 2 AND 50),
  recording boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','ended')),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.av_rooms TO authenticated;
GRANT ALL ON public.av_rooms TO service_role;
ALTER TABLE public.av_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY avr_v ON public.av_rooms FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(),'viewer'));
CREATE POLICY avr_i ON public.av_rooms FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(),'editor'));
CREATE POLICY avr_u ON public.av_rooms FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(),'editor'));
CREATE POLICY avr_d ON public.av_rooms FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(),'owner'));

CREATE TABLE public.av_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.av_rooms(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'guest' CHECK (role IN ('host','cohost','speaker','guest')),
  audio boolean NOT NULL DEFAULT true,
  video boolean NOT NULL DEFAULT true,
  screen boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  UNIQUE(room_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.av_participants TO authenticated;
GRANT ALL ON public.av_participants TO service_role;
ALTER TABLE public.av_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY avp_v ON public.av_participants FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(),'viewer'));
CREATE POLICY avp_i ON public.av_participants FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(),'viewer') AND user_id = auth.uid());
CREATE POLICY avp_u ON public.av_participants FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.has_project_role(project_id, auth.uid(),'editor'));
CREATE POLICY avp_d ON public.av_participants FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.has_project_role(project_id, auth.uid(),'editor'));

CREATE TABLE public.av_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.av_rooms(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  from_user uuid NOT NULL DEFAULT auth.uid(),
  to_user uuid,
  kind text NOT NULL CHECK (kind IN ('offer','answer','ice','leave','mute','kick','chat')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX av_signals_room_recent ON public.av_signals(room_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.av_signals TO authenticated;
GRANT ALL ON public.av_signals TO service_role;
ALTER TABLE public.av_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY avs_v ON public.av_signals FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(),'viewer'));
CREATE POLICY avs_i ON public.av_signals FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(),'viewer') AND from_user = auth.uid());

CREATE TABLE public.changelog_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('commit','pr','issue','deploy','manual')),
  ref text NOT NULL,
  title text NOT NULL,
  body text,
  author text,
  labels text[] NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.changelog_sources TO authenticated;
GRANT ALL ON public.changelog_sources TO service_role;
ALTER TABLE public.changelog_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY cs_v ON public.changelog_sources FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(),'viewer'));
CREATE POLICY cs_i ON public.changelog_sources FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(),'editor'));
CREATE POLICY cs_u ON public.changelog_sources FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(),'editor'));
CREATE POLICY cs_d ON public.changelog_sources FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(),'owner'));

CREATE TABLE public.changelog_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  category text NOT NULL CHECK (category IN ('feature','fix','perf','security','breaking','docs','chore')),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','developer','enduser','admin')),
  impact text NOT NULL DEFAULT 'minor' CHECK (impact IN ('patch','minor','major','breaking')),
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published','archived')),
  published_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.changelog_entries TO authenticated;
GRANT ALL ON public.changelog_entries TO service_role;
ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_v ON public.changelog_entries FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(),'viewer'));
CREATE POLICY ce_i ON public.changelog_entries FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(),'editor'));
CREATE POLICY ce_u ON public.changelog_entries FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(),'editor'));
CREATE POLICY ce_d ON public.changelog_entries FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(),'owner'));
CREATE TRIGGER ce_upd BEFORE UPDATE ON public.changelog_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.evidence_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  framework text NOT NULL CHECK (framework IN ('soc2','iso27001','hipaa','gdpr','pci','custom')),
  control_id text NOT NULL,
  title text NOT NULL,
  description text,
  owner text,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started','in_progress','implemented','verified','not_applicable')),
  last_reviewed timestamptz,
  next_review timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, framework, control_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_controls TO authenticated;
GRANT ALL ON public.evidence_controls TO service_role;
ALTER TABLE public.evidence_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY ec_v ON public.evidence_controls FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(),'viewer'));
CREATE POLICY ec_i ON public.evidence_controls FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(),'editor'));
CREATE POLICY ec_u ON public.evidence_controls FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(),'editor'));
CREATE POLICY ec_d ON public.evidence_controls FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(),'owner'));
CREATE TRIGGER ec_upd BEFORE UPDATE ON public.evidence_controls FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.evidence_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id uuid NOT NULL REFERENCES public.evidence_controls(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('document','screenshot','log','config','attestation','policy','other')),
  title text NOT NULL,
  uri text,
  sha256 text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  collected_at timestamptz NOT NULL DEFAULT now(),
  collected_by uuid NOT NULL DEFAULT auth.uid(),
  retention_until timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evidence_artifacts TO authenticated;
GRANT ALL ON public.evidence_artifacts TO service_role;
ALTER TABLE public.evidence_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY ea_v ON public.evidence_artifacts FOR SELECT TO authenticated USING (public.has_project_role(project_id, auth.uid(),'viewer'));
CREATE POLICY ea_i ON public.evidence_artifacts FOR INSERT TO authenticated WITH CHECK (public.has_project_role(project_id, auth.uid(),'editor'));
CREATE POLICY ea_u ON public.evidence_artifacts FOR UPDATE TO authenticated USING (public.has_project_role(project_id, auth.uid(),'editor'));
CREATE POLICY ea_d ON public.evidence_artifacts FOR DELETE TO authenticated USING (public.has_project_role(project_id, auth.uid(),'owner'));