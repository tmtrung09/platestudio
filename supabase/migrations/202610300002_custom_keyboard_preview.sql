-- Bind the explicitly requested model/part names to their real IDs. Never add
-- synthetic parts: the button and its character remain one production part.
create or replace function public.custom_order_keyboard_profile(m jsonb,v jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare tray jsonb;keys_part jsonb;tray_ids jsonb;key_ids jsonb;n integer;begin
 if trim(public.custom_order_search_text(m->>'name'))<>'ban phim ten' then return null;end if;
 select count(*),min(value::text)::jsonb into n,tray from jsonb_array_elements(coalesce(m->'parts','[]'))
 where trim(public.custom_order_search_text(value->>'name')) in ('khay','khay ban phim')
 and (v is null or jsonb_typeof(v->'partIds') is distinct from 'array' or v->'partIds' ? (value->>'id'));
 if n<>1 then return null;end if;
 select count(*),min(value::text)::jsonb into n,keys_part from jsonb_array_elements(coalesce(m->'parts','[]'))
 where regexp_replace(public.custom_order_search_text(value->>'name'),'[[:space:]]','','g')='nut+kytu'
 and (v is null or jsonb_typeof(v->'partIds') is distinct from 'array' or v->'partIds' ? (value->>'id'));
 if n<>1 or tray->>'id'=keys_part->>'id' then return null;end if;
 tray_ids:=public.custom_order_original_color_ids(v,tray);key_ids:=public.custom_order_original_color_ids(v,keys_part);
 return jsonb_build_object('version',1,'partIds',jsonb_build_object('tray',tray->>'id','keys',keys_part->>'id'),
  'sourceColorIds',jsonb_build_object('tray',tray_ids,'keys',key_ids),
  'defaults',jsonb_build_object('tray',case when jsonb_array_length(tray_ids)=1 then tray_ids->>0 else null end,
   'buttons',coalesce(nullif(keys_part->'componentColors'->>'buttons',''),case when jsonb_array_length(key_ids)=1 then key_ids->>0 else null end),
   'characters',coalesce(nullif(keys_part->'componentColors'->>'characters',''),case when jsonb_array_length(key_ids)=1 then key_ids->>0 else null end)));
end $$;
revoke all on function public.custom_order_keyboard_profile(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.custom_order_keyboard_snapshot(w uuid,m jsonb,v jsonb,k jsonb)
returns jsonb language plpgsql stable set search_path=public as $$
declare profile jsonb;roles jsonb:='{}';choices jsonb:='{}';components jsonb:='{}';role text;fid text;fil jsonb;tray_ids jsonb;key_ids jsonb;component_colors jsonb;color_keys jsonb:='{}';source_label text;source_ids jsonb;begin
 if k is null or k='null'::jsonb then return null;end if;
 profile:=public.custom_order_keyboard_profile(m,v);
 if profile is null then raise exception 'Sản phẩm hoặc biến thể không hỗ trợ bàn phím tên';end if;
 if jsonb_typeof(k)<>'object' or k->>'version' is distinct from '1' or k->'partIds' is distinct from profile->'partIds'
  or jsonb_typeof(k->'text') is distinct from 'string' or length(trim(k->>'text')) not between 1 and 120
  or jsonb_typeof(coalesce(k->'colors','{}'))<>'object' then raise exception 'Kiểm tra ký tự và cấu hình bàn phím';end if;
 if exists(select 1 from jsonb_object_keys(coalesce(k->'colors','{}')) x where x not in ('tray','buttons','characters')) then raise exception 'Vùng màu bàn phím không hợp lệ';end if;
 foreach role in array array['tray','buttons','characters'] loop
  fid:=nullif(k->'colors'->>role,'');if fid is not null then choices:=choices||jsonb_build_object(role,fid);end if;
  fid:=coalesce(fid,profile->'defaults'->>role);fil:=null;
  if fid is not null then
   select data into fil from filaments where workspace_id=w and id=fid;
   if fil is null then raise exception 'Màu bàn phím không còn trong thư viện';end if;
  end if;
  roles:=roles||jsonb_build_object(role,fid);
  source_label:=null;source_ids:=profile->'sourceColorIds'->(case when role='tray' then 'tray' else 'keys' end);
  if fid is null and jsonb_array_length(source_ids)>1 then
   select 'Màu gốc: '||string_agg(f.data->>'name',' + ' order by x.ord) into source_label from jsonb_array_elements_text(source_ids) with ordinality x(id,ord) join filaments f on f.workspace_id=w and f.id=x.id;
  end if;
  components:=components||jsonb_build_object(role,jsonb_build_object('filamentId',fid,'name',coalesce(fil->>'name',source_label),'brand',fil->>'brand','hex',fil->>'hex','mat',fil->>'mat'));
 end loop;
 if (choices ? 'buttons' or choices ? 'characters') and jsonb_array_length(profile->'sourceColorIds'->'keys')>1
  and (roles->>'buttons' is null or roles->>'characters' is null) then raise exception 'Chọn đủ màu nút và ký tự của part in chung';end if;
 tray_ids:=case when roles->>'tray' is null then profile->'sourceColorIds'->'tray' else jsonb_build_array(roles->>'tray') end;
 if roles->>'buttons' is null and roles->>'characters' is null then key_ids:=profile->'sourceColorIds'->'keys';
 else select coalesce(jsonb_agg(distinct id order by id),'[]') into key_ids from jsonb_array_elements_text(jsonb_build_array(roles->>'buttons',roles->>'characters')) id where id is not null;end if;
 -- Unmapped source colors still need the same workspace validation as explicit choices.
 for fid in select value from jsonb_array_elements_text(tray_ids||key_ids) loop
  if not exists(select 1 from filaments where workspace_id=w and id=fid) then raise exception 'Màu gốc của bàn phím không còn trong thư viện';end if;
 end loop;
 component_colors:=jsonb_build_object('tray',components->'tray');
 color_keys:=jsonb_build_object('tray','keyboard:'||encode(sha256(convert_to(component_colors::text||tray_ids::text,'UTF8')),'hex'));
 component_colors:=jsonb_build_object('buttons',components->'buttons','characters',components->'characters');
 color_keys:=color_keys||jsonb_build_object('keys','keyboard:'||encode(sha256(convert_to(component_colors::text||key_ids::text,'UTF8')),'hex'));
 return jsonb_build_object('version',1,'text',trim(k->>'text'),'partIds',profile->'partIds','colors',roles,'colorChoices',choices,'components',components,'trayFilamentIds',tray_ids,'keyFilamentIds',key_ids,'colorKeys',color_keys);
end $$;
revoke all on function public.custom_order_keyboard_snapshot(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.custom_order_catalog(w uuid,q text default '',off integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public as $$declare result jsonb;begin
 if not public.can_custom_orders(w) then raise exception 'Không có quyền nhận đơn custom' using errcode='42501';end if;
 with mapping as (select coalesce(data->'values'->'mappings','[]') rows from settings where workspace_id=w and id='kiotviet'),
 source as (select m.id,m.data,m.updated_at,coalesce((select string_agg(x->>'sku',' ') from mapping,jsonb_array_elements(rows) x where x->>'modelId'=m.id or exists(select 1 from jsonb_array_elements(coalesce(x->'components','[]')) c where c->>'modelId'=m.id)),'') sku from models m where m.workspace_id=w and coalesce(m.data->>'deletedAt','')=''),
 matched as (select * from source where public.custom_order_search_text(coalesce(data->>'name','')||' '||sku||' '||coalesce(data->'variants','[]')::text||' '||coalesce(data->'parts','[]')::text) like '%'||public.custom_order_search_text(left(q,200))||'%'),
 page as (select * from matched order by lower(data->>'name'),id limit 60 offset greatest(0,least(off,100000)))
 select jsonb_build_object('total',(select count(*) from matched),'models',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',data->>'name','sku',sku,'images',coalesce(data->'images','[]'),'variants',coalesce((select jsonb_agg(jsonb_build_object('id',v->>'id','name',v->>'name','partColors',v->'partColors','keyboardProfile',public.custom_order_keyboard_profile(data,v))||case when v ? 'partIds' then jsonb_build_object('partIds',v->'partIds') else '{}'::jsonb end) from jsonb_array_elements(coalesce(data->'variants','[]')) v),'[]'),'parts',coalesce((select jsonb_agg(jsonb_build_object('id',part->>'id','name',part->>'name','qtyPerModel',part->'qtyPerModel','filamentIds',part->'filamentIds','filamentId',part->'filamentId')) from jsonb_array_elements(coalesce(data->'parts','[]')) part),'[]'),'keyboardProfile',public.custom_order_keyboard_profile(data,null),'revision',updated_at)),'[]')) into result from page;
 return result;end $$;


create or replace function public.commit_custom_order(w uuid,request uuid,p jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r custom_order_receipts%rowtype;fingerprint text;owner_id uuid;actor text;oid text;token text;line jsonb;m jsonb;v jsonb;part jsonb;fil jsonb;ref jsonb;items jsonb:='[]';lines jsonb:='[]';colors jsonb;part_colors jsonb;color_ids jsonb;keyboard jsonb;component_colors jsonb;part_filaments jsonb;part_color_key text;plan_note text;role text;role_fil jsonb;role_name text;media jsonb;iid text;pid text;qty integer;part_qty integer;fid text;stamp timestamptz:=now();total numeric;deposit numeric;path text;order_data jsonb;
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
  keyboard:=public.custom_order_keyboard_snapshot(w,m,v,line->'keyboard');
  if jsonb_typeof(coalesce(line->'images','[]'))<>'array' or jsonb_array_length(coalesce(line->'images','[]'))>4 then raise exception 'Tối đa 4 ảnh tham khảo mỗi dòng';end if;
  for ref in select value from jsonb_array_elements(coalesce(line->'images','[]')) loop
   path:=ref->>'path';if path is null or path not like w::text||'/'||auth.uid()::text||'/'||request::text||'/%' or position('..' in path)>0 or not exists(select 1 from storage.objects where bucket_id='custom-order-media' and name=path) then raise exception 'Ảnh tham khảo chưa được lưu đầy đủ';end if;
   media:=media||jsonb_build_array(jsonb_build_object('path',path,'name',left(ref->>'name',180)));end loop;
  for part in select value from jsonb_array_elements(coalesce(m->'parts','[]')) where v is null or jsonb_typeof(v->'partIds') is distinct from 'array' or v->'partIds' ? (value->>'id') loop
   if keyboard is not null and part->>'id' in (keyboard->'partIds'->>'tray',keyboard->'partIds'->>'keys') then
    component_colors:='{}';
    if part->>'id'=keyboard->'partIds'->>'tray' then
     part_filaments:=keyboard->'trayFilamentIds';fid:=coalesce(keyboard->'colors'->>'tray',part_filaments->>0);component_colors:=jsonb_build_object('tray',keyboard->'components'->'tray');
    else
     part_filaments:=keyboard->'keyFilamentIds';fid:=coalesce(keyboard->'colors'->>'buttons',keyboard->'colors'->>'characters',part_filaments->>0);
     component_colors:=jsonb_build_object('buttons',keyboard->'components'->'buttons','characters',keyboard->'components'->'characters');
    end if;
    part_color_key:='keyboard:'||encode(sha256(convert_to(component_colors::text||part_filaments::text,'UTF8')),'hex');
    plan_note:=concat_ws(E'\n',nullif(line->>'note',''),'Ký tự: '||(keyboard->>'text'));
    for role,role_fil in select key,value from jsonb_each(component_colors) loop
     role_name:=case role when 'tray' then 'Khay bàn phím' when 'buttons' then 'Nút bàn phím' else 'Ký tự' end;
     plan_note:=plan_note||E'\n'||role_name||': '||coalesce(role_fil->>'name','Theo màu gốc/chưa chỉ định');
     part_colors:=part_colors||jsonb_build_array(jsonb_build_object('partId',part->>'id','partName',role_name,'component',role)||role_fil);
    end loop;
    if fid is not null then colors:=colors||jsonb_build_object(part->>'id',fid);end if;
    part_qty:=greatest(1,coalesce((part->>'qtyPerModel')::integer,1))*qty;
    select id into pid from plates where workspace_id=w and data->>'customRequestId'=request::text and data->>'customColorKey'=part_color_key;
    if pid is null then pid:=gen_random_uuid()::text;insert into plates(id,user_id,workspace_id,data,updated_at) values(pid,owner_id,w,jsonb_build_object('id',pid,'name','Custom · '||left(trim(p->>'customer'),60),'filamentId',fid,'filamentIds',part_filaments,'customColorKey',part_color_key,'projectId',null,'status','waiting','priority',100,'note',plan_note,'customRequestId',request,'createdAt',stamp),stamp);end if;
    insert into plate_items(id,user_id,workspace_id,data,updated_at) select pi,owner_id,w,jsonb_build_object('id',pi,'plateId',pid,'partId',part->>'id','orderId',oid,'orderItemId',iid,'modelId',line->>'modelId','modelName',m->>'name','partName',part->>'name','variantId',v->>'id','variantName',v->>'name','filamentId',fid,'filamentIds',part_filaments,'componentColors',component_colors,'keyboardText',keyboard->>'text','customColorKey',part_color_key,'qty',part_qty,'qtyDone',0,'note',plan_note,'priority',100),stamp from (select gen_random_uuid()::text pi) x;
    continue;
   end if;
   fid:=nullif(line->'colorChoices'->>(part->>'id'),'');
   if fid is not null then
    colors:=colors||jsonb_build_object(part->>'id',fid);color_ids:=jsonb_build_array(fid);
   else
    color_ids:=public.custom_order_original_color_ids(v,part);
   end if;
   -- An unassigned source part stays unassigned, matching native order allocation.
   if jsonb_array_length(color_ids)=0 then color_ids:='[null]'::jsonb;end if;
   for fid in select value from jsonb_array_elements_text(color_ids) loop
   fil:=null;if fid is not null then
    select data into fil from filaments where workspace_id=w and id=fid;
    if fil is null then raise exception 'Màu của part không còn trong thư viện; kiểm tra màu gốc hoặc chọn màu thay thế';end if;
   end if;
   part_colors:=part_colors||jsonb_build_array(jsonb_build_object('partId',part->>'id','partName',part->>'name','filamentId',fid,'name',fil->>'name','brand',fil->>'brand','hex',fil->>'hex','mat',fil->>'mat'));
   part_qty:=greatest(1,coalesce((part->>'qtyPerModel')::integer,1))*qty;
   select id into pid from plates where workspace_id=w and data->>'customRequestId'=request::text and coalesce(data->>'customColorKey','')='' and (data->>'filamentId') is not distinct from fid;
   if pid is null then pid:=gen_random_uuid()::text;insert into plates(id,user_id,workspace_id,data,updated_at) values(pid,owner_id,w,jsonb_build_object('id',pid,'name','Custom · '||left(trim(p->>'customer'),60),'filamentId',fid,'projectId',null,'status','waiting','priority',100,'note','Đơn custom ưu tiên','customRequestId',request,'createdAt',stamp),stamp);end if;
   insert into plate_items(id,user_id,workspace_id,data,updated_at) select pi,owner_id,w,jsonb_build_object('id',pi,'plateId',pid,'partId',part->>'id','orderId',oid,'orderItemId',iid,'modelId',line->>'modelId','modelName',m->>'name','partName',part->>'name','variantId',v->>'id','variantName',v->>'name','filamentId',fid,'qty',part_qty,'qtyDone',0,'note',line->>'note','priority',100),stamp from (select gen_random_uuid()::text pi) x;
   end loop;
  end loop;
  items:=items||jsonb_build_array(jsonb_build_object('id',iid,'modelId',line->>'modelId','modelName',m->>'name','qty',qty,'partId',null,'variantId',v->>'id','variantName',v->>'name','note',line->>'note','colorChoices',colors)||case when keyboard is null then '{}'::jsonb else jsonb_build_object('keyboard',keyboard) end);
  lines:=lines||jsonb_build_array(jsonb_build_object('id',iid,'modelId',line->>'modelId','variantId',v->>'id','variantName',v->>'name','qty',qty,'note',line->>'note','images',media,'colorChoices',colors,'partColors',part_colors,'model',jsonb_build_object('id',line->>'modelId','name',m->>'name','images',coalesce(m->'images','[]'),'variants',case when v is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id',v->>'id','name',v->>'name')) end))||case when keyboard is null then '{}'::jsonb else jsonb_build_object('keyboard',keyboard) end);
 end loop;
 order_data:=jsonb_build_object('id',oid,'kind','custom','priority',100,'projectId',null,'note','Custom · '||trim(p->>'customer'),'deliveryDate',p->>'due','orderedBy',actor,'orderedByUserId',auth.uid(),'status','processing','createdAt',stamp,'items',items,'custom',jsonb_build_object('customer',trim(p->>'customer'),'phone',trim(p->>'phone'),'delivery',p->>'delivery','address',case when p->>'delivery'='delivery' then p->>'address' else '' end,'total',total,'deposit',deposit,'creator',actor,'lines',lines));
 insert into orders(id,user_id,workspace_id,data,updated_at) values(oid,owner_id,w,order_data,stamp);
 insert into custom_order_receipts(workspace_id,request_id,order_id,created_by,payload_hash,token_hash,token_value) values(w,request,oid,auth.uid(),fingerprint,encode(sha256(convert_to(token,'UTF8')),'hex'),token);
 return jsonb_build_object('order',custom_order_projection(w,oid,false),'token',token);end $$;
