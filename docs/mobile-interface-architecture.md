# Giao diện Plate Studio cho điện thoại

## Hướng thiết kế đã thống nhất

Thiết kế điện thoại từ công việc người dùng cần làm bằng cảm ứng. Mobile và
desktop có lớp trình bày riêng, cùng nhận diện và cùng một nguồn dữ liệu/nghiệp
vụ. Bản mẫu tương tác được dùng để chốt cách dùng trước khi tích hợp.

## Hiện trạng đã kiểm tra trong mã nguồn

- `plate-studio.html`: `renderRoleMobileNavigation()` đã có điều hướng mobile
  riêng; `goPage()` điều phối các trang và lịch sử dùng chung.
- `renderModels()` và `viewModel()` vẫn dựng nội dung dùng chung cho nhiều loại
  màn hình. CSS và điều kiện chiều rộng đang quyết định phần lớn cách co/xếp lại.
- `kiot-mapping-sync.js` đã bảo vệ ghép SKU theo xưởng/tài khoản, lưu IndexedDB,
  revision, request ID và trạng thái xác nhận server. Đây là phần dùng chung cần
  giữ; giao diện mobile mới gọi lại lệnh nghiệp vụ, không viết luồng lưu khác.
- `assets/app/forest-theme.css` và `assets/app/surfaces.css` giữ nhận diện, màu
  trạng thái và quy tắc bề mặt. Các token có thể dùng chung, không có nghĩa hai
  lớp phải dùng cùng DOM hoặc cùng cách điều hướng.

## Cấu trúc khi triển khai

```text
Nguồn dữ liệu / quyền / lệnh nghiệp vụ / lưu bền / đồng bộ
                         |
             Trạng thái màn hình và điều hướng
                 /                       \
       Lớp trình bày mobile        Lớp trình bày desktop
       Trang tác vụ, sheet         Danh sách + chi tiết,
       và hành động chạm           toolbar và thao tác chuột
```

Chỉ một lớp trình bày hoạt động ở mỗi vùng làm việc. Không mount hai form rồi
ẩn một bằng CSS: cách đó có thể tạo listener, ID, nháp và yêu cầu lưu trùng.

Chọn loại giao diện theo không gian làm việc và khả năng tương tác; không chỉ
đọc tên thiết bị. Điện thoại xoay ngang, tablet có bàn phím và cửa sổ desktop hẹp
cần được kiểm tra riêng. Đổi loại giao diện giữ trạng thái đang nhập, vị trí,
lựa chọn và yêu cầu đang lưu; không tự tải lại dữ liệu hoặc gửi lại thao tác.

CSS responsive vẫn dùng bên trong mỗi lớp để vừa các cỡ màn hình của lớp đó.
Nó không quyết định toàn bộ luồng thao tác thay cho thiết kế mobile.

## Bản mẫu để duyệt

`assets/demos/mobile-first.html` dùng dữ liệu minh họa và lệnh trong bộ nhớ,
không gọi backend, không lưu vào localStorage/IndexedDB hoặc xin quyền camera.
Ảnh bàn phím là ảnh tham khảo người dùng cung cấp; các model chưa có ảnh dùng
khung thiếu ảnh, không tự tạo ảnh sản phẩm.

Các màn hình đại diện:

- Trang chủ: việc cần xử lý và lối vào thao tác, không thu dashboard desktop.
- Model: danh sách dành cho cảm ứng, tìm kiếm và lọc; chi tiết thành một màn
  riêng. Ghép SKU mở bước chọn có tìm kiếm và nút Ghép sát đáy, giữ model nguồn.
- Tạo đơn: chọn sản phẩm rồi sang bước yêu cầu; quay lại giữ sản phẩm và tên
  đang nhập. Tên bàn phím mặc định in hoa. Bàn phím có hai part vật lý và ba vùng
  màu Khay / Nút / Ký tự; lưới màu dùng swatch từ bảng tham khảo đã có trong repo,
  giữ lựa chọn Màu gốc. Gửi đơn chỉ tạo kết quả minh họa.
- Sản xuất: ba góc nhìn Cần in / Plate & máy / Tiến độ, mỗi góc ưu tiên việc
  cần quyết định. Các trạng thái và số lượng đều là dữ liệu minh họa.
- Menu: tìm chức năng và mở màn minh họa; camera hiển thị rõ là mô phỏng.

## Phạm vi tích hợp toàn hệ thống

Phạm vi là mọi trang và luồng của Plate Studio trên điện thoại. Việc kiểm tra
có thể chia theo nhóm nội bộ, nhưng không coi một trang chuyển đổi riêng lẻ là
hoàn tất yêu cầu mobile của hệ thống.

`assets/app/mobile-routes.js` là kiểm kê các trang và bề mặt chuyên biệt;
`mobile-workspace.js` sở hữu cây trình bày mobile và `mobile-workspace.css` sở hữu
hình học/bề mặt của cây đó. Widget dữ liệu, ô nhập và lệnh hiện hữu chỉ có một
instance; chúng được đặt trong vùng thao tác mobile, không sao chép biểu mẫu
desktop thành một bộ dữ liệu/lưu mới.

Các nhóm phải được bao phủ cùng nhau:

| Nhóm | Trang và luồng |
|---|---|
| Điều hướng | Trang chủ theo quyền, menu/tìm chức năng, đường vào và Back/Forward |
| Thư viện | Model/sản phẩm ghép, Đơn, Plate, Project, Màu nhựa và báo cáo mẻ |
| Nhận đơn | Tạo/sửa đơn nội bộ, nhận đơn custom, yêu cầu màu/tên/ảnh, QR và trang khách |
| Sản xuất | Cần in, lịch máy/khay nhựa, máy/lịch sử mẻ, tiến độ bốn góc xem |
| Hoàn thiện | QC/gia công/quẹt, bao bì, tạo phiếu giao và nhận hàng |
| Bán hàng | Thống kê/khoảng ngày, Đồng bộ Kiot, công thức ghép SKU, lịch sử/sổ đối chiếu |
| Quản trị | Tài khoản, phân quyền, thiết bị, dữ liệu/nhập xuất/sao lưu |
| Bề mặt chung | Chi tiết, form tạo/sửa, bộ chọn, camera/ảnh chờ, thông báo và lỗi/retry |

Bố cục tùy chỉnh mobile có phạm vi trình bày riêng, không ghi đè sở thích bố
cục desktop. Các dữ liệu nghiệp vụ, nháp, ID và hàng chờ lưu vẫn dùng chung.

Các khối có vòng đời riêng như thẻ đầu trang và thanh Sản xuất giữ vị trí mà
renderer nguồn quản lý, tránh tạo trùng khi đổi quyền. Công cụ Cuộn lên đầu
trang nằm trong Tùy chọn trang trên mobile để không che nút trong nội dung.
Form dùng chiều cao vùng nhìn thực; khi bàn phím làm vùng nhìn quá thấp,
trang nhận quyền cuộn thay cho một panel cố định bị cắt.

Bản mẫu không chứng minh backend hoặc ứng dụng chính đã được chuyển đổi.
Khi tích hợp, mỗi luồng phải qua kiểm tra tạo/sửa/lưu/tải lại/ACK/xung đột,
mobile và desktop; chạy `npm run qa:all`, diff check và xác minh bản web.
