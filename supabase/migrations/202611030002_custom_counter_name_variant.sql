-- Only the explicitly configured name-keyboard family resolves a tray by name.
-- Existing model IDs, part recipes, receipts and orders remain unchanged.
create or replace function public.custom_order_name_variant(m jsonb,k jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare n integer; matches integer; v jsonb; label text;
begin
 if public.custom_order_keyboard_profile(m,null) is null or not exists(
  select 1 from jsonb_array_elements(coalesce(m->'variants','[]')) x
  where trim(public.custom_order_search_text(x->>'name')) ~ '^khay [1-9][0-9]* chu$'
 ) then return null;end if;
 if jsonb_typeof(k->'text') is distinct from 'string' or trim(k->>'text')='' then
  raise exception 'Nhập tên để xác định khay bàn phím';end if;
 n:=length(normalize(trim(k->>'text'),NFC));label:='khay '||n||' chu';
 select count(*),min(x::text)::jsonb into matches,v
 from jsonb_array_elements(coalesce(m->'variants','[]')) x
 where trim(public.custom_order_search_text(x->>'name'))=label
 and public.custom_order_keyboard_profile(m,x) is not null;
 if matches<>1 then raise exception 'Chưa có một biến thể khay phù hợp với % ký tự',n;end if;
 return v;
end $$;
revoke all on function public.custom_order_name_variant(jsonb,jsonb) from public,anon,authenticated;

-- Patch the installed function rather than replacing intervening integrity fixes.
-- Fail closed if its expected validation blocks have changed.
do $migration$
declare definition text; before_variant text; after_variant text; before_note text;
begin
 select pg_get_functiondef('public.commit_custom_order(uuid,uuid,jsonb)'::regprocedure) into definition;
 before_variant:=$old$v:=null;if jsonb_array_length(coalesce(m->'variants','[]'))>0 then select value into v from jsonb_array_elements(m->'variants') where value->>'id'=line->>'variantId';if v is null then raise exception 'Cần chọn đúng biến thể';end if;end if;$old$;
 after_variant:=$new$v:=public.custom_order_name_variant(m,line->'keyboard');
  if v is not null then
   if nullif(line->>'variantId','') is not null and line->>'variantId' is distinct from v->>'id' then raise exception 'Biến thể khay không khớp tên đã nhập';end if;
  elsif jsonb_array_length(coalesce(m->'variants','[]'))>0 then
   select value into v from jsonb_array_elements(m->'variants') where value->>'id'=line->>'variantId';
   if v is null then raise exception 'Cần chọn đúng biến thể';end if;
  end if;$new$;
 before_note:=$old$if trim(coalesce(line->>'note',''))='' or length(line->>'note')>4000 then raise exception 'Ghi yêu cầu custom cho từng sản phẩm';end if;$old$;
 if position(before_variant in definition)=0 or position(before_note in definition)=0 then raise exception 'Custom order validation changed; review migration before applying';end if;
 definition:=replace(definition,before_variant,after_variant);
 definition:=replace(definition,before_note,$new$if length(coalesce(line->>'note',''))>4000 then raise exception 'Mô tả yêu cầu tối đa 4.000 ký tự';end if;$new$);
 execute definition;
end $migration$;
