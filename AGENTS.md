# Quy tắc hệ thống và phát triển Plate Studio

## Mục đích và cách duy trì file

- `AGENTS.md` là bộ quy tắc của hệ thống và cách phát triển hệ thống theo yêu cầu
  người dùng. Không dùng file làm nhật ký trao đổi/công việc hoặc báo cáo tiến độ;
  không ghi ngày giao việc, diễn biến triển khai, commit, kết quả QA từng lượt hay
  trạng thái một sự cố cụ thể.
- Chuyển yêu cầu bằng ngôn ngữ tự nhiên thành quy tắc chuyên nghiệp: rõ phạm vi,
  hành vi bắt buộc và điều kiện kiểm chứng. Giữ đúng ý nghĩa; không tự thêm nghiệp
  vụ, mở rộng phạm vi hoặc biến ví dụ/dữ liệu một lần giao việc thành quy tắc chung.
- Xem xét mỗi yêu cầu để nhận diện quy tắc mới hoặc quy tắc cần sửa. Chỉ cập nhật
  khi có nội dung như vậy, không ghi mọi câu hỏi/câu trả lời/thao tác. Đề xuất chưa
  được người dùng chấp thuận không phải quy tắc của hệ thống.
- Thêm quy tắc bằng gạch đầu dòng trong nhóm chức năng phù hợp. Gộp nội dung trùng;
  yêu cầu mới thay thế yêu cầu cũ thì sửa quy tắc cũ, không chồng các phiên bản hoặc
  kể lại quá trình thay đổi. Giữ các quy tắc khác còn hiệu lực.
- Cập nhật quy tắc và kiểm thử hồi quy liên quan trong cùng lượt thay đổi, trước
  kiểm tra/bàn giao. Thay đổi chỉ liên quan tài liệu không cần tạo tính năng hoặc
  chạy QA ứng dụng chỉ để ghi một quy tắc.
- Người dùng không phải nhắc lại các quy tắc đã thống nhất khi yêu cầu tính năng
  hoặc màn hình mới. Áp dụng ngay từ thiết kế trong phạm vi tương ứng.

## Hợp đồng UX dùng chung

### Nhận diện, tìm kiếm và chọn dữ liệu

- Bộ chọn model/sản phẩm/part/biến thể có nhiều mục phải có tìm kiếm ngay trong
  nơi chọn, không dùng dropdown chỉ có tên để duyệt thư viện. Dùng tìm kiếm chung
  hỗ trợ tiếng Việt có/không dấu theo tên và thuộc tính liên quan như biến thể,
  part, danh mục; có số kết quả và trạng thái không tìm thấy.
- Mục có ảnh phải có thumbnail trong kết quả và phần đã chọn. Ảnh thiếu/lỗi dùng
  fallback cùng kích thước, giữ tên/nhãn/thao tác. Không tạo ảnh giả thay dữ liệu
  thật; lazy-load, giới hạn kết quả với thư viện lớn và có đường xem tiếp.
- Hiển thị đủ tên model và biến thể để phân biệt. Model không biến thể vẫn chọn
  được; không tự chọn model đầu tiên hoặc biến thể thay người dùng.
- Cùng loại công việc dùng chung danh sách/tìm kiếm/sắp xếp. Ưu tiên danh mục,
  bộ lọc/nhãn thay vì tách tab/màn hình chỉ vì thêm thuộc tính. Việc tách phải có
  lý do về luồng công việc.
- Chọn màu nhựa trong nhập tay, khay máy, đối chiếu/khai báo mẻ, AI và đổi màu theo
  đơn dùng bộ chọn chung: tìm không dấu theo tên/hãng/chất liệu/mã, mẫu màu, số
  kết quả và trạng thái không khớp. Giữ chưa chỉ định, không tự chọn; hỗ trợ bàn
  phím/Escape/chạm 44px. Menu không bị vùng cuộn cắt hoặc làm mất nháp/focus/ảnh.
  Native select còn lại có color-scheme và nền/chữ option theo theme, không trắng
  trên trắng. Kiểm thử: `tools/filament-picker-qa.mjs`.
- Các thư viện Đơn, Plate, Project, Màu nhựa và Model có tìm kiếm không dấu cạnh
  tiêu đề trên desktop, xuống hàng an toàn trên mobile, lọc theo thuộc tính người
  dùng nhìn thấy; không chỉ đồng bộ CSS mà thiếu tìm kiếm dữ liệu.

### Tương tác, trạng thái và bảo toàn dữ liệu

- Gõ/chọn/thêm dòng/đổi số lượng không dựng lại toàn bộ dialog. Giữ nội dung đang
  nhập, truy vấn, focus/caret, cuộn và ảnh đã tải; chỉ cập nhật vùng thay đổi.
- Số lượng có giới hạn hợp lệ và thao tác chạm thuận tiện; dùng − / nhập / + khi
  chỉnh lặp lại. Nút chính/control cảm ứng có vùng bấm tối thiểu 44×44px; icon/ô
  đánh dấu có thể nhỏ hơn vùng bấm để không lấn ảnh hoặc nội dung.
- Form dài có vùng cuộn rõ, nút lưu/đóng luôn tiếp cận được, không che nội dung/
  bàn phím hoặc tràn ngang. Kiểm tra Tab/Enter/Escape/focus/hover/active; control
  ghép chỉ có một vòng focus, không viền chồng viền.
