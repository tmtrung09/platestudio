-- New store_custom role only. Existing roles/permissions and existing policies are
-- preserved. Its counter reads/writes use validated RPCs, never raw workshop data.
create or replace function public.can_custom_orders(w uuid,writing boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false) and
 (public.is_workspace_owner(w) or exists(select 1 from workspace_members m where m.workspace_id=w and m.user_id=auth.uid() and
 (m.permissions ? 'orders.manage' or m.permissions ? 'custom_orders.create' or (not writing and m.permissions ? 'custom_orders.view'))));
$$;
create or replace function public.is_custom_counter_account(w uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select not public.is_workspace_owner(w) and exists(select 1 from workspace_members m
 where m.workspace_id=w and m.user_id=auth.uid() and (m.role='store_custom' or
 (m.permissions ?| array['custom_orders.create','custom_orders.view'] and
 not m.permissions ?| array['models.manage','plates.plan','progress.view','orders.manage','projects.manage','batches.report','batches.describe','batches.manage','assembly.qc','delivery.create','delivery.receive','kiot.import','packaging.manage','devices.manage','activity.view','trash.manage','data.manage','access.manage'])));
$$;
revoke all on function public.can_custom_orders(uuid,boolean),public.is_custom_counter_account(uuid) from public,anon;
grant execute on function public.can_custom_orders(uuid,boolean),public.is_custom_counter_account(uuid) to authenticated;
-- Additive guard applies only to the new store_custom role or NEW custom-only
-- permission keys; legacy permission sets contain neither of these new keys.
-- No existing account role is changed, no legacy policy is removed or weakened.
do $$ declare t text; begin
 foreach t in array array['models','filaments','projects','orders','plates','plate_items','settings','batch_reports'] loop
  execute format('create policy custom_counter_guard on public.%I as restrictive for all to authenticated using (not public.is_custom_counter_account(workspace_id)) with check (not public.is_custom_counter_account(workspace_id))',t);
 end loop;
end $$;
create table public.custom_order_receipts(
 workspace_id uuid not null references workspaces(id) on delete cascade,request_id uuid not null,order_id text not null,
 created_by uuid not null references auth.users(id),payload_hash text not null,token_hash text not null unique,token_value text not null,
 customer_completed_at timestamptz,customer_completed_by uuid,created_at timestamptz not null default now(),
 primary key(workspace_id,request_id),unique(workspace_id,order_id));
alter table custom_order_receipts enable row level security;
revoke all on custom_order_receipts from public,anon,authenticated;
grant all on custom_order_receipts to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('custom-order-media','custom-order-media',false,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy custom_order_media_read on storage.objects for select to authenticated
 using(case when bucket_id='custom-order-media' then public.can_custom_orders(((storage.foldername(name))[1])::uuid,false) else false end);
create policy custom_order_media_insert on storage.objects for insert to authenticated
 with check(case when bucket_id='custom-order-media' then (storage.foldername(name))[2]=auth.uid()::text and public.can_custom_orders(((storage.foldername(name))[1])::uuid,true) else false end);
-- No update/delete policy. Retrying immutable uploads cannot destroy historical media.
create or replace function public.custom_order_search_text(s text)
returns text language sql immutable as $$select lower(translate(coalesce(s,''),
 'àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ',
 'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydAAAAAAAAAAAAAAAAAEEEEEEEEEEEIIIIIOOOOOOOOOOOOOOOOOUUUUUUUUUUUYYYYYD'))$$;
create or replace function public.custom_order_catalog(w uuid,q text default '',off integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$declare result jsonb;begin
 if not public.can_custom_orders(w) then raise exception 'Không có quyền nhận đơn custom' using errcode='42501';end if;
 with mapping as (select coalesce(data->'values'->'mappings','[]') rows from settings where workspace_id=w and id='kiotviet'),
 source as (select m.id,m.data,m.updated_at,coalesce((select string_agg(x->>'sku',' ') from mapping,jsonb_array_elements(rows) x where x->>'modelId'=m.id or exists(select 1 from jsonb_array_elements(coalesce(x->'components','[]')) c where c->>'modelId'=m.id)),'') sku from models m where m.workspace_id=w and coalesce(m.data->>'deletedAt','')=''),
 matched as (select * from source where public.custom_order_search_text(coalesce(data->>'name','')||' '||sku||' '||coalesce(data->'variants','[]')::text||' '||coalesce(data->'parts','[]')::text) like '%'||public.custom_order_search_text(left(q,200))||'%'),
 page as (select * from matched order by lower(data->>'name'),id limit 60 offset greatest(0,least(off,100000)))
 select jsonb_build_object('total',(select count(*) from matched),'models',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',data->>'name','sku',sku,'images',coalesce(data->'images','[]'),'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v->>'id','name',v->>'name')||case when v ? 'partIds' then jsonb_build_object('partIds',v->'partIds') else '{}'::jsonb end) from jsonb_array_elements(coalesce(data->'variants','[]')) v),'[]'),'parts',coalesce((select jsonb_agg(jsonb_build_object('id',part->>'id','name',part->>'name','qtyPerModel',part->'qtyPerModel')) from jsonb_array_elements(coalesce(data->'parts','[]')) part),'[]'),'revision',updated_at)),'[]')) into result from page;
 return result;end $$;
