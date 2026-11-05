# Đánh giá và bảo hành sau mua

## Luồng đã tích hợp

Trang `order-status.html` có phần **Đánh giá & bảo hành**, mở sau khi cửa hàng
xác nhận khách nhận hàng. Khách chấm hai điểm độc lập, gửi tình trạng và ảnh,
đọc phản hồi, bổ sung thông tin và xem tiến độ bảo hành riêng.

Trong `custom-orders.html`, mục **Đánh giá & bảo hành** mở hộp thư chăm sóc.
Nhân viên có quyền xem; chỉ chủ xưởng/quản lý đơn duyệt, từ chối, yêu cầu bổ sung
và xác nhận khách nhận phần thay thế. Quản lý phải chọn rõ part và số lượng trước
khi duyệt. Số lượng không vượt phần đã mua. Part không còn trong thư viện phải
đối chiếu trước, không ghép theo tên.

Duyệt tạo một công việc `kind: warranty` riêng cùng plate/plate_item cho đúng part,
giữ màu, ký tự và cấu hình in từ phần gốc. Không cộng doanh số hay số lượng đơn
mua. Tiến độ lấy từ dữ liệu in/QC/nhận tại cửa hàng thật; chưa có các bước đó thì
không thể xác nhận giao khách. Kế hoạch bị xóa/sửa sai chuyển sang cần đối chiếu.
Xóa đơn gốc theo quyền có sẵn không xóa lịch sử chăm sóc; link khách của đơn đã
xóa không còn dùng được, lịch sử đóng vẫn xem được ở phía cửa hàng.

Chuông thông báo chính nhận sự kiện mới từ server, có trạng thái đã đọc theo
tài khoản và mở đúng phiếu. Đây là thông báo trong web, chưa là push ngoài web.
Hộp thư có phân trang yêu cầu/đánh giá. Draft, blob ảnh, thông tin bổ sung và
envelope gửi nằm trong IndexedDB theo token riêng của đơn. Mất ACK thử lại cùng
request ID; offline giữ bản đã nhận và kiểm tra lại quyền ở server khi gửi.

Ảnh ở bucket riêng tư `custom-care-media`, tối đa 4 ảnh/phiếu, 5 MB/ảnh; server
kiểm tra manifest, kích thước, chữ ký định dạng và SHA-256 trước khi lưu phiếu.
Upload xong chưa đồng nghĩa phiếu đã lưu. Không có policy truy cập bảng/bucket
cho anon; endpoint công khai tự giới hạn theo token đơn.

## Demo tham khảo

Mở `assets/demos/customer-care.html` qua server HTTP của repository. Bản này
dùng dữ liệu minh họa trong bộ nhớ, không gọi API, lưu dữ liệu hay gửi thông báo
thật. Ảnh chọn từ thiết bị chỉ được xem trong phiên trang này. Tải lại sẽ xóa.
Demo được giữ riêng để tham khảo; các nút mô phỏng không có trong luồng thật.

Thử luồng:

1. Khách chọn sản phẩm, bộ phận bị hỏng (hoặc chưa xác định), mô tả và ảnh.
2. Chuyển góc xem **Cửa hàng**: thấy yêu cầu, ảnh và thông báo mới. Nhập phản
   hồi rồi chọn yêu cầu bổ sung, duyệt in thay thế hoặc từ chối có lý do.
3. Khi cần thông tin, khách đọc lời nhắn và gửi bổ sung; cửa hàng xem lại.
4. Sau duyệt, thử lần lượt bắt đầu in → kiểm tra → sẵn sàng nhận → khách đã nhận.
   Phía khách có hành trình riêng và lời mời đến nhận khi cửa hàng xác nhận.
5. Khách đánh giá trải nghiệm và chất lượng độc lập, từ 1 đến 5, không chọn sẵn.
   Đánh giá được xem riêng trong góc cửa hàng, không quyết định bảo hành.

Nút chuyển tiến độ chỉ mô phỏng để duyệt thiết kế. Thông báo demo là danh sách
sự kiện trên trang, không là bằng chứng đã gửi Zalo/SMS/push. Giới hạn ảnh dùng
để thử giao diện (4 ảnh, 5 MB/ảnh) cần được đối chiếu với chính sách thực tế khi
tích hợp. Chưa đặt thời hạn bảo hành, cam kết miễn phí hoặc thời gian hoàn tất.