- Lưu/thêm/upload có phản hồi thật: đang xử lý, thành công, thất bại, thử lại.
  File lên Storage chưa có nghĩa bản ghi nghiệp vụ đã lưu. Chỉ báo lưu cloud sau
  xác nhận server; lỗi phụ không xóa kết quả đã lưu.
- Thao tác nội bộ không làm mất thay đổi chưa lưu; rời form giữ nháp hoặc cảnh
  báo bỏ thay đổi. Xóa có xác nhận/khả năng phục hồi phù hợp; không xóa model
  nguồn khi chỉ xóa sản phẩm ghép hoặc gỡ nhãn.
- Kiểm tra tạo → sửa → lưu → tải lại → đọc cloud. Tách thời điểm nghiệp vụ khỏi
  upload/sync; cạnh tranh giữa thiết bị không ghi đè hoặc dọn nhầm dữ liệu đang dùng.
- Chọn nhiều desktop theo Windows: Ctrl + click bật/tắt từng mục, Shift + click
  chọn dải từ mục neo, Ctrl + Shift + click cộng dải. Dải theo thứ tự hiển thị sau
  lọc/sắp xếp; phím bổ trợ không đồng thời mở chi tiết.
- Trong chọn nhiều thư viện, Esc hủy chọn, Delete mở xóa có xác nhận, trừ khi nhập
  liệu/ở dialog. Có hành động hàng loạt cho trạng thái hợp lệ, gồm “Bỏ qua”; không
  áp dụng lên mục hoàn tất, phản hồi số lượng đã đổi. Cảm ứng có nút/chế độ chọn
  nhiều riêng, không phụ thuộc bàn phím.
- Thanh số mục chọn/thao tác hàng loạt ghim trong vùng cuộn, luôn thấy khi lướt;
  có nền/độ nổi tách nội dung, không che header an toàn. Mobile bọc nút, không tràn
  ngang; hướng dẫn phím tắt không chiếm dòng riêng.

### Mật độ thông tin, control và icon

- Giao diện toàn hệ thống gọn: tiêu đề, khoảng cách trang, thẻ, thống kê và điều
  hướng nhất quán trên desktop/mobile, light/dark. Không zoom/transform:scale toàn
  trang; giữ tỷ lệ ảnh, vùng cuộn, dữ liệu và hành vi lưu/sync. Ô nhập mobile giữ
  chữ 16px để tránh Safari tự zoom. Guard: `tools/density-qa.mjs`.
- Không lặp tên trang/nhãn nhóm/số lượng/thao tác đã rõ ở vị trí kế cận. Bỏ phần
  dư thừa phải quét cả họ header/toolbar, giữ điểm nhận diện và hành động chính.
  Tiêu đề gồm tên và mô tả ngắn, không liệt kê lại menu/thẻ/bộ lọc.
- Nhãn stepper/nút/chip/nhóm ngắn. Chỉ giữ mô tả làm rõ hệ quả quan trọng như ảnh
  hưởng tồn, khả năng hoàn tác, quyền hoặc điều kiện thao tác.
- Hàng chờ/trạng thái nền phụ nằm gọn trong toolbar/chip cạnh luồng liên quan,
  có số lượng/trạng thái thật/một hành động chính; không tự chiếm cả hàng ngang.
- Control cùng toolbar có cùng chiều cao/bán kính/vùng chạm; không trộn kích thước
  mặc định của select, button, menu ba chấm, tìm kiếm và chip.
- Nội dung nút hành động phải căn giữa theo cả hai chiều, kể cả nút có chiều rộng
  tối thiểu, giãn rộng hoặc nhãn xuống dòng. Nút có icon và chữ căn giữa cả cụm;
  không chèn khoảng trắng để căn chữ. Chỉ căn trái khi nút là dòng danh sách/menu
  có chủ đích, bằng override rõ ràng. Kiểm thử vị trí nội dung thực ở trạng thái
  thường, hover, active, focus và disabled trên mobile/desktop, light/dark.
- Không dùng emoji hệ thống cho icon thao tác/trạng thái mới. Khi sửa họ giao diện,
  thay emoji còn thấy của chính họ bằng SVG từ primitive icon chung để nét/kích
  thước/màu đồng nhất.
- Nút phụ chỉ có icon (sửa/đóng/làm mới/bỏ mục/sao chép/chuyển trang, tháng, thứ tự)
  dùng `.btn-icon-only`: SVG căn giữa, không nền/viền/vòng sáng/bóng hoặc dịch chuyển
  của nút có chữ trong mọi theme và hover/active. Giữ vùng bấm 44×44px, tên truy
  cập, focus và disabled. Không tự chuyển nút có chữ, nút chính, stepper, nút chụp
  hoặc điều hướng riêng chỉ vì chứa icon. Guard: `tools/icon-actions-qa.mjs`.
- Thẻ tóm tắt không lặp mọi tên model thành nhiều chip. Dùng thumbnail stack, số
  model/sản phẩm, xem chi tiết; chỉ hiện từng tên khi mở chi tiết hoặc cần ra quyết định.
- Mỗi trang chức năng có thẻ thông tin đầu trang theo cùng ngôn ngữ thiết kế,
  với đồ họa động riêng phù hợp công việc của trang. Tận dụng thẻ sẵn có, không
  chồng thêm tiêu đề/mô tả trùng. Đồ họa không che chữ/control, không giả số liệu
  nghiệp vụ; hỗ trợ light/dark, mobile và reduced-motion.
- Hướng dẫn và Bố cục là công cụ phụ, đặt ngoài thẻ thông tin trong vùng tùy
  chọn trang có mức nhấn thấp; thẻ ưu tiên nội dung và hành động chính.
