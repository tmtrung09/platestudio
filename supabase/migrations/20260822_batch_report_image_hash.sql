-- Chống tải trùng ảnh báo cáo mẻ in bằng SHA-256 của file gốc.
-- Chạy migration này trước khi deploy Edge Function mới.

create unique index if not exists batch_reports_user_image_hash_unique
  on public.batch_reports (user_id, (data->>'imageHash'))
  where coalesce(data->>'imageHash', '') <> '';

create index if not exists batch_reports_user_image_hash_lookup
  on public.batch_reports (user_id, (data->>'imageHash'))
  where coalesce(data->>'imageHash', '') <> '';
