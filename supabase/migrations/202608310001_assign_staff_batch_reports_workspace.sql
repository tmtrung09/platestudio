-- Báo cáo từ link nhân viên được Edge Function lưu bằng user_id của chủ xưởng.
-- Nếu Function chưa truyền workspace_id, thư viện lại chỉ truy vấn theo workspace_id
-- nên báo cáo (dù ảnh đã upload thành công) không hiện trên app quản lý.
-- Trigger này là lớp bảo vệ ở database, áp dụng đồng thời cho ảnh chụp và ảnh
-- được chọn từ thư viện trên điện thoại.

create or replace function public.assign_batch_report_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workspace_id is null and new.user_id is not null then
    select id into new.workspace_id
    from public.workspaces
    where owner_user_id = new.user_id
    order by created_at
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists assign_batch_report_workspace_before_write on public.batch_reports;
create trigger assign_batch_report_workspace_before_write
before insert or update of user_id, workspace_id on public.batch_reports
for each row execute function public.assign_batch_report_workspace();

-- Khôi phục các báo cáo đã được gửi trước khi trigger có mặt.
update public.batch_reports report
set workspace_id = workspace.id
from public.workspaces workspace
where report.workspace_id is null
  and report.user_id = workspace.owner_user_id;