create or replace function public.custom_order_filaments(w uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 if not public.can_custom_orders(w) then raise exception 'Không có quyền nhận đơn custom' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',data->>'name','brand',data->>'brand','hex',data->>'hex','mat',data->>'mat') order by data->>'name') from filaments where workspace_id=w),'[]');end $$;
create or replace function public.custom_order_projection(w uuid,oid text,public_view boolean default false)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare o jsonb;c jsonb;it jsonb;h jsonb;ops jsonb;safe_lines jsonb;r custom_order_receipts%rowtype;stage integer:=0;all_printed boolean:=true;all_assembled boolean:=true;all_received boolean:=true;started boolean;n integer;done integer;received numeric;ready numeric;
begin
 select data into o from orders where workspace_id=w and id=oid;
 if o is null or o->>'kind'<>'custom' then return null;end if;
 select * into r from custom_order_receipts where workspace_id=w and order_id=oid;if not found then return null;end if;
 c:=o->'custom';select coalesce(data->'values','{}') into ops from settings where workspace_id=w and id='operations';ops:=coalesce(ops,'{}');
 -- Core orders remain editable by workshop managers. Revalidate media scope on
 -- every read before the public Edge Function may sign a mutable reference.
 select coalesce(jsonb_agg(jsonb_set(line,'{images}',coalesce((select jsonb_agg(image) from jsonb_array_elements(coalesce(line->'images','[]')) image
 where image->>'path' ~ ('^'||w::text||'/[a-f0-9-]{36}/[a-f0-9-]{36}/[A-Za-z0-9._-]+\.(jpg|png|webp)$') and position('..' in image->>'path')=0),'[]'))),'[]') into safe_lines from jsonb_array_elements(c->'lines') line;
 for it in select value from jsonb_array_elements(o->'items') loop
  select count(*),count(*) filter(where coalesce((data->>'qtyDone')::numeric,0)>=coalesce((data->>'qty')::numeric,0)),bool_or(coalesce((data->>'qtyDone')::numeric,0)>0) into n,done,started from plate_items where workspace_id=w and data->>'orderId'=oid and data->>'orderItemId'=it->>'id';
  if n=0 or done<n then all_printed:=false;end if;
  if coalesce(started,false) or exists(select 1 from plate_items pi join plates pl on pl.workspace_id=pi.workspace_id and pl.id=pi.data->>'plateId' where pi.workspace_id=w and pi.data->>'orderId'=oid and pi.data->>'orderItemId'=it->>'id' and pl.data->>'status'='printing') then stage:=greatest(stage,1);end if;
  h:=coalesce(o->'assembly'->'handovers'->(it->>'id'),'{}');if coalesce(h->>'handedAt','')<>'' then stage:=greatest(stage,2);end if;
  ready:=greatest(coalesce((o->'assembly'->'items'->>(it->>'id'))::numeric,0),coalesce((h->>'readyQty')::numeric,0));
  if ready<coalesce((it->>'qty')::numeric,1) or coalesce(h->>'qcStatus','')<>'accepted' then all_assembled:=false;end if;
  select coalesce(sum(coalesce((x->>'receivedQty')::numeric,0)),0) into received from jsonb_array_elements(coalesce(ops->'deliveryBatches','[]')) d,jsonb_array_elements(coalesce(d->'items','[]')) x where d->>'status' in ('received','partial_received') and x->>'orderId'=oid and x->>'itemId'=it->>'id';
  if received<coalesce((it->>'qty')::numeric,1) then all_received:=false;end if;
 end loop;
 if all_printed then stage:=greatest(stage,2);end if;
 if all_assembled and (c->>'delivery'='delivery' or all_received) then stage:=3;end if;
 if r.customer_completed_at is not null then stage:=4;end if;
 return jsonb_build_object('id',oid,'customer',c->>'customer','delivery',c->>'delivery','total',c->'total','deposit',c->'deposit','due',o->>'deliveryDate','created',to_char((o->>'createdAt')::timestamptz at time zone 'Asia/Bangkok','YYYY-MM-DD'),'stage',stage,'cancelled',o->>'status'='cancelled','lines',safe_lines,'completedAt',r.customer_completed_at)
 ||case when public_view then '{}'::jsonb else jsonb_build_object('phone',c->>'phone','address',c->>'address','creator',c->>'creator') end;end $$;
revoke all on function custom_order_projection(uuid,text,boolean) from public,anon,authenticated;
create or replace function public.custom_order_list(w uuid,off integer default 0,q text default '')
returns jsonb language plpgsql stable security definer set search_path=public as $$declare result jsonb;begin
 if not can_custom_orders(w) then raise exception 'Không có quyền xem đơn custom' using errcode='42501';end if;
 with matched as (select id,data from orders where workspace_id=w and data->>'kind'='custom' and custom_order_search_text(id||' '||coalesce(data->'custom'->>'customer','')||' '||coalesce(data->'custom'->'lines','[]')::text) like '%'||custom_order_search_text(left(q,200))||'%'),
 page as (select id,(data->>'createdAt')::timestamptz created_at from matched order by (data->>'createdAt')::timestamptz desc,id limit 60 offset greatest(0,least(off,100000)))
 select jsonb_build_object('total',(select count(*) from matched),'orders',coalesce(jsonb_agg(custom_order_projection(w,id,false) order by created_at desc,id),'[]')) into result from page;return result;end $$;
create or replace function public.custom_order_tracking(w uuid,oid text)
returns text language plpgsql stable security definer set search_path=public as $$begin
 if not can_custom_orders(w) then raise exception 'Không có quyền xem đơn custom' using errcode='42501';end if;
 return (select token_value from custom_order_receipts r join orders o on o.workspace_id=r.workspace_id and o.id=r.order_id where r.workspace_id=w and r.order_id=oid and o.data->>'status'<>'cancelled');end $$;
create or replace function public.read_custom_order_public(token text)
returns jsonb language plpgsql stable security definer set search_path=public as $$declare r custom_order_receipts%rowtype;begin
 if token !~ '^[a-f0-9]{64}$' then return null;end if;
 select * into r from custom_order_receipts where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');if not found then return null;end if;
 return custom_order_projection(r.workspace_id,r.order_id,true);end $$;
revoke all on function read_custom_order_public(text) from public,anon,authenticated;
grant execute on function read_custom_order_public(text) to service_role;
create or replace function public.commit_custom_order(w uuid,request uuid,p jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r custom_order_receipts%rowtype;fingerprint text;owner_id uuid;actor text;oid text;token text;line jsonb;m jsonb;v jsonb;part jsonb;fil jsonb;ref jsonb;items jsonb:='[]';lines jsonb:='[]';colors jsonb;part_colors jsonb;media jsonb;iid text;pid text;qty integer;part_qty integer;fid text;stamp timestamptz:=now();total numeric;deposit numeric;path text;order_data jsonb;
begin
 if not can_custom_orders(w,true) then raise exception 'Không có quyền tạo đơn custom' using errcode='42501';end if;
 if request is null then raise exception 'Thiếu mã yêu cầu';end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text||request::text,0));fingerprint:=encode(sha256(convert_to(p::text,'UTF8')),'hex');
 select * into r from custom_order_receipts where workspace_id=w and request_id=request;
 if found then
  if r.payload_hash<>fingerprint or r.created_by<>auth.uid() then raise exception 'Yêu cầu đã có nội dung khác' using errcode='40001';end if;
  return jsonb_build_object('order',custom_order_projection(w,r.order_id,false),'token',r.token_value);end if;
 if jsonb_typeof(p->'lines') is distinct from 'array' or jsonb_array_length(p->'lines') not between 1 and 30 then raise exception 'Chọn từ 1 đến 30 dòng sản phẩm';end if;
 if length(trim(coalesce(p->>'customer','')))=0 or length(p->>'customer')>120 or regexp_replace(coalesce(p->>'phone',''),'[^0-9]','','g') !~ '^[0-9]{8,15}$' then raise exception 'Kiểm tra tên và số điện thoại khách';end if;
 if coalesce(p->>'delivery','') not in ('pickup','delivery') or (p->>'delivery'='delivery' and trim(coalesce(p->>'address',''))='') or length(coalesce(p->>'address',''))>1000 then raise exception 'Kiểm tra hình thức và địa chỉ nhận';end if;
 if coalesce(p->>'total','') !~ '^[0-9]{1,9}$' or coalesce(p->>'deposit','') !~ '^[0-9]{1,9}$' then raise exception 'Số tiền không hợp lệ';end if;
 total:=(p->>'total')::numeric;deposit:=(p->>'deposit')::numeric;if deposit>total then raise exception 'Cọc không được vượt tổng tiền';end if;
 if coalesce(p->>'due','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Thiếu ngày hẹn';end if;perform (p->>'due')::date;
 select owner_user_id into owner_id from workspaces where id=w;select coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(email,'@',1),'Nhân viên') into actor from auth.users where id=auth.uid();
 oid:='custom-'||request::text;token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 for line in select value from jsonb_array_elements(p->'lines') loop
  select data into m from models where workspace_id=w and id=line->>'modelId' and coalesce(data->>'deletedAt','')='' for share;if m is null then raise exception 'Model không còn tồn tại; kiểm tra lại đơn';end if;
  if line->>'modelRevision' is null or not exists(select 1 from models where workspace_id=w and id=line->>'modelId' and updated_at=(line->>'modelRevision')::timestamptz) then raise exception 'Model đã thay đổi; chọn lại model trước khi gửi' using errcode='40001';end if;
  v:=null;if jsonb_array_length(coalesce(m->'variants','[]'))>0 then select value into v from jsonb_array_elements(m->'variants') where value->>'id'=line->>'variantId';if v is null then raise exception 'Cần chọn đúng biến thể';end if;end if;
  if coalesce(line->>'qty','') !~ '^[0-9]{1,4}$' or (line->>'qty')::integer<1 then raise exception 'Số lượng từ 1 đến 9999';end if;
  if trim(coalesce(line->>'note',''))='' or length(line->>'note')>4000 then raise exception 'Ghi yêu cầu custom cho từng sản phẩm';end if;
  qty:=(line->>'qty')::integer;iid:=gen_random_uuid()::text;colors:='{}';part_colors:='[]';media:='[]';
  if jsonb_typeof(coalesce(line->'images','[]'))<>'array' or jsonb_array_length(coalesce(line->'images','[]'))>4 then raise exception 'Tối đa 4 ảnh tham khảo mỗi dòng';end if;
  for ref in select value from jsonb_array_elements(coalesce(line->'images','[]')) loop
   path:=ref->>'path';if path is null or path not like w::text||'/'||auth.uid()::text||'/'||request::text||'/%' or position('..' in path)>0 or not exists(select 1 from storage.objects where bucket_id='custom-order-media' and name=path) then raise exception 'Ảnh tham khảo chưa được lưu đầy đủ';end if;
   media:=media||jsonb_build_array(jsonb_build_object('path',path,'name',left(ref->>'name',180)));end loop;
  for part in select value from jsonb_array_elements(coalesce(m->'parts','[]')) where v is null or jsonb_typeof(v->'partIds') is distinct from 'array' or v->'partIds' ? (value->>'id') loop
   fid:=line->'colorChoices'->>(part->>'id');select data into fil from filaments where workspace_id=w and id=fid;if fil is null then raise exception 'Chọn màu khách yêu cầu cho từng part';end if;
   colors:=colors||jsonb_build_object(part->>'id',fid);part_colors:=part_colors||jsonb_build_array(jsonb_build_object('partId',part->>'id','partName',part->>'name','filamentId',fid,'name',fil->>'name','brand',fil->>'brand','hex',fil->>'hex','mat',fil->>'mat'));
   part_qty:=greatest(1,coalesce((part->>'qtyPerModel')::integer,1))*qty;
   select id into pid from plates where workspace_id=w and data->>'customRequestId'=request::text and data->>'filamentId'=fid;
   if pid is null then pid:=gen_random_uuid()::text;insert into plates(id,user_id,workspace_id,data,updated_at) values(pid,owner_id,w,jsonb_build_object('id',pid,'name','Custom · '||left(trim(p->>'customer'),60),'filamentId',fid,'projectId',null,'status','waiting','priority',100,'note','Đơn custom ưu tiên','customRequestId',request,'createdAt',stamp),stamp);end if;
   insert into plate_items(id,user_id,workspace_id,data,updated_at) select pi,owner_id,w,jsonb_build_object('id',pi,'plateId',pid,'partId',part->>'id','orderId',oid,'orderItemId',iid,'modelId',line->>'modelId','modelName',m->>'name','partName',part->>'name','variantId',v->>'id','variantName',v->>'name','filamentId',fid,'qty',part_qty,'qtyDone',0,'note',line->>'note','priority',100),stamp from (select gen_random_uuid()::text pi) x;
  end loop;
  items:=items||jsonb_build_array(jsonb_build_object('id',iid,'modelId',line->>'modelId','modelName',m->>'name','qty',qty,'partId',null,'variantId',v->>'id','variantName',v->>'name','note',line->>'note','colorChoices',colors));
  lines:=lines||jsonb_build_array(jsonb_build_object('id',iid,'modelId',line->>'modelId','variantId',v->>'id','variantName',v->>'name','qty',qty,'note',line->>'note','images',media,'colorChoices',colors,'partColors',part_colors,'model',jsonb_build_object('id',line->>'modelId','name',m->>'name','images',coalesce(m->'images','[]'),'variants',case when v is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id',v->>'id','name',v->>'name')) end)));
 end loop;
 order_data:=jsonb_build_object('id',oid,'kind','custom','priority',100,'projectId',null,'note','Custom · '||trim(p->>'customer'),'deliveryDate',p->>'due','orderedBy',actor,'orderedByUserId',auth.uid(),'status','processing','createdAt',stamp,'items',items,'custom',jsonb_build_object('customer',trim(p->>'customer'),'phone',trim(p->>'phone'),'delivery',p->>'delivery','address',case when p->>'delivery'='delivery' then p->>'address' else '' end,'total',total,'deposit',deposit,'creator',actor,'lines',lines));
 insert into orders(id,user_id,workspace_id,data,updated_at) values(oid,owner_id,w,order_data,stamp);
 insert into custom_order_receipts(workspace_id,request_id,order_id,created_by,payload_hash,token_hash,token_value) values(w,request,oid,auth.uid(),fingerprint,encode(sha256(convert_to(token,'UTF8')),'hex'),token);
 return jsonb_build_object('order',custom_order_projection(w,oid,false),'token',token);end $$;
create or replace function public.complete_custom_order(w uuid,oid text)
returns jsonb language plpgsql security definer set search_path=public as $$declare result jsonb;begin
 if not (public.is_workspace_owner(w) or exists(select 1 from workspace_members where workspace_id=w and user_id=auth.uid() and permissions ? 'orders.manage' and role<>'store_custom')) then raise exception 'Chỉ quản lý đơn được xác nhận khách nhận hàng' using errcode='42501';end if;
 result:=custom_order_projection(w,oid,false);if result is null or (result->>'cancelled')::boolean or (result->>'stage')::integer<3 then raise exception 'Đơn chưa sẵn sàng giao khách';end if;
 update custom_order_receipts set customer_completed_at=coalesce(customer_completed_at,now()),customer_completed_by=coalesce(customer_completed_by,auth.uid()) where workspace_id=w and order_id=oid;return custom_order_projection(w,oid,false);end $$;
revoke all on function custom_order_catalog(uuid,text,integer),custom_order_filaments(uuid),custom_order_list(uuid,integer,text),custom_order_tracking(uuid,text),commit_custom_order(uuid,uuid,jsonb),complete_custom_order(uuid,text) from public,anon;
grant execute on function custom_order_catalog(uuid,text,integer),custom_order_filaments(uuid),custom_order_list(uuid,integer,text),custom_order_tracking(uuid,text),commit_custom_order(uuid,uuid,jsonb),complete_custom_order(uuid,text) to authenticated;

create or replace function public.custom_order_get(w uuid,oid text)
returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 if not can_custom_orders(w) then raise exception 'Không có quyền xem đơn custom' using errcode='42501';end if;
 return custom_order_projection(w,oid,false);end $$;
revoke all on function custom_order_get(uuid,text) from public,anon;
grant execute on function custom_order_get(uuid,text) to authenticated;
