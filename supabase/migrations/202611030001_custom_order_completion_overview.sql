-- Make the existing customer receipt visible in the shared order snapshot.
-- The receipt remains authoritative. No order/status/production record is created.
create or replace function public.guard_custom_order_completion_snapshot()
returns trigger language plpgsql security definer set search_path=public as $$
declare completed timestamptz;
begin
 if new.data->>'kind'='custom' then
  select customer_completed_at into completed from public.custom_order_receipts
   where workspace_id=new.workspace_id and order_id=new.id;
 end if;
 if completed is not null then
  new.data:=jsonb_set(new.data,'{customCustomerCompletedAt}',to_jsonb(completed),true);
 else
  new.data:=new.data-'customCustomerCompletedAt';
 end if;
 return new;
end $$;
revoke all on function public.guard_custom_order_completion_snapshot() from public,anon,authenticated;
create trigger guard_custom_order_completion_snapshot before insert or update of data on public.orders
 for each row execute function public.guard_custom_order_completion_snapshot();

create or replace function public.sync_custom_order_completion_snapshot()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.customer_completed_at is not null then
  update public.orders set data=jsonb_set(data,'{customCustomerCompletedAt}',to_jsonb(new.customer_completed_at),true),updated_at=now()
   where workspace_id=new.workspace_id and id=new.order_id and data->>'kind'='custom'
   and data->'customCustomerCompletedAt' is distinct from to_jsonb(new.customer_completed_at);
 end if;
 return new;
end $$;
revoke all on function public.sync_custom_order_completion_snapshot() from public,anon,authenticated;
create trigger sync_custom_order_completion_snapshot after insert or update of customer_completed_at on public.custom_order_receipts
 for each row execute function public.sync_custom_order_completion_snapshot();

-- Backfill only completed receipts. The indexed workspace/order lookup is also
-- used by the write guard; incomplete orders and unrelated orders stay untouched.
update public.orders o set data=o.data,updated_at=now()
 from public.custom_order_receipts r where r.workspace_id=o.workspace_id and r.order_id=o.id
 and r.customer_completed_at is not null and o.data->>'kind'='custom'
 and o.data->'customCustomerCompletedAt' is distinct from to_jsonb(r.customer_completed_at);
