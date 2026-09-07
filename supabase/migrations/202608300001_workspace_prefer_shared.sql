-- Nếu một tài khoản từng mở app trước khi được mời, ưu tiên workspace được mời
-- thay vì workspace trống cá nhân của tài khoản đó.
create or replace function public.ensure_workspace_membership()
returns table(workspace_id uuid, owner_user_id uuid, workspace_name text, permissions jsonb, role text)
language plpgsql security definer set search_path=public,auth as $$
declare current_email text; invite public.workspace_invites%rowtype; created_workspace uuid;
begin
  select lower(email) into current_email from auth.users where id=auth.uid();
  select * into invite from public.workspace_invites where lower(email)=current_email and accepted_at is null order by created_at desc limit 1;
  if found then
    insert into public.workspace_members(workspace_id,user_id,name,email,role,permissions)
    values(invite.workspace_id,auth.uid(),invite.name,current_email,invite.role,invite.permissions)
    on conflict(workspace_id,user_id) do update set name=excluded.name,email=excluded.email,role=excluded.role,permissions=excluded.permissions;
    update public.workspace_invites set accepted_at=now() where id=invite.id;
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