## Hợp đồng dữ liệu

- Tái sử dụng token riêng của `order-status.html` và đường server trung gian như
  `custom-order-status`. Token phải nằm trong body, không đưa vào query/log.
  Token chỉ được đọc/gửi dữ liệu chăm sóc của đúng đơn; không cấp quyền xưởng.
- Lưu đánh giá và phiếu bảo hành trong bảng riêng có workspace/order ID, line
  ID, part ID cùng snapshot lúc mua; không dò part bằng tên hoặc sửa đơn gốc.
  Part không còn tồn tại phải được đối chiếu, không tự ghép sang part mới.
- Ghi phiếu, receipt chống trùng, sự kiện và hàng chờ thông báo trong transaction.
  Retry cùng request ID sau mất ACK; kiểm tra quyền và revision khi duyệt.
  Draft và blob ảnh cần giữ bền qua offline/reload trước khi báo đã lưu.
- Ảnh riêng tư, giới hạn MIME/kích thước/số lượng ở server, đường dẫn bất biến
  gắn đúng phiếu; link xem ngắn hạn. Không cho token upload/đọc ảnh đơn khác.
- Chỉ chủ xưởng/quản lý được duyệt/từ chối và xác nhận đã giao phần bảo hành.
  Thông báo nội bộ cần lưu bền, có trạng thái đã đọc và mở đúng phiếu.
- Duyệt tạo nhu cầu in thay thế chỉ cho đúng part/số lượng đã chốt, liên kết
  phiếu bảo hành với các plate_item của luồng sản xuất hiện có. Không nhân đôi
  đơn, định mức, tiền mua hoặc tiến độ hoàn thành của đơn gốc.
- Sau duyệt, suy tiến độ từ in/QC/giao nhận thực tế. Không cho nút mô phỏng trong
  demo trở thành nguồn tiến độ thật; chỉ báo sẵn sàng khi hàng đạt và đã đến nơi
  nhận. Khách nhận phần thay thế là một xác nhận riêng.
- Gửi thông báo chủ động qua Zalo cần đăng ký dịch vụ, OA, mẫu được duyệt và
  kênh gửi server. Hàng chờ gửi phải chống trùng, retry hữu hạn, có trạng thái
  giao nhận độc lập với trạng thái bảo hành. Lỗi gửi không làm mất phiếu hoặc
  lùi trạng thái sản xuất. Trang theo dõi luôn cho phép đọc lại tiến độ.

## Đưa lên project thật

Chạy quy trình này từ checkout của repository bằng tài khoản có quyền triển
khai. Dùng đăng nhập/secret binding an toàn của CLI,
không gửi giá trị token/password trong chat hay ghi vào repository.

1. Xác minh project **mapmfngikmumvghapqcu** và trạng thái migration từ môi trường
   đã xác thực. Nếu chưa liên kết, dùng `npx supabase link --project-ref
   mapmfngikmumvghapqcu`. Chạy `npx supabase migration list --linked`; không tự sửa
   lịch sử migration hoặc áp dụng migration không liên quan.
2. Sau khi đối chiếu chỉ migration được giao còn chờ, áp dụng
   `202611050001_custom_order_care.sql` bằng quy trình migration của project
   (`npx supabase db push --linked` chỉ khi danh sách pending đã được đối chiếu).
3. Deploy `custom-order-care` và `custom-care-zalo` bằng CLI Supabase cho đúng
   project. `supabase/config.toml` đặt `verify_jwt=false`: endpoint khách dùng
   token riêng của đơn; nhánh cửa hàng và worker tự xác minh user/service token
   rồi kiểm tra ACL. Không bỏ phần xác minh bên trong hàm.
4. Cấu hình OA/mẫu tin theo
   `supabase/functions/custom-care-zalo/README.md`. Thiếu cấu hình không ngăn lưu
   phiếu. Muốn gửi khi web đóng phải thêm lịch chạy worker phía server. Chưa có
   tự làm mới OAuth token; cần quy trình gia hạn token của OA.
