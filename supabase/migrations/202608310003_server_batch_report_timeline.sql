-- Timeline phải đại diện toàn bộ tập báo cáo đang lọc, không chỉ các bản ghi
-- của trang hiện tại ở browser. Hàm này chỉ trả về ngày + số lượng nhỏ gọn.

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
        or (p_status = 'pending' and coalesce(br.data->>'status', 'pending') <> 'done')
      )
  )
  select day_key::date as recorded_day, count(*)::bigint as report_count
  from filtered
  where day_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  group by day_key
  order by day_key asc;
$$;

grant execute on function public.get_batch_report_timeline(uuid, text, text) to authenticated;
