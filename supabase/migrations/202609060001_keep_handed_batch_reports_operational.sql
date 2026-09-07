-- Một mẻ đã giao xưởng vẫn là dữ liệu vận hành, kể cả các bản ghi cũ
-- chưa đổi status sang `done`. Nếu lọc chỉ theo status, thiết bị khác sẽ
-- không nhận được mẻ đó trong trang Gia công.

create index if not exists batch_reports_workspace_handed_manual_idx
  on public.batch_reports (workspace_id, updated_at desc, id desc)
  where jsonb_typeof(data->'manualItems') = 'array'
    and jsonb_array_length(data->'manualItems') > 0
    and data #>> '{workshopHandover,status}' = 'handed';

create or replace function public.get_operational_batch_reports(
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
    and (
      coalesce(br.data->>'status', 'pending') = 'pending'
      or (
        jsonb_typeof(br.data->'manualItems') = 'array'
        and jsonb_array_length(br.data->'manualItems') > 0
        and (
          coalesce(br.data->>'status', 'pending') = 'done'
          or br.data #>> '{workshopHandover,status}' = 'handed'
        )
      )
    )
  order by br.updated_at desc, br.id desc;
$$;

-- Giữ tương thích cho workspace còn dùng RPC đời trước.
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
    and jsonb_typeof(br.data->'manualItems') = 'array'
    and jsonb_array_length(br.data->'manualItems') > 0
    and (
      coalesce(br.data->>'status', 'pending') = 'done'
      or br.data #>> '{workshopHandover,status}' = 'handed'
    )
  order by br.updated_at desc, br.id desc;
$$;

grant execute on function public.get_operational_batch_reports(uuid) to authenticated;
grant execute on function public.get_fulfillment_manual_batch_reports(uuid) to authenticated;
