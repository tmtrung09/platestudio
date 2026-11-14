-- Apply only the changes recorded by the device, atomically across production
-- tables. Receipts make a retry safe even if the first response was lost.
create table public.production_sync_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  primary key (workspace_id, request_id)
);
create table public.production_sync_order_deletions (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  order_id text not null,
  deleted_by uuid,
  delete_request uuid,
  primary key (workspace_id, order_id)
);
alter table public.production_sync_receipts enable row level security;
alter table public.production_sync_order_deletions enable row level security;
revoke all on public.production_sync_receipts, public.production_sync_order_deletions from public, anon, authenticated;

-- Keep the marker even when an older client, or a different server workflow,
-- deletes an ordinary order directly.
create function public.mark_production_order_deleted()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.workspace_id is not null and coalesce(old.data->>'kind','') <> 'custom'
     and exists(select 1 from workspaces where id=old.workspace_id) then
    insert into production_sync_order_deletions(workspace_id,order_id) values (old.workspace_id,old.id)
    on conflict do nothing;
  end if;
  return old;
end $$;
create trigger mark_production_order_deleted before delete on public.orders
for each row execute function public.mark_production_order_deleted();

create function public.guard_production_order_deletion()
returns trigger language plpgsql security definer set search_path=public as $$
declare linked_order_id text;
begin
  linked_order_id:=case when tg_table_name='orders' then new.id else new.data->>'orderId' end;
  if linked_order_id is null then return new; end if;
  if tg_table_name='plate_items' and tg_op='INSERT' then
    perform 1 from orders where workspace_id=new.workspace_id and id=linked_order_id for key share;
  end if;
  if exists(select 1 from production_sync_order_deletions d
            where d.workspace_id=new.workspace_id and d.order_id=linked_order_id) then
    raise exception 'Đơn đã được xóa. Bản sửa cũ được giữ trên thiết bị.' using errcode='PT409';
  end if;
  return new;
end $$;
create trigger guard_production_order_deletion before insert on public.orders
for each row execute function public.guard_production_order_deletion();
create trigger guard_production_part_deletion before insert or update on public.plate_items
for each row execute function public.guard_production_order_deletion();

revoke all on function public.mark_production_order_deleted(), public.guard_production_order_deletion() from public, anon, authenticated;

