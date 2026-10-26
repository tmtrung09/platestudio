-- Per-part workshop state, with conditional/idempotent transactions. No printer controls.
create table public.workshop_swipe_receipts(
 workspace_id uuid not null references workspaces(id) on delete cascade, request_id uuid not null,
 actor_id uuid not null, payload jsonb not null, before_state jsonb, after_revision bigint,
 issues jsonb not null default '[]', undo_of uuid, created_at timestamptz not null default now(),
 primary key(workspace_id,request_id));
alter table workshop_swipe_receipts enable row level security;
revoke all on workshop_swipe_receipts from public,anon,authenticated;

create function public.can_workshop_swipe(w uuid) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and
 (is_workspace_owner(w) or exists(select 1 from workspace_members where workspace_id=w and user_id=auth.uid() and permissions ? 'assembly.qc'))
 and not public.is_custom_counter_account(w);
$$;

-- Raw order sync from an older tab cannot erase part progress or its aggregates.
create function public.guard_workshop_swipe() returns trigger language plpgsql set search_path=public as $$
declare a jsonb; item text; h jsonb;
begin
 if current_setting('app.workshop_swipe_writer',true)=new.workspace_id::text then return new;end if;
 if tg_table_name='orders' then
  if tg_op='INSERT' then
   if exists(select 1 from orders where workspace_id=new.workspace_id and id=new.id) then return new;end if;
   if new.data->'assembly' ? 'partWork' then raise exception 'Tiến độ part phải lưu qua Gia công' using errcode='40001';end if;
  elsif old.data->'assembly' ? 'partWork' then
   a:=coalesce(new.data->'assembly','{}')||jsonb_build_object('partWork',old.data->'assembly'->'partWork');
   for item in select distinct value->>'itemId' from jsonb_each(old.data->'assembly'->'partWork') loop
    h:=old.data->'assembly'->'handovers'->item;
    a:=jsonb_set(a,'{handovers}',coalesce(a->'handovers','{}')||jsonb_build_object(item,h));
    a:=jsonb_set(a,'{items}',coalesce(a->'items','{}')||jsonb_build_object(item,coalesce(old.data->'assembly'->'items'->item,'0')));
   end loop;
   new.data:=jsonb_set(new.data,'{assembly}',a);
  elsif new.data->'assembly' ? 'partWork' then raise exception 'Tiến độ part phải lưu qua Gia công' using errcode='40001';
  end if;
 elsif tg_table_name='plate_items' and tg_op='UPDATE' and old.data ? '_workshopRevision' then
  if coalesce((new.data->>'_workshopRevision')::bigint,-1)<>(old.data->>'_workshopRevision')::bigint then
   new.data:=new.data||jsonb_build_object('qtyDone',old.data->'qtyDone','qtyRejected',coalesce(old.data->'qtyRejected','0'),'_workshopRevision',old.data->'_workshopRevision');
  elsif new.data->'qtyDone' is distinct from old.data->'qtyDone' or new.data->'qtyRejected' is distinct from old.data->'qtyRejected' then
   new.data:=new.data||jsonb_build_object('_workshopRevision',(old.data->>'_workshopRevision')::bigint+1);
  end if;
 elsif tg_table_name='settings' and new.id='operations' and tg_op='UPDATE' then
  select coalesce(jsonb_agg(x),'[]') into a from jsonb_array_elements(coalesce(new.data->'values'->'qualityIssues','[]')) x where not (x ? 'swipeRequest');
  select a||coalesce(jsonb_agg(x),'[]') into a from jsonb_array_elements(coalesce(old.data->'values'->'qualityIssues','[]')) x where x ? 'swipeRequest';
  new.data:=jsonb_set(new.data,'{values}',coalesce(new.data->'values','{}')||jsonb_build_object('qualityIssues',a));
 end if;
 return new;
end $$;
create trigger protect_workshop_swipe_orders before insert or update on orders for each row execute function guard_workshop_swipe();
create trigger protect_workshop_swipe_issues before insert or update on settings for each row execute function guard_workshop_swipe();
create trigger protect_workshop_swipe_print_counts before insert or update on plate_items for each row execute function guard_workshop_swipe();

