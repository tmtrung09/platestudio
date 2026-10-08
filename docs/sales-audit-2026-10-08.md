# Rà soát trang Bán hàng — 2026-10-08

Phạm vi: renderer Bán hàng, KPI/biểu đồ/bộ lọc/lịch sử/chi tiết, nhập file thủ công,
Chrome và bù ngày, cache/compact/migration archive, refresh settings, xóa và sổ tồn,
liên kết SKU và hành động in lại. Đọc mã frontend, migrations và test hiện có.
Không đọc/ghi database live, không sửa logic ứng dụng, không khẳng định báo cáo thực
tế nào đã mất vĩnh viễn. Script audit dùng hàm thật trong VM với storage/network mock.

## Các lỗi ưu tiên

1. **P1 — Dọn chi tiết chưa được server xác nhận.** `compactKiotSalesInMemory`
   (plate-studio.html:19068) xóa `sales` ngoài 7 kỳ gần nhất, không xét archive thành
   công. Cache riêng chỉ giữ 31 kỳ. Tái hiện 40 báo cáo chưa archive: 2 báo cáo không
   còn chi tiết trong RAM hoặc cache; sau `saveKiotViet` nguy cơ tăng do cache ưu tiên
   ngày mới. Chỉ mục còn nhưng không đủ dựng lại SKU. Phải giữ bản bền vững chưa sync.

2. **P1 — Lưu cloud lỗi vẫn báo thành công và cắt lịch sử.**
   `importKiotSalesFile` (19778) bỏ qua kết quả archive/ledger, vẫn đổi báo cáo, đánh
   dấu ngày đã nhập và trả `true`. Khi archive false còn `slice(0,90)`. Mô phỏng 91
   kỳ cũ + 1 kỳ mới, cả hai write fail: chỉ còn 90 kỳ, kết quả `true`. Bridge dùng
   kết quả này để acknowledge ngày. Nếu archive-ready đã true, settings còn bỏ
   chi tiết của báo cáo chưa được archive. Cần outbox bền vững và trạng thái local/cloud.

3. **P1 — Báo cáo nhiều ngày ghi đè báo cáo của ngày cuối.**
   `persistKiotSalesArchive` (19160) dùng `kiotSalesReportDay` lấy period.to, gửi RPC
   replace theo một ngày rồi đổi period về ngày đó. Tái hiện kỳ 01–30/09 biến thành
   30/09. SQL `202609110001_kiot_sales_archive.sql:82` upsert unique workspace/day,
   xóa chi tiết cũ trong transaction. Transaction an toàn về nguyên tử nhưng mục tiêu
   ngày sai: tổng tháng có thể thay dữ liệu ngày cuối, biểu đồ/ledger cũng sai kỳ.

4. **P1 — Cache cũ lấn bản cập nhật từ thiết bị khác.**
   `mergeKiotSalesArchiveIndex` (19087) gắn lại local sales theo ngày mà không so revision;
   `hydrateKiotSalesDetail` cũng không so thời điểm server. Tái hiện server qty=20 nhưng
   local qty=1: metric hiển thị 1. Chi tiết có sẵn chặn tải lại. Cần invalidation theo
   report id + revision, xử lý riêng thay đổi local chưa sync.

5. **P1 — Lỗi tải chi tiết gây vòng gọi lại.** `loadKiotSalesArchiveDetail` (19151)
   nuốt lỗi, không thiết lập trạng thái lỗi. `renderSalesPage` (19616) và dialog so
   sánh gọi lại sau promise: điều kiện tải vẫn true. Mô phỏng lỗi mạng xác nhận điều
   kiện lặp còn nguyên. Có thể mắc ở “Đang tải”, nhiều request và không chọn kỳ khác.

6. **P2 — Chi tiết lớn không phân trang.** `loadKiotSalesArchiveDetail` (19151)
   chỉ select/order, không range/cursor, vẫn đặt detailLoaded=true. Mô phỏng server
   giới hạn 1.000 dòng cho report metadata 1.200: chỉ hiển thị/tính 1.000. Chưa xác
   minh giới hạn API live; bug xuất hiện khi số dòng vượt giới hạn server.

7. **P2 — Xóa báo cáo chưa xóa biến động tồn liên quan.**
   `removeKiotSalesImport` (19656) xóa archive/settings và lịch bridge nhưng không
   xử lý movement `sales:ngày`. Không thấy trigger xử lý trong migrations. Ledger
   bán được ghi riêng, không có FK cascade tới report. Xóa báo cáo vẫn có thể để
   lượng trừ tồn tồn tại. Kết luận từ source/schema repository, chưa xác minh trigger live.

8. **P2 — In lại chưa theo công thức SKU mới.** `getSalesRestockNeeds` (19196)
   tìm model chỉ bằng mapping.modelId, trong khi sản phẩm bán dùng mapping.components.
   SKU đã ghép theo công thức có thể bị dẫn lại vào Ghép, hoặc chỉ in model đầu và
   không nhân số lượng thành phần. `openSalesRestockPlan` cũng chỉ truyền một model.

