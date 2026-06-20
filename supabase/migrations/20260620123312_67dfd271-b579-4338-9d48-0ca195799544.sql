
-- Enum for org roles
DO $$ BEGIN
  CREATE TYPE public.org_role AS ENUM ('owner','admin','editor','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Organizations
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL DEFAULT 'hobby',
  seats integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.org_role NOT NULL DEFAULT 'editor',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX organization_members_user_idx ON public.organization_members(user_id);

CREATE TABLE public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.org_role NOT NULL DEFAULT 'editor',
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX organization_invitations_org_idx ON public.organization_invitations(org_id);
CREATE INDEX organization_invitations_email_idx ON public.organization_invitations(lower(email));

-- GRANTs (PostgREST data API)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.organization_invitations TO service_role;

-- Security-definer role helper (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_org_role(_org_id uuid, _user_id uuid, _min_role public.org_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = _org_id AND o.owner_id = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.org_id = _org_id AND m.user_id = _user_id
        AND (
          _min_role = 'viewer'
          OR (_min_role = 'editor' AND m.role IN ('editor','admin','owner'))
          OR (_min_role = 'admin' AND m.role IN ('admin','owner'))
          OR (_min_role = 'owner' AND m.role = 'owner')
        )
    );
$$;

-- RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- organizations
CREATE POLICY "orgs viewable by members" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.has_org_role(id, auth.uid(), 'viewer'));

CREATE POLICY "orgs insert by owner" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "orgs update by admin" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(id, auth.uid(), 'admin'));

CREATE POLICY "orgs delete by owner" ON public.organizations
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- organization_members
CREATE POLICY "members readable by org viewers" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'viewer'));

CREATE POLICY "members insert by admin" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "members update by admin" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "members delete by admin or self" ON public.organization_members
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin') OR user_id = auth.uid());

-- organization_invitations
CREATE POLICY "invites readable by org admins" ON public.organization_invitations
  FOR SELECT TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "invites insert by admin" ON public.organization_invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin') AND invited_by = auth.uid());

CREATE POLICY "invites update by admin" ON public.organization_invitations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'))
  WITH CHECK (public.has_org_role(org_id, auth.uid(), 'admin'));

CREATE POLICY "invites delete by admin" ON public.organization_invitations
  FOR DELETE TO authenticated
  USING (public.has_org_role(org_id, auth.uid(), 'admin'));

-- updated_at trigger
CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-add creator as owner member
CREATE OR REPLACE FUNCTION public.org_seed_owner_member()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.organization_members (org_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'owner')
  ON CONFLICT (org_id, user_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER organizations_seed_owner
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.org_seed_owner_member();
