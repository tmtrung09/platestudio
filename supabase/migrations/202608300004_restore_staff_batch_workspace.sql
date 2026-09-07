-- Các ảnh từ link nhân viên được gửi sau khi dùng workspace chung nhưng trước
-- khi Edge Function có workspace_id vẫn nằm trong batch_reports. Gắn chúng về
-- đúng workspace của chủ dữ liệu để chúng hiện lại trong Báo cáo mẻ in.
update public.batch_reports report
set workspace_id = workspace.id
from public.workspaces workspace
where report.workspace_id is null
  and report.user_id = workspace.owner_user_id;
