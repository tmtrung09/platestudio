create table public.photo_albums (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  key_hash text unique check (key_hash ~ '^[a-f0-9]{64}$')
);

create table public.photo_album_images (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.photo_albums(workspace_id) on delete cascade,
  upload_hash text check (upload_hash ~ '^[a-f0-9]{64}$'),
  report_user_id uuid,
  report_id text,
  report_image text,
  report_thumb text,
  foreign key (report_user_id, report_id) references public.batch_reports(user_id, id) on delete cascade,
  check ((upload_hash is not null and report_user_id is null and report_id is null and report_image is null and report_thumb is null)
      or (upload_hash is null and report_user_id is not null and report_id is not null and report_image is not null)),
  unique (workspace_id, upload_hash),
  unique (workspace_id, report_user_id, report_id)
);
create index photo_album_images_page on public.photo_album_images (workspace_id, id desc);
create index photo_album_images_report on public.photo_album_images (report_user_id, report_id);

alter table public.photo_albums enable row level security;
alter table public.photo_album_images enable row level security;
revoke all on public.photo_albums, public.photo_album_images from public, anon, authenticated;
grant select on public.photo_albums to service_role;
grant select, insert on public.photo_album_images to service_role;
grant usage, select on sequence public.photo_album_images_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photo-album', 'photo-album', false, 12582912,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

create function public.manage_photo_album(
  p_workspace_id uuid,
  p_action text default 'status',
  p_report_ids text[] default '{}',
  p_key_hash text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  affected integer := 0;
  active boolean;
begin
  if auth.uid() is null or coalesce(auth.jwt()->>'is_anonymous', 'false') = 'true'
    or not public.is_workspace_owner(p_workspace_id) then
    raise insufficient_privilege using message = 'Chỉ chủ xưởng được quản lý link ảnh.';
  end if;

  case p_action
    when 'status' then null;
    when 'rotate' then
      if p_key_hash is null or p_key_hash !~ '^[a-f0-9]{64}$' then
        raise invalid_parameter_value using message = 'Mã link không hợp lệ.';
      end if;
      insert into public.photo_albums (workspace_id, key_hash)
      values (p_workspace_id, p_key_hash)
      on conflict (workspace_id) do update set key_hash = excluded.key_hash;
    when 'revoke' then
      update public.photo_albums set key_hash = null where workspace_id = p_workspace_id;
    when 'share' then
      if coalesce(cardinality(p_report_ids), 0) not between 1 and 100 then
        raise invalid_parameter_value using message = 'Chọn từ 1 đến 100 ảnh mỗi lượt.';
      end if;
      insert into public.photo_albums (workspace_id) values (p_workspace_id)
      on conflict (workspace_id) do nothing;
      insert into public.photo_album_images (workspace_id, report_user_id, report_id, report_image, report_thumb)
      select p_workspace_id, report.user_id, report.id, report.data->>'image', report.data->>'thumb'
      from (
        select *, count(*) over (partition by id) as matches from public.batch_reports
        where workspace_id = p_workspace_id and id = any (p_report_ids)
      ) report
      where report.matches = 1
        and report.data->>'image' ~ '^https://mapmfngikmumvghapqcu[.]supabase[.]co/storage/v1/object/public/plate-media/[A-Za-z0-9_-]+(/[A-Za-z0-9_.-]+)+$'
        and coalesce(report.data->>'status', '') <> 'uploading'
      on conflict (workspace_id, report_user_id, report_id) do nothing;
      get diagnostics affected = row_count;
    when 'unshare' then
      delete from public.photo_album_images
      where workspace_id = p_workspace_id and report_id = any (p_report_ids);
      get diagnostics affected = row_count;
    else
      raise invalid_parameter_value using message = 'Thao tác không hợp lệ.';
  end case;

  select key_hash is not null into active from public.photo_albums where workspace_id = p_workspace_id;
  return jsonb_build_object('active', coalesce(active, false), 'affected', affected);
end;
$$;
revoke all on function public.manage_photo_album(uuid, text, text[], text) from public, anon;
grant execute on function public.manage_photo_album(uuid, text, text[], text) to authenticated;