- Thiết kế thẻ thông tin phải có demo đủ các trang để người dùng duyệt trước
  khi áp dụng vào giao diện chính; demo ghi rõ minh họa và không ghi dữ liệu xưởng.

### Tìm kiếm, ảnh và thời gian

- Tìm kiếm chung kế thừa Tiến độ in: SVG nhỏ, cao tối thiểu 42px, nền gọn, focus
  rõ. Đặt cạnh tiêu đề/toolbar khi an toàn, không tự thêm hàng.
- Tìm kiếm trong vùng làm việc lớn nghỉ ở dạng gọn, bung khi focus/nhập; không
  đẩy nội dung, mất truy vấn/focus hoặc che control. Toàn bộ vỏ gọn tối thiểu
  44×44px và bấm được; click vỏ/icon focus input, không để input rộng 0 làm mất tương tác.
- Lưới ảnh dùng tỷ lệ khung thống nhất, canh giữa bằng object-fit phù hợp, không
  viền/nền sáng gây đứt đoạn ở dark mode; áp dụng ảnh dọc/ngang/thiếu/lỗi.
- Ảnh trong thư viện báo cáo mẻ phủ sát mép thẻ, không nhận khoảng đệm của thẻ
  thông tin chung; điện thoại xếp hai ảnh mỗi hàng. Giữ trạng thái, chọn nhiều,
  thao tác 44px, ảnh thiếu/lỗi và thứ tự dữ liệu. Guard: `tools/batch-gallery-qa.mjs`.
- Hàng công việc theo model, kể cả nhóm plate/màu, có thumbnail thật khi có dữ
  liệu; ảnh lỗi giữ khung fallback, tên và bố cục.
- Công việc theo khoảng ngày ưu tiên lịch trực quan chọn khoảng, phân biệt ngày
  có/thiếu dữ liệu; không chỉ dùng hai ô ngày rời nếu lịch truyền được trạng thái.
- Lịch chọn ngày dùng khung có giới hạn chiều rộng gọn, co theo vùng chứa trên
  mobile; không kéo giãn theo toàn hàng của trang. Ô ngày có chiều cao ổn định,
  không dùng aspect-ratio vuông khiến chiều cao tăng theo chiều rộng màn hình.
  Giữ đủ tuần, chọn khoảng, dấu có/thiếu dữ liệu và thao tác tháng/đóng; không
  cắt hàng cuối hoặc thay đổi dữ liệu báo cáo để thu gọn. Áp dụng chung cho lịch
  Bán hàng, lịch sử bán và bù ngày. Guard: `tools/sales-calendar-qa.mjs`.
- Lịch chọn khoảng trên Bán hàng mở thành pop-up neo ngay nút “Khoảng ngày”,
  không thêm hàng hoặc đẩy bố cục trang. Canh trong viewport, đổi hướng khi
  thiếu chỗ và cuộn bên trong trên màn hình thấp; không bị vùng cuộn cắt.
  Có nút đóng, Esc/click ngoài và trả focus phù hợp. Mở/đổi tháng/đóng không
  dựng lại dữ liệu trang, không đổi kỳ đã áp dụng hoặc mất nháp chọn khoảng.
- Lọc lịch sử nêu rõ khoảng xem, có đường về toàn bộ dữ liệu, không làm rỗng/xóa
  nguồn khi đổi tag. Tháng/ngày đồng bộ để tránh giao nhau rỗng; khoảng tùy chọn
  chọn trên lịch. Tuần bắt đầu thứ Hai, 7/30 ngày gồm hôm nay. Biểu đồ cuộn tới mọi
  ngày, mở đoạn mới nhất, tôn trọng reduced-motion.
- Thư viện báo cáo mẻ không có lọc/timeline theo ngày. Giữ tìm kiếm/trạng thái/
  sắp xếp; không khôi phục ngày từ localStorage hoặc gửi điều kiện ngày lên cloud.
  Chỉ khôi phục khi người dùng yêu cầu thiết kế mới và đã kiểm thử lại.

## Khởi động, đồng bộ và camera

- Lời mời tạo lối tắt platedio có demo để duyệt trước khi tích hợp vào ứng dụng
  chính; hướng dẫn phù hợp thiết bị/trình duyệt và phân biệt thao tác mô phỏng
  với việc tạo lối tắt thật.
- Khi hỗ trợ cài đặt trực tiếp, nút thêm platedio mở hộp xác nhận của trình duyệt
  sau thao tác người dùng; thiết bị khác có hướng dẫn phù hợp. Không tự thêm
  hoặc báo đã cài trước xác nhận thực. Lời mời nhường loading, form và camera;
  có cách bỏ qua và không nhắc khi đang mở từ lối tắt.

- Khi mở trang mà giao diện chưa sẵn sàng, hiển thị màn hình loading có đồ họa
  động; đặt tên `platedio` bên dưới với chữ đậm, nét mạnh và in nghiêng. Thiết kế
  phải có demo và được người dùng duyệt trước khi tích hợp vào ứng dụng chính.
- Loading có hiệu ứng khi xuất hiện và rời màn hình. Cụm logo góc trên bên trái
  đồng bộ nhận diện `platedio`; sau khi loading rời và nội dung trang xuất hiện,
  cụm logo xuất hiện bằng hiệu ứng sượt ngang. Demo bao gồm toàn bộ trình tự này.
- Local-first: reload dựng từ cache gần nhất rồi sync thay đổi ở nền, không chặn
  thao tác để tải lại toàn bộ dữ liệu đã biết. Cache có version/migration/độ mới;
  server là nguồn xác nhận cuối cùng.
