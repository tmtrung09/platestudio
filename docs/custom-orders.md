# Đặt custom tại cửa hàng

Chủ xưởng vào Phân quyền, chọn vai trò **Cửa hàng · Nhận đơn custom** cho tài
khoản nhân viên. Vai trò có quyền tạo và xem mọi đơn custom trong workspace cửa
hàng, không chỉnh đơn đã tạo, xác nhận tiến độ, sửa model hay dữ liệu xưởng.
Sau đăng nhập Plate Studio, tài khoản này được chuyển vào `custom-orders.html`.
Chủ xưởng/quản lý đơn hoặc người có quyền tạo/xem custom mở **Vận hành → Đơn custom**
trong sidebar máy tính, hoặc **Menu → Đơn custom** trên điện thoại. Mục này tìm
được bằng ô tìm kiếm trong Menu và ẩn khi tài khoản không có quyền.

Nhân viên tìm model theo tên hoặc mã KiotViet, chọn biến thể nếu có, chọn màu cho
từng part được dùng trong biến thể, nhập số lượng, mô tả và ảnh tham khảo. Không
tự chọn màu mặc định. Model không có part vẫn đặt được. Tiếp theo nhập tên khách,
điện thoại/Zalo, cách nhận hàng, địa chỉ nếu giao, tổng tiền/cọc/ngày hẹn, rồi
đối chiếu thông tin trước khi tạo.

Đơn/plate/part được tạo trong một transaction ở server. `colorChoices` và snapshot
tên/màu part theo từng dòng đi cùng đơn; model nguồn không bị đổi màu. Đơn custom
có nhãn riêng và được ưu tiên trong danh sách đơn, nhu cầu sản xuất, góc tiến độ
và thứ tự mặc định của plate. Chọn sắp xếp plate khác vẫn theo lựa chọn của người dùng.

Chọn model xong, thư viện tự thu gọn và đưa dòng yêu cầu vừa thêm vào vùng nhìn.
Mở **Thêm sản phẩm** để tìm thêm model; giữ nguyên các dòng đang nhập. Danh sách
model có vùng cuộn giới hạn, thanh **Thông tin khách** nằm trong tầm thao tác.
Tải lại hoặc quay lại bước Sản phẩm mở phần yêu cầu đã lưu.

Nháp, ảnh và yêu cầu chờ gửi nằm trong IndexedDB riêng theo workspace + user.
Reload/offline không đổi request ID. Ảnh tải lên đường dẫn bất biến trong bucket
riêng tư; mất ACK thì retry cùng request, server trả receipt cũ. Chỉ có QR sau ACK
của transaction. Lỗi quota không báo đã lưu; đóng trang khi chưa giữ được nháp có
cảnh báo. Catalog cache chỉ là dữ liệu đã được phép đọc trước đó, không cấp quyền
ghi; khi nối lại server kiểm tra lại membership và quyền.

QR mở `order-status.html#<token>`; khách không cần đăng nhập. Token riêng 64 ký tự
hex được sinh ngẫu nhiên ở server, gửi ở body tới Edge Function, không nằm trong query/referrer. Server
chỉ trả sản phẩm, yêu cầu, màu part, tiền và tiến độ của đúng đơn; không trả điện
thoại/địa chỉ khách, thông tin đăng nhập hay dữ liệu xưởng. Ảnh riêng được ký link
ngắn hạn. Link không hợp lệ không chuyển sang đơn khác. Liên hệ qua Facebook
Bánh Mì Stationery đã thống nhất.

Các mốc được suy từ dữ liệu sản xuất thực: chưa làm / đang làm / kiểm tra và hoàn
thiện / sẵn sàng nhận hoặc giao. Đơn nhận tại cửa hàng cần xác nhận cửa hàng nhận
đủ và hoàn thiện/QC xong trước mốc sẵn sàng. Mốc cuối chỉ do quản lý đơn xác nhận
**khách đã nhận hàng** trong chi tiết custom, không tự suy từ cửa hàng nhận xưởng.
Đơn hủy hiện rõ và không phát hoạt ảnh đang in. Trang khách cập nhật khi đang mở,
giữ scene DOM nếu tiến độ không đổi và nêu rõ khi chưa đọc được dữ liệu mới.

Phần bảo vệ RLS bổ sung chỉ giới hạn vai trò mới hoặc nhóm chỉ có các quyền custom
mới. Các role/quyền xưởng cũ và policy hiện có được giữ nguyên. API tạo đơn kiểm
tra lại revision model, biến thể, mọi màu part, số lượng, tiền, ngày và ảnh đã lưu.

Kiểm tra: `npm run qa:custom-orders`, `npm run qa:all` và `git diff --check`.
SQL QA chạy database cô lập; UI QA dùng transport giả lập và IndexedDB cô lập,
không tạo dữ liệu khách/xưởng thật. Edge Function được kiểm tra kiểu bằng Deno.