## Các rủi ro bổ sung cần kiểm tra khi sửa

- RPC report và RPC ledger tách rời: lỗi một bên gây lệch báo cáo và tồn; cần retry
  idempotent cho cả hai, không coi việc một RPC thành công là cả quy trình hoàn tất.
- Nhiều dòng cùng SKU được parser giữ nguyên nhưng archive có PK(report_id,sku):
  cần gộp trước khi ghi. Dòng có tên nhưng thiếu SKU được chấp nhận ở local rồi bị
  bỏ khỏi payload archive: metadata và chi tiết có thể lệch.
- `refreshRemoteCloudTable('settings')` thay toàn bộ kiotViet bằng JSON remote;
  cần kiểm chứng cạnh tranh khi nhập đang await và refresh đang chạy.
- `existingIndex` trong importer được tính trước các await: refresh/import đồng thời
  có thể thay đổi mảng trước splice; cần định danh lại lúc commit local.
- Không nên dùng dữ liệu trong `kiotViet.sales` (bị strip khỏi settings) như nguồn
  lâu dài cho KPI tồn/model sau reload; phải lấy đúng report được hydrate.

## Kiểm chứng và giới hạn

`node tools/sales-audit.mjs`: 6 mô phỏng thực thi tái hiện lỗi + 1 kiểm tra source
về xóa/ledger. Exit 0 nghĩa là audit tái hiện đúng các lỗi hiện tại, **không phải**
ứng dụng đã an toàn. Test cố ý sẽ cần thay thành regression kỳ vọng đúng khi sửa.
Không chạy/publish bản sửa ứng dụng trong lượt chỉ yêu cầu rà soát này.
QA cũ chủ yếu kiểm parser, ngày, UI và bridge; chưa bao phủ chuỗi mất dữ liệu trên.

Ưu tiên sửa: giữ bền dữ liệu chưa sync và bỏ cắt lịch sử → chặn sai kỳ archive →
revision/cache → retry/lỗi/phân trang → ledger/xóa và công thức in lại. Sau đó đối
chiếu chỉ mục server, chi tiết, bản cache và file gốc để lập danh sách có thể phục hồi.

## Bản sửa theo yêu cầu tiếp theo “fix đi”

- Bản nhập mới lưu vào key outbox riêng theo workspace/user/request trước khi gọi
  server; quota lỗi phải báo thật, không thay báo cáo cũ. Không cắt lịch sử 90 kỳ.
  Startup/online và retry 60 giây tiếp tục bản chờ. Xung đột cần người dùng xác nhận
  sau khi đọc bản cloud mới; có xuất JSON bản chờ và bản phục hồi legacy.
- Báo cáo và ledger ghi/xóa trong transaction có revision + receipt idempotency.
  Lỗi ledger rollback báo cáo; receipt cũ không hoàn tác sửa/xóa mới hơn. Ghi chú
  đối soát thủ công được giữ; kết luận đã xử lý chỉ giữ nếu chênh lệch không đổi.
  Tab cũ không được ghi trực tiếp bỏ qua transaction mới.
- Chặn file nhiều ngày (yêu cầu xuất từng ngày), gộp trùng SKU, từ chối dòng thiếu
  SKU. Báo cáo legacy nhiều ngày giữ nguyên, không tự chuyển thành một ngày.
- Chỉ compact/strip chi tiết đã có revision server; cache phải khớp revision.
  Tải phân trang đến hết, kiểm số dòng và revision sau tải; lỗi có nút thử lại,
  không loop, không chặn đổi kỳ; nhiều nơi đọc cùng báo cáo dùng chung request.
- In bù theo đủ model/variant/hệ số thành phần. Công thức còn lựa chọn thay thế
  bị chặn và dẫn về Ghép SKU, không tự chọn thay người dùng.
- Kiểm thử SQL cô lập còn phát hiện RPC cũ lỗi tên `report_day`/`id` mơ hồ giữa
  OUT variable và cột. RPC mới không gọi đường lỗi này.

`tools/sales-audit.mjs` hiện là regression kỳ vọng đúng (không còn là test khẳng
định lỗi). `tools/sales-sql-qa.mjs` chạy migration thật bằng PGlite, không dùng DB
live; `tools/sales-ui-qa.mjs` kiểm mobile/desktop, light/dark với dữ liệu giả lập.
Các test mới nằm trong `npm run qa:kiot-sync` và `npm run qa:all`.
Chưa đối chiếu hoặc khôi phục báo cáo lịch sử thực đã thiếu/hỏng; không được coi
bản sửa ngăn lỗi tái diễn là bằng chứng mọi dữ liệu quá khứ đã được phục hồi.
