
alter table public.templates
  add column if not exists author_id uuid references auth.users(id) on delete set null,
  add column if not exists is_public boolean not null default false,
  add column if not exists avg_rating numeric(3,2) not null default 0,
  add column if not exists rating_count integer not null default 0;

create index if not exists templates_public_idx on public.templates(is_public, avg_rating desc) where is_active;

-- Public can browse public+active templates
drop policy if exists "Public templates are browsable" on public.templates;
create policy "Public templates are browsable"
  on public.templates for select
  to anon, authenticated
  using (is_active and (is_public or auth.uid() = author_id));

grant select on public.templates to anon;

-- Authors can publish/update their own templates
drop policy if exists "Authors can insert templates" on public.templates;
create policy "Authors can insert templates"
  on public.templates for insert to authenticated
  with check (author_id = auth.uid());

drop policy if exists "Authors can update own templates" on public.templates;
create policy "Authors can update own templates"
  on public.templates for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "Authors can delete own templates" on public.templates;
create policy "Authors can delete own templates"
  on public.templates for delete to authenticated
  using (author_id = auth.uid());

-- Ratings table
create table if not exists public.template_ratings (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review text check (review is null or char_length(review) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, user_id)
);

create index if not exists template_ratings_template_idx on public.template_ratings(template_id, created_at desc);

grant select on public.template_ratings to anon;
grant select, insert, update, delete on public.template_ratings to authenticated;
grant all on public.template_ratings to service_role;

alter table public.template_ratings enable row level security;

create policy "Anyone can read ratings"
  on public.template_ratings for select to anon, authenticated using (true);

create policy "Users can rate templates"
  on public.template_ratings for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own ratings"
  on public.template_ratings for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Users can delete own ratings"
  on public.template_ratings for delete to authenticated
  using (user_id = auth.uid());

drop trigger if exists template_ratings_set_updated_at on public.template_ratings;
create trigger template_ratings_set_updated_at
  before update on public.template_ratings
  for each row execute function public.set_updated_at();

-- Aggregator trigger
create or replace function public.refresh_template_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _tid uuid;
begin
  _tid := coalesce(new.template_id, old.template_id);
  update public.templates t
    set avg_rating = coalesce((select round(avg(r.rating)::numeric, 2) from public.template_ratings r where r.template_id = _tid), 0),
        rating_count = (select count(*) from public.template_ratings r where r.template_id = _tid)
  where t.id = _tid;
  return null;
end;
$$;

drop trigger if exists template_ratings_aggregate on public.template_ratings;
create trigger template_ratings_aggregate
  after insert or update or delete on public.template_ratings
  for each row execute function public.refresh_template_rating();

revoke execute on function public.refresh_template_rating() from anon, public, authenticated;