5. Chạy kiểm tra bằng tài khoản thử được cho phép: nhận hàng → đánh giá → gửi
   ảnh → quản lý duyệt → in/QC/nhận cửa hàng → khách theo dõi → xác nhận giao.
   Không dùng dữ liệu khách/xưởng thật làm fixture. Gửi Zalo thử chỉ sau khi mẫu,
   số người nhận thử và chi phí được người có quyền chấp nhận.
6. Khi backend đã kiểm chứng, phát hành frontend qua quy trình Pages hiện có,
   xác nhận revision/asset phục vụ. `assets` đã được workflow copy toàn bộ;
   service worker đã cập nhật cache cho module chăm sóc mới.

Kiểm thử cục bộ không ghi dữ liệu thật:

```sh
npm run qa:care
DENO_TLS_CA_STORE=system npm run qa:care-api
```

Đặt `CHROME_PATH` phù hợp hệ điều hành. Trên Windows/PowerShell, đặt biến môi
trường bằng `$env:...` trước lệnh; chỉ cần CA hệ thống cho Deno khi có proxy CA.
Không tắt xác minh TLS. Hồi quy liên quan: `tools/custom-orders-sql-qa.mjs`,
`tools/custom-orders-ui-qa.mjs`, `tools/custom-orders-persistence-qa.mjs`,
`tools/startup-qa.mjs`, `tools/service-worker-qa.mjs` và `tools/notifications-qa.mjs`.
QA thông báo hỗ trợ `QA_NOTIFICATIONS_BASE` để chạy qua HTTP khi Chromium chặn
`file://`; vẫn cô lập CDN/Supabase, không bỏ assertion.

## Kết nối Zalo bằng OA đã xác thực

Tái sử dụng OA của cửa hàng, không đăng ký OA mới. Kiểm tra OA đã liên kết tài
khoản dịch vụ Zalo Business Solutions/Zalo Cloud Account và ứng dụng API chưa.
Nếu chưa có, tạo ứng dụng tại Zalo Developers, liên kết OA và cấp quyền truy cập;
liên kết tài khoản dịch vụ, chọn gói phù hợp và nạp số dư theo yêu cầu của Zalo.
Không gửi access token, refresh token hoặc app secret trong chat hay đưa vào web.

Tài liệu hiện giới thiệu dịch vụ theo tên **ZBS Template Message**; hướng dẫn
đăng ký còn dùng tên **ZNS**. Đăng ký mẫu theo đúng giao dịch bảo hành và chờ
Zalo duyệt trước khi gọi API gửi. Mẫu đề xuất để đối chiếu, chưa được phê duyệt:

> Bánh Mì Stationery thông báo: Phần thay thế của yêu cầu bảo hành <warranty_code>
> đã sẵn sàng. Bạn vui lòng đến cửa hàng nhận hàng. Nút: Xem tiến độ bảo hành.

Gửi đến số điện thoại gắn với giao dịch và đang dùng Zalo; dịch vụ không yêu cầu
khách theo dõi OA trước đó. Cần kiểm tra điều kiện gửi, mẫu và nội dung CTA thực tế
khi đăng ký. Không hứa gửi thành công đến mọi số điện thoại hoặc tin đã được đọc.
Link riêng cần được đối chiếu với quy định CTA của Zalo trước khi dùng; không
đưa số điện thoại hay chi tiết nhạy cảm vào URL công khai.

Hàng chờ chuẩn bị hai mốc đã duyệt và sẵn sàng đến nhận, không gửi từng cập nhật
in nhỏ; chỉ gửi thật sau khi có cấu hình OA/mẫu tin. Bảng giá công bố nhiều mẫu thông
thường ở mức 200đ/tin xử lý thành công, chưa VAT; chi phí thực tế tùy loại mẫu,
thành phần, nút thao tác và gói OA. Cần đối chiếu khi kích hoạt dịch vụ trả phí.

Nguồn chính thức đã đọc:

- <https://zalo.solutions/business-message>
- <https://zalo.solutions/blog/huong-dan-dang-ky-su-dung-dich-vu-zns/jlm44tzzwffh0od10ix6rra7>
- <https://zalo.solutions/business-message/pricing>
