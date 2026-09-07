-- Khi lỗi đồng bộ cũ xoá dòng batch_reports nhưng chưa xoá file Storage,
-- chủ xưởng có thể quét các ảnh còn lại và khôi phục lại báo cáo an toàn.
-- Không trả về ảnh đã nằm trong thùng rác để không vô tình hoàn tác thao tác xoá.

create or replace function public.list_orphaned_batch_report_media(
  p_workspace_id uuid,
  p_limit integer default 500
)
returns table(
  report_id text,
  image_path text,
  thumb_path text,
  recorded_at timestamptz,
  media_source text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_workspace_owner(p_workspace_id) then
    raise exception 'Chỉ chủ xưởng được khôi phục ảnh báo cáo';
  end if;

  return query
  with media as (
    select
      object_row.name,
      object_row.created_at,
      split_part(object_row.name, '/', 2) as folder,
      regexp_replace(split_part(object_row.name, '/', 3), '[.][^.]+$', '') as recovered_report_id
    from storage.objects object_row
    join public.workspace_members member
      on member.workspace_id = p_workspace_id
     and member.user_id::text = split_part(object_row.name, '/', 1)
    where object_row.bucket_id = 'plate-media'
      and split_part(object_row.name, '/', 2) in ('batch-reports', 'staff-batch-reports')
      and array_length(string_to_array(object_row.name, '/'), 1) = 3
      and split_part(object_row.name, '/', 3) !~ '-thumb[.][^.]+$'
  ), orphaned as (
    select distinct on (media.recovered_report_id)
      media.recovered_report_id,
      media.name,
      media.created_at,
      media.folder
    from media
    where not exists (
      select 1
      from public.batch_reports report
      where report.workspace_id = p_workspace_id
        and report.id = media.recovered_report_id
    )
      and not exists (
        select 1
        from public.settings setting_row
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(setting_row.data->'values') = 'array'
            then setting_row.data->'values'
            else '[]'::jsonb
          end
        ) as trash_item(value)
        where setting_row.workspace_id = p_workspace_id
          and setting_row.id = 'trash'
          and trash_item.value->>'type' = 'batch-report'
          and trash_item.value->'data'->>'id' = media.recovered_report_id
      )
    order by media.recovered_report_id, media.created_at desc
  )
  select
    orphaned.recovered_report_id,
    orphaned.name,
    case when thumbnail.name is null then null else thumbnail.name end,
    orphaned.created_at,
    orphaned.folder
  from orphaned
  left join storage.objects thumbnail
    on thumbnail.bucket_id = 'plate-media'
   and thumbnail.name = regexp_replace(orphaned.name, '[.][^.]+$', '-thumb.jpg')
  order by orphaned.created_at desc
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
end;
$$;

grant execute on function public.list_orphaned_batch_report_media(uuid, integer) to authenticated;
