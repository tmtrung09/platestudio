-- Resumable camera uploads use Storage upsert so the same durable report ID can
-- safely retry after reload. Supabase requires SELECT in addition to INSERT and
-- UPDATE for upsert/RETURNING, while the original plate-media policies omitted it.
drop policy if exists "Plate media users read own files" on storage.objects;
create policy "Plate media users read own files"
on storage.objects for select to authenticated
using (
  bucket_id = 'plate-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
