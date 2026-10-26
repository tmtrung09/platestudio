-- Preserve the older delivery ledger as well as modern deliveryBatches.
-- This additive guard also covers direct order writes from older app versions.
create function public.guard_workshop_swipe_shipped_stock() returns trigger
language plpgsql security definer set search_path=public as $$
declare ops jsonb; iid text; modern numeric; legacy numeric; finished numeric;
begin
 if not (new.data->'assembly' ? 'partWork') then return new;end if;
 select data->'values' into ops from settings where workspace_id=new.workspace_id and id='operations';
 for iid in select distinct value->>'itemId' from jsonb_each(new.data->'assembly'->'partWork') loop
  select coalesce(sum(coalesce((x->>'sentQty')::numeric,(x->>'qty')::numeric,0)),0) into modern
   from jsonb_array_elements(coalesce(ops->'deliveryBatches','[]')) b,jsonb_array_elements(coalesce(b->'items','[]')) x
   where b->>'status'<>'cancelled' and x->>'orderId'=new.id and x->>'itemId'=iid;
  select coalesce(sum(coalesce((x->>'qty')::numeric,0)),0) into legacy
   from jsonb_array_elements(coalesce(ops->'deliveries','[]')) b,jsonb_array_elements(coalesce(b->'items','[]')) x
   where b->>'orderId'=new.id and x->>'itemId'=iid;
  finished:=coalesce((new.data->'assembly'->'items'->>iid)::numeric,0);
  if finished<modern+legacy then raise exception 'Đã có hàng giao đi, không thể giảm phần hoàn tất' using errcode='40001';end if;
 end loop;
 return new;
end $$;
revoke all on function guard_workshop_swipe_shipped_stock() from public,anon,authenticated;
create trigger zz_workshop_swipe_shipped_stock before insert or update on orders
 for each row execute function guard_workshop_swipe_shipped_stock();
