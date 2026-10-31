-- Preserve unrelated legacy part entries even when they do not have an ID.
-- Opt-in protection for explicitly restored part IDs. Legacy snapshots must not
-- undo a restoration they have never read. Current snapshots can still delete.
create or replace function public.guard_restored_model_parts()
returns trigger language plpgsql set search_path=public as $$
declare g jsonb:=old.data->'partRestoreGuard'; incoming jsonb:=new.data->'partRestoreGuard';
 parts jsonb; kept jsonb; states jsonb:='{}'; pid text; p jsonb; present boolean; was_present boolean; changed boolean:=false;
begin
 -- Direct administrative repairs can install a fresh revision atomically with
 -- the restored part. Browser writes run as authenticated under existing RLS.
 if current_user in ('postgres','supabase_admin') and coalesce(current_setting('plate_studio.part_restore',true),'')='yes' then return new;end if;
 if jsonb_typeof(g) is distinct from 'object' or g->>'version' is distinct from '1'
  or coalesce(g->>'revision','')='' or jsonb_typeof(g->'partIds') is distinct from 'array' then return new;end if;
 if jsonb_typeof(new.data->'parts') is distinct from 'array' then
  raise exception 'Model đã có part được khôi phục; tải dữ liệu mới để đối chiếu' using errcode='40001';end if;
 parts:=new.data->'parts';
 if incoming=g then
  -- This client read the current restoration revision. An explicit removal or
  -- re-addition is valid; advance the revision and retain removal tombstones.
  for pid in select jsonb_array_elements_text(g->'partIds') loop
   present:=exists(select 1 from jsonb_array_elements(parts) x where x->>'id'=pid);
   was_present:=exists(select 1 from jsonb_array_elements(coalesce(old.data->'parts','[]')) x where x->>'id'=pid);
   states:=states||jsonb_build_object(pid,case when present then 'present' else 'removed' end);
   if present<>was_present then changed:=true;end if;
  end loop;
  if changed then
   new.data:=jsonb_set(new.data,'{partRestoreGuard}',g||jsonb_build_object('revision',gen_random_uuid()::text,'states',states));
   new.updated_at:=clock_timestamp();
  end if;
  return new;
 end if;
 -- Merge only the protected IDs from the server. Keep all unrelated incoming
 -- fields and other parts; a stale snapshot cannot revive a protected deletion.
 select coalesce(jsonb_agg(x order by ord),'[]') into kept
 from jsonb_array_elements(parts) with ordinality a(x,ord)
 where not coalesce(g->'partIds' ? (x->>'id'),false);
 for pid in select jsonb_array_elements_text(g->'partIds') loop
  select x into p from jsonb_array_elements(coalesce(old.data->'parts','[]')) x where x->>'id'=pid limit 1;
  if p is not null then
   if exists(select 1 from jsonb_array_elements(kept) x where lower(trim(x->>'name'))=lower(trim(p->>'name'))) then
    raise exception 'Có part khác cùng tên với part được khôi phục; cần đối chiếu' using errcode='40001';end if;
   kept:=kept||jsonb_build_array(p);
  end if;
 end loop;
 new.data:=jsonb_set(new.data,'{parts}',kept)||jsonb_build_object('partRestoreGuard',g);
 new.updated_at:=case when new.data=old.data then old.updated_at else clock_timestamp() end;
 return new;
end $$;
