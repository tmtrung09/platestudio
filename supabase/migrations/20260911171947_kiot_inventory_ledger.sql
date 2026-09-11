-- Sổ kiểm soát tồn kho KiotViet.
-- Snapshot là bằng chứng quan sát bất biến; giao/bán/điều chỉnh là biến động
-- độc lập. Không ghi đè tồn quan sát cũ, nhờ vậy luôn giải thích được chênh lệch.

create table if not exists public.kiot_inventory_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  observed_at timestamptz not null default now(),
  imported_at timestamptz not null default now(),
  source text not null default 'catalog_file',
  file_name text not null default '',
  is_full_snapshot boolean not null default true,
  sku_count integer not null default 0 check (sku_count >= 0),
  stock_total numeric not null default 0,
  source_hash text not null default ''
);

create index if not exists kiot_inventory_snapshots_workspace_observed_idx
  on public.kiot_inventory_snapshots(workspace_id, observed_at desc, imported_at desc);

create table if not exists public.kiot_inventory_snapshot_lines (
  snapshot_id uuid not null references public.kiot_inventory_snapshots(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sku text not null,
  name text not null default '',
  category text not null default '',
  observed_stock numeric not null default 0,
  reserved_stock numeric not null default 0,
  unit text not null default '',
  sale_price numeric not null default 0,
  primary key(snapshot_id, sku)
);

create index if not exists kiot_inventory_snapshot_lines_workspace_sku_idx
  on public.kiot_inventory_snapshot_lines(workspace_id, sku);

create table if not exists public.kiot_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  kind text not null check (kind in ('sale','delivery_received','return','adjustment','opening_balance')),
  occurred_at timestamptz not null,
  sku text not null,
  name text not null default '',
  quantity_delta numeric not null,
  note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, source_key, sku)
);

create index if not exists kiot_inventory_movements_workspace_sku_time_idx
  on public.kiot_inventory_movements(workspace_id, sku, occurred_at);
create index if not exists kiot_inventory_movements_workspace_time_idx
  on public.kiot_inventory_movements(workspace_id, occurred_at desc);

create table if not exists public.kiot_inventory_reconciliation_lines (
  snapshot_id uuid not null references public.kiot_inventory_snapshots(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  sku text not null,
  baseline_snapshot_id uuid references public.kiot_inventory_snapshots(id) on delete set null,
  baseline_stock numeric,
  movement_delta numeric not null default 0,
  expected_stock numeric,
  observed_stock numeric not null default 0,
  variance numeric,
  status text not null check (status in ('baseline','matched','open','resolved')),
  resolution_note text not null default '',
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(snapshot_id, sku)
);

create index if not exists kiot_inventory_reconciliation_open_idx
  on public.kiot_inventory_reconciliation_lines(workspace_id, snapshot_id, status)
  where status = 'open';

alter table public.kiot_inventory_snapshots enable row level security;
alter table public.kiot_inventory_snapshot_lines enable row level security;
alter table public.kiot_inventory_movements enable row level security;
alter table public.kiot_inventory_reconciliation_lines enable row level security;

drop policy if exists workspace_members_manage_kiot_inventory_snapshots on public.kiot_inventory_snapshots;
create policy workspace_members_manage_kiot_inventory_snapshots on public.kiot_inventory_snapshots
  for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
drop policy if exists workspace_members_manage_kiot_inventory_snapshot_lines on public.kiot_inventory_snapshot_lines;
create policy workspace_members_manage_kiot_inventory_snapshot_lines on public.kiot_inventory_snapshot_lines
  for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
drop policy if exists workspace_members_manage_kiot_inventory_movements on public.kiot_inventory_movements;
create policy workspace_members_manage_kiot_inventory_movements on public.kiot_inventory_movements
  for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));
