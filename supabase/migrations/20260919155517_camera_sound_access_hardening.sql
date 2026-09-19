alter policy camera_sounds_read on public.camera_sounds using (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and public.is_workspace_member(workspace_id));

alter policy camera_sounds_add on public.camera_sounds with check (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and user_id=(select auth.uid()) and public.is_workspace_member(workspace_id) and not archived);

alter policy camera_sounds_edit on public.camera_sounds using (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and public.is_workspace_member(workspace_id) and (user_id=(select auth.uid()) or public.is_workspace_owner(workspace_id)))
  with check (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and public.is_workspace_member(workspace_id) and (user_id=(select auth.uid()) or public.is_workspace_owner(workspace_id)));

alter policy camera_sound_preferences_read on public.camera_sound_preferences using (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and user_id=(select auth.uid()) and public.is_workspace_member(workspace_id));

alter policy camera_sound_preferences_add on public.camera_sound_preferences with check (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and user_id=(select auth.uid()) and public.is_workspace_member(workspace_id) and (sound_id is null or exists(select 1 from public.camera_sounds s where s.id=sound_id and s.workspace_id=camera_sound_preferences.workspace_id and not s.archived)));

alter policy camera_sound_preferences_edit on public.camera_sound_preferences using (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and user_id=(select auth.uid()) and public.is_workspace_member(workspace_id))
  with check (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and user_id=(select auth.uid()) and public.is_workspace_member(workspace_id) and (sound_id is null or exists(select 1 from public.camera_sounds s where s.id=sound_id and s.workspace_id=camera_sound_preferences.workspace_id and not s.archived)));

alter policy camera_sound_files_read on storage.objects using (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and bucket_id='camera-sounds' and exists(select 1 from public.camera_sounds s where s.storage_path=name and not s.archived and public.is_workspace_member(s.workspace_id)));

alter policy camera_sound_files_add on storage.objects with check (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and bucket_id='camera-sounds' and (storage.foldername(name))[2]=(select auth.uid())::text and public.is_workspace_member(((storage.foldername(name))[1])::uuid));

alter policy camera_sound_files_cleanup on storage.objects using (not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and bucket_id='camera-sounds' and (storage.foldername(name))[2]=(select auth.uid())::text and not exists(select 1 from public.camera_sounds s where s.storage_path=name));

create policy camera_sound_files_read_pending on storage.objects for select to authenticated
  using (bucket_id='camera-sounds' and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and (storage.foldername(name))[2]=(select auth.uid())::text and public.is_workspace_member(((storage.foldername(name))[1])::uuid) and not exists(select 1 from public.camera_sounds s where s.storage_path=name));
