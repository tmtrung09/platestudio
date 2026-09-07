-- Plate Studio cloud upgrade: run once in Supabase > SQL Editor.
-- Adds batch-report sync, image storage, and Realtime publication.

create table if not exists public.batch_reports (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- SHA-256 của ảnh gốc: tránh cùng một ảnh bị tải lên nhiều lần, kể cả từ hai thiết bị.
create unique index if not exists batch_reports_user_image_hash_unique
  on public.batch_reports (user_id, (data->>'imageHash'))
  where coalesce(data->>'imageHash', '') <> '';

create index if not exists batch_reports_user_image_hash_lookup
  on public.batch_reports (user_id, (data->>'imageHash'))
  where coalesce(data->>'imageHash', '') <> '';
alter table public.batch_reports enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='batch_reports' and policyname='Users manage own batch reports') then
    create policy "Users manage own batch reports" on public.batch_reports for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('plate-media', 'plate-media', true)
on conflict (id) do update set public = true;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Plate media users upload own files') then
    create policy "Plate media users upload own files" on storage.objects for insert to authenticated
      with check (bucket_id='plate-media' and (storage.foldername(name))[1]=auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Plate media users update own files') then
    create policy "Plate media users update own files" on storage.objects for update to authenticated
      using (bucket_id='plate-media' and (storage.foldername(name))[1]=auth.uid()::text);
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Plate media users delete own files') then
    create policy "Plate media users delete own files" on storage.objects for delete to authenticated
      using (bucket_id='plate-media' and (storage.foldername(name))[1]=auth.uid()::text);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='models') then alter publication supabase_realtime add table public.models; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='filaments') then alter publication supabase_realtime add table public.filaments; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='projects') then alter publication supabase_realtime add table public.projects; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then alter publication supabase_realtime add table public.orders; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='plates') then alter publication supabase_realtime add table public.plates; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='plate_items') then alter publication supabase_realtime add table public.plate_items; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='settings') then alter publication supabase_realtime add table public.settings; end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='batch_reports') then alter publication supabase_realtime add table public.batch_reports; end if;
end $$;