drop policy if exists workspace_members_manage_kiot_inventory_reconciliation_lines on public.kiot_inventory_reconciliation_lines;
create policy workspace_members_manage_kiot_inventory_reconciliation_lines on public.kiot_inventory_reconciliation_lines
  for all to authenticated using(public.is_workspace_member(workspace_id)) with check(public.is_workspace_member(workspace_id));

create or replace function public.rebuild_kiot_inventory_reconciliation(
  p_workspace_id uuid,
  p_snapshot_id uuid
)
returns integer
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_current public.kiot_inventory_snapshots%rowtype;
  v_previous public.kiot_inventory_snapshots%rowtype;
  v_count integer;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Bạn không có quyền đối chiếu tồn kho của workspace này';
  end if;
  select * into v_current from public.kiot_inventory_snapshots
    where id=p_snapshot_id and workspace_id=p_workspace_id;
  if not found then raise exception 'Không tìm thấy snapshot tồn kho'; end if;
  select * into v_previous from public.kiot_inventory_snapshots
    where workspace_id=p_workspace_id and id<>p_snapshot_id and observed_at<v_current.observed_at
    order by observed_at desc, imported_at desc limit 1;

  delete from public.kiot_inventory_reconciliation_lines where snapshot_id=p_snapshot_id;

  if v_previous.id is null then
    insert into public.kiot_inventory_reconciliation_lines(
      snapshot_id,workspace_id,sku,baseline_stock,movement_delta,expected_stock,observed_stock,variance,status
    )
    select p_snapshot_id,p_workspace_id,line.sku,null,0,null,line.observed_stock,null,'baseline'
    from public.kiot_inventory_snapshot_lines line where line.snapshot_id=p_snapshot_id;
  else
    insert into public.kiot_inventory_reconciliation_lines(
      snapshot_id,workspace_id,sku,baseline_snapshot_id,baseline_stock,movement_delta,expected_stock,observed_stock,variance,status
    )
    with sku_set as (
      select sku from public.kiot_inventory_snapshot_lines where snapshot_id=p_snapshot_id
      union
      select sku from public.kiot_inventory_snapshot_lines where snapshot_id=v_previous.id
    ), values_by_sku as (
      select sku_set.sku,
        coalesce(previous_line.observed_stock,0) as baseline_stock,
        coalesce(current_line.observed_stock,0) as observed_stock,
        coalesce((select sum(movement.quantity_delta) from public.kiot_inventory_movements movement
          where movement.workspace_id=p_workspace_id and movement.sku=sku_set.sku
            and movement.occurred_at>v_previous.observed_at and movement.occurred_at<=v_current.observed_at),0) as movement_delta
      from sku_set
      left join public.kiot_inventory_snapshot_lines previous_line on previous_line.snapshot_id=v_previous.id and previous_line.sku=sku_set.sku
      left join public.kiot_inventory_snapshot_lines current_line on current_line.snapshot_id=p_snapshot_id and current_line.sku=sku_set.sku
    )
    select p_snapshot_id,p_workspace_id,sku,v_previous.id,baseline_stock,movement_delta,
      baseline_stock+movement_delta,observed_stock,observed_stock-(baseline_stock+movement_delta),
      case when observed_stock=baseline_stock+movement_delta then 'matched' else 'open' end
    from values_by_sku;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.replace_kiot_inventory_snapshot(
  p_workspace_id uuid,
  p_observed_at timestamptz,
  p_source text,
  p_file_name text,
  p_is_full_snapshot boolean,
  p_source_hash text,
  p_lines jsonb
)
returns table(id uuid, observed_at timestamptz, sku_count integer, stock_total numeric)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_snapshot_id uuid;
begin
  if not public.is_workspace_member(p_workspace_id) then
    raise exception 'Bạn không có quyền lưu snapshot tồn kho của workspace này';
  end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' then raise exception 'Dòng tồn kho không hợp lệ'; end if;
  insert into public.kiot_inventory_snapshots(workspace_id,user_id,observed_at,source,file_name,is_full_snapshot,source_hash,sku_count,stock_total)
  select p_workspace_id,auth.uid(),coalesce(p_observed_at,now()),coalesce(nullif(trim(p_source),''),'catalog_file'),coalesce(p_file_name,''),coalesce(p_is_full_snapshot,true),coalesce(p_source_hash,''),
    count(*) filter(where trim(coalesce(line.sku,''))<>''),coalesce(sum(coalesce(line.observed_stock,0)) filter(where trim(coalesce(line.sku,''))<>''),0)
  from jsonb_to_recordset(p_lines) as line(sku text,observed_stock numeric)
  returning kiot_inventory_snapshots.id into v_snapshot_id;

  insert into public.kiot_inventory_snapshot_lines(snapshot_id,workspace_id,sku,name,category,observed_stock,reserved_stock,unit,sale_price)
  select v_snapshot_id,p_workspace_id,trim(coalesce(line.sku,'')),coalesce(line.name,''),coalesce(line.category,''),coalesce(line.observed_stock,0),coalesce(line.reserved_stock,0),coalesce(line.unit,''),coalesce(line.sale_price,0)
  from jsonb_to_recordset(p_lines) as line(sku text,name text,category text,observed_stock numeric,reserved_stock numeric,unit text,sale_price numeric)
  where trim(coalesce(line.sku,''))<>'';

  perform public.rebuild_kiot_inventory_reconciliation(p_workspace_id,v_snapshot_id);
  return query select snapshot.id,snapshot.observed_at,snapshot.sku_count,snapshot.stock_total from public.kiot_inventory_snapshots snapshot where snapshot.id=v_snapshot_id;
