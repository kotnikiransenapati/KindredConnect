
create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  anchor_path text,
  mentions uuid[] not null default '{}',
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_comments_project_idx on public.project_comments(project_id, created_at desc);
create index if not exists project_comments_anchor_idx on public.project_comments(project_id, anchor_path);

grant select, insert, update, delete on public.project_comments to authenticated;
grant all on public.project_comments to service_role;

alter table public.project_comments enable row level security;

create policy "Viewers can read comments"
  on public.project_comments for select to authenticated
  using (public.has_project_role(project_id, auth.uid(), 'viewer'));

create policy "Editors can post comments"
  on public.project_comments for insert to authenticated
  with check (
    public.has_project_role(project_id, auth.uid(), 'editor')
    and author_id = auth.uid()
  );

create policy "Authors can update own comments"
  on public.project_comments for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy "Authors or owners can delete comments"
  on public.project_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or public.has_project_role(project_id, auth.uid(), 'owner')
  );

drop trigger if exists project_comments_set_updated_at on public.project_comments;
create trigger project_comments_set_updated_at
  before update on public.project_comments
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.project_comments;
