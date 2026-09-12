-- Các bảng vận hành chính phải nằm trong publication Realtime. Nếu chỉ các bảng
-- Kiot được publish, thay đổi Model/Đơn/Mẻ in trên thiết bị khác chỉ lộ ra sau F5.
-- Dùng danh sách idempotent để triển khai an toàn cho cả workspace cũ lẫn mới.
do $$
declare table_name text;
begin
  foreach table_name in array array['models','filaments','projects','orders','plates','plate_items','settings','batch_reports']
  loop
    if to_regclass(format('public.%I',table_name)) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname='supabase_realtime' and schemaname='public' and tablename=table_name
       ) then
      execute format('alter publication supabase_realtime add table public.%I',table_name);
    end if;
  end loop;
end $$;
