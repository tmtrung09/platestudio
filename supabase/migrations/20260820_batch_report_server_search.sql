-- Tìm kiếm lịch sử báo cáo mẻ in trên server.
-- Chạy bằng Supabase CLI (`supabase db push`) hoặc dán toàn bộ file này vào SQL Editor.

-- Supabase đặt các extension PostgreSQL trong schema `extensions`.
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- unaccent mặc định là STABLE; wrapper IMMUTABLE giúp PostgreSQL dùng được trong GIN index.
create or replace function public.plate_search_normalize(input text)
returns text
language sql
immutable
parallel safe
as $$ select lower(extensions.unaccent(coalesce(input, ''))) $$;

create index if not exists batch_reports_user_updated_cursor_idx
  on public.batch_reports (user_id, updated_at desc, id desc);

create index if not exists batch_reports_search_document_idx
  on public.batch_reports
  using gin (to_tsvector('simple', public.plate_search_normalize(data::text)));

create index if not exists batch_reports_search_fuzzy_idx
  on public.batch_reports
  using gin (public.plate_search_normalize(data::text) extensions.gin_trgm_ops);

create index if not exists batch_reports_filament_lookup_idx
  on public.batch_reports (user_id, (data->>'filamentId'), updated_at desc, id desc);

-- Cursor = (updated_at, id): ổn định khi nhiều báo cáo có cùng thời gian cập nhật.
-- security invoker + auth.uid() giữ nguyên quyền RLS của từng chủ tài khoản.
create or replace function public.search_batch_reports(
  p_query text default null,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id text default null,
  p_limit integer default 24,
  p_filament_ids text[] default '{}'
)
returns table(id text, data jsonb, updated_at timestamptz, total_count bigint)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with filtered as (
    select br.id::text as id, br.data::jsonb as data, br.updated_at
    from public.batch_reports br
    where br.user_id = auth.uid()
      and (
        coalesce(btrim(p_query), '') = ''
        or (cardinality(p_filament_ids) > 0 and br.data->>'filamentId' = any(p_filament_ids))
        or to_tsvector('simple', public.plate_search_normalize(br.data::text))
           @@ websearch_to_tsquery('simple', public.plate_search_normalize(p_query))
        or public.plate_search_normalize(br.data::text) % public.plate_search_normalize(p_query)
      )
  ), total as (
    select count(*)::bigint as value from filtered
  )
  select f.id, f.data, f.updated_at, total.value as total_count
  from filtered f cross join total
  where p_cursor_updated_at is null
     or f.updated_at < p_cursor_updated_at
     or (f.updated_at = p_cursor_updated_at and f.id < coalesce(p_cursor_id, ''))
  order by f.updated_at desc, f.id desc
  limit greatest(1, least(coalesce(p_limit, 24), 100));
$$;

grant execute on function public.search_batch_reports(text, timestamptz, text, integer, text[]) to authenticated;
