# Gia công bằng thẻ quẹt

Trong Gia công & giao hàng, nút **Quẹt part** nằm cạnh tiêu đề Gia công. Chỉ tài
khoản đã đăng nhập có quyền `assembly.qc` được thao tác. Quay lại danh sách bằng
nút Danh sách. Tìm kiếm dùng chung ô tìm của trang, không tạo thư viện riêng.

Mỗi thẻ giữ ID đơn/dòng/part/màu thực từ phân bổ in đã bàn giao xưởng. Các phân
bổ cùng part và màu trong một dòng đơn được cộng đúng số lượng, không gộp giữa
đơn hoặc biến thể. Dữ liệu cũ thiếu định danh vẫn giữ trong danh sách để kiểm tra.
Ảnh part thật ưu tiên trước ảnh model; thiếu/lỗi có fallback. Không dùng hình demo.

Toàn bộ thẻ nhận quẹt, trừ ô và nút chỉnh số lượng. Phải đi bước tiếp theo, trái
là báo lỗi hoặc chờ vật tư theo trạng thái, lên để sau. Có nút và phím tương ứng.
Số lượng mặc định là phần còn lại; xử lý một phần đưa phần chưa xử lý xuống cuối.
QC lỗi yêu cầu lý do, trả đúng số part lỗi về nhu cầu in bù trong cùng transaction.
Model chỉ có số lượng thành phẩm bằng số bộ đủ mọi part, tính cả hệ số/đổi màu.

Lượt quẹt lưu IndexedDB riêng theo xưởng và tài khoản trước khi đổi thẻ. Queue
từng request độc lập, giữ ID qua reload/mất ACK, tự retry khi online/trở lại tab.
`commit_workshop_swipe` xác thực quyền, nguồn số lượng, trạng thái và revision;
receipt chống ghi trùng. Xung đột giữ bản chờ để đối chiếu, không tự ghi đè mới.
Chỉ thông báo đã lên hệ thống sau ACK. Hoàn tác có điều kiện, không giảm phần đã
giao hoặc phục hồi lỗi đã được xử lý tiếp. Các màn đọc tiến độ dùng cùng aggregate
của đơn; generic order sync từ phiên cũ không xóa trạng thái part đã lưu.

Guard SQL chạy database cô lập và guard UI dùng trình duyệt/transport cô lập;
không tạo đơn hoặc thay đổi dữ liệu xưởng thật để thử. Chạy `npm run qa:workshop-swipe`
và gate chung `npm run qa:all` trước phát hành. Migration:
`202610260001_workshop_swipe.sql` và
`202610260002_workshop_swipe_legacy_delivery_guard.sql`.
