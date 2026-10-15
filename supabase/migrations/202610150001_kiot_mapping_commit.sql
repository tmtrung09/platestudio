-- Mapping edits are per SKU, durable/idempotent and independent of catalog writes.
create table public.kiot_mapping_receipts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id uuid not null,
  sku text not null,
  actor_id uuid not null,
  payload jsonb not null,
  primary key(workspace_id,request_id)
);
alter table public.kiot_mapping_receipts enable row level security;
create policy members_read_mapping_receipts on public.kiot_mapping_receipts for select to authenticated
  using(public.is_workspace_member(workspace_id));
revoke all on public.kiot_mapping_receipts from anon,authenticated;
grant select on public.kiot_mapping_receipts to authenticated;

create function public.guard_kiot_mapping_settings() returns trigger
language plpgsql set search_path=public as $$
begin
  if new.id<>'kiotviet' then return new; end if;
  if current_setting('app.kiot_mapping_writer',true)=new.workspace_id::text then return new; end if;
  if tg_op='INSERT' then
    -- ON CONFLICT also runs the INSERT trigger; the UPDATE trigger checks the old row.
    if exists(select 1 from public.settings s where s.workspace_id=new.workspace_id and s.id=new.id) then return new; end if;
    if coalesce(new.data->'values'->'mappings','[]'::jsonb)<>'[]'::jsonb
       or coalesce(new.data->'values'->'skippedSkus','[]'::jsonb)<>'[]'::jsonb
       or coalesce(new.data->'values'->'mappingRevisions','{}'::jsonb)<>'{}'::jsonb then
      raise exception using errcode='40001',message='Hãy cập nhật trang để lưu ghép SKU an toàn.';
    end if;
  elsif coalesce(new.data->'values'->'mappings','[]'::jsonb) is distinct from coalesce(old.data->'values'->'mappings','[]'::jsonb)
     or coalesce(new.data->'values'->'skippedSkus','[]'::jsonb) is distinct from coalesce(old.data->'values'->'skippedSkus','[]'::jsonb)
     or coalesce(new.data->'values'->'mappingRevisions','{}'::jsonb) is distinct from coalesce(old.data->'values'->'mappingRevisions','{}'::jsonb) then
    raise exception using errcode='40001',message='Bản ghép SKU đã thay đổi. Tải lại trang; không ghi đè từ phiên cũ.';
  end if;
  return new;
end;
$$;
create trigger protect_kiot_mapping_settings before insert or update on public.settings
  for each row execute function public.guard_kiot_mapping_settings();

-- Generic settings synchronization cannot write mapping fields, including stale copies.
create function public.merge_kiot_settings(p_workspace_id uuid,p_values jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare v_old jsonb; v_next jsonb; v_owner uuid;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then raise exception 'Không có quyền ghi KiotViet'; end if;
  if jsonb_typeof(p_values) is distinct from 'object' then raise exception 'Dữ liệu KiotViet không hợp lệ'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':kiot-settings',0));
  select s.data->'values' into v_old from public.settings s where s.workspace_id=p_workspace_id and s.id='kiotviet' for update;
  v_next=(p_values-'mappings'-'skippedSkus'-'mappingRevisions')||jsonb_build_object(
    'mappings',coalesce(v_old->'mappings','[]'::jsonb),
    'skippedSkus',coalesce(v_old->'skippedSkus','[]'::jsonb),
    'mappingRevisions',coalesce(v_old->'mappingRevisions','{}'::jsonb));
  perform set_config('app.kiot_mapping_writer',p_workspace_id::text,true);
  update public.settings set data=jsonb_build_object('id','kiotviet','values',v_next),updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and id='kiotviet';
  if not found then
    select owner_user_id into v_owner from public.workspaces where id=p_workspace_id;
    insert into public.settings(id,user_id,workspace_id,data,updated_at)
      values('kiotviet',v_owner,p_workspace_id,jsonb_build_object('id','kiotviet','values',v_next),clock_timestamp());
  end if;
end;
$$;

