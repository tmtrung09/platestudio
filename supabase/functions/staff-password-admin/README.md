# Admin đặt mật khẩu cho nhân viên

Chạy Edge Function `staff-password-admin` trong cùng dự án Supabase với Plate
Studio. Triển khai hàm trước khi phát hành giao diện. Hàm dùng `SUPABASE_URL`
và `SUPABASE_SERVICE_ROLE_KEY` do Edge Runtime cấp.

Trên máy chủ tin cậy, xác nhận UUID của xưởng và UUID của tài khoản chủ xưởng
được cấp quyền. Dùng Supabase Auth Admin API để thêm khóa
`staff_password_workspace_id` chứa UUID của xưởng vào `app_metadata` hiện có
của tài khoản đó. Ví dụ với client dùng khóa server:

```js
const { data, error } = await admin.auth.admin.getUserById(adminUserId);
if (error || !data.user) throw error ?? new Error('Không tìm thấy admin');
const { error: updateError } = await admin.auth.admin.updateUserById(adminUserId, {
  app_metadata: { ...data.user.app_metadata, staff_password_workspace_id: workspaceId },
});
if (updateError) throw updateError;
```

Admin đăng nhập lại để giao diện nhận quyền mới. Trong **Phân quyền**, chọn
**Đặt mật khẩu mới** ở thẻ của nhân viên đã là thành viên xưởng. Khi thu hồi
quyền, đặt `staff_password_workspace_id` thành `null` trong `app_metadata`.

Khi kiểm tra sau triển khai, dùng tài khoản nhân viên thử nghiệm và đăng nhập
lại bằng mật khẩu mới. Dùng các tài khoản thử để kiểm tra yêu cầu từ người
thiếu quyền, thành viên ngoài xưởng và thao tác đặt mật khẩu cho admin đều bị
từ chối.
