-- Đưa các báo cáo bán theo ngày đã lưu trước khi có sổ tồn kho vào ledger.
-- Khóa nguồn sales:YYYY-MM-DD + SKU giúp migration chạy an toàn một lần và
-- không nhân đôi khi người dùng nhập lại file của cùng ngày sau này.

insert into public.kiot_inventory_movements(
  workspace_id,user_id,source_key,kind,occurred_at,sku,name,quantity_delta,note,metadata
)
select
  report.workspace_id,
  report.user_id,
  'sales:' || report.report_day::text,
  'sale',
  ((report.report_day::timestamp + time '23:59:59.999') at time zone 'Asia/Ho_Chi_Minh'),
  line.sku,
  line.name,
  -abs(coalesce(line.quantity,0)),
  'Bổ sung từ báo cáo bán KiotViet đã lưu',
  jsonb_build_object('report_id',report.id,'backfilled',true)
from public.kiot_sales_reports report
join public.kiot_sales_report_lines line on line.report_id=report.id
where trim(coalesce(line.sku,''))<>'' and coalesce(line.quantity,0)<>0
on conflict(workspace_id,source_key,sku) do update set
  user_id=excluded.user_id,
  kind=excluded.kind,
  occurred_at=excluded.occurred_at,
  name=excluded.name,
  quantity_delta=excluded.quantity_delta,
  note=excluded.note,
  metadata=excluded.metadata,
  updated_at=now();
