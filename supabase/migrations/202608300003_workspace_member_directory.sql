-- Danh bạ tài khoản đã từng đăng nhập: chỉ chủ xưởng được xem để cấp quyền.
create table if not exists public.app_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  last_seen_at timestamptz not null default now()
);
alter table public.app_profiles enable row level security;

create or replace function public.register_app_profile()
returns void language plpgsql security definer set search_path=public,auth as $$
begin
  insert into public.app_profiles(user_id,email,display_name,last_seen_at)
  select u.id,lower(u.email),coalesce(u.raw_user_meta_data->>'full_name',split_part(u.email,'@',1)),now()
  from auth.users u where u.id=auth.uid()
  on conflict(user_id) do update set email=excluded.email,display_name=excluded.display_name,last_seen_at=excluded.last_seen_at;
end $$;

create or replace function public.list_workspace_access(p_workspace_id uuid)
returns table(user_id uuid,email text,name text,role text,permissions jsonb,status text,is_owner boolean)
language plpgsql security definer set search_path=public,auth as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'Chỉ chủ xưởng được xem danh sách tài khoản'; end if;
  return query
  select p.user_id,p.email,coalesce(m.name,p.display_name),coalesce(m.role,i.role,'custom'),coalesce(m.permissions,i.permissions,'[]'::jsonb),
    case when m.user_id is not null then 'member' when i.id is not null then 'invited' else 'available' end,
    p.user_id=(select w.owner_user_id from public.workspaces w where w.id=p_workspace_id)
  from public.app_profiles p
  left join public.workspace_members m on m.workspace_id=p_workspace_id and m.user_id=p.user_id
  left join public.workspace_invites i on i.workspace_id=p_workspace_id and lower(i.email)=lower(p.email)
  order by (p.user_id=(select w.owner_user_id from public.workspaces w where w.id=p_workspace_id)) desc,
    case when m.user_id is not null then 0 when i.id is not null then 1 else 2 end,p.last_seen_at desc;
end $$;
