-- Token-bound after-sales records. No anonymous table or RPC access.
create table public.custom_order_reviews(
 workspace_id uuid not null references workspaces(id),order_id text not null,request_id uuid not null,
 experience integer not null check(experience between 1 and 5),quality integer not null check(quality between 1 and 5),
 message text not null check(length(message)<=2000),payload_hash text not null,created_at timestamptz not null default now(),
 primary key(workspace_id,order_id),unique(workspace_id,request_id));
create table public.custom_care_uploads(
 workspace_id uuid not null references workspaces(id),order_id text not null,request_id uuid not null,
 files jsonb not null,created_at timestamptz not null default now(),primary key(workspace_id,request_id));
create table public.custom_order_warranties(
 id uuid primary key,workspace_id uuid not null references workspaces(id),order_id text not null,line_id text not null,
 part_id text,reported_part_id text,approved_part_name text,reported_part text not null,description text not null check(length(description) between 1 and 2000),
 images jsonb not null,snapshot jsonb not null,payload_hash text not null,
 approved_quantity integer,production_plan jsonb not null default '[]',
 state text not null default 'pending' check(state in ('pending','info','approved','declined','collected')),
 note text not null default '',supplement text not null default '',job_id text,revision integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),decided_by uuid,collected_at timestamptz);
create index custom_warranty_active_job on custom_order_warranties(workspace_id,job_id) where state='approved';
create index custom_warranty_inbox on custom_order_warranties(workspace_id,updated_at desc,id);
create table public.custom_care_events(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id),order_id text not null,
 warranty_id uuid,kind text not null,created_at timestamptz not null default now());
create index custom_care_event_inbox on custom_care_events(workspace_id,created_at desc);
create table public.custom_care_zalo_outbox(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id),warranty_id uuid not null references custom_order_warranties(id),
 stage text not null check(stage in ('approved','ready')),status text not null default 'pending'
 check(status in ('pending','sending','sent','failed','unknown','blocked')),attempts integer not null default 0,
 next_attempt_at timestamptz not null default now(),claimed_at timestamptz,provider_id text,error_code text,
 created_at timestamptz not null default now(),unique(warranty_id,stage));
