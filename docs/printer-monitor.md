# Máy trực tiếp trên web

Quyết định ngày 2026-10-10: theo dõi khi web đang mở, dùng Supabase hiện có;
không cần chạy PrintPeek, LAN, Bambu Connect hoặc cấp hosting 24/7.

## Sử dụng

Sản xuất → Plate & máy → Máy trực tiếp. Chủ xưởng chọn Kết nối, dùng email đã
liên kết với tài khoản Bambu, gửi mã và xác nhận. Chưa có kết nối/dữ liệu thì
không tạo máy giả. Biệt danh lưu riêng trên thiết bị. Bảng ghim chỉ ở trong web.

Phản hồi thành công có `code: null` được chấp nhận; username có sẵn trong token
không cần gọi preference lần nữa. Lỗi nêu đúng bước và mã/HTTP đã lọc, không
hiển thị nguyên nội dung có thể chứa thông tin tài khoản. Mã sai/hết hạn có
thông báo riêng; lỗi giữ form và phiên cũ. Không gửi mã mới đồng thời với xác nhận.

Thông báo bắt đầu/tạm dừng/tiếp tục/in xong/thất bại/mất/kết nối lại dùng bảng
thả và pop-up hiện có. Cảnh báo, lỗi, thông tin có nhãn riêng. “Bỏ qua cảnh báo”
chỉ áp dụng warning theo máy + mã + đợt xuất hiện, giữ lịch sử và có Hiện lại.
Trạng thái máy không bị biến thành lỗi chỉ vì có warning; không có lệnh xóa
cảnh báo hoặc điều khiển pause/resume/tốc độ. Quyền điều khiển Bambu của
PrintPeek vẫn chưa được giải quyết.

## Thu dữ liệu và quyền

- Edge Function `bambu-monitor` xác minh JWT Plate Studio và workspace trực
  tiếp, dù gateway `verify_jwt=false`. Không có endpoint đọc ẩn danh.
- Chỉ chủ workspace đăng nhập/ngắt tài khoản Bambu. Email có cooldown server.
  MQTT CONNACK/SUBACK phải xác nhận quyền đọc trước khi thay phiên liên kết cũ.
- Phiên Bambu mã hóa AES-GCM phía server, AAD theo workspace. Bảng chứa phiên
  không có quyền đọc của web. Token, mã email không đưa vào URL/log/localStorage.
  Khóa mã hóa dẫn xuất từ service-role key: nếu xoay key, đăng nhập Bambu lại.
- MQTT TLS 8883 có xác minh chứng chỉ; chỉ subscribe topic report của các ID
  đã bind. Lệnh duy nhất là `pushall` (yêu cầu snapshot), tối đa mỗi máy 5 phút.
  API cloud đọc được kế thừa từ PrintPeek, không bảo đảm hợp đồng public ổn định.
- Browser dùng POST NDJSON có Authorization header. Mỗi relay tối đa 85 giây,
  rồi nối lại; lease DB giới hạn một producer/workspace, chặn producer hết hạn.
  Các tab khác đọc state/events mỗi 5 giây và nhận luồng khi lease được nhả.
  Lịch sử không tải lại ở nền khi không xem; đọc nền có ưu tiên thấp và giãn
  tới 15 giây khi camera có ảnh đang chờ để không tranh tải với ảnh nhân viên.
  Popup cùng trình duyệt dùng seen-ID và Web Locks để tránh trùng.
- Đóng toàn bộ web/mất mạng có thể tạo khoảng trống; relay cuối có thể sống
  đến hết phiên ngắn của nó. Không có dịch vụ thu liên tục khi mọi web đã đóng.
  Hạn mức Edge/DB/băng thông vẫn phụ thuộc tài khoản Supabase, không hứa miễn phí.
- Đọc theo quyền `progress.view` hoặc `plates.plan`; ghép model theo Plate.
  Không sửa các bảng tồn, pitem, plate, camera, báo cáo, operations hoặc QC.

## Lịch sử mẻ

Snapshot, sự kiện và mẻ commit nguyên tử; retry event có khóa duy nhất.
Run giữ ID máy, dòng máy, task/subtask, tên file, lần đầu quan sát, bắt đầu/
kết thúc đã quan sát, thời gian in/tạm dừng đã theo dõi, kết quả và cờ khoảng
trống. Không gọi giờ quan sát là giờ thực của máy; mở giữa mẻ hoặc gián đoạn
không bịa tổng thời gian hay thông báo chuyển trạng thái đã bỏ lỡ.

Ảnh dòng máy từ bộ ảnh BambuStudio chính thức qua CDN. Thumbnail lấy từ cloud
chỉ khi **máy và task/subtask trùng chính xác, duy nhất**; thiếu/ảnh lỗi giữ
fallback, không lấy mẻ gần nhất hoặc đoán theo tên. Hiện lưu URL cloud (chưa
chép thành bản ảnh vĩnh viễn); URL hết hạn/mẻ ngoài 50 task gần nhất có thể
không có ảnh. Đây không phải kho lưu bản gốc ảnh chụp của nhân viên.

Ghép model/biến thể/số lượng chủ động vào từng run bằng bộ chọn tìm kiếm + ảnh.
Các liên kết là cột riêng, telemetry không ghi đè; lưu có revision chống ghi
đè thiết bị khác, lỗi giữ lựa chọn và có đối chiếu bản mới trước khi lưu lại.
Ngắt liên kết chỉ xóa phiên, không xóa lịch sử. Dữ liệu không tự xác nhận QC
hay cộng tồn; history tải từng 50 dòng có Xem thêm.

Mô tả HMS và dictionary Việt hóa được chuyển cơ học từ PrintPeek, giữ license
ha-bambulab và attribution OPUS/Argos trong `supabase/functions/bambu-monitor/licenses`.
Dictionary chưa được người chuyên môn duyệt toàn bộ; xem nội dung gốc/mã khi
cần, không coi bản dịch tự động là hướng dẫn an toàn chắc chắn.

## Kiểm chứng

`npm run qa:printers`: reducer/MQTT giả lập, PostgreSQL cô lập (RLS/lease/
rollback/retry/cooldown/liên kết), UI 320/390/640/1280 và light/dark; lỗi lưu,
focus/ảnh/stepper, cảnh báo sau reload, quyền và thông báo. `npm run qa:printer-api`
dùng Deno với fetch giả, không đăng nhập Bambu hoặc sửa dữ liệu xưởng.

Sau khi deploy, chủ xưởng vẫn cần đăng nhập tài khoản Bambu qua web và kiểm
tra sáu máy thật. Deploy function/migration hay QA mô phỏng không phải bằng
chứng luồng MQTT từ Supabase đến sáu máy đã hoạt động. Không gửi lệnh máy
để QA hoặc dùng secrets lấy từ app Windows thay cho sự đăng nhập chủ động.
