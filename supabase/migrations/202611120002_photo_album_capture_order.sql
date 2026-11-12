alter table public.photo_album_images
  add column public_id uuid not null default gen_random_uuid(),
  add column sort_at timestamptz not null default '-infinity';

-- Batch report timestamps are saved as ISO strings. Skip malformed legacy fields.
create function public.photo_album_report_time(p_data jsonb)
returns timestamptz
language plpgsql stable set search_path = ''
as $$
declare
  candidate text;
  taken_at timestamptz;
begin
  foreach candidate in array array[
    p_data->>'photoTakenAt',
    case when p_data->>'photoTakenAtSource' is distinct from 'upload' then p_data->>'capturedAt' end,
    case when p_data->>'photoTakenAtSource' is distinct from 'upload' then p_data->>'createdAt' end
  ] loop
    if candidate ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' then
      begin
        taken_at := candidate::timestamptz;
        if taken_at >= '1900-01-01T00:00:00Z' and taken_at <= now() + interval '1 day' then
          return taken_at;
        end if;
      exception when invalid_datetime_format or datetime_field_overflow or invalid_time_zone_displacement_value then
        continue;
      end;
    end if;
  end loop;
  return '-infinity';
end;
$$;
revoke all on function public.photo_album_report_time(jsonb) from public, anon, authenticated;

update public.photo_album_images image
set sort_at = public.photo_album_report_time(report.data)
from public.batch_reports report
where report.user_id = image.report_user_id and report.id = image.report_id
  and report.workspace_id = image.workspace_id;

create function public.set_photo_album_report_time()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select public.photo_album_report_time(report.data) into new.sort_at
  from public.batch_reports report
  where report.user_id = new.report_user_id and report.id = new.report_id
    and report.workspace_id = new.workspace_id;
  new.sort_at := coalesce(new.sort_at, '-infinity');
  return new;
end;
$$;
revoke all on function public.set_photo_album_report_time() from public, anon, authenticated;
create trigger photo_album_report_time_on_share before insert on public.photo_album_images
for each row when (new.report_id is not null) execute function public.set_photo_album_report_time();

create unique index photo_album_images_public_id on public.photo_album_images (public_id);
create index photo_album_images_capture_page on public.photo_album_images (workspace_id, sort_at desc, public_id desc);
drop index public.photo_album_images_page;

create function public.photo_album_capture_page(
  p_workspace_id uuid,
  p_before_at timestamptz default null,
  p_before_id uuid default null
)
returns table (public_id uuid, sort_at text)
language sql stable set search_path = ''
as $$
  select image.public_id, image.sort_at::text
  from public.photo_album_images image
  where image.workspace_id = p_workspace_id
    and (p_before_at is null or (image.sort_at, image.public_id) < (p_before_at, p_before_id))
  order by image.sort_at desc, image.public_id desc
  limit 25;
$$;
revoke all on function public.photo_album_capture_page(uuid, timestamptz, uuid) from public, anon, authenticated;
grant execute on function public.photo_album_capture_page(uuid, timestamptz, uuid) to service_role;