do $$declare t text;begin
 foreach t in array array['custom_order_reviews','custom_care_uploads','custom_order_warranties','custom_care_events','custom_care_zalo_outbox'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('custom-care-media','custom-care-media',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
-- Only short-lived signed upload/read URLs issued by the token-bound Edge API.
create or replace function public.can_manage_custom_care(w uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and
 (is_workspace_owner(w) or exists(select 1 from workspace_members where workspace_id=w and user_id=auth.uid()
 and role<>'store_custom' and permissions ? 'orders.manage'));
$$;
create or replace function public.custom_care_scope(token text)
returns public.custom_order_receipts language plpgsql stable security definer set search_path=public as $$
declare r custom_order_receipts%rowtype;begin
 if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'Link đơn không hợp lệ' using errcode='42501';end if;
 select c.* into r from custom_order_receipts c join orders o on o.workspace_id=c.workspace_id and o.id=c.order_id
 where c.token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') and o.data->>'kind'='custom' and coalesce(o.data->>'status','')<>'cancelled';
 if not found then raise exception 'Link đơn không hợp lệ' using errcode='42501';end if;return r;end $$;
create or replace function public.custom_care_recipe(p jsonb) returns jsonb language sql immutable set search_path=public as $$select jsonb_build_object('filamentId',p->'filamentId','filamentIds',p->'filamentIds','componentColors',p->'componentColors','keyboardText',p->'keyboardText','customColorKey',p->'customColorKey')$$;
revoke all on function custom_care_recipe(jsonb) from public,anon,authenticated;
create or replace function public.custom_warranty_stage(c public.custom_order_warranties)
returns text language plpgsql stable security definer set search_path=public as $$
declare job jsonb;item jsonb;ops jsonb;received numeric;recipe jsonb;planned numeric;begin
 if c.state in ('declined','collected') then return c.state;end if;
 if not exists(select 1 from orders where workspace_id=c.workspace_id and id=c.order_id and coalesce(data->>'status','')<>'cancelled') then return 'reconcile';end if;
 if c.state<>'approved' then return c.state;end if;
 select data into job from orders where workspace_id=c.workspace_id and id=c.job_id;
 if job is null or job->>'status'='cancelled' then return 'reconcile';end if;
 item:=job->'items'->0;
 if job->>'warrantyRequestId' is distinct from c.id::text or jsonb_array_length(job->'items')<>1 or item->>'partId' is distinct from c.part_id or item->>'modelId' is distinct from c.snapshot->>'modelId' or (item->>'qty')::numeric is distinct from c.approved_quantity::numeric then return 'reconcile';end if;
 if exists(select 1 from plate_items where workspace_id=c.workspace_id and data->>'orderId'=c.job_id and (data->>'partId' is distinct from c.part_id or data->>'modelId' is distinct from c.snapshot->>'modelId' or data->>'orderItemId' is distinct from item->>'id' or not c.production_plan @> jsonb_build_array(custom_care_recipe(data)))) then return 'reconcile';end if;
 for recipe in select value from jsonb_array_elements(c.production_plan) loop
  select sum((data->>'qty')::numeric) into planned from plate_items where workspace_id=c.workspace_id and data->>'orderId'=c.job_id and custom_care_recipe(data)=recipe;
  if planned is distinct from c.approved_quantity::numeric then return 'reconcile';end if;
 end loop;
 if not exists(select 1 from plate_items where workspace_id=c.workspace_id and data->>'orderId'=c.job_id) then return 'reconcile';end if;
 if exists(select 1 from plate_items where workspace_id=c.workspace_id and data->>'orderId'=c.job_id and coalesce((data->>'qtyDone')::numeric,0)<(data->>'qty')::numeric) then
  if exists(select 1 from plate_items pi left join plates p on p.workspace_id=pi.workspace_id and p.id=pi.data->>'plateId'
   where pi.workspace_id=c.workspace_id and pi.data->>'orderId'=c.job_id and (coalesce((pi.data->>'qtyDone')::numeric,0)>0 or p.data->>'status'='printing')) then return 'printing';end if;
  return 'approved';
 end if;
 if coalesce(job->'assembly'->'handovers'->(item->>'id')->>'qcStatus','')<>'accepted' or
 greatest(coalesce((job->'assembly'->'items'->>(item->>'id'))::numeric,0),coalesce((job->'assembly'->'handovers'->(item->>'id')->>'readyQty')::numeric,0))<(item->>'qty')::numeric then return 'qc';end if;
 select data->'values' into ops from settings where workspace_id=c.workspace_id and id='operations';
 select coalesce(sum((x->>'receivedQty')::numeric),0) into received from jsonb_array_elements(coalesce(ops->'deliveryBatches','[]')) d,
 jsonb_array_elements(coalesce(d->'items','[]')) x where d->>'status' in ('received','partial_received') and x->>'orderId'=c.job_id and x->>'itemId'=item->>'id';
 if received<(item->>'qty')::numeric then return 'qc';end if;
 return 'ready';
 exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return 'reconcile';end $$;
create or replace function public.custom_warranty_public(c public.custom_order_warranties)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',c.id,'lineId',c.line_id,'partId',c.part_id,'partName',coalesce(c.approved_part_name,c.reported_part),'reportedPartName',c.reported_part,'reportedPartId',c.reported_part_id,
 'modelName',c.snapshot->'model'->>'name','description',c.description,'images',c.images,'stage',custom_warranty_stage(c),
 'note',c.note,'supplement',c.supplement,'revision',c.revision,'createdAt',c.created_at,'collectedAt',c.collected_at);
$$;
create or replace function public.read_custom_care(token text)
returns jsonb language plpgsql stable security definer set search_path=public as $$declare r custom_order_receipts%rowtype;begin
 r:=custom_care_scope(token);
 return jsonb_build_object('eligible',r.customer_completed_at is not null,
 'review',(select jsonb_build_object('experience',experience,'quality',quality,'message',message) from custom_order_reviews where workspace_id=r.workspace_id and order_id=r.order_id),
 'warranties',coalesce((select jsonb_agg(custom_warranty_public(c) order by created_at desc,id) from custom_order_warranties c where workspace_id=r.workspace_id and order_id=r.order_id),'[]'));
end $$;
create or replace function public.reserve_custom_care_upload(token text,request uuid,files jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r custom_order_receipts%rowtype;existing custom_care_uploads%rowtype;f jsonb;manifest jsonb:='[]';ext text;begin
 r:=custom_care_scope(token);if r.customer_completed_at is null then raise exception 'Chỉ gửi bảo hành sau khi nhận hàng';end if;
 if request is null or jsonb_typeof(files) is distinct from 'array' or jsonb_array_length(files) not between 1 and 4 then raise exception 'Chọn từ 1 đến 4 ảnh';end if;
 perform pg_advisory_xact_lock(hashtextextended(r.workspace_id::text||r.order_id,0));
 select * into existing from custom_care_uploads where workspace_id=r.workspace_id and request_id=request;
 if found then
  if existing.order_id<>r.order_id or (select jsonb_agg(x-'path') from jsonb_array_elements(existing.files) x)<>files then raise exception 'Ảnh của yêu cầu đã khác' using errcode='PT409';end if;
  return existing.files;
 end if;
 if (select count(*) from custom_care_uploads where workspace_id=r.workspace_id and order_id=r.order_id and created_at>now()-interval '1 day')>=20 then raise exception 'Bạn đã gửi nhiều ảnh hôm nay; vui lòng liên hệ cửa hàng';end if;
 for f in select value from jsonb_array_elements(files) loop
  if coalesce(f->>'type','') not in ('image/jpeg','image/png','image/webp') or coalesce(f->>'size','') !~ '^[0-9]{1,8}$' or (f->>'size')::integer not between 1 and 5242880 or length(coalesce(f->>'name','')) not between 1 and 180 or coalesce(f->>'id','') !~ '^[a-f0-9-]{36}$' or coalesce(f->>'sha256','') !~ '^[a-f0-9]{64}$' then raise exception 'Ảnh không hợp lệ';end if;
  ext:=case f->>'type' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
  manifest:=manifest||jsonb_build_array(f||jsonb_build_object('path',r.workspace_id::text||'/'||request::text||'/'||(f->>'id')||'.'||ext));
 end loop;
 if (select count(distinct x->>'id') from jsonb_array_elements(manifest) x)<>jsonb_array_length(manifest) then raise exception 'Ảnh bị trùng mã';end if;
 insert into custom_care_uploads values(r.workspace_id,r.order_id,request,manifest,now());return manifest;
end $$;
create or replace function public.submit_custom_care(token text,request uuid,p jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r custom_order_receipts%rowtype;c custom_order_warranties%rowtype;old custom_order_reviews%rowtype;line jsonb;media jsonb;part text;fingerprint text;f jsonb;begin
 r:=custom_care_scope(token);if request is null or jsonb_typeof(p) is distinct from 'object' then raise exception 'Yêu cầu không hợp lệ';end if;
 perform pg_advisory_xact_lock(hashtextextended(r.workspace_id::text||r.order_id,0));fingerprint:=encode(sha256(convert_to(p::text,'UTF8')),'hex');
 if p->>'kind'='review' then
  select * into old from custom_order_reviews where workspace_id=r.workspace_id and order_id=r.order_id;
  if found then
   if old.request_id=request and old.payload_hash=fingerprint then return read_custom_care(token);end if;
   raise exception 'Đơn đã có đánh giá' using errcode='PT409';
  end if;
  if r.customer_completed_at is null then raise exception 'Chỉ đánh giá sau khi nhận hàng';end if;
  if coalesce(p->>'experience','') !~ '^[1-5]$' or coalesce(p->>'quality','') !~ '^[1-5]$' or length(coalesce(p->>'message',''))>2000 then raise exception 'Chọn điểm từ 1 đến 5 cho cả hai mục';end if;
  insert into custom_order_reviews values(r.workspace_id,r.order_id,request,(p->>'experience')::integer,(p->>'quality')::integer,coalesce(p->>'message',''),fingerprint,now());
  insert into custom_care_events(workspace_id,order_id,kind) values(r.workspace_id,r.order_id,'review');return read_custom_care(token);
 elsif p->>'kind'='warranty' then
  select * into c from custom_order_warranties where id=request;
  if found then
   if c.workspace_id=r.workspace_id and c.order_id=r.order_id and c.payload_hash=fingerprint then return read_custom_care(token);end if;
   raise exception 'Mã yêu cầu đã có nội dung khác' using errcode='PT409';
  end if;
  if r.customer_completed_at is null then raise exception 'Chỉ gửi bảo hành sau khi nhận hàng';end if;
  if (select count(*) from custom_order_warranties where workspace_id=r.workspace_id and order_id=r.order_id and state not in ('declined','collected'))>=10 then raise exception 'Đang có nhiều yêu cầu; vui lòng liên hệ cửa hàng';end if;
  select x into line from orders o,jsonb_array_elements(o.data->'custom'->'lines') x where o.workspace_id=r.workspace_id and o.id=r.order_id and x->>'id'=p->>'lineId';
  if line is null then raise exception 'Sản phẩm không thuộc đơn này';end if;
  part:=nullif(p->>'partId','');
  if part is not null and not exists(select 1 from jsonb_array_elements(coalesce(line->'partColors','[]')) x where x->>'partId'=part) then raise exception 'Bộ phận không thuộc sản phẩm';end if;
  if length(trim(coalesce(p->>'description',''))) not between 1 and 2000 then raise exception 'Mô tả tình trạng từ 1 đến 2000 ký tự';end if;
  select files into media from custom_care_uploads where workspace_id=r.workspace_id and order_id=r.order_id and request_id=request;
  if media is null then raise exception 'Ảnh chưa được lưu';end if;
  for f in select value from jsonb_array_elements(media) loop
   if not exists(select 1 from storage.objects where bucket_id='custom-care-media' and name=f->>'path') then raise exception 'Ảnh chưa được lưu đầy đủ';end if;
  end loop;
  insert into custom_order_warranties(id,workspace_id,order_id,line_id,part_id,reported_part_id,reported_part,description,images,snapshot,payload_hash)
  values(request,r.workspace_id,r.order_id,line->>'id',part,part,coalesce((select x->>'partName' from jsonb_array_elements(coalesce(line->'partColors','[]')) x where x->>'partId'=part limit 1),'Khác / Chưa xác định'),trim(p->>'description'),media,line||jsonb_build_object('_customer',(select data->'custom'->>'customer' from orders where workspace_id=r.workspace_id and id=r.order_id)),fingerprint);
  insert into custom_care_events(workspace_id,order_id,warranty_id,kind) values(r.workspace_id,r.order_id,request,'warranty');return read_custom_care(token);
 else raise exception 'Thao tác không hợp lệ';end if;
end $$;
create table public.custom_care_supplement_receipts(warranty_id uuid not null references custom_order_warranties(id),request_id uuid not null,content_hash text not null,primary key(warranty_id,request_id));
alter table custom_care_supplement_receipts enable row level security;
revoke all on custom_care_supplement_receipts from public,anon,authenticated;
grant all on custom_care_supplement_receipts to service_role;
create or replace function public.supplement_custom_care(token text,cid uuid,request uuid,expected integer,message text)
returns jsonb language plpgsql security definer set search_path=public as $$declare r custom_order_receipts%rowtype;c custom_order_warranties%rowtype;h text;old text;begin
 r:=custom_care_scope(token);select * into c from custom_order_warranties where id=cid and workspace_id=r.workspace_id and order_id=r.order_id for update;
 if not found then raise exception 'Không tìm thấy yêu cầu';end if;
 h:=encode(sha256(convert_to(coalesce(message,''),'UTF8')),'hex');select content_hash into old from custom_care_supplement_receipts where warranty_id=cid and request_id=request;
 if found then if old<>h then raise exception 'Nội dung bổ sung đã khác' using errcode='PT409';end if;return read_custom_care(token);end if;
 if c.revision<>expected or c.state<>'info' then raise exception 'Yêu cầu đã được cập nhật; tải lại để đối chiếu' using errcode='PT409';end if;
 if length(trim(coalesce(message,''))) not between 1 and 2000 then raise exception 'Nhập thông tin bổ sung';end if;
 update custom_order_warranties set supplement=message,state='pending',revision=revision+1,updated_at=now() where id=cid;
 insert into custom_care_supplement_receipts values(cid,request,h);
 insert into custom_care_events(workspace_id,order_id,warranty_id,kind) values(r.workspace_id,r.order_id,cid,'supplement');return read_custom_care(token);
end $$;
create or replace function public.decide_custom_care(w uuid,cid uuid,expected integer,decision text,message text,part text default null,quantity integer default 1)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c custom_order_warranties%rowtype;source jsonb;pi jsonb;m jsonb;oid text;pid text;iid text;owner_id uuid;original jsonb;recipe record;maximum numeric;begin
 if not can_manage_custom_care(w) then raise exception 'Chỉ quản lý đơn được xử lý bảo hành' using errcode='42501';end if;
 select * into c from custom_order_warranties where workspace_id=w and id=cid for update;if not found then raise exception 'Không tìm thấy yêu cầu';end if;
 if c.revision<>expected then raise exception 'Yêu cầu đã được cập nhật; tải lại để đối chiếu' using errcode='PT409';end if;
 if decision='collected' then
  if custom_warranty_stage(c)<>'ready' then raise exception 'Hàng chưa sẵn sàng tại cửa hàng';end if;
  update custom_order_warranties set state='collected',collected_at=now(),revision=revision+1,updated_at=now(),decided_by=auth.uid() where id=cid;
  update orders set data=data||jsonb_build_object('status','done','warrantyCompletedAt',now()),updated_at=now() where workspace_id=w and id=c.job_id;
 elsif decision in ('info','declined','approved') and c.state='pending' then
  if length(trim(coalesce(message,''))) not between 1 and 2000 then raise exception 'Nhập phản hồi cho khách';end if;
  if decision='approved' then
   select data into original from orders where workspace_id=w and id=c.order_id for share;
   if original is null or original->>'status'='cancelled' then raise exception 'Đơn gốc không còn hợp lệ';end if;
   select x into source from jsonb_array_elements(original->'items') x where x->>'id'=c.line_id;
   select data into pi from plate_items where workspace_id=w and data->>'orderId'=c.order_id and data->>'orderItemId'=c.line_id and data->>'partId'=part order by id limit 1;
   if source is null or pi is null or source->>'modelId' is distinct from c.snapshot->>'modelId' or pi->>'modelId' is distinct from source->>'modelId' or not exists(select 1 from jsonb_array_elements(coalesce(c.snapshot->'partColors','[]')) x where x->>'partId'=part) then raise exception 'Đối chiếu đúng bộ phận của sản phẩm trước khi duyệt';end if;
   select data into m from models where workspace_id=w and id=source->>'modelId' and coalesce(data->>'deletedAt','')='';
   if m is null or not exists(select 1 from jsonb_array_elements(coalesce(m->'parts','[]')) x where x->>'id'=part) then raise exception 'Part nguồn đã thay đổi; cần đối chiếu thư viện';end if;
   select min(n) into maximum from (select sum((data->>'qty')::numeric) n from plate_items where workspace_id=w and data->>'orderId'=c.order_id and data->>'orderItemId'=c.line_id and data->>'partId'=part group by data->'filamentId',data->'filamentIds',data->'componentColors',data->'keyboardText',data->'customColorKey') recipes;
   if quantity is null or quantity<1 or quantity>least(9999,maximum) then raise exception 'Số lượng thay thế vượt bộ phận đã mua';end if;
   select owner_user_id into owner_id from workspaces where id=w;
   oid:='warranty-'||cid::text;pid:=gen_random_uuid()::text;iid:=gen_random_uuid()::text;
   insert into orders(id,user_id,workspace_id,data) values(oid,owner_id,w,jsonb_build_object('id',oid,'kind','warranty','warrantyRequestId',cid,'sourceOrderId',c.order_id,'priority',100,'status','processing','createdAt',now(),'note','Bảo hành · '||coalesce(original->'custom'->>'customer','')||' · '||c.reported_part,
    'items',jsonb_build_array(source||jsonb_build_object('id',iid,'partId',part,'qty',quantity,'note','Bảo hành · '||message))));
   for recipe in select jsonb_agg(data order by id)->0 template from plate_items where workspace_id=w and data->>'orderId'=c.order_id and data->>'orderItemId'=c.line_id and data->>'partId'=part group by data->'filamentId',data->'filamentIds',data->'componentColors',data->'keyboardText',data->'customColorKey' loop
    pi:=recipe.template;pid:=gen_random_uuid()::text;
   insert into plates(id,user_id,workspace_id,data) values(pid,owner_id,w,jsonb_build_object('id',pid,'name','Bảo hành · '||c.reported_part,'filamentId',pi->'filamentId','filamentIds',pi->'filamentIds','customColorKey',pi->'customColorKey','status','waiting','priority',100,'createdAt',now(),'warrantyRequestId',cid));
   insert into plate_items(id,user_id,workspace_id,data) select id,owner_id,w,pi||jsonb_build_object('id',id,'plateId',pid,'orderId',oid,'orderItemId',iid,'qty',quantity,'qtyDone',0,'warrantyRequestId',cid,'note','Bảo hành · '||message) from (select gen_random_uuid()::text id) ids;
   end loop;
   update custom_order_warranties set job_id=oid,part_id=part,approved_quantity=quantity,production_plan=(select jsonb_agg(distinct custom_care_recipe(data)) from plate_items where workspace_id=w and data->>'orderId'=oid),approved_part_name=coalesce(pi->>'partName',reported_part) where id=cid;
   insert into custom_care_zalo_outbox(workspace_id,warranty_id,stage) values(w,cid,'approved') on conflict do nothing;
  end if;
  update custom_order_warranties set state=decision,note=trim(message),revision=revision+1,updated_at=now(),decided_by=auth.uid() where id=cid;
 else raise exception 'Không thể chuyển trạng thái này' using errcode='PT409';end if;
 insert into custom_care_events(workspace_id,order_id,warranty_id,kind) values(w,c.order_id,cid,decision);
 select * into c from custom_order_warranties where id=cid;return custom_warranty_public(c);
end $$;
create or replace function public.custom_care_inbox(w uuid,off integer default 0,focus uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 if not can_custom_orders(w) then raise exception 'Không có quyền xem chăm sóc khách hàng' using errcode='42501';end if;
 return jsonb_build_object('total',(select count(*) from custom_order_warranties where workspace_id=w and (focus is null or id=focus)),
 'reviewTotal',(select count(*) from custom_order_reviews where workspace_id=w),
 'warranties',coalesce((select jsonb_agg(custom_warranty_public(c)||jsonb_build_object('orderId',c.order_id,'jobId',c.job_id,'customer',coalesce(o.data->'custom'->>'customer',c.snapshot->>'_customer'),'parts',c.snapshot->'partColors',
 'zalo',coalesce((select jsonb_agg(jsonb_build_object('stage',stage,'status',status,'errorCode',error_code)) from custom_care_zalo_outbox where warranty_id=c.id),'[]')) order by c.updated_at desc,c.id)
 from (select * from custom_order_warranties where workspace_id=w and (focus is null or id=focus) order by updated_at desc,id limit 40 offset greatest(0,least(off,100000))) c left join orders o on o.workspace_id=w and o.id=c.order_id),'[]'),
 'reviews',coalesce((select jsonb_agg(jsonb_build_object('orderId',r.order_id,'experience',r.experience,'quality',r.quality,'message',r.message,'createdAt',r.created_at)) from (select * from custom_order_reviews where workspace_id=w order by created_at desc,order_id limit 40 offset greatest(0,least(off,100000))) r),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'orderId',e.order_id,'warrantyId',e.warranty_id,'kind',e.kind,'createdAt',e.created_at)) from (select * from custom_care_events where workspace_id=w order by created_at desc limit 40) e),'[]'));
end $$;
-- Enqueue readiness only from real production/QC/store receipt data, once per request.
create or replace function public.sync_custom_care_readiness()
returns trigger language plpgsql security definer set search_path=public as $$declare w uuid;c custom_order_warranties%rowtype;begin
 w:=coalesce(new.workspace_id,old.workspace_id);
 if tg_table_name='settings' and (coalesce(new.id,old.id)<>'operations' or new.data->'values'->'deliveryBatches' is not distinct from old.data->'values'->'deliveryBatches') then return null;end if;
 for c in select * from custom_order_warranties where workspace_id=w and state='approved' and (
  (tg_table_name='orders' and job_id in (new.id,old.id)) or
  (tg_table_name='plate_items' and job_id in (new.data->>'orderId',old.data->>'orderId')) or
  (tg_table_name='plates' and exists(select 1 from plate_items where workspace_id=w and data->>'orderId'=job_id and data->>'plateId' in (new.id,old.id))) or tg_table_name='settings') loop
  if custom_warranty_stage(c)='ready' then
   insert into custom_care_zalo_outbox(workspace_id,warranty_id,stage) values(w,c.id,'ready') on conflict do nothing;
  end if;
 end loop;return null;
end $$;
create trigger care_production_items after insert or update or delete on plate_items for each row execute function sync_custom_care_readiness();
create trigger care_production_plates after update on plates for each row execute function sync_custom_care_readiness();
create trigger care_production_orders after update on orders for each row execute function sync_custom_care_readiness();
create trigger care_production_receipts after insert or update on settings for each row execute function sync_custom_care_readiness();
-- Explicit function ACLs: public mutations are reachable only by service-role Edge code.
revoke all on function can_manage_custom_care(uuid),custom_care_scope(text),custom_warranty_stage(custom_order_warranties),custom_warranty_public(custom_order_warranties),read_custom_care(text),reserve_custom_care_upload(text,uuid,jsonb),submit_custom_care(text,uuid,jsonb),supplement_custom_care(text,uuid,uuid,integer,text),decide_custom_care(uuid,uuid,integer,text,text,text,integer),custom_care_inbox(uuid,integer,uuid),sync_custom_care_readiness() from public,anon,authenticated;
grant execute on function can_manage_custom_care(uuid),decide_custom_care(uuid,uuid,integer,text,text,text,integer),custom_care_inbox(uuid,integer,uuid) to authenticated;
grant execute on function read_custom_care(text),reserve_custom_care_upload(text,uuid,jsonb),submit_custom_care(text,uuid,jsonb),supplement_custom_care(text,uuid,uuid,integer,text) to service_role;

create table public.custom_care_event_reads(event_id uuid not null references custom_care_events(id) on delete cascade,user_id uuid not null,created_at timestamptz not null default now(),primary key(event_id,user_id));
alter table custom_care_event_reads enable row level security;
revoke all on custom_care_event_reads from public,anon,authenticated;
grant all on custom_care_event_reads to service_role;
create or replace function public.custom_care_notifications(w uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 if not can_manage_custom_care(w) then raise exception 'Không có quyền xem thông báo bảo hành' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id','care:'||e.id,'careId',e.warranty_id,'orderId',e.order_id,'type','custom_care','kind',e.kind,'createdAt',e.created_at,
 'readAt',(select created_at from custom_care_event_reads where event_id=e.id and user_id=auth.uid()),'permissions',jsonb_build_array('orders.manage')))
 from (select * from custom_care_events where workspace_id=w order by created_at desc,id limit 100) e),'[]');
