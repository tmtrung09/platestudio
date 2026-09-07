-- Workspace dùng chung: dữ liệu xưởng không còn tách riêng theo tài khoản đăng nhập.
-- Migration giữ nguyên user_id cũ như "chủ dữ liệu" để mọi bản ghi legacy được
-- chuyển an toàn sang workspace của chủ xưởng, không xoá hay ghi đè dữ liệu cũ.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Xưởng của tôi',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists workspaces_one_personal_owner_idx on public.workspaces(owner_user_id);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  email text,
  role text not null default 'custom',
  permissions jsonb not null default '[]'::jsonb,
  joined_at timestamptz not null default now(),
  unique(workspace_id,user_id)
);
create unique index if not exists workspace_members_user_workspace_idx on public.workspace_members(user_id,workspace_id);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  name text,
  role text not null default 'custom',
  permissions jsonb not null default '[]'::jsonb,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique(workspace_id,email)
);
create index if not exists workspace_invites_email_idx on public.workspace_invites(lower(email));

-- Backfill: mỗi chủ dữ liệu cũ có đúng một workspace; toàn bộ bản ghi cũ được
-- gắn workspace đó. Không drop user_id vì các Edge Function cũ vẫn dùng nó.
insert into public.workspaces(owner_user_id,name)
select distinct legacy.user_id, 'Xưởng của tôi'
from (
  select user_id from public.models union select user_id from public.filaments
  union select user_id from public.projects union select user_id from public.orders
  union select user_id from public.plates union select user_id from public.plate_items
  union select user_id from public.settings union select user_id from public.batch_reports
) legacy
where legacy.user_id is not null
on conflict (owner_user_id) do nothing;

insert into public.workspace_members(workspace_id,user_id,name,email,role,permissions)
select w.id,w.owner_user_id,coalesce(u.raw_user_meta_data->>'full_name',split_part(u.email,'@',1)),u.email,'owner',
  '["models.manage","plates.plan","orders.manage","batches.report","assembly.qc","delivery.create","delivery.receive","kiot.import","access.manage"]'::jsonb
from public.workspaces w join auth.users u on u.id=w.owner_user_id
on conflict (workspace_id,user_id) do nothing;

do $$
declare t text;
begin
  foreach t in array array['models','filaments','projects','orders','plates','plate_items','settings','batch_reports'] loop
    execute format('alter table public.%I add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade',t);
    execute format('create index if not exists %I on public.%I(workspace_id,updated_at desc)',t||'_workspace_updated_idx',t);
    execute format('update public.%I d set workspace_id=w.id from public.workspaces w where d.workspace_id is null and d.user_id=w.owner_user_id',t);
  end loop;
end $$;

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=auth.uid());
$$;

create or replace function public.is_workspace_owner(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspaces w where w.id=p_workspace_id and w.owner_user_id=auth.uid());
$$;

create or replace function public.ensure_workspace_membership()
returns table(workspace_id uuid, owner_user_id uuid, workspace_name text, permissions jsonb, role text)
language plpgsql security definer set search_path=public,auth as $$
declare current_email text; invite public.workspace_invites%rowtype; created_workspace uuid;
begin
  select lower(email) into current_email from auth.users where id=auth.uid();
  select m.workspace_id,w.owner_user_id,w.name,m.permissions,m.role into workspace_id,owner_user_id,workspace_name,permissions,role
  from public.workspace_members m join public.workspaces w on w.id=m.workspace_id
  where m.user_id=auth.uid() order by m.joined_at limit 1;
  if found then return next; return; end if;
  select * into invite from public.workspace_invites where lower(email)=current_email and accepted_at is null order by created_at limit 1;
  if found then
    insert into public.workspace_members(workspace_id,user_id,name,email,role,permissions)
    values(invite.workspace_id,auth.uid(),invite.name,current_email,invite.role,invite.permissions)
    on conflict(workspace_id,user_id) do update set name=excluded.name,email=excluded.email,role=excluded.role,permissions=excluded.permissions;
    update public.workspace_invites set accepted_at=now() where id=invite.id;
    select w.id,w.owner_user_id,w.name,invite.permissions,invite.role into workspace_id,owner_user_id,workspace_name,permissions,role from public.workspaces w where w.id=invite.workspace_id;
    return next; return;
  end if;
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
  on conflict(workspace_id,email) do update set name=excluded.name,role=excluded.role,permissions=excluded.permissions,invited_by=excluded.invited_by,accepted_at=null;
  select id into target_user from auth.users where lower(email)=lower(trim(p_email)) limit 1;
  if target_user is not null then
    insert into public.workspace_members(workspace_id,user_id,name,email,role,permissions)
    values(p_workspace_id,target_user,nullif(trim(p_name),''),lower(trim(p_email)),coalesce(nullif(p_role,''),'custom'),coalesce(p_permissions,'[]'::jsonb))
    on conflict(workspace_id,user_id) do update set name=excluded.name,email=excluded.email,role=excluded.role,permissions=excluded.permissions;
  end if;
end $$;

create or replace function public.remove_workspace_member(p_workspace_id uuid,p_email text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then raise exception 'Chỉ chủ xưởng được phân quyền'; end if;
  delete from public.workspace_invites where workspace_id=p_workspace_id and lower(email)=lower(trim(p_email));
  delete from public.workspace_members where workspace_id=p_workspace_id and lower(email)=lower(trim(p_email)) and user_id<>(select owner_user_id from public.workspaces where id=p_workspace_id);
end $$;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;
drop policy if exists workspace_member_reads_workspace on public.workspaces;
create policy workspace_member_reads_workspace on public.workspaces for select to authenticated using(public.is_workspace_member(id));
drop policy if exists workspace_members_visible_to_members on public.workspace_members;
create policy workspace_members_visible_to_members on public.workspace_members for select to authenticated using(public.is_workspace_member(workspace_id));
drop policy if exists workspace_invites_visible_to_owner on public.workspace_invites;
create policy workspace_invites_visible_to_owner on public.workspace_invites for select to authenticated using(public.is_workspace_owner(workspace_id));

do $$
declare t text;
begin
  foreach t in array array['models','filaments','projects','orders','plates','plate_items','settings','batch_reports'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists workspace_members_manage_data on public.%I',t);
    execute format('create policy workspace_members_manage_data on public.%I for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id))',t);
  end loop;
end $$;
