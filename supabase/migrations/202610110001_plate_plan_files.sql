-- Private print-input files. No model, stock, camera or printer-command mutations.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('plate-plan-files','plate-plan-files',false,52428800,array['application/octet-stream'])
on conflict(id) do nothing;

create or replace function public.can_access_plate_plan_files(p_workspace uuid,p_write boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
 select not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false) and
 (public.is_workspace_owner(p_workspace) or exists(select 1 from public.workspace_members
 where workspace_id=p_workspace and user_id=auth.uid() and
 (permissions ? 'plates.plan' or (not p_write and
 (permissions ? 'batches.describe' or permissions ? 'batches.manage' or permissions ? 'progress.view')))));
$$;
revoke all on function public.can_access_plate_plan_files(uuid,boolean) from public,anon;
grant execute on function public.can_access_plate_plan_files(uuid,boolean) to authenticated;

create policy plate_plan_files_read on storage.objects for select to authenticated
 using(case when bucket_id='plate-plan-files' then public.can_access_plate_plan_files(((storage.foldername(name))[1])::uuid,false) else false end);
create policy plate_plan_files_add on storage.objects for insert to authenticated
 with check(case when bucket_id='plate-plan-files' then (storage.foldername(name))[2]=auth.uid()::text
 and public.can_access_plate_plan_files(((storage.foldername(name))[1])::uuid,true) else false end);
-- Immutable paths and no DELETE policy: removing a plan reference cannot destroy historical files.
