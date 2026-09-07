-- Bổ sung phân loại "Bỏ qua" cho thư viện báo cáo mẻ.
-- Việc lọc vẫn phải diễn ra trước phân trang tại server.

create or replace function public.get_batch_reports_page(
  p_workspace_id uuid,
  p_query text default null,
  p_status text default 'all',
  p_recorded_day date default null,
  p_sort text default 'recorded_desc',
  p_page integer default 1,
  p_page_size integer default 24
)
returns table(id text, data jsonb, updated_at timestamptz, total_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select br.id::text as id, br.data::jsonb as data, br.updated_at
    from public.batch_reports br
    where br.workspace_id = p_workspace_id
      and (coalesce(btrim(p_query), '') = '' or lower(br.data::text) like '%' || lower(btrim(p_query)) || '%')
      and (p_recorded_day is null or left(coalesce(br.data->>'createdAt', ''), 10) = p_recorded_day::text)
  ), filtered as (
    select * from base
    where p_status = 'all'
       or (p_status = 'done' and coalesce(data->>'status', 'pending') = 'done')
       or (p_status = 'pending' and coalesce(data->>'status', 'pending') not in ('done', 'skipped'))
       or (p_status = 'skipped' and coalesce(data->>'status', 'pending') = 'skipped')
  )
  select f.id, f.data, f.updated_at, count(*) over()::bigint as total_count
  from filtered f
  order by
    case when p_sort = 'pending_first' then case when coalesce(f.data->>'status', 'pending') = 'done' then 1 else 0 end else 0 end asc,
    case when p_sort = 'done_first' then case when coalesce(f.data->>'status', 'pending') = 'done' then 0 else 1 end else 0 end asc,
    case when p_sort = 'recorded_asc' then coalesce(f.data->>'createdAt', '') end asc,
    case when p_sort = 'recorded_desc' then coalesce(f.data->>'createdAt', '') end desc,
    f.updated_at desc, f.id desc
  offset (greatest(1, coalesce(p_page, 1)) - 1) * greatest(1, least(coalesce(p_page_size, 24), 100))
  limit greatest(1, least(coalesce(p_page_size, 24), 100));
$$;

create or replace function public.get_batch_report_timeline(
  p_workspace_id uuid,
  p_query text default null,
  p_status text default 'all'
)
returns table(recorded_day date, report_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with filtered as (
    select left(coalesce(br.data->>'createdAt', ''), 10) as day_key
    from public.batch_reports br
    where br.workspace_id = p_workspace_id
      and (coalesce(btrim(p_query), '') = '' or lower(br.data::text) like '%' || lower(btrim(p_query)) || '%')
      and (
        p_status = 'all'
        or (p_status = 'done' and coalesce(br.data->>'status', 'pending') = 'done')
        or (p_status = 'pending' and coalesce(br.data->>'status', 'pending') not in ('done', 'skipped'))
        or (p_status = 'skipped' and coalesce(br.data->>'status', 'pending') = 'skipped')
      )
  )
  select day_key::date as recorded_day, count(*)::bigint as report_count
  from filtered
  where day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  group by day_key
  order by day_key asc;
$$;

grant execute on function public.get_batch_reports_page(uuid, text, text, date, text, integer, integer) to authenticated;
grant execute on function public.get_batch_report_timeline(uuid, text, text) to authenticated;
