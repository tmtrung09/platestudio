# Đồng bộ KiotViet trong Chrome đang dùng

1. Mở `tools\start-kiotviet-sync.cmd` và để cửa sổ đó chạy. Nếu muốn chạy nền, mở `tools\start-kiotviet-sync-background.vbs` thay cho file `.cmd`.
2. Trong Chrome đang đăng nhập KiotViet, vào `chrome://extensions`, bật **Chế độ nhà phát triển**, chọn **Tải tiện ích đã giải nén** và chọn thư mục `tools\kiotviet-chrome-extension`.
3. Vào Plate Studio → **Đồng bộ KiotViet** → bấm **Đồng bộ từ Chrome** để thử ngay.

Tiện ích chỉ có quyền trên `banhmi19.kiotviet.vn` và localhost. Nó mở báo cáo, chọn **Báo cáo → 3D Rùm Beng → Hôm qua → Excel 97–2003** trong chính profile Chrome đã cài tiện ích. File Excel được đọc từ thư mục Downloads cho lượt đồng bộ hiện tại rồi Plate Studio tự nhập nó.

## Lịch tự lấy hằng ngày

Mỗi khi mở Plate Studio vào một ngày mới, app sẽ kiểm tra báo cáo **Hôm qua**. Nếu ngày đó chưa có dữ liệu, bridge mới tạo một lượt lấy file; nếu đã có thì tự bỏ qua. Không có mốc giờ cố định và không cần mở máy hằng ngày. Trạng thái lịch nằm trong thư mục dữ liệu riêng của Windows (`AppData\Local\Plate Studio`), không nằm trong mã nguồn.

## Ghi thao tác để hoàn thiện luồng

1. Sau khi khởi động lại local bridge và tải lại extension, mở tab KiotViet cần thao tác.
2. Bấm biểu tượng extension → **Bắt đầu ghi**.
3. Thực hiện chậm rãi toàn bộ quy trình lọc, chọn thời gian và xuất Excel như bình thường.
4. Bấm lại biểu tượng extension → **Dừng và gửi bản ghi**.

Bản ghi chỉ gồm thứ tự thao tác, URL, text/thuộc tính DOM và giá trị bộ lọc; không lấy cookie, mật khẩu hoặc thông tin đăng nhập.
