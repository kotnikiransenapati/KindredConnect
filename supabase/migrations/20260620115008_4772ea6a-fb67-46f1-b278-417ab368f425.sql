create type public.skill_kind as enum ('mcp', 'http_tool', 'prompt');
create type public.skill_visibility as enum ('private', 'public');
create type public.gate_kind as enum ('lighthouse', 'smoke', 'a11y');
create type public.gate_status as enum ('pending', 'passed', 'failed', 'error');

create table public.agent_skills (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 64),
  description text not null default '',
  kind public.skill_kind not null,
  visibility public.skill_visibility not null default 'private',
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  install_count int not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name)
);
create index agent_skills_project_idx on public.agent_skills(project_id);
create index agent_skills_public_idx on public.agent_skills(visibility) where visibility = 'public';

grant select, insert, update, delete on public.agent_skills to authenticated;
grant select on public.agent_skills to anon;
grant all on public.agent_skills to service_role;

alter table public.agent_skills enable row level security;

create policy "skills viewer read" on public.agent_skills for select to authenticated
using (visibility = 'public' or public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "skills public anon read" on public.agent_skills for select to anon
using (visibility = 'public');
create policy "skills editor insert" on public.agent_skills for insert to authenticated
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "skills editor update" on public.agent_skills for update to authenticated
using (public.has_project_role(project_id, auth.uid(), 'editor'))
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "skills owner delete" on public.agent_skills for delete to authenticated
using (public.has_project_role(project_id, auth.uid(), 'owner'));

create trigger agent_skills_set_updated_at
before update on public.agent_skills
for each row execute function public.set_updated_at();

create table public.ci_gates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  deployment_id uuid references public.deployments(id) on delete cascade,
  kind public.gate_kind not null,
  status public.gate_status not null default 'pending',
  score numeric(5,2),
  threshold numeric(5,2) not null default 70,
  target_url text,
  report jsonb not null default '{}'::jsonb,
  error text,
  duration_ms int,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index ci_gates_project_idx on public.ci_gates(project_id, created_at desc);
create index ci_gates_deployment_idx on public.ci_gates(deployment_id);

grant select, insert, update, delete on public.ci_gates to authenticated;
grant all on public.ci_gates to service_role;

alter table public.ci_gates enable row level security;

create policy "ci_gates viewer read" on public.ci_gates for select to authenticated
using (public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "ci_gates editor insert" on public.ci_gates for insert to authenticated
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "ci_gates editor update" on public.ci_gates for update to authenticated
using (public.has_project_role(project_id, auth.uid(), 'editor'))
with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create policy "ci_gates owner delete" on public.ci_gates for delete to authenticated
using (public.has_project_role(project_id, auth.uid(), 'owner'));