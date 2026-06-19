
create table if not exists public.deployments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  version_num integer not null,
  label text,
  snapshot jsonb not null default '[]'::jsonb,
  file_count integer not null default 0,
  status text not null default 'ready' check (status in ('ready','failed','building')),
  is_current boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists deployments_slug_version_uq on public.deployments(slug, version_num);
create index if not exists deployments_project_idx on public.deployments(project_id, created_at desc);
create index if not exists deployments_slug_current_idx on public.deployments(slug) where is_current;

grant select on public.deployments to anon;
grant select, insert, update, delete on public.deployments to authenticated;
grant all on public.deployments to service_role;

alter table public.deployments enable row level security;

create policy "Deployments are publicly readable"
  on public.deployments for select
  to anon, authenticated
  using (true);

create policy "Editors can create deployments"
  on public.deployments for insert
  to authenticated
  with check (public.has_project_role(project_id, auth.uid(), 'editor'));

create policy "Editors can update deployments"
  on public.deployments for update
  to authenticated
  using (public.has_project_role(project_id, auth.uid(), 'editor'))
  with check (public.has_project_role(project_id, auth.uid(), 'editor'));

create policy "Owners can delete deployments"
  on public.deployments for delete
  to authenticated
  using (public.has_project_role(project_id, auth.uid(), 'owner'));

create or replace function public.next_deployment_version(_slug text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(version_num), 0) + 1 from public.deployments where slug = _slug;
$$;
