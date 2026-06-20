create policy "mobile-builds read"
on storage.objects for select to authenticated
using (
  bucket_id = 'mobile-builds'
  and public.has_project_role((split_part(name, '/', 1))::uuid, auth.uid(), 'viewer')
);

create policy "mobile-builds write"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mobile-builds'
  and public.has_project_role((split_part(name, '/', 1))::uuid, auth.uid(), 'editor')
);

create policy "mobile-builds delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'mobile-builds'
  and public.has_project_role((split_part(name, '/', 1))::uuid, auth.uid(), 'owner')
);