-- Derive an initial part state only from actual printed quantities and the legacy
-- model handover; the same formula is used by the offline client.
create function public.workshop_swipe_seed(o jsonb,it jsonb,g jsonb) returns jsonb language plpgsql immutable as $$
declare h jsonb:=coalesce(o->'assembly'->'handovers'->(it->>'id'),case when o->'assembly' ? 'handedAt' then o->'assembly' else '{}'::jsonb end);
 n integer:=greatest(0,(g->>'printed')::integer); per_set integer:=greatest(1,ceil(coalesce((g->>'partRequired')::numeric,(g->>'required')::numeric)/greatest(1,(it->>'qty')::numeric))::integer); off_qty integer:=coalesce((g->>'offset')::integer,0);
 passed integer; done integer; active integer; ready integer; paused boolean;
begin
 passed:=least(n,greatest(0,coalesce((h->>'qcAcceptedQty')::integer,(h->>'partQcAcceptedQty')::integer,case when h->>'qcStatus'='accepted' then (it->>'qty')::integer else 0 end)*per_set-off_qty));
 done:=least(passed,greatest(0,coalesce((o->'assembly'->'items'->>(it->>'id'))::integer,0)*per_set-off_qty));
 active:=case when h->>'assemblyStatus'='in_progress' then passed-done else 0 end;ready:=passed-done-active;
 return jsonb_build_object('itemId',it->>'id','partId',g->>'partId','filamentId',g->>'filamentId','revision',0,'printed',n,'required',g->'required','qc',n-passed,'ready',ready,'assembling',active,'wait_ready',0,'wait_assembling',0,'completed',done,'error',0);
end $$;

create function public.workshop_swipe_project(o jsonb,iid text) returns jsonb language plpgsql immutable as $$
declare it jsonb; a jsonb:=o->'assembly'; h jsonb; r jsonb; per_set integer; n integer; qc integer; done integer; qc_min integer:=2147483647; done_min integer:=2147483647; active boolean:=false; count_parts integer:=0;
begin
 select value into it from jsonb_array_elements(o->'items') where value->>'id'=iid;
 n:=greatest(0,(it->>'qty')::integer);h:=coalesce(a->'handovers'->iid,'{}');
 for r in select jsonb_build_object('required',sum((value->>'required')::integer),'ready',sum((value->>'ready')::integer),'assembling',sum((value->>'assembling')::integer),'wait_ready',sum((value->>'wait_ready')::integer),'wait_assembling',sum((value->>'wait_assembling')::integer),'completed',sum((value->>'completed')::integer)) from jsonb_each(a->'partWork') where value->>'itemId'=iid group by value->>'partId' loop
  count_parts:=count_parts+1;per_set:=greatest(1,ceil((r->>'required')::numeric/greatest(1,n))::integer);
  qc:=((r->>'ready')::integer+(r->>'assembling')::integer+(r->>'wait_ready')::integer+(r->>'wait_assembling')::integer+(r->>'completed')::integer)/per_set;
  done:=(r->>'completed')::integer/per_set;qc_min:=least(qc_min,qc);done_min:=least(done_min,done);
  active:=active or (r->>'assembling')::integer>0 or (r->>'wait_assembling')::integer>0 or (r->>'completed')::integer>0;
 end loop;
 if count_parts=0 then return o;end if;
 qc_min:=least(n,qc_min);done_min:=least(n,done_min);
 h:=h||jsonb_build_object('swipeManaged',true,'qcStatus',case when qc_min>=n then 'accepted' when qc_min>0 then 'partial' else 'pending' end,'qcAcceptedQty',qc_min,'partQcAcceptedQty',qc_min,'readyQty',done_min,'assemblyQty',done_min,'assemblyStatus',case when done_min>=n then 'completed' when active then 'in_progress' when qc_min>0 then 'ready' else 'blocked' end);
 a:=a||jsonb_build_object('items',coalesce(a->'items','{}')||jsonb_build_object(iid,done_min),'handovers',coalesce(a->'handovers','{}')||jsonb_build_object(iid,h));
 return jsonb_set(o,'{assembly}',a);
end $$;

create function public.workshop_swipe_read(w uuid,oid text) returns jsonb language plpgsql security definer set search_path=public as $$
declare o jsonb; parts jsonb; issues jsonb;
begin
 if not can_workshop_swipe(w) then raise exception 'Không có quyền gia công' using errcode='42501';end if;
 select data into o from orders where workspace_id=w and id=oid;
 select coalesce(jsonb_agg(data),'[]') into parts from plate_items where workspace_id=w and data->>'orderId'=oid;
 select coalesce(jsonb_agg(x),'[]') into issues from settings,jsonb_array_elements(coalesce(data->'values'->'qualityIssues','[]')) x where workspace_id=w and id='operations' and x->>'orderId'=oid and x ? 'swipeRequest';
 return jsonb_build_object('order',o,'parts',parts,'issues',issues);
