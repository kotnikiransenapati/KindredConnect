create table if not exists public.foundry_monetization_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  code text not null,
  name text not null,
  price_cents integer not null default 0,
  currency text not null default 'usd',
  interval text not null default 'month' check (interval in ('month','year','one_time')),
  features jsonb not null default '[]'::jsonb,
  quotas jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, code)
);
grant select, insert, update, delete on public.foundry_monetization_plans to authenticated;
grant all on public.foundry_monetization_plans to service_role;
alter table public.foundry_monetization_plans enable row level security;
create policy "plans viewer read" on public.foundry_monetization_plans for select to authenticated using (public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "plans editor write" on public.foundry_monetization_plans for all to authenticated using (public.has_project_role(project_id, auth.uid(), 'editor')) with check (public.has_project_role(project_id, auth.uid(), 'editor'));

create table if not exists public.foundry_onboarding_journeys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  slug text not null,
  name text not null,
  audience text not null default 'new_user',
  steps jsonb not null default '[]'::jsonb,
  completion_goal text,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);
grant select, insert, update, delete on public.foundry_onboarding_journeys to authenticated;
grant all on public.foundry_onboarding_journeys to service_role;
alter table public.foundry_onboarding_journeys enable row level security;
create policy "journeys viewer read" on public.foundry_onboarding_journeys for select to authenticated using (public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "journeys editor write" on public.foundry_onboarding_journeys for all to authenticated using (public.has_project_role(project_id, auth.uid(), 'editor')) with check (public.has_project_role(project_id, auth.uid(), 'editor'));

create table if not exists public.foundry_polish_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  grade text not null,
  category_scores jsonb not null default '{}'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.foundry_polish_reports to authenticated;
grant all on public.foundry_polish_reports to service_role;
alter table public.foundry_polish_reports enable row level security;
create policy "polish viewer read" on public.foundry_polish_reports for select to authenticated using (public.has_project_role(project_id, auth.uid(), 'viewer'));
create policy "polish editor write" on public.foundry_polish_reports for all to authenticated using (public.has_project_role(project_id, auth.uid(), 'editor')) with check (public.has_project_role(project_id, auth.uid(), 'editor'));
create index if not exists idx_foundry_polish_reports_project_created on public.foundry_polish_reports (project_id, created_at desc);

create trigger trg_foundry_monetization_plans_updated before update on public.foundry_monetization_plans for each row execute function public.set_updated_at();
create trigger trg_foundry_onboarding_journeys_updated before update on public.foundry_onboarding_journeys for each row execute function public.set_updated_at();