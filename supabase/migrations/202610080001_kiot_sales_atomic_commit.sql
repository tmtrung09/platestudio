-- One transaction for report + stock ledger, revision checked and retry-safe.
create table if not exists public.kiot_sales_commit_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  report_id uuid not null,
  report_day date not null,
  report_revision timestamptz not null,
  primary key(workspace_id, request_id)
);
alter table public.kiot_sales_commit_receipts enable row level security;
create policy members_read_sales_receipts on public.kiot_sales_commit_receipts
  for select to authenticated using(public.is_workspace_member(workspace_id));

-- Preserve human reconciliation notes; keep a resolution only if variance is unchanged.
create or replace function public.refresh_kiot_sales_reconciliation(p_workspace_id uuid)
returns void language plpgsql security invoker set search_path=public as $$
declare v_notes jsonb; v_snapshot uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Không có quyền đối chiếu'; end if;
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_notes
    from public.kiot_inventory_reconciliation_lines r where workspace_id=p_workspace_id and (resolution_note<>'' or status='resolved');
  for v_snapshot in select s.id from public.kiot_inventory_snapshots s where s.workspace_id=p_workspace_id loop
    perform public.rebuild_kiot_inventory_reconciliation(p_workspace_id,v_snapshot);
  end loop;
  update public.kiot_inventory_reconciliation_lines r set resolution_note=n.resolution_note,
    status=case when n.status='resolved' and r.variance is not distinct from n.variance then 'resolved' else r.status end,
    resolved_by=case when r.variance is not distinct from n.variance then n.resolved_by else null end,
    resolved_at=case when r.variance is not distinct from n.variance then n.resolved_at else null end
  from jsonb_to_recordset(v_notes) n(snapshot_id uuid,sku text,resolution_note text,status text,variance numeric,resolved_by uuid,resolved_at timestamptz)
  where r.workspace_id=p_workspace_id and r.snapshot_id=n.snapshot_id and r.sku=n.sku;
end;
$$;

create or replace function public.commit_kiot_sales_report(
  p_workspace_id uuid, p_report_day date, p_request_id uuid,
  p_expected_updated_at timestamptz, p_source text, p_file_name text,
  p_note text, p_lines jsonb
) returns table(id uuid, report_day date, updated_at timestamptz)
language plpgsql security definer set search_path=public
as $$
declare
  v_existing public.kiot_sales_reports;
  v_receipt public.kiot_sales_commit_receipts;
  v_id uuid; v_revision timestamptz; v_lines jsonb; v_movements jsonb;
  v_qty numeric; v_revenue numeric; v_snapshot uuid;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then
    raise exception 'Bạn không có quyền ghi báo cáo';
  end if;
  if p_report_day is null or p_request_id is null then raise exception 'Thiếu ngày hoặc mã lần nhập'; end if;
  -- Serialize requests for the same day (including a not-yet-existing report).
  -- Different days also share reconciliation snapshots; serialize that ledger work.
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':sales-ledger',0));
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_report_day::text, 0));
  select * into v_receipt from public.kiot_sales_commit_receipts r
    where r.workspace_id=p_workspace_id and r.request_id=p_request_id;
  if found then
    if v_receipt.report_day<>p_report_day then raise exception 'Mã lần nhập đã được dùng cho ngày khác'; end if;
    return query select v_receipt.report_id,v_receipt.report_day,v_receipt.report_revision; return;
  end if;
  select * into v_existing from public.kiot_sales_reports r
    where r.workspace_id=p_workspace_id and r.report_day=p_report_day for update;
  if v_existing.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001', message='Báo cáo đã thay đổi trên thiết bị khác; bản nhập được giữ lại, không ghi đè.';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' then raise exception 'Chi tiết không hợp lệ'; end if;
  if jsonb_array_length(p_lines)=0 or exists (
    select 1 from jsonb_to_recordset(p_lines) x(sku text,quantity numeric,revenue numeric)
    where trim(coalesce(x.sku,''))='' or x.quantity is null or x.quantity<=0 or coalesce(x.revenue,0)<0
  ) then raise exception 'Báo cáo rỗng, thiếu SKU hoặc số lượng không hợp lệ'; end if;
  select jsonb_agg(to_jsonb(x)),sum(x.quantity),sum(x.revenue) into v_lines,v_qty,v_revenue from (
    select trim(sku) sku,max(name) name,max(category) category,sum(quantity) quantity,sum(coalesce(revenue,0)) revenue
    from jsonb_to_recordset(p_lines) x(sku text,name text,category text,quantity numeric,revenue numeric) group by trim(sku)
  ) x;
  -- Do not call the legacy RPC: its OUT report_day/id variables collide with
  -- unqualified column names in ON CONFLICT and the final SELECT.
  v_revision=clock_timestamp();
  if v_existing.id is null then
    insert into public.kiot_sales_reports(workspace_id,user_id,report_day,source,file_name,note,sku_count,quantity_total,revenue_total,imported_at,updated_at)
    values(p_workspace_id,auth.uid(),p_report_day,coalesce(p_source,'manual'),p_file_name,coalesce(p_note,''),jsonb_array_length(v_lines),v_qty,v_revenue,v_revision,v_revision)
    returning kiot_sales_reports.id into v_id;
  else
    v_id=v_existing.id;
    update public.kiot_sales_reports r set user_id=auth.uid(),source=coalesce(p_source,'manual'),file_name=p_file_name,note=coalesce(p_note,''),
      sku_count=jsonb_array_length(v_lines),quantity_total=v_qty,revenue_total=v_revenue,imported_at=v_revision,updated_at=v_revision where r.id=v_id;
  end if;
  delete from public.kiot_sales_report_lines l where l.report_id=v_id;
  insert into public.kiot_sales_report_lines(report_id,workspace_id,sku,name,category,quantity,revenue)
    select v_id,p_workspace_id,x.sku,coalesce(x.name,''),coalesce(x.category,''),x.quantity,x.revenue
    from jsonb_to_recordset(v_lines) x(sku text,name text,category text,quantity numeric,revenue numeric);
  select jsonb_agg(jsonb_build_object('sku',x.sku,'name',x.name,'quantity_delta',-x.quantity,
    'metadata',jsonb_build_object('reportDay',p_report_day,'reportId',v_id))) into v_movements
    from jsonb_to_recordset(v_lines) x(sku text,name text,quantity numeric);
  perform public.replace_kiot_inventory_movements(p_workspace_id,'sales:'||p_report_day,'sale',
    ((p_report_day+1)::timestamp at time zone 'Asia/Bangkok')-interval '1 millisecond',p_note,v_movements);
  perform public.refresh_kiot_sales_reconciliation(p_workspace_id);
  insert into public.kiot_sales_commit_receipts values(p_workspace_id,p_request_id,v_id,p_report_day,v_revision);
  return query select v_id,p_report_day,v_revision;
