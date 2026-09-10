-- Lịch sử bán theo ngày tăng đều theo thời gian. Không lưu chúng trong
-- settings.data (một JSON chung) vì mỗi lần sửa sẽ phải tải/ghi lại cả lịch sử.
-- Chỉ mục report nhẹ để dựng lịch, chi tiết SKU nằm ở bảng riêng và chỉ đọc khi
-- người dùng mở đúng ngày đó.

create table if not exists public.kiot_sales_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  report_day date not null,
  source text not null default 'chrome',
  file_name text,
  note text not null default '',
  sku_count integer not null default 0 check (sku_count >= 0),
  quantity_total numeric not null default 0 check (quantity_total >= 0),
  revenue_total numeric not null default 0 check (revenue_total >= 0),
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, report_day)
);

create index if not exists kiot_sales_reports_workspace_day_idx
  on public.kiot_sales_reports(workspace_id, report_day desc);

create table if not exists public.kiot_sales_report_lines (
  report_id uuid not null references public.kiot_sales_reports(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sku text not null,
  name text not null default '',
  category text not null default '',
  quantity numeric not null default 0 check (quantity >= 0),
  revenue numeric not null default 0 check (revenue >= 0),
  primary key(report_id, sku)
);

create index if not exists kiot_sales_report_lines_workspace_sku_idx
  on public.kiot_sales_report_lines(workspace_id, sku);

alter table public.kiot_sales_reports enable row level security;
alter table public.kiot_sales_report_lines enable row level security;

drop policy if exists workspace_members_manage_kiot_sales_reports on public.kiot_sales_reports;
create policy workspace_members_manage_kiot_sales_reports
  on public.kiot_sales_reports for all to authenticated
  using(public.is_workspace_member(workspace_id))
  with check(public.is_workspace_member(workspace_id));

drop policy if exists workspace_members_manage_kiot_sales_report_lines on public.kiot_sales_report_lines;
create policy workspace_members_manage_kiot_sales_report_lines
  on public.kiot_sales_report_lines for all to authenticated
  using(public.is_workspace_member(workspace_id))
  with check(public.is_workspace_member(workspace_id));

-- Một lần nhập thay toàn bộ chi tiết của đúng ngày trong một transaction. Nếu
-- mạng ngắt, ngày cũ còn nguyên; không có trạng thái nửa cũ nửa mới.
create or replace function public.replace_kiot_sales_report(
  p_workspace_id uuid,
  p_report_day date,
  p_source text,
  p_file_name text,
  p_note text,
  p_sku_count integer,
  p_quantity_total numeric,
  p_revenue_total numeric,
  p_lines jsonb
)
returns table(id uuid, report_day date, updated_at timestamptz)
language plpgsql
security invoker
set search_path=public
as $$
declare v_report_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Bạn không có quyền ghi lịch sử bán của workspace này';
  end if;
  if p_report_day is null then raise exception 'Thiếu ngày báo cáo'; end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Chi tiết báo cáo không hợp lệ';
  end if;

  insert into public.kiot_sales_reports(
    workspace_id,user_id,report_day,source,file_name,note,sku_count,quantity_total,revenue_total,imported_at,updated_at
  ) values (
    p_workspace_id,auth.uid(),p_report_day,coalesce(nullif(trim(p_source),''),'chrome'),nullif(trim(p_file_name),''),coalesce(p_note,''),
    greatest(0,coalesce(p_sku_count,0)),greatest(0,coalesce(p_quantity_total,0)),greatest(0,coalesce(p_revenue_total,0)),now(),now()
  ) on conflict(workspace_id,report_day) do update set
    user_id=auth.uid(),source=excluded.source,file_name=excluded.file_name,note=excluded.note,
    sku_count=excluded.sku_count,quantity_total=excluded.quantity_total,revenue_total=excluded.revenue_total,
    imported_at=excluded.imported_at,updated_at=excluded.updated_at
  returning kiot_sales_reports.id into v_report_id;

  delete from public.kiot_sales_report_lines where report_id=v_report_id;
  insert into public.kiot_sales_report_lines(report_id,workspace_id,sku,name,category,quantity,revenue)
  select v_report_id,p_workspace_id,trim(coalesce(line.sku,'')),coalesce(line.name,''),coalesce(line.category,''),
    greatest(0,coalesce(line.quantity,0)),greatest(0,coalesce(line.revenue,0))
  from jsonb_to_recordset(p_lines) as line(sku text,name text,category text,quantity numeric,revenue numeric)
  where trim(coalesce(line.sku,'')) <> '';

  return query select v_report_id,p_report_day,(select updated_at from public.kiot_sales_reports where id=v_report_id);
end;
$$;

grant execute on function public.replace_kiot_sales_report(uuid,date,text,text,text,integer,numeric,numeric,jsonb) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='kiot_sales_reports') then
    alter publication supabase_realtime add table public.kiot_sales_reports;
  end if;
end $$;
