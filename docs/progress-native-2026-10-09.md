# Viết lại Tiến độ in

Người dùng báo Tiến độ liên tục bể giao diện, không đồng nhất với các trang khác,
và yêu cầu viết lại trang thay vì tiếp tục vá.

## Nguyên nhân và thay đổi

- DOM cũ của một cửa sổ riêng được chuyển vào trang bằng mount. CSS cũ vẫn có
  sidebar/drawer, chiều cao viewport, vùng cuộn lồng và navigation mobile riêng.
  Nhiều lớp override có breakpoint khác nhau xử lý cùng một cấu trúc.
- Bỏ toàn bộ DOM/style của cửa sổ đó và các rule vá còn sót. Trang native nằm trong
  Sản xuất, dùng header/theme/toolbar và `.pg-content` chung, không sidebar phụ.
- Một toolbar: tìm kiếm không dấu, góc xem, trạng thái và tạo đơn theo quyền.
  Tổng tiến độ phản ánh danh sách đang lọc; Ngoài đơn chỉ có sản lượng báo cáo,
  không gán phần trăm hoàn thành khi không có nhu cầu từ đơn.
- Bốn góc đơn/model/plate/ngoài đơn giữ nguyên nguồn dữ liệu và handler nghiệp vụ.
  Thẻ hoàn thành có nút mở; model mở bằng bàn phím; part dùng stepper 44px nhất quán.
- Cập nhật giữ cuộn, focus và DOM thẻ/ảnh không thay đổi. Icon SVG và ảnh lỗi dùng
  fallback trong cùng khung. Người chỉ xem không được hiện control ghi.
- URL giữ góc xem, tìm kiếm, trạng thái, nhóm ngoài đơn và scope khi Back/tải lại.
- Không đổi schema, di chuyển/xóa dữ liệu, hay thay cách xác nhận cloud.

## Regression

`tools/progress-qa.mjs`: 320/390/768/1024/1440 và landscape 844×390, light/dark;
bốn góc xem, tên dài, thiếu/lỗi ảnh, 1/4/120 part, bàn phím, tìm không dấu,
sửa qtyDone qua handler thật, scope đơn/dự án, quyền, giữ cuộn/DOM và hình học
trang kế cận. Không dùng dữ liệu live. Kèm QA tổng trước phát hành.
