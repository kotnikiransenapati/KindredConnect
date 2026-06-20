create type public.mobile_platform as enum ('ios', 'android');
create type public.mobile_build_type as enum ('debug', 'release');
create type public.mobile_build_status as enum ('queued', 'building', 'success', 'failed');

create table public.mobile_signing_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  platform public.mobile_platform not null,
  name text not null check (char_length(name) between 2 and 64),
  alias text,
  ciphertext bytea not null,
  iv bytea not null,
  auth_tag bytea not null,
  last_four text,
  filename text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, platform, name)
);
create index mobile_signing_profiles_project_idx on public.mobile_signing_profiles(project_id);
grant select, insert, update, delete on public.mobile_signing_profiles to authenticated;
grant all on public.mobile_signing_profiles to service_role;
alter table public.mobile_signing_profiles enable row level security;
create policy "signing viewer read" on public.mobile_signing_profiles for select to authenticated
using (public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "signing editor insert" on public.mobile_signing_profiles for insert to authenticated
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "signing editor update" on public.mobile_signing_profiles for update to authenticated
using (public.has_project_role(project_id, auth.uid(), 'editor'))
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "signing owner delete" on public.mobile_signing_profiles for delete to authenticated
using (public.has_project_role(project_id, auth.uid(), 'owner'));
create trigger msp_set_updated_at before update on public.mobile_signing_profiles
for each row execute function public.set_updated_at();

create table public.mobile_builds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  platform public.mobile_platform not null,
  build_type public.mobile_build_type not null default 'debug',
  status public.mobile_build_status not null default 'queued',
  version_name text not null default '1.0.0',
  version_code int not null default 1,
  signing_profile_id uuid references public.mobile_signing_profiles(id) on delete set null,
  artifact_path text,
  log text not null default '',
  bundle_id text,
  duration_ms int,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index mobile_builds_project_idx on public.mobile_builds(project_id, created_at desc);
grant select, insert, update, delete on public.mobile_builds to authenticated;
grant all on public.mobile_builds to service_role;
alter table public.mobile_builds enable row level security;
create policy "builds viewer read" on public.mobile_builds for select to authenticated
using (public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "builds editor insert" on public.mobile_builds for insert to authenticated
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "builds editor update" on public.mobile_builds for update to authenticated
using (public.has_project_role(project_id, auth.uid(), 'editor'))
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "builds owner delete" on public.mobile_builds for delete to authenticated
using (public.has_project_role(project_id, auth.uid(), 'owner'));
create trigger mb_set_updated_at before update on public.mobile_builds
for each row execute function public.set_updated_at();

create table public.mobile_screens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,40}$'),
  route text not null default '/',
  layout jsonb not null default '{"nodes":[]}'::jsonb,
  position int not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);
create index mobile_screens_project_idx on public.mobile_screens(project_id, position);
grant select, insert, update, delete on public.mobile_screens to authenticated;
grant all on public.mobile_screens to service_role;
alter table public.mobile_screens enable row level security;
create policy "screens viewer read" on public.mobile_screens for select to authenticated
using (public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "screens editor insert" on public.mobile_screens for insert to authenticated
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "screens editor update" on public.mobile_screens for update to authenticated
using (public.has_project_role(project_id, auth.uid(), 'editor'))
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "screens owner delete" on public.mobile_screens for delete to authenticated
using (public.has_project_role(project_id, auth.uid(), 'owner'));
create trigger ms_set_updated_at before update on public.mobile_screens
for each row execute function public.set_updated_at();