# Đặt custom tại cửa hàng

Chủ xưởng vào Phân quyền, chọn vai trò **Cửa hàng · Nhận đơn custom** cho tài
khoản nhân viên. Vai trò có quyền tạo và xem mọi đơn custom trong workspace cửa
hàng, không chỉnh đơn đã tạo, xác nhận tiến độ, sửa model hay dữ liệu xưởng.
Sau đăng nhập Plate Studio, tài khoản này được chuyển vào `custom-orders.html`.
Chủ xưởng/quản lý đơn hoặc người có quyền tạo/xem custom mở **Vận hành → Đơn custom**
trong sidebar máy tính, hoặc **Menu → Đơn custom** trên điện thoại. Mục này tìm
được bằng ô tìm kiếm trong Menu và ẩn khi tài khoản không có quyền.

Nhân viên tìm model theo tên hoặc mã KiotViet, chọn biến thể nếu có, nhập số lượng,
mô tả và ảnh tham khảo. Part chưa chỉnh giữ màu gốc của biến thể hoặc kế thừa màu
part; nguồn nhiều màu giữ đủ màu, nguồn chưa có màu giữ chưa chỉ định. Chỉ chọn
màu cho part cần đổi, chọn **Giữ màu gốc** để bỏ thay đổi. Tìm màu bằng tiếng Việt
có hoặc không dấu, kể cả tên màu tiếng Anh tương ứng (như trắng → White, đen → Black).
Model không có part vẫn đặt được. Tiếp theo nhập tên khách,
điện thoại/Zalo, cách nhận hàng, địa chỉ nếu giao, tổng tiền/cọc/ngày hẹn, rồi
đối chiếu thông tin trước khi tạo.

Đơn/plate/part được tạo trong một transaction ở server. `colorChoices` chỉ chứa
part đổi màu; snapshot tên/màu đã chốt của tất cả part đi cùng đơn; model nguồn
không bị đổi màu. Migration `202610300001_custom_order_original_colors.sql` cập nhật
catalog màu gốc và cách server tạo kế hoạch in. Đơn custom
có nhãn riêng và được ưu tiên trong danh sách đơn, nhu cầu sản xuất, góc tiến độ
và thứ tự mặc định của plate. Chọn sắp xếp plate khác vẫn theo lựa chọn của người dùng.

Máy tính màn rộng đặt thư viện model bên trái và phần màu/yêu cầu bên phải,
giữ thư viện mở khi thêm sản phẩm. Trên màn hẹp, chọn model xong thư viện tự
thu gọn và đưa dòng yêu cầu vừa thêm vào vùng nhìn.
Mở **Thêm sản phẩm** để tìm thêm model; giữ nguyên các dòng đang nhập. Danh sách
model có vùng cuộn giới hạn, thanh **Thông tin khách** nằm trong tầm thao tác.
Tải lại hoặc quay lại bước Sản phẩm mở phần yêu cầu đã lưu.

Chọn model **bàn phím tên**, có hai part **khay** (hoặc **Khay bàn phím**) và **nút+ký tự**, sẽ mở phần
minh họa ngay trong dòng sản phẩm. Nhân viên nhập ký tự và chọn ba màu **Khay bàn
phím / Nút bàn phím / Ký tự** bằng bộ chọn màu nhựa hiện có. Hình dùng các khay,
nút và chữ từ 3MF, chiếu ở một góc cố định; không có điều khiển xoay 3D. Đổi màu
chỉ tô lại bản đồ vật liệu, giữ nguyên hình học. Ký tự ngoài bộ chữ trong 3MF
có thông báo font minh họa thay thế.

Migration `202610300002_custom_keyboard_preview.sql` cung cấp ánh xạ ID theo
model/part đã xác nhận và kiểm tra lại khi tạo đơn. Nút và ký tự giữ chung một
`plate_item`, có `filamentIds`, `componentColors`, ký tự và ghi chú màu đã chốt;
không nhân đôi sản lượng khi dùng hai màu. Màu gốc chưa có vai trò nút/chữ được
giữ theo nguồn, không đoán theo thứ tự mảng. Nháp và yêu cầu chờ gửi giữ tên,
ba màu và cùng request ID; phần xem lại, chi tiết đơn và link khách đọc snapshot.

Bộ hình dùng Blender Cycles dựng ánh sáng mềm, độ bóng, vân lớp nhựa và bóng
tiếp xúc từ mesh thật; giữ riêng màu nhựa với ánh sáng để đổi màu tức thời.
Dựng lại bằng hai bước sau; bước Python cần numpy/Pillow để lọc bóng và tối ưu PNG:

```sh
blender -b --python-exit-code 1 -P tools/render-keyboard-studio.py -- "<source.3mf>" --bake --output assets/custom-orders/keyboard-render-data.js
python tools/render-keyboard-studio.py --split --output assets/custom-orders/keyboard-render-data.js
```

Blender chỉ dùng khi dựng asset, không là phụ thuộc của web và không thêm trình xem 3D.
Web chỉ tải ảnh khay theo chiều dài và các chữ đang dùng, rồi cache theo service
worker; không tải toàn bộ bảng hình để mở form. Ảnh đã tải xem lại được offline;
nếu chưa có ảnh cần dùng khi mất mạng, nháp vẫn được giữ và hình báo chưa tải được.
Công cụ chỉ đọc hình học, không thực thi G-code, và lưu SHA-256 nguồn trong asset
để đối chiếu. Minh họa không tự sửa thư viện màu hay model.

Thư viện dùng chung có bảng tham khảo PLA Matte R3D/TINMORRY/CAILAB trong
`assets/filaments/reference-palette.json`. Tên Việt, tên gốc, mã, dòng và hãng
được tìm trong thư viện lẫn bộ chọn màu. Nguồn mở từ hộp sửa màu, ghi rõ swatch
web hãng, bảng nhà phân phối hay lấy mẫu ảnh; HEX tham khảo không phải số đo nhựa.
Màu trùng đã đối chiếu giữ ID, HEX, tên/ghi chú và các liên kết cũ, chỉ bổ sung
metadata. TINMORRY nhận diện tên hãng cũ Timory/Tinmory; tên gần giống không tự ghép.
Nhập catalogue không tạo cuộn hoặc số lượng tồn. Chạy lại không thêm bản trùng;
trường hợp nhiều bản khớp/đã xóa dừng cả transaction để đối chiếu.

Migration chỉ tạo hàm nhập dành cho admin, không tự nhập vào mọi xưởng. Chuẩn bị
SQL bằng `node tools/prepare-filament-palette-import.mjs --workspace=<uuid>`;
đối chiếu kết quả dry-run trước khi chuẩn bị lại với `--apply`. Chạy SQL đã tạo
qua Supabase admin CLI cho đúng project/xưởng, rồi đọc lại cloud và dry-run lần
nữa. Quyền trình duyệt không được gọi hàm nhập này.

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