- Realtime không ghi đè mù local. Bản ghi có ID ổn định, revision/mốc server, cập
  nhật có điều kiện, tombstone và idempotency key. Offline lưu outbox bền vững,
  retry an toàn, có trạng thái chờ/lỗi/xung đột.
- Camera là fast path độc lập, mở trực tiếp không đợi thư viện/lịch sử/ảnh. Chụp
  liên tiếp, lưu blob/metadata tối thiểu vào local ngay; nén/thumbnail/upload/liên
  kết chạy nền bằng queue bền vững. Không mất ảnh khi reload/mất mạng/đóng app.
- Camera có công tắc tùy chọn mở ngay khi vào web, mặc định tắt, lưu theo thiết
  bị + xưởng + tài khoản. Chỉ tự mở khi có quyền, trước tải dữ liệu cloud phụ;
  tắt được trong camera, không mở lại sau khi người dùng đóng trong cùng phiên.
  Có giới thiệu lần đầu gọn, không lấy focus hoặc che nút chụp/đóng; lỗi lưu tùy
  chọn giữ trạng thái cũ và phản hồi rõ. Guard: `tools/camera-startup-qa.mjs`.
- Tách “đã lưu trên máy”, “đang tải”, “đã lên Storage”, “đã gắn bản ghi”. Không đợi
  upload mới cho chụp tiếp; retry/resume chống trùng, chỉ dọn local sau xác nhận
  đầy đủ. Worker tối ưu theo chính sách đã thống nhất, không tự giảm chất lượng gốc.
- Tải delta/cursor/field cần dùng, tránh request tuần tự, phân trang thư viện lớn,
  cache thumbnail/lazy-load. Cache/preload app shell và camera khi mạng yếu; dữ
  liệu nền không tranh ưu tiên upload ảnh chờ.
- Service worker network-first online, cache fallback offline; PWA có shortcut
  `?capture=1`. Reload dùng RPC manifest so revision/số bản ghi, chỉ tải collection
  đổi và fallback REST an toàn khi migration chưa có.
- Blob camera lưu IndexedDB theo workspace + user trước upload, giữ reportId/
  image hash khi resume. Cho đóng camera sau lưu local bền vững, không cảnh báo
  rời trang cho ảnh IndexedDB đã giữ.
- Mỗi lần mở web tự quét/upload nền ảnh chưa được server xác nhận, không đòi mở
  camera hoặc bấm “Thử lại”. Retry backoff, đánh thức khi online/quay lại tab; nút
  thử lại là dự phòng. Tương thích queue cũ, không đổi ID/blob hoặc dọn sớm.
- Nhiều thiết bị cùng không upload được phải kiểm tra đường tải chung: Edge
  Function, token staff, Storage, ghi batch_reports. Không yêu cầu chụp lại/xóa dữ
  liệu trình duyệt; giữ local để retry sau khi dịch vụ được sửa.
- Upload upsert:true vào plate-media có đủ SELECT/INSERT/UPDATE giới hạn bucket
  và thư mục auth.uid(). Xác minh cả link staff qua Edge Function và tài khoản
  upload trực tiếp, migration live, ảnh cũ tự retry; không kết luận sửa xong chỉ
  bằng client hoặc tạo được bản ghi khi file vẫn lỗi.
- Âm chụp tùy chọn, không chặn camera/âm local mặc định khi metadata cloud chậm.
  Nạp mặc định độc lập, đổi âm riêng sau tải xong. QA mô phỏng cloud chậm/không
  phản hồi và chờ buffer bất đồng bộ.
- Thay đổi hiệu năng đo trước/sau, có guard cho thời gian tương tác từ cache, mở
  camera, chụp tới lần tiếp, sync/upload mạng chậm; thử offline → reload → online,
  hai thiết bị cùng sửa, retry/xóa.

## Không gian Sản xuất

### Điều hướng và nhu cầu in

- Hợp nhất Tiến độ in, Plate in, Nhắc part thiếu, Cần in lại trong Sản xuất:
  Cần in / Plate & máy / Tiến độ; không phân mảnh cùng công việc ở nhiều nơi.
- Cần in dùng danh sách/tìm kiếm chung, ghi nguồn theo đơn/ngoài đơn/QC/đối chiếu/
  bù hàng. Đơn chưa bắt đầu xuất hiện, đơn hủy không đề xuất. Mẻ in chờ đối chiếu
  không cộng vào nhu cầu mới.
- QC của pitem là lý do của thiếu đã có, không cộng trùng. SKU có gợi ý theo bán/
  tồn chỉ một hàng, người dùng chọn chính sách, không cộng hai mức. QC thiếu ID
  part/mất pitem giữ hàng cần kiểm tra, không đoán part.
- Làm mới gộp cập nhật xưởng và index bán khi có quyền KiotViet. Giữ ID model/
  biến thể/part/màu, tham chiếu pitem/đơn, chỉ xếp lượng chưa trong kế hoạch. Giữ
  quyền đọc từng nguồn/ghi riêng và đường xem tiếp.
- Plate & máy giữ thư viện plate, Lịch máy/Khay nhựa. Tiến độ có đơn/model/plate/
  ngoài đơn. Route cũ mở đúng góc nhìn; Back/Forward/reload giữ scope đơn/dự án,
  tìm kiếm và bộ lọc.

### Tiến độ in

