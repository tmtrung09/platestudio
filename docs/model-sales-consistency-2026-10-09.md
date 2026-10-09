# Đồng bộ dữ liệu bán trong chi tiết model

## Lỗi đã tái hiện

SP012001 / Flower Coasters có 3 bán, 131.552 đ ở Bán hàng nhưng 0 bán, 0 đ trong
chi tiết model; tồn cửa hàng vẫn là 9. Mảng `kiotViet.sales` chỉ là cache phiên,
được bỏ khỏi settings cloud sau khi archive sẵn sàng. Bảng model và metrics AI
vẫn đọc mảng đó, trong khi trang Bán hàng đọc chi tiết `salesImports`/archive.
Tái hiện bằng dữ liệu cô lập; không kết luận báo cáo live bị mất chỉ từ số 0.

## Bản sửa

- `kiotSalesSnapshot` dùng cùng báo cáo đang chọn và cùng fallback theo bộ lọc
  ngày với trang Bán hàng; legacy flat chỉ được dùng nếu chưa có báo cáo nào.
- Bảng model, tổng metrics gửi AI và tóm tắt Kiot đọc nguồn này. Bảng ghi rõ kỳ
  và số bán theo SKU, không nhân hệ số model vào doanh số SKU hay cộng mọi kỳ.
  Xem nhanh trên thẻ vẫn là kỳ 30 ngày có nhãn riêng.
- Hydrate cache phải khớp revision; mở model tự tải index/chi tiết bằng loader
  hiện có, có phân trang, kiểm tra số SKU và revision. Thiếu/lỗi hiện `—` và tải
  lại; chỉ chi tiết đầy đủ không có SKU đó mới được hiện zero thật.
- AI chờ dữ liệu, kiểm tra quyền/scope, gửi đúng số lượng, doanh thu và kỳ.
  Kết quả AI cũ khác report/revision không xuất hiện như phân tích kỳ hiện tại.
- Patch riêng vùng Kiot, giữ ảnh model và scroll, giữ vị trí focus, không mở lại
  dialog đã đóng hay thay model khác; callback cũ không patch workspace mới.
- Không đổi schema/migration/Edge Function, không sửa/xóa báo cáo hoặc ledger.

## Kiểm chứng

`tools/model-sales-qa.mjs` có assertion cho 3 vs 0, cache khác revision, lazy-load
qua loader thực, đủ/trống/thiếu chi tiết, retry và lỗi mạng, kỳ cũ/bộ lọc, payload
AI, quyền, DOM/scroll và callback khi đóng/đổi model/workspace. Chạy trên 390 và
1280px, light/dark, chặn mọi request mạng thật. Ảnh kiểm tra nằm trong
`qa-results/model-sales/`. QA tổng bắt buộc trước phát hành.

Kết quả lượt sửa: regression model-sales 4/4 (gồm reload thực); QA toàn bộ chạy
hoàn tất exit 0, workflow 174/0, mobile 9/0, desktop 14/0 với 8 nhóm cảnh báo có
sẵn, density 48/0; model-signals, nhập bán/SQL, cloud/upload và plate đều pass.
Đã xem ảnh ready desktop/light và error mobile/dark, diff check không có lỗi.

Giới hạn: QA không kiểm tra báo cáo live của người dùng hoặc gọi Gemini thật;
không yêu cầu nhập lại/xóa dữ liệu trình duyệt để nhận bản sửa.
