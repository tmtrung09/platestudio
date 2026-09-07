-- Trang Gia công chỉ cần các mẻ ngoài đơn đã hoàn tất. Không được suy ra tập
-- này từ một trang 24 ảnh đang mở ở Thư viện báo cáo, vì mẻ cũ sẽ biến mất.

create index if not exists batch_reports_workspace_done_manual_idx
  on public.batch_reports (workspace_id, updated_at desc)
  where coalesce(data->>'status', 'pending') = 'done'
    and jsonb_typeof(data->'manualItems') = 'array'
    and jsonb_array_length(data->'manualItems') > 0;

create or replace function public.get_fulfillment_manual_batch_reports(
  p_workspace_id uuid
)
returns table(id text, data jsonb, updated_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select br.id::text, br.data::jsonb, br.updated_at
  from public.batch_reports br
  where br.workspace_id = p_workspace_id
    and coalesce(br.data->>'status', 'pending') = 'done'
    and jsonb_typeof(br.data->'manualItems') = 'array'
    and jsonb_array_length(br.data->'manualItems') > 0
  order by br.updated_at desc, br.id desc;
$$;

grant execute on function public.get_fulfillment_manual_batch_reports(uuid) to authenticated;