- Tiến độ là trang native trong Sản xuất, dùng header/toolbar/theme và vùng cuộn
  `.pg-content` chung. Không mount legacy, sidebar/drawer hoặc navigation mobile
  riêng, không chồng CSS vá layout.
- Giữ bốn góc xem, handler part/QC/gia công/giao, liên kết đơn/dự án. Đổi giao
  diện không chuyển/xóa dữ liệu.
- Tìm không dấu theo đơn/model/biến thể/part/màu, có số kết quả/bỏ lọc. Stepper
  part thống nhất, vùng bấm 44px, thẻ mở bàn phím. Giữ focus/cuộn/ảnh/fallback;
  URL giữ góc xem/truy vấn/trạng thái/scope.
- Guard mọi góc xem, mobile/tablet/desktop/landscape, hai theme; không tràn ngang,
  khoảng trắng viewport, cuộn lồng hoặc đổi hình học trang kế cận.

### Sắp plate và file in

- Plate có thể gồm model/part và mục nhập tay cho đồ mới/decor/việc khác, không
  bắt tạo model giả/ghép nhầm thư viện. Nhập tay có tên/số lượng/ghi chú/màu tùy
  chọn/file từ thiết bị.
- File là chỉ định đầu vào, không tự slice/phân tích/gửi lệnh máy. Giữ gốc trong
  IndexedDB trước thêm/lưu; upload riêng tư theo xưởng, trạng thái thật/retry/tự
  tiếp tục khi có mạng/mở lại. Không đặt blob trong settings hoặc xóa file lịch
  sử khi chỉ gỡ tham chiếu.
- Nhận 3MF, STL, OBJ, G-code, BGCODE, STEP/STP, ZIP, tối đa 50 MB/file; lỗi/quota
  không báo thành công.
- Giữ nháp/file qua đóng/mở/reload, DOM/focus khi thêm model/tải nền. Plate đổi
  ở phiên khác giữ nháp/chặn ghi đè mù. Mục cùng tên có ID riêng, không tự gộp;
  tên không phải định danh.
- Đối chiếu giữ tên/ghi chú/file/kết quả đạt/lỗi/chưa in nhập tay; không tự cộng
  tồn/tiến độ đơn/model hoặc suy model từ tên file. Guard:
  `tools/plate-manual-qa.mjs`, `tools/plate-files-sql-qa.mjs` và QA plate.

### Máy in và lịch sử mẻ

- Tích hợp web kế thừa flow PrintPeek; demo ghi rõ minh họa, chỉ triển khai phương
  án được duyệt. Demo/giả lập không chứng minh hoạt động máy thật/quyền điều khiển;
  không tự mua/cấp dịch vụ hosting mới.
- Hỗ trợ đội máy 2 A1, 2 P1S, 1 P2S, 1 H2S qua Bambu Cloud độc lập, không LAN,
  không bắt buộc Bambu Connect/PrintPeek Windows. Giữ biệt danh/tiến độ/layer/
  thời gian; phân biệt error/warning/thông tin, Việt hóa kèm mã gốc.
- Theo dõi trong Sản xuất / Plate & máy qua trang native `printer-monitor`, có
  máy trực tiếp/lịch sử mẻ. Dùng Supabase hiện có theo phiên web, không tự cấp
  hosting 24/7 hoặc cam kết miễn phí ngoài hạn mức tài khoản.
- Chỉ thu khi có web mở; đóng mọi phiên/mất mạng có thể tạo khoảng trống. Mở lại
  không giả thời điểm bắt đầu/kết thúc hoặc sự kiện bỏ lỡ. Trung gian kết nối hữu
  hạn tự nối lại, giữ state/chống trùng.
- Web chỉ ghim bảng trong web, không hứa overlay đè ứng dụng Windows. Phân biệt
  bộ thu/lưu dữ liệu, thông báo trong web, push ngoài web; không coi là cùng khả
  năng hoặc tự thêm dịch vụ để đổi phạm vi theo dõi.
- Token Bambu chỉ ở server, mã hóa, không đọc bằng quyền web; kiểm tra workspace/
  quyền, không log mật khẩu/token/email/mã xác nhận. Chỉ chủ xưởng kết nối/ngắt;
  đọc theo quyền Tiến độ hoặc Plate, ghép model theo quyền Plate.
- Kết nối chấp nhận thành công có code:null; ưu tiên username MQTT trong token,
  preference chỉ fallback. Xác minh MQTT trước thay phiên cũ. Lỗi nêu bước gửi mã/
  xác nhận mã/đọc định danh/đọc máy và HTTP/mã an toàn, không gộp thành mã email sai
  hoặc lộ dữ liệu nhạy cảm. Giữ form/dữ liệu để thử lại, không đòi xóa dữ liệu web.
- Ảnh đúng dòng máy, thumbnail đúng mẻ. Lịch sử giữ tổng thời gian in, bắt đầu/
  kết thúc, máy/model; tách giờ thực/ước tính/lần đầu quan sát, tạm dừng/khoảng
  thiếu dữ liệu. In xong không tự là QC đạt hoặc cộng tồn.
- Ghép ảnh/mẻ bằng ID, không chỉ tên/mẻ gần nhất; thiếu ảnh/chưa ghép hiện rõ,
  không đoán hoặc dùng ảnh demo làm thật. Ghép model/biến thể/số lượng bằng bộ
  chọn tìm kiếm/ảnh, giữ nháp khi lưu lỗi, kiểm tra revision. Telemetry không
  ghi đè ghép; ngắt tài khoản không xóa lịch sử.
