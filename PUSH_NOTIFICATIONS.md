# Thông báo đẩy Plate Studio

Tính năng đã có sẵn trong mã nguồn. Để gửi được thông báo khi thiết bị đã đóng tab, cần triển khai một lần lên Supabase và chạy ứng dụng qua HTTPS.

1. Chạy migration `supabase/migrations/202609060001_push_subscriptions.sql` trong Supabase SQL Editor.
2. Deploy Edge Function: `supabase functions deploy send-device-push`.
3. Tạo VAPID key pair bằng `npx web-push generate-vapid-keys`, rồi đặt secrets:

   `supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:email-cua-ban@example.com"`

4. Deploy `plate-studio.html`, `push-sw.js`, `manifest.webmanifest` và `plate-studio-mark.svg` cùng một HTTPS domain (Netlify hiện tại phù hợp). Không dùng `file://`; `http://localhost` chỉ dùng được trên máy đang chạy.
5. Trên từng máy/điện thoại: mở trang HTTPS, đăng nhập, vào **Thiết bị** → **Bật thông báo** → cho phép trong trình duyệt. Có nút **Thử** để kiểm tra.

Thông báo chỉ gửi đến thành viên có quyền liên quan với sự kiện; người vừa thực hiện thao tác không nhận lại chính thông báo đó. Subscription hết hạn sẽ tự được xóa khi máy chủ nhận lỗi 404 hoặc 410.
