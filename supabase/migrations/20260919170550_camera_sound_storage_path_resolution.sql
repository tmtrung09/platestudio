-- Qualify the outer object path: camera_sounds also has a name column.
alter policy camera_sound_files_read on storage.objects using (
  not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
  and bucket_id='camera-sounds'
  and exists(select 1 from public.camera_sounds s
    where s.storage_path=storage.objects.name and not s.archived
      and public.is_workspace_member(s.workspace_id))
);
alter policy camera_sound_files_cleanup on storage.objects using (
  not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
  and bucket_id='camera-sounds'
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and not exists(select 1 from public.camera_sounds s where s.storage_path=storage.objects.name)
);
alter policy camera_sound_files_read_pending on storage.objects using (
  bucket_id='camera-sounds'
  and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  and not exists(select 1 from public.camera_sounds s where s.storage_path=storage.objects.name)
);