- Hai máy mỗi hàng trên desktop/mobile; màn hình hẹp dùng thẻ gọn, không ép chữ
  cạnh ảnh. Giữ ảnh/trạng thái/chỉ số/thao tác. Thẻ cùng hàng cao bằng nhau, căn
  trên, cụm ảnh/khoảng cách ổn định; tự tăng theo tên/mẻ dài/lỗi mở, không cắt
  thông tin hoặc đặt chiều cao cứng.
- Click thẻ/tên mở chi tiết máy; lịch sử mở chi tiết mẻ. Có ảnh lớn/trạng thái/
  layer/nhiệt độ/mốc và thời gian đã theo dõi/model ghép/diễn biến/lỗi/cảnh báo.
  Đọc đúng ID, thiếu/lỗi có trạng thái/retry. Desktop rộng đặt bên phải, màn nhỏ
  trên lưới; nhận diện chọn, bàn phím/chạm, đóng/Escape trả focus. Không thêm quyền
  điều khiển qua chi tiết; chức năng điều khiển chưa được xác thực trên máy thật
  không được trình bày như đã hoạt động.
- Chi tiết mở/đóng co giãn mượt: desktop thu/giãn danh sách nhường chỗ bên phải,
  màn nhỏ bung/thu trên lưới, vẫn hai máy mỗi hàng. Không scale trang/dựng lại
  DOM/ảnh/mất cuộn/chạy lại hiệu ứng theo telemetry. Bấm nhanh không kẹt; thu bỏ
  khỏi Tab ngay. Reduced-motion tức thời, mất quyền/đổi xưởng ẩn ngay. Đổi máy/
  mẻ không giữ nhầm ảnh/model.
- Lưu sự kiện chuyển trạng thái thật: bắt đầu/tạm dừng/tiếp tục/hoàn thành/thất bại/
  mất và nối lại; chống trùng telemetry/reconnect/nhiều tab. Warning không biến
  đang in thành lỗi; error không bỏ qua bằng nút warning.
- Bỏ qua warning theo máy + mã, có hiện lại, giữ qua reload/lịch sử, không gửi
  lệnh xóa lỗi. Delta thiếu HMS không chứng minh hết cảnh báo; chỉ báo tái phát
  khi nguồn xác nhận mã đã biến mất rồi xuất hiện lại. Mã chưa hiểu giữ mã/nội
  dung gốc, không đoán nguyên nhân/an toàn.
- Guard: `tools/printer-core-qa.mjs`, `tools/printer-sql-qa.mjs`,
  `tools/printer-ui-qa.mjs`, `tools/printer-motion-probe.mjs`,
  `tools/printer-api-qa.ts`. API QA dùng Deno/dữ liệu cô lập; phân biệt deploy/live
  QA, không báo hoàn tất máy thật chỉ từ demo.

## Thông báo

- Pop-up thường/toast ở góc trên bên phải, bảng thông báo thả gọn, đơn giản, không
  border, dùng SVG; không chồng nhau/bảng thả. Hover/focus tạm dừng tự đóng; không
  sửa/xóa dữ liệu camera/nghiệp vụ để đổi giao diện.
- X chỉ hiện khi hover trên thiết bị có hover, vẫn hiện khi focus bàn phím và
  có cách đóng rõ trên thiết bị không hover; vùng đóng 44px.
- Bảng thả không mở dialog giữa màn hình, ghi đè form hoặc tự đánh dấu đã đọc
  khi mở. Giữ người nhận/quyền/lịch sử/âm thanh/trạng thái đúng khi xem, đọc hết,
  Escape, click ngoài và tải nền.
- Chỉ ngắt luồng bằng pop-up máy khi dữ liệu hiện tại xác nhận đúng mẻ đã in
  xong hoặc máy thực sự dừng vì lỗi: PAUSE có mã error, FAILED, hoặc mẻ dừng có
  error. Tạm dừng thủ công/warning đơn thuần/bắt đầu/tiếp tục/kết nối chỉ lưu
  trong bảng thông báo và trạng thái máy, không bật popup/âm thanh. Không suy
  máy dừng chỉ từ một mã lỗi, warning hoặc mất kết nối.
- Trước khi hiện và khi nhận cập nhật, đối chiếu máy + ID mẻ + lần chuyển trạng
  thái. Máy đã in tiếp, đổi mẻ, lỗi hết hoặc sự kiện bị thay thế thì bỏ popup/
  hàng chờ cũ, kể cả qua reload/nhiều tab; vẫn giữ lịch sử. Cache cũ/chưa kết nối/
  chưa có telemetry mới không đủ để bật popup. Gom mã lỗi cùng một lần dừng
  thành một thông báo; lần dừng mới sau khi in tiếp vẫn được thông báo.
- Pop-up còn hợp lệ không tự hết giờ. “Đã biết”, “Xem máy” và Esc đóng/xác nhận
  thông báo đang hiện, không gửi lệnh, bỏ qua mã error hoặc tác động form/chọn
  nhiều phía sau. Click ngoài/vuốt/đọc hết bảng không xác nhận. Lưu việc đóng
  theo workspace + người dùng để không hiện lại; nếu không lưu được, Esc vẫn
  đóng trong phiên và phản hồi rõ giới hạn qua reload.
- Pop-up máy cần xác nhận xếp hàng/chống trùng ID/bền qua reload theo workspace
  + người dùng trên thiết bị. Chờ form/dialog/camera, không ghi đè nháp/focus.
  Hiện trạng thái/thời điểm/xem đúng máy; xác nhận tách khỏi đã đọc, không xóa
  lỗi/gửi lệnh/tự QC/cộng tồn.
