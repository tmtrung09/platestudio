-- Read-only catalog regression checks, safe against the linked production DB.
do $$
declare policy record; matched integer := 0;
begin
  for policy in select policyname,qual from pg_policies where schemaname='storage'
    and policyname in ('camera_sound_files_read','camera_sound_files_cleanup','camera_sound_files_read_pending')
  loop
    matched := matched + 1;
    if position('s.storage_path = objects.name' in policy.qual) = 0 then
      raise exception 'Audio path is not correlated to the storage object: %', policy.policyname;
    end if;
  end loop;
  if matched <> 3 then raise exception 'Missing audio storage policies'; end if;
  if not exists(select 1 from storage.buckets where id='camera-sounds'
    and not public and file_size_limit=5242880) then
    raise exception 'Audio bucket must remain private and bounded';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('camera_sounds','camera_sound_preferences')
    and not c.relrowsecurity) then raise exception 'Missing audio RLS'; end if;
  if has_table_privilege('anon','public.camera_sounds','SELECT')
    or has_column_privilege('authenticated','public.camera_sounds','storage_path','UPDATE') then
    raise exception 'Audio grants are too broad';
  end if;
end $$;
