-- Một request nhẹ cho biết bảng nào thực sự đổi từ lần mở app trước.
-- Client dùng manifest này để giữ cache local và chỉ tải lại collection đã đổi.
create or replace function public.get_workspace_sync_manifest(p_workspace_id uuid)
returns table(table_key text, latest_updated_at timestamptz, row_count bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Bạn không có quyền đọc workspace này';
  end if;

  return query
  select 'models'::text,max(updated_at),count(*) from public.models where workspace_id=p_workspace_id
  union all select 'fils',max(updated_at),count(*) from public.filaments where workspace_id=p_workspace_id
  union all select 'projects',max(updated_at),count(*) from public.projects where workspace_id=p_workspace_id
  union all select 'orders',max(updated_at),count(*) from public.orders where workspace_id=p_workspace_id
  union all select 'plates',max(updated_at),count(*) from public.plates where workspace_id=p_workspace_id
  union all select 'pitems',max(updated_at),count(*) from public.plate_items where workspace_id=p_workspace_id
  union all select 'settings',max(updated_at),count(*) from public.settings where workspace_id=p_workspace_id
  union all select 'batchReports',max(updated_at),count(*) from public.batch_reports where workspace_id=p_workspace_id;
end;
$$;

revoke all on function public.get_workspace_sync_manifest(uuid) from public;
grant execute on function public.get_workspace_sync_manifest(uuid) to authenticated;