- Header chừa chỗ cho chuông, không ép tên trang thành cột hẹp trên mobile.
  Thanh ghim đo mốc vị trí thực, không giả định chiều cao header.
- Hành động phụ pop-up đặt dưới nội dung, không chia ba cột ép tên/mô tả thành
  từng chữ. Đóng 44px góc trên, chữ đọc được, không tràn ngang.
- Guard: `tools/notifications-qa.mjs`, `tools/printer-alerts-probe.mjs` từ printer
  UI QA; bao phủ quyền/workspace/queue/reload/form/các cách đóng/bàn phím/chạm/
  mobile/desktop/hai theme.

## KiotViet, bán hàng và tồn kho

- Trang Bán hàng dùng khoảng ngày trên lịch/lọc nhanh làm kỳ thống kê duy nhất;
  không có dropdown chọn file báo cáo. Tổng bán, doanh thu, SKU, nhóm hàng,
  sản phẩm bán nhiều, số liệu model/AI và gợi ý in bù cùng khoảng. Biểu đồ/lịch
  sử mở báo cáo riêng mà không đổi kỳ tổng. Giữ báo cáo gốc; không cộng trùng
  kỳ giao nhau hoặc phân bổ báo cáo nhiều ngày vào ngày cuối. Chi tiết chưa đủ,
  kỳ không thể tách hoặc ngoài biên phải nêu rõ, không coi là 0 hay số liệu đầy đủ.
- Đồng bộ giữ danh mục/báo cáo bán/ghép SKU/sổ đối chiếu và đường nhập file/Chrome/
  bù ngày. Trạng thái thật, không coi chưa kết nối/thiếu dữ liệu là thành công;
  giữ focus/caret/ảnh khi tìm hoặc tải nền.
- Ghép/gỡ ghép/bỏ qua SKU lưu bền nội dung thao tác theo xưởng + người dùng trước
  khi chuyển mục; cache đầy hoặc lỗi kho local giữ nháp và báo lỗi. Tự phục hồi
  hàng chờ qua reload/online, gửi lại cùng request ID; chỉ xác nhận lưu cloud sau
  ACK server. Ghi theo SKU có revision và tombstone, không để snapshot danh mục
  từ phiên cũ ghi đè ghép mới. Xung đột giữ bản chờ để người dùng đối chiếu.
  Guard: `tools/kiot-mapping-qa.mjs`, `tools/kiot-mapping-sql-qa.mjs`.
- Rà soát gồm nhập file/Chrome/bù ngày/cache/archive/sync/lịch sử/lọc/biểu đồ/in
  lại. Phân biệt lỗi tái hiện với live chưa xác minh; dữ liệu QA cô lập, không
  sửa/xóa live để thử. QA giao diện không chứng minh dữ liệu bán an toàn.
- Chênh lệch số bán giữa trang Bán hàng/model không tự chứng minh mất báo cáo;
  đối chiếu nguồn/kỳ trước kết luận. Bảng model/tóm tắt Kiot/metrics AI dùng kỳ
  đang chọn ở Bán hàng, fallback cùng lọc ngày, ghi rõ kỳ; xem nhanh 30 ngày ghi
  kỳ riêng.
- Chi tiết dựa salesImports/archive; cache chỉ dùng khi revision khớp. Chưa tải/
  lỗi là chưa biết, không là 0, có retry hữu hạn. AI chờ đủ chi tiết/quyền, kết
  quả khác báo cáo/revision không là kỳ hiện tại. Chỉ cập nhật vùng Kiot, giữ
  ảnh/cuộn, không mở lại model đã đóng/đổi; giữ nguồn/ledger.
- Báo cáo/ledger lưu/xóa nguyên tử, kiểm tra revision, retry cùng request ID.
  Bản chưa xác nhận lưu bền trước gửi; không cắt lịch sử/compact chi tiết chưa
  archive. Tải đủ trang, không báo cloud thành công/xác nhận ngày bridge khi lỗi.
  File nhiều ngày không gán ngày cuối.
- Cache KiotViet chỉ thu gọn hoặc loại chi tiết có revision đã được cloud xác
  nhận; không xóa báo cáo legacy, bản phục hồi, hàng chờ hay file gốc để giải
  phóng chỗ. Khi localStorage đầy, bản nhập mới có đường lưu bền dự phòng theo
  workspace + người dùng, giữ request ID qua reload; chỉ dọn sau xác nhận server.
  Khôi phục hàng chờ khi mở web độc lập với kết nối Chrome/tải cloud ban đầu;
  không đổi workspace hoặc người dùng sở hữu bản nhập khi tiếp tục gửi.
- Đồng bộ Chrome phải phân biệt lỗi kết nối, đọc file, kiểm tra kỳ, lưu local,
  lưu cloud và xác nhận bridge. Hiện lý do thật, không gộp thành mất kết nối.
  File đã tải hoặc bản nhập đang chờ phải được dùng lại khi thử lưu, không bắt
  xuất lại báo cáo; chưa lưu cloud không được xác nhận ngày hoặc tiến hàng bù.
- Service worker sao chép response trước khi trả cho trình duyệt, giữ tác vụ
  cache bằng waitUntil và xử lý lỗi mạng/cache nền; lỗi cache không làm hỏng
  phản hồi đang dùng hoặc tạo promise rejection không được xử lý.
- Ngày chỉ hoàn tất khi có chi tiết hoặc metadata xác nhận SKU/số lượng/doanh
  thu lớn hơn 0; rỗng hiện riêng, có đường bù ngày.
