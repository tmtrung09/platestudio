-- Catalogue enrichment is explicit and workspace-scoped. It never creates stock.
create or replace function public.filament_palette_name(v text)
returns text language sql immutable set search_path=public as $$
 select regexp_replace(replace(public.custom_order_search_text(coalesce(v,'')),'pupple','purple'),'(^matte\s+|[^a-z0-9])','','g')
$$;

create or replace function public.import_filament_reference_palette(w uuid, catalog jsonb, apply_changes boolean default false)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare owner_id uuid; c jsonb; f filaments%rowtype; matches text[]; fid text; metadata jsonb; refs jsonb;
 plan jsonb:='[]'; seen text[]:='{}'; used_ids text[]:='{}'; added integer:=0; enriched integer:=0; unchanged integer:=0;
begin
 select owner_user_id into owner_id from workspaces where id=w;
 if owner_id is null then raise exception 'Không tìm thấy xưởng';end if;
 if jsonb_typeof(catalog->'colors') is distinct from 'array' or jsonb_array_length(catalog->'colors')=0 or jsonb_array_length(catalog->'colors')>500 then
  raise exception 'Bảng màu không hợp lệ';end if;
 perform pg_advisory_xact_lock(hashtextextended('filament-reference:'||w::text,0));
 for c in select value from jsonb_array_elements(catalog->'colors') loop
  if coalesce(c->>'catalogKey','') !~ '^[a-z0-9-]+:[a-z0-9-]+:[a-z0-9-]+$'
   or coalesce(c->>'brand','') not in ('R3D','TINMORRY','CAILAB') or coalesce(c->>'line','')<>'PLA Matte'
   or coalesce(c->>'hex','') !~ '^#[A-Fa-f0-9]{6}$' or coalesce(c->>'name','')='' or coalesce(c->>'vi','')=''
   or coalesce(c->>'source','') !~ '^https://(r3dprint\.com|tinmorry\.net|www\.tonyswift3d\.com|www\.cailab3d\.com)/'
   or coalesce(c->>'method','') not in ('web-swatch','distributor-swatch','photo-sample') then
   raise exception 'Mục bảng màu không hợp lệ: %',c->>'catalogKey';end if;
  if (c->>'catalogKey')=any(seen) then raise exception 'Trùng khóa bảng màu';end if;
  seen:=array_append(seen,c->>'catalogKey');
  -- Lock existing candidates before reading their editable fields. HEX is never an identity.
  perform 1 from filaments where workspace_id=w for update;
  select array_agg(id order by id) into matches from filaments where workspace_id=w and (
   exists(select 1 from jsonb_array_elements(coalesce(data->'paletteRefs','[]')) r where r->>'catalogKey'=c->>'catalogKey')
   or (case when lower(data->>'brand') in ('timory','tinmory','tinmorry') then 'TINMORRY' else upper(data->>'brand') end=c->>'brand'
    and upper(coalesce(data->>'mat',''))='PLA' and data->>'matte'='true' and coalesce(data->>'silk','false')<>'true'
    and (case when coalesce(data->>'code','')<>'' then data->>'code'=c->>'code'
      else public.filament_palette_name(data->>'name')=public.filament_palette_name(c->>'name') end)));
  if coalesce(array_length(matches,1),0)>1 then raise exception 'Màu cần đối chiếu vì có nhiều bản ghi: %',c->>'catalogKey';end if;
  if array_length(matches,1)=1 then
   fid:=matches[1];select * into f from filaments where workspace_id=w and id=fid;
   if coalesce(f.data->>'deletedAt','')<>'' then raise exception 'Màu đã xóa cần đối chiếu: %',fid;end if;
  else
   fid:='palette-'||md5(w::text||':'||(c->>'catalogKey'));
   if exists(select 1 from filaments where id=fid) then raise exception 'ID bảng màu đã được dùng: %',fid;end if;
   f:=null;
  end if;
  if fid=any(used_ids) then raise exception 'Hai màu tham khảo khớp cùng bản ghi: %',fid;end if;
  used_ids:=array_append(used_ids,fid);
  select coalesce(jsonb_agg(r),'[]') into refs from jsonb_array_elements(coalesce(f.data->'paletteRefs','[]')) r where r->>'catalogKey' is distinct from c->>'catalogKey';
  metadata:=jsonb_build_object('nameVi',coalesce(nullif(f.data->>'nameVi',''),c->>'vi'),
   'originalName',coalesce(nullif(f.data->>'originalName',''),c->>'name'),
   'canonicalBrand',c->>'brand','line',coalesce(nullif(f.data->>'line',''),c->>'line'),
   'code',coalesce(nullif(f.data->>'code',''),c->>'code'),
   'paletteRefs',refs||jsonb_build_array((c-'id')||jsonb_build_object('checkedDate',catalog->>'checkedDate')));
  if f.id is null then
   added:=added+1;
   if apply_changes then insert into filaments(id,user_id,workspace_id,data,updated_at)
    values(fid,owner_id,w,jsonb_build_object('id',fid,'brand',c->>'brand','name',c->>'vi','hex',c->>'hex','mat','PLA','matte',true,'silk',false,'note','')||metadata,clock_timestamp());end if;
   plan:=plan||jsonb_build_array(jsonb_build_object('key',c->>'catalogKey','id',fid,'action','add','hex',c->>'hex'));
  else
   if f.data||metadata=f.data then unchanged:=unchanged+1;else
    enriched:=enriched+1;
    if apply_changes then update filaments set data=f.data||metadata,updated_at=clock_timestamp() where workspace_id=w and id=fid;end if;
   end if;
   plan:=plan||jsonb_build_array(jsonb_build_object('key',c->>'catalogKey','id',fid,'action','enrich','hex',f.data->>'hex'));
  end if;
 end loop;
 return jsonb_build_object('applied',apply_changes,'added',added,'enriched',enriched,'unchanged',unchanged,'plan',plan);
end $$;
-- Admin CLI only; no browser role may import into another workspace.
revoke all on function public.import_filament_reference_palette(uuid,jsonb,boolean) from public,anon,authenticated;

-- Older clients replace the JSON object on edit. Retain enrichment they do not know about.
create or replace function public.preserve_filament_reference_metadata()
returns trigger language plpgsql set search_path=public as $$
declare k text;
begin
 if old.data ? 'paletteRefs' then
  foreach k in array array['paletteRefs','nameVi','originalName','canonicalBrand','line','code'] loop
   if not (new.data ? k) and old.data ? k then new.data:=jsonb_set(new.data,array[k],old.data->k);end if;
  end loop;
 end if;
 return new;
end $$;
create trigger filament_reference_metadata before update of data on public.filaments
for each row execute function public.preserve_filament_reference_metadata();

create or replace function public.custom_order_filaments(w uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$begin
 if not public.can_custom_orders(w) then raise exception 'Không có quyền nhận đơn custom' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',data->>'name','brand',data->>'brand','hex',data->>'hex','mat',data->>'mat',
  'nameVi',data->>'nameVi','originalName',data->>'originalName','canonicalBrand',data->>'canonicalBrand','line',data->>'line','code',data->>'code','paletteRefs',data->'paletteRefs') order by data->>'name')
  from filaments where workspace_id=w and coalesce(data->>'deletedAt','')=''),'[]');end $$;