end $$;

create function public.commit_workshop_swipe(w uuid,request uuid,p jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare o jsonb; it jsonb; h jsonb; a jsonb; work jsonb; g jsonb; r jsonb; prior jsonb; receipt workshop_swipe_receipts%rowtype;
 oid text:=p->>'orderId'; iid text:=p->>'itemId'; pid text:=p->>'partId'; fid text:=coalesce(p->>'filamentId',''); k text; model_data jsonb; variant_data jsonb; configured jsonb;
 src text:=p->>'from'; dst text:=p->>'to'; qty integer; delta integer; available integer; required integer; remains integer; take integer;
 part record; issue_rows jsonb:='[]'; ops jsonb; owner_id uuid; undo_row workshop_swipe_receipts%rowtype; seen integer:=0; shipped integer:=0;
begin
 if not can_workshop_swipe(w) then raise exception 'Không có quyền gia công' using errcode='42501';end if;
 if request is null or coalesce(oid,'')='' or coalesce(iid,'')='' or coalesce(pid,'')='' or length(oid)>200 or length(iid)>200 or length(pid)>200 or length(fid)>200 or position(chr(31) in iid||pid||fid)>0 then raise exception 'Thiếu định danh part';end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text||':swipe:'||oid,0));
 select * into receipt from workshop_swipe_receipts where workspace_id=w and request_id=request;
 if found then
  if receipt.actor_id<>auth.uid() or receipt.payload<>p then raise exception 'Mã lần lưu đã được dùng' using errcode='40001';end if;
  return workshop_swipe_read(w,oid)||jsonb_build_object('requestId',request);
 end if;
 select data into o from orders where workspace_id=w and id=oid for update;
 if o is null or o->>'status'='cancelled' then raise exception 'Đơn không còn khả dụng' using errcode='40001';end if;
 select value into it from jsonb_array_elements(o->'items') where value->>'id'=iid;
 h:=coalesce(o->'assembly'->'handovers'->iid,case when o->'assembly' ? 'handedAt' then o->'assembly' else '{}'::jsonb end);
 if it is null or coalesce(h->>'handedAt','')='' then raise exception 'Part chưa được giao xưởng' using errcode='40001';end if;
 select data into model_data from models where workspace_id=w and id=it->>'modelId';
 select value into variant_data from jsonb_array_elements(case when jsonb_typeof(model_data->'variants')='array' then model_data->'variants' else '[]' end) where value->>'id'=it->>'variantId';
 for configured in select value from jsonb_array_elements(case when jsonb_typeof(model_data->'parts')='array' then model_data->'parts' else '[]' end) where variant_data->'partIds' ? (value->>'id') or jsonb_typeof(variant_data->'partIds') is distinct from 'array' loop
  if not exists(select 1 from plate_items where workspace_id=w and data->>'orderId'=oid and data->>'orderItemId'=iid and data->>'partId'=configured->>'id') then raise exception 'Chưa có phân bổ cho tất cả part cần thiết; kiểm tra lại model' using errcode='40001';end if;
 end loop;
 -- Serialize with other workshop QC edits and settings writes.
 perform 1 from settings where workspace_id=w and id='operations' for update;
 perform 1 from plate_items where workspace_id=w and data->>'orderId'=oid and data->>'orderItemId'=iid order by id for update;
 work:=coalesce(o->'assembly'->'partWork','{}');
 for g in select jsonb_build_object('partId',part_id,'filamentId',filament_id,'required',need,'printed',printed,'partRequired',sum(need) over(partition by part_id),'offset',coalesce(sum(printed) over(partition by part_id order by filament_id collate "C" rows between unbounded preceding and 1 preceding),0)) from (select data->>'partId' part_id,coalesce(data->>'filamentId','') filament_id,sum(greatest(0,(data->>'qty')::integer)) need,sum(least(greatest(0,(data->>'qtyDone')::integer),greatest(0,(data->>'qty')::integer))) printed from plate_items where workspace_id=w and data->>'orderId'=oid and data->>'orderItemId'=iid group by data->>'partId',coalesce(data->>'filamentId','')) grouped loop
  if coalesce(g->>'partId','')='' then raise exception 'Part cũ thiếu ID, cần kiểm tra phân bổ' using errcode='40001';end if;
  k:=iid||chr(31)||(g->>'partId')||chr(31)||(g->>'filamentId');
  r:=coalesce(work->k,workshop_swipe_seed(o,it,g));delta:=(g->>'printed')::integer-(r->>'printed')::integer;
  if delta<0 or (r->>'required')::integer<>(g->>'required')::integer then raise exception 'Số lượng nguồn đã đổi; kiểm tra lại part trước khi quẹt' using errcode='40001';end if;
  if delta>0 then
   take:=least(delta,(r->>'error')::integer);
   r:=r||jsonb_build_object('error',(r->>'error')::integer-take,'qc',(r->>'qc')::integer+delta,'printed',g->'printed','revision',(r->>'revision')::bigint+1);
  end if;
  work:=work||jsonb_build_object(k,r);seen:=seen+1;
 end loop;
 k:=iid||chr(31)||pid||chr(31)||fid;r:=work->k;
 if seen=0 or r is null then raise exception 'Part không thuộc dòng đơn này' using errcode='40001';end if;
 if (r->>'revision')::bigint<>coalesce((p->>'revision')::bigint,-1) then raise exception 'Part đã thay đổi ở thiết bị khác; tải lại để đối chiếu' using errcode='40001';end if;
 prior:=r;
 if p ? 'undoOf' then
  select * into undo_row from workshop_swipe_receipts where workspace_id=w and request_id=(p->>'undoOf')::uuid;
  if not found or undo_row.actor_id<>auth.uid() or undo_row.undo_of is not null or undo_row.payload->>'orderId'<>oid or undo_row.payload->>'itemId'<>iid or undo_row.payload->>'partId'<>pid or coalesce(undo_row.payload->>'filamentId','')<>fid or undo_row.after_revision<>(r->>'revision')::bigint or exists(select 1 from workshop_swipe_receipts where workspace_id=w and undo_of=undo_row.request_id) then raise exception 'Không thể hoàn tác vì part đã có cập nhật tiếp theo' using errcode='40001';end if;
  for g in select value from jsonb_array_elements(undo_row.issues) loop
   if not exists(select 1 from plate_items where workspace_id=w and id=g->>'partId' and (data->>'qtyDone')::integer=(g->>'afterQty')::integer and (data->>'_workshopRevision')::bigint=(g->>'afterPrintRevision')::bigint) then raise exception 'Part lỗi đã được xử lý tiếp, không thể hoàn tác' using errcode='40001';end if;
   perform set_config('app.workshop_swipe_writer',w::text,true);
   update plate_items set data=data||jsonb_build_object('qtyDone',g->'beforeQty','qtyRejected',g->'beforeRejected','_workshopRevision',(data->>'_workshopRevision')::bigint+1),updated_at=clock_timestamp() where workspace_id=w and id=g->>'partId';
  end loop;
  r:=undo_row.before_state||jsonb_build_object('revision',(r->>'revision')::bigint+1);
 else
  qty:=(p->>'qty')::integer;
  if qty is null or qty<1 or qty>1000000 or src not in ('qc','ready','assembling','wait_ready','wait_assembling','completed') or qty>coalesce((r->>src)::integer,0) then raise exception 'Số lượng part không hợp lệ' using errcode='40001';end if;
  if not (dst='error' or (src='qc' and dst='ready') or (src='ready' and dst in ('assembling','wait_ready')) or (src='assembling' and dst in ('completed','wait_assembling')) or (src='wait_ready' and dst='ready') or (src='wait_assembling' and dst='assembling')) then raise exception 'Hướng quẹt không hợp lệ' using errcode='22023';end if;
  if dst='error' and length(trim(coalesce(p->>'reason','')))=0 then raise exception 'Cần ghi lý do QC lỗi';end if;
  r:=r||jsonb_build_object(src,(r->>src)::integer-qty,dst,coalesce((r->>dst)::integer,0)+qty,'revision',(r->>'revision')::bigint+1);
  if dst='error' then
   remains:=qty;
   for part in select id,data from plate_items where workspace_id=w and data->>'orderId'=oid and data->>'orderItemId'=iid and data->>'partId'=pid and coalesce(data->>'filamentId','')=fid order by id loop
    take:=least(remains,greatest(0,(part.data->>'qtyDone')::integer));if take=0 then continue;end if;
    g:=jsonb_build_object('id',request::text||':'||part.id,'swipeRequest',request,'orderId',oid,'orderItemId',iid,'partId',part.id,'modelId',it->>'modelId','partName',part.data->>'partName','qty',take,'beforeQty',(part.data->>'qtyDone')::integer,'afterQty',(part.data->>'qtyDone')::integer-take,'beforeRejected',coalesce((part.data->>'qtyRejected')::integer,0),'afterPrintRevision',coalesce((part.data->>'_workshopRevision')::bigint,0)+1,'reason',left(p->>'reason',300),'note',left(coalesce(p->>'note',''),500),'status','open','createdAt',now(),'actor',auth.uid());issue_rows:=issue_rows||jsonb_build_array(g);
    perform set_config('app.workshop_swipe_writer',w::text,true);
    update plate_items set data=data||jsonb_build_object('qtyDone',(data->>'qtyDone')::integer-take,'qtyRejected',coalesce((data->>'qtyRejected')::integer,0)+take,'_workshopRevision',coalesce((data->>'_workshopRevision')::bigint,0)+1),updated_at=clock_timestamp() where workspace_id=w and id=part.id;
    remains:=remains-take;exit when remains=0;
   end loop;
   if remains<>0 then raise exception 'Không còn đủ part thực tế' using errcode='40001';end if;
   r:=r||jsonb_build_object('printed',(r->>'printed')::integer-qty);
  end if;
 end if;
 work:=work||jsonb_build_object(k,r);a:=coalesce(o->'assembly','{}')||jsonb_build_object('partWork',work,'handovers',coalesce(o->'assembly'->'handovers','{}')||jsonb_build_object(iid,h));o:=workshop_swipe_project(jsonb_set(o,'{assembly}',a),iid);
 select coalesce(data->'values','{}') into ops from settings where workspace_id=w and id='operations';ops:=coalesce(ops,'{}');
 select coalesce(sum(coalesce((x->>'sentQty')::integer,(x->>'qty')::integer,0)),0) into shipped from jsonb_array_elements(coalesce(ops->'deliveryBatches','[]')) b,jsonb_array_elements(coalesce(b->'items','[]')) x where b->>'status'<>'cancelled' and x->>'orderId'=oid and x->>'itemId'=iid;
 if shipped>coalesce((o->'assembly'->'items'->>iid)::integer,0) then raise exception 'Đã có hàng giao đi, không thể giảm phần hoàn tất' using errcode='40001';end if;
 perform set_config('app.workshop_swipe_writer',w::text,true);
 if issue_rows<>'[]' or p ? 'undoOf' then
  select coalesce(jsonb_agg(x),'[]') into g from jsonb_array_elements(coalesce(ops->'qualityIssues','[]')) x where not (p ? 'undoOf' and coalesce(x->>'swipeRequest','')=p->>'undoOf');
  ops:=ops||jsonb_build_object('qualityIssues',g||issue_rows);
  select owner_user_id into owner_id from workspaces where id=w;
  insert into settings(id,user_id,workspace_id,data,updated_at) values('operations',owner_id,w,jsonb_build_object('id','operations','values',ops),clock_timestamp()) on conflict(workspace_id,id) do update set data=excluded.data,updated_at=excluded.updated_at;
 end if;
 update orders set data=o,updated_at=clock_timestamp() where workspace_id=w and id=oid;
 insert into workshop_swipe_receipts(workspace_id,request_id,actor_id,payload,before_state,after_revision,issues,undo_of) values(w,request,auth.uid(),p,prior,(r->>'revision')::bigint,issue_rows,case when p ? 'undoOf' then (p->>'undoOf')::uuid end);
 return workshop_swipe_read(w,oid)||jsonb_build_object('requestId',request);
end $$;
revoke all on function can_workshop_swipe(uuid),workshop_swipe_seed(jsonb,jsonb,jsonb),workshop_swipe_project(jsonb,text),workshop_swipe_read(uuid,text),commit_workshop_swipe(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function can_workshop_swipe(uuid),workshop_swipe_read(uuid,text),commit_workshop_swipe(uuid,uuid,jsonb) to authenticated;
