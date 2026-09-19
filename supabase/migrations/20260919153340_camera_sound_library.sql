-- Named shutter sounds: files are private; library is workspace-scoped;
-- selection belongs to one user. No changes to existing media/settings policies.
create table public.camera_sounds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) between 1 and 60),
  storage_path text not null unique,
  content_type text not null check (content_type in ('audio/mpeg','audio/wav','audio/mp4','audio/ogg','audio/webm')),
  byte_size integer not null check (byte_size between 1 and 5242880),
  duration numeric not null check (duration > 0 and duration <= 15),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  check (storage_path = workspace_id::text || '/' || user_id::text || '/' || id::text)
);
create index camera_sounds_workspace_created_idx on public.camera_sounds(workspace_id,created_at desc);
create index camera_sounds_user_idx on public.camera_sounds(user_id);
alter table public.camera_sounds enable row level security;
revoke all on public.camera_sounds from anon, authenticated;
grant select, insert on public.camera_sounds to authenticated;
grant update(name,archived) on public.camera_sounds to authenticated;
create policy camera_sounds_read on public.camera_sounds for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy camera_sounds_add on public.camera_sounds for insert to authenticated
  with check (user_id=(select auth.uid()) and public.is_workspace_member(workspace_id) and not archived);
create policy camera_sounds_edit on public.camera_sounds for update to authenticated
  using (public.is_workspace_member(workspace_id) and (user_id=(select auth.uid()) or public.is_workspace_owner(workspace_id)))
  with check (public.is_workspace_member(workspace_id) and (user_id=(select auth.uid()) or public.is_workspace_owner(workspace_id)));

create table public.camera_sound_preferences (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  sound_id uuid references public.camera_sounds(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(workspace_id,user_id)
);
create index camera_sound_preferences_user_idx on public.camera_sound_preferences(user_id);
create index camera_sound_preferences_sound_idx on public.camera_sound_preferences(sound_id);
alter table public.camera_sound_preferences enable row level security;
revoke all on public.camera_sound_preferences from anon, authenticated;
grant select,insert,update on public.camera_sound_preferences to authenticated;
create policy camera_sound_preferences_read on public.camera_sound_preferences for select to authenticated
  using (user_id=(select auth.uid()) and public.is_workspace_member(workspace_id));
create policy camera_sound_preferences_add on public.camera_sound_preferences for insert to authenticated
  with check (user_id=(select auth.uid()) and public.is_workspace_member(workspace_id) and (sound_id is null or exists(select 1 from public.camera_sounds s where s.id=sound_id and s.workspace_id=camera_sound_preferences.workspace_id and not s.archived)));
create policy camera_sound_preferences_edit on public.camera_sound_preferences for update to authenticated
  using (user_id=(select auth.uid()) and public.is_workspace_member(workspace_id))
  with check (user_id=(select auth.uid()) and public.is_workspace_member(workspace_id) and (sound_id is null or exists(select 1 from public.camera_sounds s where s.id=sound_id and s.workspace_id=camera_sound_preferences.workspace_id and not s.archived)));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('camera-sounds','camera-sounds',false,5242880,array['audio/mpeg','audio/wav','audio/mp4','audio/ogg','audio/webm']);
create policy camera_sound_files_read on storage.objects for select to authenticated
  using (bucket_id='camera-sounds' and exists(select 1 from public.camera_sounds s where s.storage_path=name and not s.archived and public.is_workspace_member(s.workspace_id)));
create policy camera_sound_files_add on storage.objects for insert to authenticated
  with check (bucket_id='camera-sounds' and (storage.foldername(name))[2]=(select auth.uid())::text and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
-- Only for cleanup when a new upload could not be registered. Registered sounds
-- are archived, not destructively deleted, so another device can recover safely.
create policy camera_sound_files_cleanup on storage.objects for delete to authenticated
  using (bucket_id='camera-sounds' and (storage.foldername(name))[2]=(select auth.uid())::text and not exists(select 1 from public.camera_sounds s where s.storage_path=name));
