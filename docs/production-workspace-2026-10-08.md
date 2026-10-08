# Sản xuất tập trung

Yêu cầu: dùng mô hình 6.1 Sol phân tích và làm lại Tiến độ in, Plate in,
Nhắc part còn thiếu, Cần in lại. Phân tích và review nguồn đã được thực hiện
bằng `gpt-6.1-sol`; triển khai giữ dữ liệu và các handler nghiệp vụ hiện có.

| Góc nhìn | Quyết định người dùng cần làm | Nguồn |
| --- | --- | --- |
| Cần in | Chọn việc, đối chiếu mẻ, chọn mức bù, sắp phần chưa xếp máy | pitems còn thiếu, mẻ ngoài đơn, QC, kết quả mẻ lỗi, bán/tồn KiotViet |
| Plate & máy | Tổ chức lượt in, máy/ngày và khay nhựa | platePageEntries, printPlans |
| Tiến độ | Xác minh kết quả theo đơn/model/plate/ngoài đơn | orderItem, pitems, báo cáo mẻ |

Một mục Sản xuất trên sidebar, mobile và Menu. Lịch máy/Khay nhựa là trang con
của Plate & máy. Các route kỹ thuật cũ giữ tương thích; inventory mở cùng renderer
Cần in với nguồn Bù hàng. Không còn renderer độc lập cho Nhắc part hoặc Cần in lại.

## Quy tắc dữ liệu

- Đơn chưa in vẫn có nhu cầu; đơn hủy hoặc đã giao không được đề xuất in.
- Giữ pitemId, orderId, orderItemId, variantId, partId, filamentId khi gộp trình bày.
- QC pitem đã làm giảm qtyDone: chỉ gắn lý do QC vào phần thiếu, không cộng thêm.
- QC ngoài đơn thiếu ID part hoặc QC đơn thiếu pitem vẫn có hàng cần kiểm tra,
  không đoán part. Làm mới cũng tải lại index bán hàng khi có quyền KiotViet.
- Gộp lượng lỗi của các mẻ cùng khóa trước khi so với phần thiếu đã có.
- Một SKU có cả gợi ý bán và tồn chỉ có một hàng, chọn một mức bù. Khi nguồn
  thay đổi, chính sách đã chọn được xác thực lại trước khi lập kế hoạch.
- Đã xếp máy được tính từ các plate kế hoạch chưa báo cáo. Lập kế hoạch dùng phần
  chưa xếp; xóa/đổi kế hoạch sẽ phản ánh lại bằng phép tính, không sửa pitem.
- Mẻ chờ đối chiếu là việc xác minh riêng, không phải một lượng in mới.
- Quyền đọc theo từng nguồn; xếp máy vẫn cần plates.plan, đối chiếu cần quyền
  quản lý báo cáo, QC cần assembly.qc và SKU cần kiot.import.

## Kiểm tra

`tools/production-qa.mjs` kiểm tra mobile/desktop và light/dark: các nguồn trùng,
đơn chưa bắt đầu/hủy, biến thể/màu, số đã xếp, QC dữ liệu cũ, 80 SKU, tìm không
dấu/giữ focus, route cũ, quyền từng nguồn và Back/reload giữ bộ lọc/tìm kiếm.
Kèm QA hiện có cho plate, kế hoạch, QC, cloud, ảnh và bán hàng trước phát hành.