create function public.commit_kiot_mapping(
  p_workspace_id uuid,p_sku text,p_request_id uuid,p_expected_revision text,
  p_expected_state jsonb,p_mapping jsonb,p_skipped jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_values jsonb; v_state jsonb; v_revision text; v_receipt public.kiot_mapping_receipts;
  v_payload jsonb; v_maps jsonb; v_skips jsonb; v_owner uuid;
begin
  if auth.uid() is null or not public.is_workspace_member(p_workspace_id) then raise exception 'Không có quyền ghép SKU'; end if;
  if p_request_id is null or p_sku is null or trim(p_sku)='' then raise exception 'Thiếu SKU hoặc mã lần lưu'; end if;
  if p_mapping is not null and (jsonb_typeof(p_mapping) is distinct from 'object' or p_mapping->>'sku' is distinct from p_sku or coalesce(p_mapping->>'modelId','')='') then raise exception 'Ghép SKU không hợp lệ'; end if;
  if p_skipped is not null and (jsonb_typeof(p_skipped) is distinct from 'object' or p_skipped->>'sku' is distinct from p_sku) then raise exception 'Bỏ qua SKU không hợp lệ'; end if;
  if p_mapping is not null and p_skipped is not null then raise exception 'SKU đã ghép không thể đồng thời bỏ qua'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':kiot-settings',0));
  select s.data->'values' into v_values from public.settings s where s.workspace_id=p_workspace_id and s.id='kiotviet' for update;
  v_values=coalesce(v_values,'{}'::jsonb);
  v_revision=v_values->'mappingRevisions'->>p_sku;
  v_state=jsonb_build_object('mapping',(select x from jsonb_array_elements(coalesce(v_values->'mappings','[]'::jsonb)) x where x->>'sku'=p_sku limit 1),
    'skipped',(select x from jsonb_array_elements(coalesce(v_values->'skippedSkus','[]'::jsonb)) x where x->>'sku'=p_sku limit 1));
  v_payload=jsonb_build_object('mapping',p_mapping,'skipped',p_skipped);
  select * into v_receipt from public.kiot_mapping_receipts r where r.workspace_id=p_workspace_id and r.request_id=p_request_id;
  if found then
    if v_receipt.sku<>p_sku or v_receipt.actor_id<>auth.uid() or v_receipt.payload<>v_payload then raise exception 'Mã lần lưu đã được dùng cho thao tác khác'; end if;
    return v_state||jsonb_build_object('revision',v_revision);
  end if;
  if v_revision is distinct from p_expected_revision or (v_revision is null and v_state is distinct from p_expected_state) then
    raise exception using errcode='40001',message='SKU đã được sửa ở phiên khác. Bản của bạn được giữ để đối chiếu.';
  end if;
  select coalesce(jsonb_agg(x),'[]'::jsonb) into v_maps from jsonb_array_elements(coalesce(v_values->'mappings','[]'::jsonb)) x where x->>'sku'<>p_sku;
  select coalesce(jsonb_agg(x),'[]'::jsonb) into v_skips from jsonb_array_elements(coalesce(v_values->'skippedSkus','[]'::jsonb)) x where x->>'sku'<>p_sku;
  if p_mapping is not null then v_maps=v_maps||jsonb_build_array(p_mapping); end if;
  if p_skipped is not null then v_skips=v_skips||jsonb_build_array(p_skipped); end if;
  v_revision=(coalesce(v_revision,'0')::bigint+1)::text;
  v_values=v_values||jsonb_build_object('mappings',v_maps,'skippedSkus',v_skips,
    'mappingRevisions',coalesce(v_values->'mappingRevisions','{}'::jsonb)||jsonb_build_object(p_sku,v_revision));
  perform set_config('app.kiot_mapping_writer',p_workspace_id::text,true);
  update public.settings set data=jsonb_build_object('id','kiotviet','values',v_values),updated_at=clock_timestamp()
    where workspace_id=p_workspace_id and id='kiotviet';
  if not found then
    select owner_user_id into v_owner from public.workspaces where id=p_workspace_id;
    insert into public.settings(id,user_id,workspace_id,data,updated_at)
      values('kiotviet',v_owner,p_workspace_id,jsonb_build_object('id','kiotviet','values',v_values),clock_timestamp());
  end if;
  insert into public.kiot_mapping_receipts values(p_workspace_id,p_request_id,p_sku,auth.uid(),v_payload);
  return v_payload||jsonb_build_object('revision',v_revision);
end;
$$;
revoke all on function public.merge_kiot_settings(uuid,jsonb) from public,anon;
revoke all on function public.commit_kiot_mapping(uuid,text,uuid,text,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.merge_kiot_settings(uuid,jsonb) to authenticated;
grant execute on function public.commit_kiot_mapping(uuid,text,uuid,text,jsonb,jsonb,jsonb) to authenticated;
