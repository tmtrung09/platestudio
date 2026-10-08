# Bán và tồn trên thẻ model

Theo yêu cầu ngày 2026-10-09: hover trong thư viện để thấy đã bán, tồn Kiot,
tồn xưởng; dấu hiệu tồn ít/bán chạy phải thích ứng với dữ liệu, không chốt một
ngưỡng số lượng cố định.

## Phép tính và giới hạn

- Kỳ mặc định: 30 ngày tính cả hôm nay. Chỉ cộng báo cáo đúng kỳ; ưu tiên kỳ
  ngắn/daily, không cộng hai báo cáo giao nhau. Ngày thiếu không coi là bán 0.
  Báo cáo chưa tải đủ chi tiết/revision hoặc SKU công thức thay thế không được
  gắn nhãn chắc chắn. Lịch sử không rõ kỳ không dùng để tính sức bán gần đây.
- Quy số bán/tồn SKU về lượng model bằng hệ số các thành phần required; biến
  thể của cùng model cộng hệ số. Không suy model đầu tiên cho SKU alternative.
- Tốc độ bán là max(trung bình các ngày có dữ liệu trong 30 ngày, trung bình
  các ngày có dữ liệu trong 7 ngày gần nhất). Nếu báo cáo gộp vắt qua mốc 7 ngày,
  chỉ dùng trung bình toàn kỳ, không tự phân bổ doanh số theo ngày.
- Tồn ít khi snapshot Kiot không đủ nhu cầu 7 ngày theo tốc độ đó. Hiện số ngày
  hàng còn bán được và số lượng cần phủ tuần tới; không dùng ngưỡng 5 món.
- Bán chạy là nhóm 20% model đã ghép SKU có sức bán cao nhất trong toàn thư viện,
  không chỉ danh mục đang lọc; hòa điểm cùng nhận nhãn. Cần ít nhất hai model có
  bán và hai ngày báo cáo. Chưa đủ dữ liệu hiện trạng thái thiếu, không đoán.
- Xưởng lấy workshopReadyDeliveryQty từ nguồn vận hành chung: thành phẩm còn
  lại sau QC/trừ gửi hàng, cộng remainingQty của tồn đầu kỳ active đã kiểm.
  Không cộng lịch sử part đã in hay hàng chưa gia công. Khi nguồn cloud xưởng
  chưa đầy đủ, hiện giới hạn dưới hoặc trạng thái chưa tải đủ, không khẳng định 0.
- Nguồn Kiot và xưởng kiểm quyền riêng. Snapshot ghi ngày cập nhật; đây là dữ
  liệu đã nhập, không phải kết nối live trực tiếp Kiot. Không sửa ledger/source.

## Giao diện và kiểm tra

Một portal ngoài card: hover/focus và nút chạm 44px, Escape/click ngoài để đóng,
không cắt bởi overflow card, tránh thanh navigation mobile. Badge SVG và nhấn màu
tĩnh; phần tiêu chí mở khi cần. Tải nền hữu hạn, giữ DOM ảnh/card, focus và cuộn;
ưu tiên ảnh camera đang chờ. Lỗi có thử lại, không gọi request mỗi lần hover.

`tools/model-signals-qa.mjs`: 350 model, 320/390/640/1024/1440 light/dark;
hệ số SKU, tồn sau gửi/QC, tồn đầu kỳ, tốc độ thay đổi, duplicate kỳ, thiếu nguồn,
quyền, hover/focus/chạm, Escape, viewport và giữ DOM/focus. Dữ liệu cô lập.