- Nhập Chrome đối chiếu kỳ file với ngày job; sai thì dừng/giữ báo cáo cũ, không
  gắn ngày khác. Bù chỉ thay cùng ngày sau parse dòng hợp lệ và lưu xong. Không
  tự lấy lại/ghi đè ngày có doanh số hợp lệ; thiếu/rỗng chạy lại, không cộng lặp tồn.
- Parser nhận header KiotViet theo tiền tố/biến thể như “Mã hàng hóa”, “Tên hàng
  hóa”, không phụ thuộc một cách viết; loại tổng, chỉ lưu SKU có lượng bán hợp
  lệ. In bù đủ thành phần/hệ số, không tự chọn model thay thế.
- QA gồm ngày thiếu/rỗng/hợp lệ, file sai kỳ/rỗng, reload, archive/cache lệch
  revision, tải nền/lỗi/retry/zero thật/bảng model/tóm tắt/AI, hai theme và mobile/
  desktop. Guard model: `tools/model-sales-qa.mjs`.

### Tín hiệu bán và tồn trên model

- Thẻ model xem nhanh bán/tồn Kiot/tồn xưởng khi hover, có bàn phím/chạm tương
  đương, không thay đổi chọn/drag/mở model.
- Ngưỡng tồn ít/bán chạy linh động theo dữ liệu bán thực tế, không số cố định.
  Nêu kỳ/nguồn/độ phủ/tiêu chí; báo cáo thiếu/chưa tải, SKU chưa ghép hoặc ghép
  thay thế không biến thành 0/tín hiệu chắc chắn. Không cộng trùng báo cáo giao nhau.
- Tồn Kiot là snapshot riêng; tồn xưởng là thành phẩm sẵn giao sau gửi/QC và tồn
  đầu kỳ đã kiểm, không phải tổng part in. SKU nhiều model/biến thể giữ hệ số,
  không đoán thay thế hoặc sửa nguồn.
- Hiệu ứng gọn có nhãn/SVG, không chỉ màu/nhấp nháy liên tục, tôn trọng reduced-
  motion. Bảng không bị card/viewport cắt, Escape đóng, đọc được khi hover bảng,
  không che navigation mobile.
- Guard phép tính/hệ số, thiếu dữ liệu/quyền, giao/QC, nhiều model, hai theme,
  hover/focus/chạm/cạnh viewport/cuộn/tải nền không dựng lại lưới.

## Quy trình kiểm tra và bàn giao

- Đọc file, tìm component tương tự/regression test trước thiết kế; kế thừa hành
  vi, không chỉ CSS. Tự kiểm tra nhận diện/tìm/thao tác lặp/focus/cuộn/dữ liệu/
  lưu/quay lại/xóa/lỗi ảnh/mất mạng.
- Lỗi UI thuộc họ thành phần, không chỉ điểm trong ảnh. Xác định selector/token/
  breakpoint/theme/trạng thái; rg quét mọi instance/override, sửa primitive/token/
  component chung, chỉ vá cục bộ khi chứng minh đặc thù.
- Màu/contrast: kiểm tra hard-coded color sau override, ưu tiên token. Layout:
  safe area/fixed/floating/overflow/z-index/breakpoint. Chậm/mất dữ liệu: lần
  lifecycle/storage/sync, thử reload/đổi thiết bị/cạnh tranh. Ảnh lỗi: quét mọi
  render/fallback/lazy-load cùng loại.
- Dữ liệu đại diện hàng trăm mục/tên dài/có và không biến thể/ảnh thật, thiếu,
  lỗi/rỗng/không khớp/nhiều dòng/thao tác lặp. Kiểm tra mobile/desktop, light/dark,
  trạng thái liên quan, focus/hover/active/vùng chạm.
- Thêm assertion tái hiện lớp lỗi, thất bại trước bản vá hoặc điều kiện chấp
  nhận cụ thể. Xem render/screenshot thực tế; test pass không thay đánh giá UI.
  Ưu tiên test mục tiêu, chốt diff rồi QA tổng.
- Sửa ứng dụng phải qua `npm run qa:all`, `git diff --check`, không đẩy khi có
  failure. Nêu phần chưa kiểm chứng, phân biệt warning/failure, không kết luận
  hoàn tất từ một điểm đã ổn hoặc QA cũ.
- Không thiết kế lại toàn ứng dụng ngoài phạm vi; chỉ hỏi khi thiếu nghiệp vụ/
  phạm vi/quyền. Tư vấn Cài đặt/khả năng mới không cấp quyền triển khai; phân biệt
  tính năng có sẵn và đề xuất.
- Phát hành cần QA trên diff cuối, migration cần thiết đã áp dụng, staged diff
  chỉ gồm phần được giao, push theo quyền đã cấp, xác nhận revision/asset đang
  phục vụ. Không gộp thay đổi song song không liên quan hoặc báo xong khi web/
  server còn bản cũ.
- Lỗi runner không là QA pass hoặc bằng chứng người dùng/máy bị khóa. Với
  CreateProcessWithLogonW 1909, kiểm tra runner/tài khoản sandbox, thử lại trước;
  chỉ đề nghị đăng nhập lại/khởi động lại Codex nếu lỗi kéo dài sau kiểm tra.
- Bàn giao ngắn: thay đổi chính/nơi áp dụng/phạm vi quét/kết quả kiểm tra/giới hạn
  còn lại. Không ghi báo cáo bàn giao hoặc lịch sử phát hành vào `AGENTS.md`.