end;
$$;

create or replace function public.replace_kiot_inventory_movements(
  p_workspace_id uuid,
  p_source_key text,
  p_kind text,
  p_occurred_at timestamptz,
  p_note text,
  p_lines jsonb
)
returns integer
language plpgsql
security invoker
set search_path=public
as $$
declare v_count integer;
begin
  if not public.is_workspace_member(p_workspace_id) then raise exception 'Bạn không có quyền ghi biến động tồn kho'; end if;
  if trim(coalesce(p_source_key,''))='' then raise exception 'Thiếu khóa nguồn biến động'; end if;
  if p_kind not in ('sale','delivery_received','return','adjustment','opening_balance') then raise exception 'Loại biến động không hợp lệ'; end if;
  if jsonb_typeof(coalesce(p_lines,'[]'::jsonb))<>'array' then raise exception 'Dòng biến động không hợp lệ'; end if;
  delete from public.kiot_inventory_movements where workspace_id=p_workspace_id and source_key=p_source_key;
  insert into public.kiot_inventory_movements(workspace_id,user_id,source_key,kind,occurred_at,sku,name,quantity_delta,note,metadata)
  select p_workspace_id,auth.uid(),p_source_key,p_kind,coalesce(p_occurred_at,now()),trim(coalesce(line.sku,'')),coalesce(line.name,''),coalesce(line.quantity_delta,0),coalesce(p_note,''),coalesce(line.metadata,'{}'::jsonb)
  from jsonb_to_recordset(p_lines) as line(sku text,name text,quantity_delta numeric,metadata jsonb)
  where trim(coalesce(line.sku,''))<>'' and coalesce(line.quantity_delta,0)<>0;
  get diagnostics v_count=row_count;
  return v_count;
end;
$$;

grant execute on function public.rebuild_kiot_inventory_reconciliation(uuid,uuid) to authenticated;
grant execute on function public.replace_kiot_inventory_snapshot(uuid,timestamptz,text,text,boolean,text,jsonb) to authenticated;
grant execute on function public.replace_kiot_inventory_movements(uuid,text,text,timestamptz,text,jsonb) to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='kiot_inventory_snapshots') then
    alter publication supabase_realtime add table public.kiot_inventory_snapshots;
  end if;
end $$;