create function public.commit_production_sync(w uuid, request uuid, changes jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor uuid:=auth.uid();
  owner_id uuid;
  member_permissions jsonb;
  prior production_sync_receipts%rowtype;
  change jsonb;
  target text;
  row_id text;
  current_data jsonb;
  current_revision timestamptz;
  expected_revision timestamptz;
  desired jsonb;
  patch jsonb;
  before_fields jsonb;
  field text;
  result jsonb:='[]'::jsonb;
  can_manage_orders boolean;
  restore_request uuid;
begin
  select ws.owner_user_id into owner_id from workspaces ws where ws.id=w;
  select m.permissions into member_permissions from workspace_members m where m.workspace_id=w and m.user_id=actor;
  if actor is null or owner_id is null or (actor<>owner_id and member_permissions is null)
     or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or public.is_custom_counter_account(w)
     or (actor<>owner_id and not member_permissions ?| array['orders.manage','plates.plan','assembly.qc','batches.manage','models.manage','projects.manage','data.manage','delivery.create','delivery.receive','trash.manage']) then
    raise exception 'Không có quyền ghi dữ liệu sản xuất của xưởng' using errcode='42501';
  end if;
  can_manage_orders:=actor=owner_id or coalesce(member_permissions ?| array['orders.manage','data.manage'],false);
  if request is null or jsonb_typeof(changes) is distinct from 'array'
     or jsonb_array_length(changes) not between 1 and 20000 or octet_length(changes::text)>25000000 then
    raise exception 'Danh sách thay đổi sản xuất không hợp lệ' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('production-sync'),hashtext(w::text));
  select * into prior from production_sync_receipts where workspace_id=w and request_id=request;
  if found then
    if prior.actor_id<>actor or prior.payload<>changes then
      raise exception 'Mã yêu cầu đã được dùng cho thay đổi khác' using errcode='PT409';
    end if;
    return prior.result;
  end if;

  for change in select value from jsonb_array_elements(changes) loop
    target:=change->>'table';
    row_id:=change->>'id';
    desired:=nullif(change->'data','null'::jsonb);
    patch:=change->'patch';
    before_fields:=change->'before';
    expected_revision:=(change->>'revision')::timestamptz;
    restore_request:=(change->>'restore')::uuid;
    if target is null or target not in ('orders','plates','plate_items') or row_id is null or length(row_id) not between 1 and 160
       or (desired is not null and (jsonb_typeof(desired)<>'object' or desired->>'id' is distinct from row_id)) then
      raise exception 'Dòng dữ liệu sản xuất không hợp lệ' using errcode='22023';
    end if;

    execute format('select data, updated_at from public.%I where workspace_id=$1 and id=$2 for update',target)
      into current_data,current_revision using w,row_id;
    if target='orders' and (desired is null or current_data is null or patch is not null
       or desired->'items' is distinct from current_data->'items') and not can_manage_orders then
      raise exception 'Không có quyền tạo, sửa thông tin hoặc xóa đơn' using errcode='42501';
    end if;
    if target='orders' and patch is not null then
      if desired is null or jsonb_typeof(patch) is distinct from 'object' or jsonb_typeof(before_fields) is distinct from 'object'
         or (select bool_or(key not in ('note','projectId','deliveryDate','status') or not before_fields ? key) from jsonb_object_keys(patch) key)
         or current_data is null then
        raise exception 'Bản sửa không còn khớp đơn hiện tại' using errcode='PT409',detail=target||':'||row_id;
      end if;
    end if;
    if target='orders' and (current_data->>'kind'='custom' or desired->>'kind'='custom')
       and (desired is null or current_data is null) then
      raise exception 'Đơn custom dùng luồng tạo hoặc xóa riêng' using errcode='PT409';
    end if;

    if restore_request is not null then
      if target<>'orders' or not can_manage_orders or current_data is not null or desired is null or expected_revision is not null then
        raise exception 'Không thể hoàn tác xóa đơn này' using errcode='PT409',detail=target||':'||row_id;
      end if;
      delete from production_sync_order_deletions
       where workspace_id=w and order_id=row_id and deleted_by=actor and delete_request=restore_request;
      if not found then
        raise exception 'Mốc hoàn tác xóa đơn đã thay đổi' using errcode='PT409',detail=target||':'||row_id;
      end if;
    end if;

    if current_data is distinct from desired and (current_revision is distinct from expected_revision or patch is not null) then
      if current_data is null or patch is null or target<>'orders' or jsonb_typeof(patch)<>'object'
         or jsonb_typeof(before_fields) is distinct from 'object' or desired is null then
        raise exception 'Dữ liệu đã thay đổi trên máy khác. Bản của em vẫn còn trên thiết bị.'
          using errcode='PT409',detail=target||':'||row_id;
      end if;
      for field in select jsonb_object_keys(patch) loop
        if field not in ('note','projectId','deliveryDate','status')
           or not before_fields ? field
           or (coalesce(current_data->field,'null'::jsonb) is distinct from before_fields->field
               and current_data->field is distinct from patch->field) then
          raise exception 'Thông tin đơn đã được sửa trên máy khác. Bản của em vẫn còn trên thiết bị.'
            using errcode='PT409',detail=target||':'||row_id;
        end if;
      end loop;
      desired:=current_data||patch;
    end if;

    if current_data is distinct from desired then
      if desired is null then
        execute format('delete from public.%I where workspace_id=$1 and id=$2',target) using w,row_id;
        current_revision:=null;
        if target='orders' then
          update production_sync_order_deletions set deleted_by=actor,delete_request=request where workspace_id=w and order_id=row_id;
        end if;
      elsif current_data is null then
        execute format('insert into public.%I(id,user_id,workspace_id,data,updated_at) values($1,$2,$3,$4,clock_timestamp()) returning data,updated_at',target)
          into desired,current_revision using row_id,owner_id,w,desired;
      else
        execute format('update public.%I set data=$3,updated_at=clock_timestamp() where workspace_id=$1 and id=$2 returning data,updated_at',target)
          into desired,current_revision using w,row_id,desired;
      end if;
    end if;
    result:=result||jsonb_build_array(jsonb_build_object('table',target,'id',row_id,'revision',current_revision,'data',desired));
  end loop;
  for row_id in select value->>'id' from jsonb_array_elements(changes)
                 where value->>'table'='orders' and value->'data'='null'::jsonb loop
    if exists(select 1 from plate_items where workspace_id=w and data->>'orderId'=row_id) then
      raise exception 'Đơn có part mới trên máy khác. Bản xóa vẫn còn trên thiết bị.'
        using errcode='PT409',detail='orders:'||row_id;
    end if;
  end loop;
  insert into production_sync_receipts values(w,request,actor,changes,result);
  return result;
end $$;
revoke all on function public.commit_production_sync(uuid,uuid,jsonb) from public, anon;
grant execute on function public.commit_production_sync(uuid,uuid,jsonb) to authenticated;
