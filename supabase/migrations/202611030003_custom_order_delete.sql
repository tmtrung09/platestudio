-- Keep receipts as permanent idempotency tombstones; archive business rows
-- privately before removing them from the shared working collections.
alter table public.custom_order_receipts add column deleted_at timestamptz;
alter table public.custom_order_receipts add column deleted_by uuid references auth.users(id);
create table public.custom_order_delete_archive(
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 collection text not null check(collection in ('orders','plate_items')),
 id text not null, order_id text not null, record jsonb not null,
 deleted_at timestamptz not null default now(), deleted_by uuid,
 primary key(workspace_id,collection,id));
alter table public.custom_order_delete_archive enable row level security;
revoke all on public.custom_order_delete_archive from public,anon,authenticated;
grant all on public.custom_order_delete_archive to service_role;
create index if not exists plate_items_custom_order_lookup on public.plate_items(workspace_id,(data->>'orderId'));

create function public.can_delete_custom_order(w uuid,oid text)
returns boolean language sql stable security definer set search_path=public as $$
 select public.can_custom_orders(w) and exists(
  select 1 from custom_order_receipts r where r.workspace_id=w and r.order_id=oid
  and (r.created_by=auth.uid() or public.is_workspace_owner(w) or exists(
   select 1 from workspace_members m where m.workspace_id=w and m.user_id=auth.uid() and m.permissions ? 'orders.manage')));
$$;
create function public.custom_order_delete_revision(w uuid,oid text)
returns text language sql stable security definer set search_path=public as $$
 select md5(o.data::text||extract(epoch from o.updated_at)::text||coalesce((select string_agg(p.id||p.data::text||extract(epoch from p.updated_at)::text,'|' order by p.id)
 from plate_items p where p.workspace_id=w and p.data->>'orderId'=oid),'')) from orders o where o.workspace_id=w and o.id=oid;
$$;

create function public.guard_deleted_custom_order()
returns trigger language plpgsql security definer set search_path=public as $$
declare oid text; deleted timestamptz;
begin
 oid:=case when tg_table_name='orders' then new.id else new.data->>'orderId' end;
 -- A share lock serializes late writes with the receipt's deletion transaction.
 select deleted_at into deleted from custom_order_receipts where workspace_id=new.workspace_id and order_id=oid for share;
 if deleted is not null or exists(select 1 from custom_order_delete_archive a join custom_order_receipts r on r.workspace_id=a.workspace_id and r.order_id=a.order_id where a.workspace_id=new.workspace_id and a.collection=tg_table_name and a.id=new.id and r.deleted_at is not null) then
  raise exception 'Đơn custom đã được xóa; không thể đồng bộ lại bản cũ' using errcode='PT409';
 end if;
 return new;
end $$;
create trigger protect_deleted_custom_order before insert or update on public.orders for each row execute function public.guard_deleted_custom_order();
create trigger protect_deleted_custom_order_part before insert or update on public.plate_items for each row execute function public.guard_deleted_custom_order();

create function public.archive_deleted_custom_order()
returns trigger language plpgsql security definer set search_path=public as $$
declare r custom_order_receipts%rowtype; stamp timestamptz:=now();
begin
 select * into r from custom_order_receipts where workspace_id=old.workspace_id and order_id=old.id for update;
 if not found then return old;end if;
 if not public.can_delete_custom_order(old.workspace_id,old.id) then raise exception 'Chỉ quản lý đơn hoặc người tạo được xóa đơn này' using errcode='42501';end if;
 update custom_order_receipts set deleted_at=coalesce(deleted_at,stamp),deleted_by=coalesce(deleted_by,auth.uid()) where workspace_id=old.workspace_id and order_id=old.id;
 insert into custom_order_delete_archive(workspace_id,collection,id,order_id,record,deleted_at,deleted_by)
 values(old.workspace_id,'orders',old.id,old.id,to_jsonb(old),stamp,auth.uid());
 perform 1 from plate_items where workspace_id=old.workspace_id and data->>'orderId'=old.id for update;
 insert into custom_order_delete_archive(workspace_id,collection,id,order_id,record,deleted_at,deleted_by)
 select workspace_id,'plate_items',id,old.id,to_jsonb(p),stamp,auth.uid() from plate_items p where workspace_id=old.workspace_id and data->>'orderId'=old.id
 on conflict(workspace_id,collection,id) do update set record=excluded.record,deleted_at=excluded.deleted_at,deleted_by=excluded.deleted_by;
 delete from plate_items where workspace_id=old.workspace_id and data->>'orderId'=old.id;
 return old;
