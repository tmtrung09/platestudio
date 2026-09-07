-- Danh bạ thiết bị: deviceId là mã ngẫu nhiên lưu trên thiết bị, không fingerprint.
create table if not exists public.device_registry (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  label text not null default 'Thiết bị',
  operator_name text,
  device_kind text,
  status text not null default 'active' check (status in ('active','blocked')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source text,
  unique(user_id, device_id)
);

alter table public.device_registry enable row level security;
drop policy if exists "device owner manages registry" on public.device_registry;
create policy "device owner manages registry" on public.device_registry
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists device_registry_owner_seen_idx on public.device_registry(user_id,last_seen_at desc);
