-- Output parameter workspace_id của hàm PL/pgSQL trùng tên cột. Dùng tên
-- constraint rõ ràng để PostgreSQL không còn báo "column reference is ambiguous".
create or replace function public.ensure_workspace_membership()
returns table(workspace_id uuid, owner_user_id uuid, workspace_name text, permissions jsonb, role text)
language plpgsql security definer set search_path=public,auth as $$
declare current_email text; invite public.workspace_invites%rowtype; created_workspace uuid;
begin
  select lower(u.email) into current_email from auth.users u where u.id=auth.uid();
  select i.* into invite from public.workspace_invites i where lower(i.email)=current_email and i.accepted_at is null order by i.created_at desc limit 1;
  if found then
    insert into public.workspace_members(workspace_id,user_id,name,email,role,permissions)
    values(invite.workspace_id,auth.uid(),invite.name,current_email,invite.role,invite.permissions)
    on conflict on constraint workspace_members_workspace_id_user_id_key do update set name=excluded.name,email=excluded.email,role=excluded.role,permissions=excluded.permissions;
    update public.workspace_invites i set accepted_at=now() where i.id=invite.id;
    select w.id,w.owner_user_id,w.name,invite.permissions,invite.role into workspace_id,owner_user_id,workspace_name,permissions,role from public.workspaces w where w.id=invite.workspace_id;
    return next; return;
  end if;
  select m.workspace_id,w.owner_user_id,w.name,m.permissions,m.role into workspace_id,owner_user_id,workspace_name,permissions,role
  from public.workspace_members m join public.workspaces w on w.id=m.workspace_id
  where m.user_id=auth.uid() order by (w.owner_user_id=auth.uid()) asc,m.joined_at limit 1;
  if found then return next; return; end if;
  insert into public.workspaces(owner_user_id,name) values(auth.uid(),coalesce(split_part(current_email,'@',1),'Xưởng của tôi')) returning id into created_workspace;
  insert into public.workspace_members(workspace_id,user_id,name,email,role,permissions)
  values(created_workspace,auth.uid(),coalesce(split_part(current_email,'@',1),'Chủ xưởng'),current_email,'owner',
    '["models.manage","plates.plan","orders.manage","batches.report","assembly.qc","delivery.create","delivery.receive","kiot.import","access.manage"]'::jsonb);
  select w.id,w.owner_user_id,w.name,m.permissions,m.role into workspace_id,owner_user_id,workspace_name,permissions,role
  from public.workspaces w join public.workspace_members m on m.workspace_id=w.id where w.id=created_workspace;
  return next;
end $$;

create or replace function public.invite_workspace_member(p_workspace_id uuid,p_name text,p_email text,p_role text,p_permissions jsonb)
returns void language plpgsql security definer set search_path=public,auth as $$
declare target_user uuid;
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'Chỉ chủ xưởng được phân quyền'; end if;
  if coalesce(trim(p_email),'')='' then raise exception 'Thiếu email thành viên'; end if;
  insert into public.workspace_invites(workspace_id,email,name,role,permissions,invited_by)
  values(p_workspace_id,lower(trim(p_email)),nullif(trim(p_name),''),coalesce(nullif(p_role,''),'custom'),coalesce(p_permissions,'[]'::jsonb),auth.uid())
  on conflict on constraint workspace_invites_workspace_id_email_key do update set name=excluded.name,role=excluded.role,permissions=excluded.permissions,invited_by=excluded.invited_by,accepted_at=null;
  select u.id into target_user from auth.users u where lower(u.email)=lower(trim(p_email)) limit 1;
  if target_user is not null then
    insert into public.workspace_members(workspace_id,user_id,name,email,role,permissions)
    values(p_workspace_id,target_user,nullif(trim(p_name),''),lower(trim(p_email)),coalesce(nullif(p_role,''),'custom'),coalesce(p_permissions,'[]'::jsonb))
    on conflict on constraint workspace_members_workspace_id_user_id_key do update set name=excluded.name,email=excluded.email,role=excluded.role,permissions=excluded.permissions;
  end if;
end $$;