end;
$$;

create or replace function public.delete_kiot_sales_report(
  p_workspace_id uuid,p_report_id uuid,p_expected_updated_at timestamptz
) returns boolean language plpgsql security definer set search_path=public
as $$
declare v_report public.kiot_sales_reports; v_day date; v_snapshot uuid;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then raise exception 'Không có quyền xóa báo cáo'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':sales-ledger',0));
  select r.report_day into v_day from public.kiot_sales_reports r where r.workspace_id=p_workspace_id and r.id=p_report_id;
  if not found then return true; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || v_day::text,0));
  select * into v_report from public.kiot_sales_reports r where r.workspace_id=p_workspace_id and r.id=p_report_id for update;
  if not found then return true; end if;
  if v_report.updated_at is distinct from p_expected_updated_at then raise exception using errcode='40001',message='Báo cáo đã thay đổi. Hãy tải lại trước khi xóa.'; end if;
  delete from public.kiot_inventory_movements where workspace_id=p_workspace_id and source_key='sales:'||v_day;
  delete from public.kiot_sales_reports where workspace_id=p_workspace_id and id=p_report_id;
  perform public.refresh_kiot_sales_reconciliation(p_workspace_id);
  return true;
end;
$$;
revoke all on function public.commit_kiot_sales_report(uuid,date,uuid,timestamptz,text,text,text,jsonb) from public, anon;
revoke all on function public.delete_kiot_sales_report(uuid,uuid,timestamptz) from public, anon;
grant execute on function public.commit_kiot_sales_report(uuid,date,uuid,timestamptz,text,text,text,jsonb) to authenticated;
grant execute on function public.delete_kiot_sales_report(uuid,uuid,timestamptz) to authenticated;
-- Old tabs must fail safely rather than bypass the revision/ledger transaction.
revoke insert,update,delete on public.kiot_sales_reports,public.kiot_sales_report_lines from authenticated,anon;
revoke execute on function public.replace_kiot_sales_report(uuid,date,text,text,text,integer,numeric,numeric,jsonb) from public,authenticated,anon;