end $$;
create or replace function public.mark_custom_care_read(w uuid,ids uuid[])
returns void language plpgsql security definer set search_path=public as $$begin
 if not can_manage_custom_care(w) then raise exception 'Không có quyền xem thông báo bảo hành' using errcode='42501';end if;
 insert into custom_care_event_reads(event_id,user_id) select id,auth.uid() from custom_care_events where workspace_id=w and id=any(ids) on conflict do nothing;
end $$;
revoke all on function custom_care_notifications(uuid),mark_custom_care_read(uuid,uuid[]) from public,anon;
grant execute on function custom_care_notifications(uuid),mark_custom_care_read(uuid,uuid[]) to authenticated;

create or replace function public.claim_custom_care_zalo(w uuid,configured boolean)
returns jsonb language plpgsql security definer set search_path=public as $$declare item custom_care_zalo_outbox%rowtype;result jsonb:='[]';c custom_order_warranties%rowtype;begin
 -- An expired in-flight attempt is uncertain, never silently sent twice.
 update custom_care_zalo_outbox set status='unknown',error_code='lease_expired' where workspace_id=w and status='sending' and claimed_at<now()-interval '5 minutes';
 if not configured then
  update custom_care_zalo_outbox set status='blocked',error_code='not_configured' where workspace_id=w and status='pending';return result;
 end if;
 update custom_care_zalo_outbox set status='pending',error_code=null where workspace_id=w and status='blocked' and error_code='not_configured';
 for item in select * from custom_care_zalo_outbox where workspace_id=w and status='pending' and attempts<5 and next_attempt_at<=now() order by created_at,id limit 10 for update skip locked loop
  select * into c from custom_order_warranties where id=item.warranty_id;
  if c.state<>'approved' or (item.stage='ready' and custom_warranty_stage(c)<>'ready') or (item.stage='approved' and custom_warranty_stage(c)<>'approved') then
   update custom_care_zalo_outbox set status='blocked',error_code='stage_changed' where id=item.id;continue;
  end if;
  update custom_care_zalo_outbox set status='sending',attempts=attempts+1,claimed_at=now() where id=item.id;
  result:=result||jsonb_build_array(jsonb_build_object('id',item.id,'warrantyId',c.id,'stage',item.stage,'phone',(select data->'custom'->>'phone' from orders where workspace_id=w and id=c.order_id),'orderId',c.order_id,
   'token',(select token_value from custom_order_receipts where workspace_id=w and order_id=c.order_id)));
 end loop;return result;
