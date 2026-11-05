# Thông báo bảo hành qua Zalo

Hàm chỉ gửi qua OA cửa hàng đã xác thực; không đăng ký OA, mẫu tin hoặc dịch vụ
trả phí. Endpoint kiểm tra service credential hoặc phiên quản lý đơn. OA được
giới hạn vào đúng `ZALO_CARE_WORKSPACE_ID`, không cho quản lý xưởng khác dùng OA.

Thiết lập trong **Supabase Edge Function secrets**, không nhập trong chat hoặc
commit vào Git:

| Tên | Nội dung |
| --- | --- |
| `ZALO_CARE_WORKSPACE_ID` | UUID xưởng sử dụng OA này |
| `ZALO_OA_ACCESS_TOKEN` | Access token OA do ứng dụng Zalo đã được cấp quyền lấy |
| `ZALO_CARE_APPROVED_TEMPLATE` | ID mẫu đã được duyệt cho mốc chấp nhận bảo hành |
| `ZALO_CARE_READY_TEMPLATE` | ID mẫu đã được duyệt cho mốc sẵn sàng đến nhận |
| `CUSTOM_CARE_PUBLIC_URL` | URL HTTPS đầy đủ kết thúc bằng `/order-status.html`, gồm cả đường dẫn con nếu host trên GitHub Pages |

Hai mẫu phải khai báo các biến **`order_code`, `warranty_code`, `tracking_url`**.
Đối chiếu CTA, domain và link có fragment với Zalo lúc duyệt mẫu; không khẳng định
mẫu hoặc link này đã được Zalo duyệt chỉ từ QA. Không gửi quảng cáo kèm tin giao dịch.
Số người nhận lấy từ đơn gốc ở server, không nhận số điện thoại từ request trình duyệt.

Access token có vòng đời hữu hạn. Bản này **không tự đăng nhập hoặc tự làm mới
OAuth token**. Cần dùng quy trình cấp/gia hạn token của ứng dụng OA và cập nhật
secret trước khi hết hạn. Nếu Zalo từ chối token/mẫu, hàng chờ chuyển `blocked`,
không tự gửi liên tục. Chưa thể cam kết vận hành không cần theo dõi khi chưa
có quy trình gia hạn token và kiểm chứng tài khoản thật.

## Chạy hàng chờ

- Khi quản lý mở mục Đánh giá & bảo hành, giao diện kiểm tra hàng chờ khoảng mỗi
  phút. Nút **Xử lý hàng chờ Zalo** cũng gọi hàm này. Không có cấu hình thì hàng
  chờ được đánh dấu rõ, phiếu bảo hành vẫn giữ nguyên.
- Để gửi cả khi web đóng, cấu hình lịch gọi Edge Function mỗi phút bằng chức năng
  scheduling của Supabase, hoặc scheduler sẵn có. Gửi POST JSON chứa `workspaceId`
  khớp biến cấu hình; dùng service credential ở server cho Authorization. Cất
  credential bằng Vault/secret binding của scheduler, không viết giá trị vào SQL,
  repository hoặc log. Lịch chạy chưa được tạo bởi mã migration này.
- API phản hồi `accepted` nghĩa dịch vụ đã tiếp nhận, chưa chứng minh khách đã
  đọc. Chưa tích hợp webhook xác nhận đọc hoặc xử lý hội thoại Zalo hai chiều.

Mỗi lượt xử lý tối đa 10 tin, mỗi phiếu chỉ có một hàng cho mỗi mốc. Khóa hàng
ngăn hai worker gửi cùng lúc. HTTP 429 được thử lại có giới hạn; mất kết nối,
HTTP 5xx, mất ACK hoặc lease hết hạn chuyển `unknown`, **không tự gửi lại** vì có
thể Zalo đã nhận. Đối chiếu trên trang quản trị Zalo bằng tracking ID trước khi
quản trị viên xử lý lại hàng đó. Không xóa receipt hay tạo phiếu mới để gửi lại.

Khi thiếu cấu hình được bổ sung, `not_configured` được tự đưa lại hàng chờ. Với
lỗi cấu hình khác, kiểm tra mã lỗi, sửa nguyên nhân và đối chiếu nhà cung cấp
trước khi quản trị viên đưa đúng hàng về `pending`. Không đặt lại `sent` hoặc
`unknown` hàng loạt. Mốc đã lỗi thời do tiến độ thay đổi không được gửi.

Kiểm tra không gửi tin thật:

```sh
DENO_TLS_CA_STORE=system npm run qa:care-api
node tools/customer-care-sql-qa.mjs
```

`DENO_TLS_CA_STORE=system` dành cho môi trường có CA proxy tin cậy trong hệ điều
hành. Trên PowerShell, đặt `$env:DENO_TLS_CA_STORE='system'` nếu cần; không tắt TLS.

Nguồn: <https://zalo.solutions/business-message> và
<https://zalo.solutions/business-message/pricing>. Phí thực tế theo gói OA/mẫu/CTA
được duyệt; kiểm thử transport không xác nhận tài khoản có quyền gửi thật.