end $$;
create trigger archive_custom_order_before_delete before delete on public.orders for each row execute function public.archive_deleted_custom_order();

-- Legacy native clients can remove allocations before deleting the order.
-- Keep the same recovery evidence regardless of request arrival order.
create function public.archive_custom_order_part()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from custom_order_receipts where workspace_id=old.workspace_id and order_id=old.data->>'orderId' and deleted_at is null) then
  insert into custom_order_delete_archive(workspace_id,collection,id,order_id,record,deleted_by)
  values(old.workspace_id,'plate_items',old.id,old.data->>'orderId',to_jsonb(old),auth.uid())
  on conflict(workspace_id,collection,id) do update set record=excluded.record,deleted_at=excluded.deleted_at,deleted_by=excluded.deleted_by;
 end if;
 return old;
end $$;
create trigger archive_custom_order_part_before_delete before delete on public.plate_items for each row execute function public.archive_custom_order_part();

create function public.delete_custom_order(w uuid,oid text,expected text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r custom_order_receipts%rowtype;
begin
 if not public.can_delete_custom_order(w,oid) then raise exception 'Chỉ quản lý đơn hoặc người tạo được xóa đơn này' using errcode='42501';end if;
 select * into r from custom_order_receipts where workspace_id=w and order_id=oid for update;
 if r.deleted_at is not null then return jsonb_build_object('id',oid,'deletedAt',r.deleted_at);end if;
 perform 1 from orders where workspace_id=w and id=oid for update;
 perform 1 from plate_items where workspace_id=w and data->>'orderId'=oid for update;
 if expected is null or expected is distinct from public.custom_order_delete_revision(w,oid) then
  raise exception 'Đơn hoặc tiến độ đã thay đổi. Mở lại chi tiết và kiểm tra trước khi xóa' using errcode='PT409';end if;
 delete from orders where workspace_id=w and id=oid;
 select * into r from custom_order_receipts where workspace_id=w and order_id=oid;
 return jsonb_build_object('id',oid,'deletedAt',r.deleted_at);
end $$;

-- Extend only private projection/list fields; the public token projection
-- never exposes creator IDs, capabilities, tombstones or deletion revisions.
do $migration$
declare definition text; old_text text; new_text text;
begin
 select pg_get_functiondef('public.custom_order_projection(uuid,text,boolean)'::regprocedure) into definition;
 old_text:=$old$jsonb_build_object('phone',c->>'phone','address',c->>'address','creator',c->>'creator')$old$;
 new_text:=$new$jsonb_build_object('phone',c->>'phone','address',c->>'address','creator',c->>'creator','canDelete',public.can_delete_custom_order(w,oid),'deleteRevision',case when public.can_delete_custom_order(w,oid) then public.custom_order_delete_revision(w,oid) else null end)$new$;
 if position(old_text in definition)=0 then raise exception 'Review custom order projection before applying deletion';end if;
 execute replace(definition,old_text,new_text);
 select pg_get_functiondef('public.custom_order_list(uuid,integer,text)'::regprocedure) into definition;
 old_text:='into result from page;return result;';
 new_text:=$new$into result from page;return result||jsonb_build_object('deletedIds',coalesce((select jsonb_agg(order_id) from custom_order_receipts where workspace_id=w and deleted_at is not null),'[]'::jsonb));$new$;
 if position(old_text in definition)=0 then raise exception 'Review custom order list before applying deletion';end if;
 execute replace(definition,old_text,new_text);
 select pg_get_functiondef('public.commit_custom_order(uuid,uuid,jsonb)'::regprocedure) into definition;
 old_text:=$old$return jsonb_build_object('order',custom_order_projection(w,r.order_id,false),'token',r.token_value);$old$;
 new_text:=$new$if r.deleted_at is not null then raise exception 'Đơn này đã được xóa; không gửi lại yêu cầu cũ' using errcode='PT409';end if;
  return jsonb_build_object('order',custom_order_projection(w,r.order_id,false),'token',r.token_value);$new$;
 if position(old_text in definition)=0 then raise exception 'Review custom order receipt before applying deletion';end if;
 execute replace(definition,old_text,new_text);
end $migration$;
revoke all on function public.can_delete_custom_order(uuid,text),public.custom_order_delete_revision(uuid,text),public.guard_deleted_custom_order(),public.archive_deleted_custom_order(),public.archive_custom_order_part(),public.delete_custom_order(uuid,text,text) from public,anon,authenticated;
grant execute on function public.delete_custom_order(uuid,text,text) to authenticated;