end $$;
create or replace function public.finish_custom_care_zalo(oid uuid,outcome text,provider text default null,reason text default null)
returns void language plpgsql security definer set search_path=public as $$begin
 if outcome not in ('sent','pending','failed','unknown','blocked') then raise exception 'Invalid outcome';end if;
 update custom_care_zalo_outbox set status=case when outcome='pending' and attempts>=5 then 'failed' else outcome end,
 provider_id=left(provider,180),error_code=left(reason,80),next_attempt_at=now()+interval '5 minutes'*greatest(1,attempts)
 where id=oid and status='sending';
end $$;
revoke all on function claim_custom_care_zalo(uuid,boolean),finish_custom_care_zalo(uuid,text,text,text) from public,anon,authenticated;
grant execute on function claim_custom_care_zalo(uuid,boolean),finish_custom_care_zalo(uuid,text,text,text) to service_role;


-- Ordinary native snapshots cannot reopen a customer-collected warranty job.
create or replace function public.guard_custom_care_job_snapshot()
returns trigger language plpgsql security definer set search_path=public as $$declare c custom_order_warranties%rowtype;begin
 select * into c from custom_order_warranties where workspace_id=new.workspace_id and job_id=new.id;
 if found then
  new.data:=new.data||jsonb_build_object('kind','warranty','warrantyRequestId',c.id,'sourceOrderId',c.order_id);
  if c.state='collected' then new.data:=new.data||jsonb_build_object('status','done','warrantyCompletedAt',c.collected_at);
  else new.data:=new.data-'warrantyCompletedAt';end if;
 end if;return new;
end $$;
revoke all on function guard_custom_care_job_snapshot() from public,anon,authenticated;
create trigger care_job_server_receipt before insert or update of data on orders for each row execute function guard_custom_care_job_snapshot();
