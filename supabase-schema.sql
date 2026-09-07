-- Plate Studio: run this once in Supabase > SQL Editor > New query.
-- It creates private, per-user cloud storage for the application data.

create table if not exists public.filaments (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.models (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.projects (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.orders (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.plates (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.plate_items (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.settings (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.filaments enable row level security;
alter table public.models enable row level security;
alter table public.projects enable row level security;
alter table public.orders enable row level security;
alter table public.plates enable row level security;
alter table public.plate_items enable row level security;
alter table public.settings enable row level security;

create policy "Users manage own filaments" on public.filaments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own models" on public.models for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own projects" on public.projects for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own orders" on public.orders for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own plates" on public.plates for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own plate items" on public.plate_items for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage own settings" on public.settings for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
