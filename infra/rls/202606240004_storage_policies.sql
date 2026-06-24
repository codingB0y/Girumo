-- HUBFLOW - Fase 4 - Supabase Storage policies
-- Apply after RLS helper functions.
-- Bucket: uploads
-- Object name convention: <tenant_id>/<kind>/<file>
-- Metadata table path convention: uploads/<tenant_id>/<kind>/<file>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  false,
  52428800,
  null
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_uploads_select_member on storage.objects
for select using (
  bucket_id = 'uploads'
  and app.has_membership((storage.foldername(name))[1]::uuid)
);

create policy storage_uploads_insert_member on storage.objects
for insert with check (
  bucket_id = 'uploads'
  and app.has_membership((storage.foldername(name))[1]::uuid)
);

create policy storage_uploads_update_member on storage.objects
for update using (
  bucket_id = 'uploads'
  and app.has_membership((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id = 'uploads'
  and app.has_membership((storage.foldername(name))[1]::uuid)
);

create policy storage_uploads_delete_owner_admin on storage.objects
for delete using (
  bucket_id = 'uploads'
  and app.has_role((storage.foldername(name))[1]::uuid, array['owner','admin']::public.member_role[])
);
