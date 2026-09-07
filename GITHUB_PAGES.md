# Đưa Plate Studio lên GitHub Pages

GitHub Pages có thể thay Netlify cho bản web tĩnh này. Sau khi hoàn tất, em chỉ cần gửi một link cố định:

`https://<tên-tài-khoản-github>.github.io/<tên-repository>/`

Link gốc tự mở Plate Studio và vẫn giữ trang nội bộ, ví dụ `#ps_page=fulfillment`.

## Làm một lần

1. Trên GitHub, tạo một repository mới, ví dụ `plate-studio`. Chọn **Public** nếu tài khoản GitHub của em không có GitHub Pages cho repository riêng tư.
2. Mở PowerShell tại thư mục này và chạy các lệnh sau (thay URL bằng URL repository của em):

   ```powershell
   git init
   git add .
   git commit -m "Deploy Plate Studio to GitHub Pages"
   git branch -M main
   git remote add origin https://github.com/<tên-tài-khoản-github>/<tên-repository>.git
   git push -u origin main
   ```

3. Trong repository trên GitHub, vào **Settings → Pages**, tại **Build and deployment → Source** chọn **GitHub Actions**.
4. Chờ workflow `Deploy Plate Studio to GitHub Pages` chạy xong trong tab **Actions**. GitHub sẽ hiện link chính thức trong workflow và trang Pages.

## Mỗi lần cập nhật

Sau khi đã có repository, chỉ cần:

```powershell
git add .
git commit -m "Cập nhật Plate Studio"
git push
```

GitHub tự publish bản mới. Workflow chỉ đưa các file cần chạy web lên Pages; không đưa `node_modules`, ảnh/HTML tải về, kết quả QA hoặc dữ liệu cục bộ lên GitHub.

## Supabase: cần thêm domain mới

Plate Studio đã đổi sang tự lấy domain hiện tại cho link mời nhân viên và link xác thực. Sau lần deploy đầu tiên, vào **Supabase → Authentication → URL Configuration** và thêm cả hai URL sau vào **Redirect URLs**:

```
https://<tên-tài-khoản-github>.github.io/<tên-repository>/
https://<tên-tài-khoản-github>.github.io/<tên-repository>/plate-studio.html
```

Nếu dùng quên mật khẩu hoặc xác nhận email, thiếu bước này thì Supabase sẽ từ chối chuyển hướng về GitHub Pages.

## Lưu ý

- GitHub Pages chỉ host giao diện tĩnh; Supabase vẫn là nơi lưu dữ liệu và thông báo đẩy.
- Link GitHub Pages sẽ ổn định miễn là em giữ nguyên tài khoản GitHub và tên repository. Muốn một link đẹp hơn nữa, sau này có thể gắn domain riêng vào GitHub Pages.
