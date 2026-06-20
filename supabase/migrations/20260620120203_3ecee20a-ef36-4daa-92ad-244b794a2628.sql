create type public.push_target as enum ('all', 'user', 'segment');
create type public.push_status as enum ('draft', 'scheduled', 'sending', 'sent', 'failed');

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  platform public.mobile_platform not null,
  token text not null,
  device_label text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (project_id, token)
);
create index push_devices_project_idx on public.push_devices(project_id, last_seen_at desc);
grant select, insert, update, delete on public.push_devices to authenticated;
grant all on public.push_devices to service_role;
alter table public.push_devices enable row level security;
create policy "push_devices viewer read" on public.push_devices for select to authenticated
using (public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "push_devices self insert" on public.push_devices for insert to authenticated
with check (user_id = auth.uid());
create policy "push_devices self update" on public.push_devices for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "push_devices self or owner delete" on public.push_devices for delete to authenticated
using (user_id = auth.uid() or public.has_project_role(project_id, auth.uid(), 'owner'));

create table public.push_campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 240),
  data jsonb not null default '{}'::jsonb,
  target public.push_target not null default 'all',
  target_value text,
  status public.push_status not null default 'draft',
  scheduled_at timestamptz,
  sent_at timestamptz,
  sent_count int not null default 0,
  fail_count int not null default 0,
  error text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_campaigns_project_idx on public.push_campaigns(project_id, created_at desc);
grant select, insert, update, delete on public.push_campaigns to authenticated;
grant all on public.push_campaigns to service_role;
alter table public.push_campaigns enable row level security;
create policy "push_campaigns viewer read" on public.push_campaigns for select to authenticated
using (public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "push_campaigns editor insert" on public.push_campaigns for insert to authenticated
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "push_campaigns editor update" on public.push_campaigns for update to authenticated
using (public.has_project_role(project_id, auth.uid(), 'editor'))
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "push_campaigns owner delete" on public.push_campaigns for delete to authenticated
using (public.has_project_role(project_id, auth.uid(), 'owner'));
create trigger pc_set_updated_at before update on public.push_campaigns
for each row execute function public.set_updated_at();

create table public.deep_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null check (path ~ '^/[A-Za-z0-9_\-/:]{0,200}$'),
  screen_slug text not null,
  params jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, path)
);
create index deep_links_project_idx on public.deep_links(project_id);
grant select, insert, update, delete on public.deep_links to authenticated;
grant all on public.deep_links to service_role;
alter table public.deep_links enable row level security;
create policy "deep_links viewer read" on public.deep_links for select to authenticated
using (public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "deep_links editor insert" on public.deep_links for insert to authenticated
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "deep_links editor update" on public.deep_links for update to authenticated
using (public.has_project_role(project_id, auth.uid(), 'editor'))
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "deep_links owner delete" on public.deep_links for delete to authenticated
using (public.has_project_role(project_id, auth.uid(), 'owner'));
create trigger dl_set_updated_at before update on public.deep_links
for each row execute function public.set_updated_at();

create table public.store_listings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  platform public.mobile_platform not null,
  title text not null default '' check (char_length(title) <= 50),
  subtitle text not null default '' check (char_length(subtitle) <= 50),
  short_description text not null default '' check (char_length(short_description) <= 80),
  full_description text not null default '' check (char_length(full_description) <= 4000),
  keywords text[] not null default '{}',
  category text,
  contact_email text,
  support_url text,
  privacy_url text,
  age_rating text not null default '4+',
  screenshots jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (project_id, platform)
);
grant select, insert, update, delete on public.store_listings to authenticated;
grant all on public.store_listings to service_role;
alter table public.store_listings enable row level security;
create policy "store_listings viewer read" on public.store_listings for select to authenticated
using (public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "store_listings editor insert" on public.store_listings for insert to authenticated
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "store_listings editor update" on public.store_listings for update to authenticated
using (public.has_project_role(project_id, auth.uid(), 'editor'))
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "store_listings owner delete" on public.store_listings for delete to authenticated
using (public.has_project_role(project_id, auth.uid(), 'owner'));
create trigger sl_set_updated_at before update on public.store_listings
for each row execute function public.set_updated_at();