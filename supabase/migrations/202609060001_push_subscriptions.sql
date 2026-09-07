-- Đăng ký Web Push theo thiết bị. Subscription chỉ do chính người dùng sở hữu
-- quản lý; Edge Function dùng service role để gửi đúng thành viên workspace.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  label text not null default 'Thiết bị Plate Studio',
  endpoint text not null,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, device_id),
  unique(endpoint)
);
create index if not exists push_subscriptions_workspace_user_idx on public.push_subscriptions(workspace_id,user_id,updated_at desc);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_owner_manage on public.push_subscriptions;
create policy push_subscriptions_owner_manage on public.push_subscriptions
  for all to authenticated
  using (user_id=auth.uid() and public.is_workspace_member(workspace_id))
  with check (user_id=auth.uid() and public.is_workspace_member(workspace_id));
