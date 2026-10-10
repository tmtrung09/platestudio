# Quy tắc chất lượng giao diện Plate Studio

## Hợp đồng UX mặc định — áp dụng cả tính năng mới (mandatory)

Người dùng không phải nhắc lại các yêu cầu đã thống nhất cho mỗi màn hình mới.
Các quy tắc dưới đây được tổng hợp từ yêu cầu và các luồng đã sửa trong repository;
không coi việc chưa có lời nhắc trong task hiện tại là lý do để bỏ qua.

## Vòng đời file ghi nhớ yêu cầu — mandatory

Mỗi yêu cầu mới của người dùng đều phải làm `AGENTS.md` được xem xét và cập nhật
ngay trong cùng lượt thực hiện. Đây là bước bắt buộc cho **mọi yêu cầu**, không chỉ
UX hoặc yêu cầu có vẻ sẽ lặp lại:

1. Trước khi kết thúc task, ghi vào file này nguyên tắc, điều kiện chấp nhận, lựa
   chọn đã thống nhất hoặc giới hạn mới mà yêu cầu bổ sung. Viết đủ cụ thể để task
   sau có thể áp dụng mà không cần người dùng nhắc lại.
2. Giữ các quy tắc trước đó còn hiệu lực. Nếu yêu cầu mới thay thế hoặc mâu thuẫn,
   sửa quy tắc cũ và ghi rõ phạm vi mới; không chồng thêm câu mơ hồ.
3. Quy tắc về một lần giao việc (phạm vi/tên/mẫu/dữ liệu cụ thể) vẫn phải được ghi
   thành quyết định/ngữ cảnh có thể tái sử dụng nếu liên quan; không bịa thành quy
   tắc chung cho toàn dự án. Chỉ ghi điều người dùng đã nói hoặc đã chấp thuận.
4. Cập nhật file và regression guard phù hợp trước khi QA, commit/push hoặc báo xong.
   Nếu task thuần hỏi đáp và không đổi dự án, ghi lại điều mới trực tiếp vào mục phù
   hợp trong file này; không cần tạo mã hay chạy QA ứng dụng chỉ để lưu một quy tắc.

### Nhận diện và chọn dữ liệu

1. Bộ chọn model/sản phẩm/part/biến thể có thể có nhiều mục phải có ô tìm kiếm ngay
   trong nơi chọn. Không dùng dropdown chỉ có tên để duyệt cả thư viện. Tìm theo
   tên và các thuộc tính liên quan (biến thể, part, danh mục); dùng hàm tìm kiếm
   chung, hỗ trợ tiếng Việt có/không dấu. Có số kết quả và trạng thái không tìm thấy.
2. Mục có ảnh phải hiển thị thumbnail cả trong kết quả chọn và phần đã chọn.
   Mục thiếu ảnh/ảnh lỗi dùng fallback cùng kích thước, không mất tên, nhãn hay nút.
   Không tự tạo ảnh giả để thay dữ liệu thật. Lazy-load/giới hạn kết quả với thư viện lớn.
3. Hiển thị đủ tên model + biến thể để phân biệt; model không biến thể vẫn chọn được.
   Không âm thầm thêm model đầu tiên hay chọn một biến thể bất kỳ thay người dùng.
4. Cùng một loại công việc dùng chung danh sách, tìm kiếm và sắp xếp. Ưu tiên danh
   mục/bộ lọc/nhãn (ví dụ “Ghép”) thay vì tạo tab hoặc màn hình riêng chỉ vì dữ liệu
   có thêm thuộc tính. Phải có lý do về luồng công việc nếu cần tách.

### Tương tác và trạng thái

1. Gõ, chọn, thêm dòng, đổi số lượng không dựng lại toàn bộ dialog. Giữ tên đang
   nhập, truy vấn, focus/caret, vị trí cuộn và ảnh đã tải; cập nhật đúng vùng thay đổi.
2. Số lượng có giới hạn hợp lệ và thao tác chạm thuận tiện (− / nhập / + khi cần
   chỉnh lặp lại). Nút chính và control cảm ứng dùng vùng chạm tối thiểu 44×44px.
   Icon/ô đánh dấu có thể nhỏ hơn vùng chạm để tránh lấn ảnh hoặc nội dung, nhưng
   vùng bấm thực vẫn phải đủ 44×44px.
3. Form dài có vùng cuộn rõ ràng, nút lưu/đóng luôn tiếp cận được; không che nội dung
   hoặc bàn phím, không tràn ngang. Kiểm tra focus, Tab, Enter, Escape, hover/active.
   Control ghép chỉ có một vòng focus, không viền chồng viền.
4. Lưu/thêm/tải ảnh phải có phản hồi trạng thái thật: đang xử lý, thành công, thất bại
   và đường thử lại. File lên Storage chưa có nghĩa là bản ghi nghiệp vụ đã lưu.
   Không báo “đã lưu cloud” trước khi server xác nhận; lỗi phụ không xóa kết quả đã lưu.
5. Không mất thay đổi chưa lưu khi thao tác nội bộ; khi rời form phải giữ nháp hoặc
   cảnh báo bỏ thay đổi. Xóa có xác nhận/khả năng phục hồi phù hợp và không xóa nhầm
   model nguồn khi người dùng chỉ xóa sản phẩm ghép hay gỡ nhãn.
6. Kiểm tra tạo → sửa → lưu → tải lại → đọc từ cloud, không chỉ trạng thái vừa tạo.
   Tách thời điểm nghiệp vụ (ngày chụp/in) khỏi thời điểm upload/sync; xử lý cạnh tranh
   giữa thiết bị mà không ghi đè hoặc dọn nhầm dữ liệu đang sử dụng.
7. Danh sách hoặc lưới có chọn nhiều trên desktop phải hỗ trợ quy ước quen thuộc của
   Windows: `Ctrl` + click bật/tắt từng mục, `Shift` + click chọn dải liên tiếp từ mục
   neo, và `Ctrl` + `Shift` + click cộng thêm dải. Dải chọn tính theo thứ tự mục đang
   hiển thị sau lọc/sắp xếp; thao tác có phím bổ trợ không được đồng thời mở chi tiết.
8. Khi đang chọn nhiều ở thư viện, `Esc` phải hủy chế độ chọn và `Delete` mở luồng
   xóa có xác nhận, trừ khi người dùng đang nhập liệu hoặc đang ở dialog. Thanh thao
   tác phải có hành động hàng loạt cho mọi trạng thái hợp lệ, gồm đánh dấu “Bỏ qua”;
   không được áp dụng lên mục đã hoàn tất và phải phản hồi rõ số lượng đã đổi.
   Trên thiết bị cảm ứng vẫn giữ nút/chế độ “Chọn nhiều” rõ ràng, không phụ thuộc bàn phím.
8. Khi người dùng đang chọn nhiều mục trong một danh sách dài, thanh hiển thị số mục
   đã chọn và các thao tác hàng loạt phải ghim trong vùng cuộn, luôn nhìn thấy khi lướt.
   Thanh cần có nền/độ nổi đủ tách khỏi nội dung phía sau, không che header an toàn,
   và trên mobile phải bọc nút thay vì tràn ngang.

### Mật độ thông tin, ảnh và thời gian

1. Không lặp lại tên trang, nhãn nhóm, số lượng hoặc thao tác đã được thể hiện rõ ở
   vị trí kế cận. Với một nhận xét đánh dấu phần dư thừa, quét cùng họ header/thanh
   công cụ trước khi bỏ, nhưng vẫn giữ một điểm nhận diện và thao tác chính.
2. Thanh tìm kiếm nằm trong vùng làm việc lớn chỉ chiếm diện tích khi cần: ở trạng
   thái nghỉ dùng phiên bản gọn; khi focus/nhập thì bung rộng để tìm. Việc chuyển
   trạng thái không được đẩy nội dung, làm mất truy vấn/focus, hoặc che control.
   Toàn bộ vỏ của trạng thái gọn là vùng chạm tối thiểu 44×44px và nhấn/click bất kỳ
   chỗ nào trên vỏ (kể cả icon) phải chuyển focus vào input; không để input rộng 0
   khiến icon nhìn thấy nhưng không bấm được.
3. Lưới ảnh phải dùng khung tỷ lệ thống nhất, ảnh canh giữa bằng `object-fit` phù hợp
   và không có viền/nền sáng tạo cảm giác đứt đoạn ở dark mode. Quy tắc này áp dụng
   cho mọi card ảnh của cùng thư viện, kể cả ảnh dọc, ngang, thiếu hoặc lỗi.
4. Khi công việc liên quan một khoảng ngày hoặc lịch sử theo ngày, ưu tiên lịch trực
   quan có thể chọn khoảng và hiển thị rõ ngày đã có dữ liệu/ngày còn thiếu. Không
   chỉ bắt người dùng chọn hai ô ngày rời rạc nếu lịch có thể truyền trạng thái đó.
5. Bộ lọc lịch sử phải nêu rõ khoảng đang xem, giữ lối trở lại toàn bộ dữ liệu và
   không xóa hay làm rỗng dữ liệu gốc khi đổi tag. Bộ lọc kết hợp tháng/ngày phải
   đồng bộ lựa chọn để không tạo trạng thái giao nhau rỗng bất ngờ. Khoảng tùy chọn
   chọn được trên lịch; các mốc nhanh cần định nghĩa ranh giới nhất quán (tuần bắt đầu thứ Hai,
   khoảng 7/30 ngày tính cả hôm nay). Biểu đồ nhiều ngày phải cho phép cuộn tới mọi
   ngày trong khoảng đã chọn, mở ở đoạn mới nhất và cung cấp chuyển động cột tôn
   trọng cài đặt giảm chuyển động của thiết bị.
6. Riêng Thư viện báo cáo mẻ tạm thời không có bộ lọc hoặc timeline theo ngày vì
   phiên bản hiện tại không ổn định. Giữ tìm kiếm, lọc trạng thái và sắp xếp; không
   khôi phục ngày cũ từ localStorage hoặc gửi điều kiện ngày lên cloud. Chỉ đưa lọc
   ngày trở lại khi có một thiết kế mới được người dùng yêu cầu và kiểm thử lại.

### Quy trình bắt buộc trước khi bàn giao

1. Đọc file này; tìm component tương tự đã có và regression test đi kèm trước khi
   thiết kế control mới. Kế thừa cả hành vi, không chỉ CSS. Ví dụ bộ chọn trong xếp
   plate đã có tìm kiếm, ảnh, stepper, giữ DOM và thanh lưu cố định.
2. Với mỗi bề mặt mới/sửa, tự kiểm tra: nhận diện bằng gì? tìm mục thế nào? thao tác
   lặp lại có nhanh không? focus/cuộn/dữ liệu có giữ không? biết đã lưu bằng gì?
   quay lại/xóa/lỗi ảnh/mất mạng ra sao? Không chờ người dùng chỉ từng thiếu sót.
3. Dùng dữ liệu đại diện: thư viện hàng trăm mục, tên dài, có/không biến thể, ảnh
   thật/thiếu/lỗi, danh sách rỗng/không khớp, nhiều dòng và thao tác lặp lại.
4. Thêm assertion cụ thể cho hợp đồng UX liên quan, kiểm tra mobile + desktop và
   light + dark; xem ảnh chụp/render thực tế. Chạy QA tổng và diff check như bên dưới.
   Test pass không thay thế việc xem và đánh giá giao diện.
5. Khi người dùng bổ sung một yêu cầu UX có tính lặp lại, cập nhật quy tắc và test
   của họ component trong cùng task. Không mở rộng thành thiết kế lại toàn ứng dụng
   ngoài phạm vi; ghi rõ phần chưa thể kiểm chứng thay vì khẳng định đã hoàn tất.
6. Tự áp dụng các chi tiết UX đã thống nhất; chỉ hỏi lại khi thiếu quyết định nghiệp
   vụ, phạm vi hoặc quyền thao tác. Trong lúc chỉnh, ưu tiên test mục tiêu + xem ảnh;
   chốt thay đổi rồi chạy QA tổng để giảm vòng lặp, thời gian và quota. Bàn giao ngắn
   gọn: thay đổi chính, nơi sử dụng, kết quả kiểm tra và giới hạn còn lại.

## Không vá một điểm (mandatory)

Mọi lỗi giao diện do người dùng báo phải được coi là một lỗi của **họ thành phần**
(component family), không phải chỉ của màn hình đang được chụp. Ví dụ: stepper số
lượng, select, bottom sheet, card ảnh, thanh tìm kiếm, nút nổi, modal, navigation.

Không được kết luận “đã sửa” chỉ vì đúng điểm trong ảnh đã ổn. Trước khi hoàn tất,
bắt buộc làm đủ các bước sau:

1. Xác định selector/component gốc, biến theme, breakpoint và trạng thái có liên
   quan (light/dark, mobile/desktop, mở/đóng, trống/có dữ liệu).
2. Dùng `rg` quét toàn bộ project để tìm tất cả instance, selector và CSS override
   cùng họ. Sửa từ primitive/token/component dùng chung; chỉ dùng vá cục bộ khi
   chứng minh được thành phần đó thực sự đặc thù.
3. Kiểm tra tối thiểu cả mobile và desktop, cùng mọi theme/trạng thái mà lỗi có thể
   lặp lại. Với control có thao tác, kiểm tra cả focus, hover/active và vùng chạm.
4. Thêm hoặc cập nhật regression test QA tái hiện **lớp lỗi** đó. Test phải thất bại
   trước bản vá hoặc có assertion cụ thể; không chỉ dựa vào ảnh chụp thủ công.
5. Chạy `npm run qa:all` và `git diff --check`. Không đẩy bản sửa nếu còn failure.
6. Khi báo lại người dùng, nêu rõ: phạm vi đã quét, các nhóm đã sửa, và kết quả QA.

## Mẫu tư duy khi xử lý lỗi

- Màu/nền/contrast sai: kiểm tra toàn bộ component trong light + dark mode và mọi
  hard-coded color nằm sau theme override; ưu tiên token `var(--...)`.
- Tràn, che nội dung, layout lệch: kiểm tra breakpoint, safe area, fixed/floating
  layer, overflow và thứ tự z-index cho tất cả page/overlay cùng pattern.
- Chậm, giật, mất dữ liệu: lần theo lifecycle và shared storage/sync handler; kiểm
  tra các luồng tạo, sửa, tải lại, đổi thiết bị và thao tác đồng thời.
- Một ảnh hoặc item hiển thị lỗi: kiểm tra tất cả đường dẫn render/fallback/lazy-load
  cùng loại, không chỉ record xuất hiện trong ảnh.

## Nội dung giao diện (mandatory)

Mỗi bề mặt chỉ hiển thị thông tin cần để nhận biết trạng thái hoặc ra quyết định.

1. Tiêu đề trang: tên + một mô tả ngắn; không liệt kê lại các mục đã có ở menu,
   thẻ, bộ lọc hoặc bước bên dưới.
2. Stepper, nút, chip và tiêu đề nhóm: ưu tiên nhãn ngắn. Không đặt thêm câu giải
   thích nếu nhãn, số lượng hoặc trạng thái đã truyền đủ ý.
3. Mô tả chỉ được giữ khi nó làm rõ một hệ quả quan trọng (dữ liệu không ảnh hưởng
   tồn kho, thao tác không thể hoàn tác, quyền hạn, hay điều kiện cần thực hiện).
4. Trạng thái nền hoặc hàng chờ phụ chỉ cần một số lượng và một hành động chính phải
   nằm gọn trong toolbar/chip cạnh luồng liên quan, không tự chiếm nguyên một hàng
   ngang; vẫn giữ được số lượng, trạng thái thực và hành động đó trên desktop lẫn mobile.
5. Khi rút gọn copy, quét cả họ component và mọi breakpoint; thêm regression check
   cho nguyên tắc mới thay vì chỉ cắt chữ ở ảnh người dùng gửi.
6. Các control là anh em trong cùng toolbar phải dùng cùng chiều cao, bán kính bo và
   vùng chạm; không trộn kích thước mặc định của select, button, menu ba chấm và ô tìm
   kiếm. Khi có chip/trạng thái nền chen vào toolbar, khung bao của nó cũng theo chuẩn đó.
7. Hàng công việc theo model (kể cả khi đang gộp theo plate/màu) phải kèm thumbnail
   model thật khi có dữ liệu; ảnh lỗi chỉ được ẩn/fallback cùng khung, không bỏ tên hoặc
   làm đổi bố cục. Không dùng emoji hệ thống cho icon thao tác/trạng thái mới; mỗi họ
   giao diện được chạm tới phải thay icon emoji còn thấy được của chính họ bằng SVG từ
   primitive icon chung để nét vẽ, kích thước và màu đồng nhất.
8. Thẻ tóm tắt không được lặp toàn bộ tên model thành nhiều chip. Giữ thumbnail stack,
   số model/sản phẩm và hành động xem chi tiết; chỉ hiển thị từng tên khi người dùng mở
   phần chi tiết hoặc khi tên đó cần ra quyết định.
9. Thanh tìm kiếm dùng chung trên các trang phải kế thừa bề mặt của tìm kiếm Tiến độ
   In: icon SVG nhỏ, chiều cao tối thiểu 42px, nền gọn và focus rõ. Vị trí/rộng theo
   workspace nhưng không được tự chiếm thêm một hàng nếu còn đặt cạnh tiêu đề/toolbar
   một cách an toàn. Hướng dẫn phím tắt không được chiếm một dòng riêng trong thanh
   chọn nhiều khi nút và hành vi đã rõ.
10. Các thư viện chính (Đơn, Plate, Project, Màu nhựa và Model) phải có tìm kiếm
    không dấu ngay cạnh tiêu đề trên desktop, tự xuống hàng an toàn trên mobile và lọc
    theo các thuộc tính người dùng nhìn thấy. Không chỉ chuẩn hóa CSS mà để một trang
    còn không có cách tìm dữ liệu của chính nó.

## Định nghĩa hoàn tất

### Duyệt thiết kế thông báo (yêu cầu ngày 2026-10-10)

- Người dùng yêu cầu chuyển thông báo lên góc trên bên phải và tinh gọn, đơn giản
  hơn. Phải cho xem thiết kế và chờ người dùng chốt trước khi sửa ứng dụng.
- Sau khi xem bản minh họa, người dùng đã chốt và yêu cầu triển khai cả pop-up
  nhỏ góc trên bên phải và bảng thông báo dạng thả gọn; cả hai không có border.
  Đây là phê duyệt thay cho yêu cầu khoan triển khai ở lượt xem trước.
- Dấu X chỉ hiện khi đưa chuột vào thông báo trên thiết bị có hover. Vẫn phải
  hiện khi focus bàn phím, và có đường đóng rõ ràng trên thiết bị không có hover;
  vùng bấm đóng 44px. Không dùng cách ẩn khiến bàn phím hoặc cảm ứng không đóng được.
- Bảng thả không mở dialog giữa màn hình, không ghi đè dialog đang nhập, không
  tự đánh dấu đã đọc khi chỉ mở. Giữ lọc người nhận/quyền, lịch sử và âm thanh;
  click xem, đọc hết, Escape, click ngoài và tải nền phải giữ trạng thái đúng.
- Pop-up sự kiện và toast phản hồi dùng chung vị trí/kiểu không viền, icon SVG,
  không chồng nhau hay bảng thả. Tạm dừng tự đóng khi hover/focus; không sửa/xóa
  dữ liệu camera hay nghiệp vụ để thay giao diện. Guard: tools/notifications-qa.mjs.
- Header dùng chung phải chừa chỗ cho chuông mà không ép tên trang thành cột hẹp
  trên mobile. Guard sticky đo mốc ghim từ vị trí thực thay vì giả định chiều cao
  header; vẫn kiểm tra thanh thao tác nằm đúng mép vùng cuộn sau khi vượt mốc đó.

### Trao đổi về trang Cài đặt (ngày 2026-10-10)

- Người dùng hỏi nếu làm trang Cài đặt thì có thể làm những gì. Phạm vi lượt này
  là tư vấn khả năng và cách tổ chức, chưa phải yêu cầu xây dựng hay phát hành.
- Khi tiếp tục trao đổi, phân biệt các tùy chỉnh đã có có thể gom lại (âm thanh
  chụp/thông báo, thông báo đẩy, sao lưu, quản lý thiết bị/quyền) với tính năng
  đề xuất mới. Các nhóm hoặc thứ tự ưu tiên trong tư vấn chưa được người dùng
  chấp thuận; không tự coi là phạm vi triển khai đã thống nhất.

### Trang đồng bộ KiotViet (yêu cầu ngày 2026-10-10)

- Người dùng yêu cầu dùng năng lực mô hình 6.1 Sol làm lại trang Đồng bộ KiotViet
  vì giao diện rối. Phạm vi là tổ chức lại trang và các control liên quan; giữ dữ
  liệu danh mục, báo cáo bán, ghép SKU và sổ đối chiếu hiện có.
- Áp dụng hợp đồng UX đã có cho cả nhóm nhập dữ liệu, lịch nền, danh mục SKU và
  đối chiếu: thông tin gọn, trạng thái thật, giữ focus/caret/ảnh khi tìm kiếm và
  cập nhật nền; không coi chưa kết nối hoặc chưa có dữ liệu là thành công.
- Việc làm lại vẫn phải giữ các đường nhập file/Chrome/bù ngày và ghép SKU theo
  các quy tắc KiotViet bên dưới; kiểm tra mobile/desktop, hai theme và regression
  trước khi bàn giao theo quy trình chung.

### Không gian Sản xuất tập trung (yêu cầu ngày 2026-10-08)

- Người dùng yêu cầu phân tích bằng mô hình 6.1 Sol và làm lại bốn trang Tiến độ
  in, Plate in, Nhắc part còn thiếu, Cần in lại vì chức năng phân mảnh. Hợp nhất
  điều hướng thành một mục Sản xuất, gồm Cần in / Plate & máy / Tiến độ.
- Cần in dùng một danh sách và tìm kiếm chung; ghi rõ nguồn theo đơn, ngoài đơn,
  QC lỗi, đối chiếu mẻ, bù hàng. Đơn chưa bắt đầu vẫn xuất hiện; đơn hủy không
  được đề xuất. Mẻ đã in chờ đối chiếu không được cộng vào số lượng cần in mới.
- QC của pitem là lý do của phần thiếu đã có, không cộng trùng. Cùng SKU có gợi ý
  theo bán và theo tồn chỉ có một hàng; người dùng chọn chính sách, không cộng hai
    mức. QC ngoài đơn thiếu ID part hoặc QC đơn đã mất tham chiếu pitem phải giữ
    hàng cần kiểm tra, không đoán part. Làm mới danh sách gộp phải cập nhật cả
    dữ liệu xưởng và index báo cáo bán khi tài khoản có quyền KiotViet.
- Giữ định danh model/biến thể/part/màu và tham chiếu pitem/đơn khi lập kế hoạch;
  chỉ xếp lượng chưa có trong kế hoạch. Giữ quyền đọc theo từng nguồn và quyền
  ghi riêng, không cấp thêm quyền khi gom trang. Danh sách lớn có đường xem tiếp.
- Plate & máy giữ thư viện plate và có Lịch máy/Khay nhựa; Tiến độ dùng các cách
  xem đơn/model/plate. Các route cũ vẫn mở đúng góc nhìn trong cùng không gian,
  giữ liên kết theo đơn/dự án, tìm kiếm/bộ lọc khi Back/Forward hoặc tải lại.

### Tín hiệu bán và tồn trên thẻ model (yêu cầu ngày 2026-10-09)

- Thư viện model phải cho xem nhanh lượng bán, tồn Kiot và tồn xưởng khi rê chuột;
  có đường tương đương bằng bàn phím và nút chạm, không làm thay đổi chọn/drag/mở model.
- Người dùng yêu cầu ngưỡng linh động theo tình hình bán thực tế, không dùng một
  số lượng cố định để gắn nhãn tồn ít hoặc bán chạy. Nêu rõ kỳ, nguồn, độ phủ dữ liệu
  và tiêu chí suy ra; báo cáo thiếu/chưa tải, SKU chưa ghép hay ghép thay thế không
  được biến thành số 0 hoặc tín hiệu chắc chắn. Không cộng trùng báo cáo giao nhau.
- Tồn Kiot là snapshot riêng; tồn xưởng là thành phẩm sẵn giao còn lại sau gửi/QC
  và tồn đầu kỳ đã kiểm, không phải tổng part từng in. Công thức SKU nhiều model/
  biến thể phải giữ hệ số và không đoán thành phần thay thế. Không sửa dữ liệu nguồn.
- Hiệu ứng gọn có nhãn/icon SVG, không chỉ dựa vào màu, không nhấp nháy liên tục;
  tôn trọng reduced-motion. Bảng xem nhanh không bị card/viewport cắt, đóng được
  bằng Escape, đọc được khi đưa chuột vào chính bảng và không che navigation mobile.
- Guard phải kiểm tra phép tính/hệ số, thiếu dữ liệu/quyền, hàng đã giao/QC, nhiều
  model, light/dark, hover/focus/chạm, cạnh viewport, cuộn và tải nền không dựng lại lưới.

### Tiến độ in native (yêu cầu viết lại ngày 2026-10-09)

- Trang Tiến độ phải là bề mặt native trong Sản xuất, dùng cùng header, toolbar,
  theme và vùng cuộn `.pg-content` với các trang khác. Không mount cửa sổ legacy,
  không có sidebar/drawer hay navigation mobile riêng, không chồng CSS vá layout.
- Giữ bốn góc xem đơn/model/plate/ngoài đơn, liên kết đơn/dự án và các handler
  cập nhật part, QC, gia công/giao hàng. Viết lại giao diện không chuyển/xóa dữ liệu.
- Tìm không dấu theo đơn, model, biến thể, part, màu; có số kết quả và đường bỏ
  bộ lọc. Chỉnh số part dùng stepper thống nhất, vùng bấm 44px; thẻ mở được bằng
  bàn phím. Giữ focus, cuộn và ảnh đã tải khi cập nhật; ảnh lỗi giữ khung fallback.
  Back/tải lại phải giữ góc xem, tìm kiếm, trạng thái và scope đơn/dự án trong URL.
- Guard phải kiểm tra mọi góc xem, chiều rộng nhỏ/tablet/desktop và landscape,
  hai theme, không tràn ngang, không khoảng trắng do chiều cao viewport, không
  có vùng cuộn lồng hay ảnh hưởng hình học trang kế cận khi chuyển trang.

### Mật độ giao diện mặc định (yêu cầu ngày 2026-10-08)

- Người dùng yêu cầu thu gọn giao diện toàn hệ thống: áp dụng chung cho tiêu đề,
  khoảng cách trang, thẻ, thống kê và thanh điều hướng; không chỉ sửa một trang.
- Giữ mật độ gọn trên desktop và mobile, light/dark. Không dùng `zoom` hoặc
  `transform:scale` toàn trang để thu nhỏ; giữ tỷ lệ ảnh và các vùng cuộn hiện có.
- Không đổi dữ liệu hay hành vi lưu/đồng bộ để chỉnh kích thước. Nút chính và
  control cảm ứng vẫn có vùng bấm tối thiểu 44px, ô nhập mobile giữ chữ 16px để
  tránh Safari tự zoom. Kiểm tra bằng `tools/density-qa.mjs` cùng QA hiện có.

Một sửa lỗi UI chỉ hoàn tất khi đã có: sửa ở nguồn dùng chung hoặc lý do rõ ràng cho
ngoại lệ; regression guard; QA pass; và thay đổi được đẩy lên remote theo quyền đã
được người dùng cấp. Quy tắc này áp dụng cho mọi thay đổi tương lai trong repository.

## Hiệu năng khởi động, đồng bộ và chụp ảnh (mandatory)

1. Ứng dụng phải ưu tiên local-first: khi reload, dựng giao diện và dữ liệu đọc gần
   nhất từ cache cục bộ trước, rồi đồng bộ phần thay đổi từ server ở nền; không chặn
   thao tác ban đầu chỉ để tải lại toàn bộ dữ liệu đã biết. Cache phải có version,
   migration và trạng thái độ mới rõ ràng; server vẫn là nguồn xác nhận cuối cùng.
2. Realtime không được ghi đè mù dữ liệu local. Mỗi bản ghi đồng bộ phải có định danh
   ổn định, version/revision hoặc mốc server, cơ chế cập nhật có điều kiện, tombstone
   cho xóa và idempotency key cho thao tác gửi lại. Thay đổi khi offline được lưu vào
   outbox bền vững, retry an toàn và có trạng thái chờ/lỗi/xung đột để người dùng biết.
3. Luồng camera là fast path độc lập: phải có đường vào trực tiếp và mở được camera
   mà không đợi tải toàn bộ thư viện, lịch sử hay ảnh. Cho phép chụp liên tiếp và lưu
   ảnh/blob cùng metadata tối thiểu vào local ngay; việc nén, tạo thumbnail, upload và
   liên kết bản ghi chạy nền, có hàng đợi bền vững và không làm mất ảnh khi reload,
   mất mạng hoặc đóng ứng dụng giữa chừng.
4. Upload ảnh phải tách trạng thái “đã chụp/lưu trên máy”, “đang tải”, “đã lên
   Storage” và “đã gắn vào bản ghi nghiệp vụ”. Không buộc người dùng đợi upload xong
   mới chụp ảnh tiếp; có retry/resume, chống upload trùng và chỉ dọn bản local sau khi
   server xác nhận đầy đủ. Tối ưu kích thước/thumbnail ở worker khi phù hợp, nhưng
   không tự làm giảm chất lượng bản gốc ngoài chính sách đã được thống nhất.
5. Tải dữ liệu theo delta/cursor và chỉ lấy field cần cho màn hình; tránh chuỗi request
   tuần tự, giới hạn/phân trang thư viện lớn, cache thumbnail và lazy-load ảnh ngoài
   viewport. App shell và route camera cần được cache/preload phù hợp để reload hoặc
   mở lại nhanh, kể cả mạng yếu; dữ liệu nền không được tranh băng thông ưu tiên của
   upload ảnh đang chờ.
6. Mọi thay đổi hiệu năng phải có đo trước/sau và regression guard cho ít nhất: thời
   gian tới giao diện tương tác được từ cache, thời gian mở camera, thời gian từ bấm
   chụp tới khi có thể chụp ảnh kế tiếp, thời gian đồng bộ nền/upload ở mạng chậm, và
   tính đúng khi offline → reload → online, hai thiết bị cùng sửa, retry và xóa.
7. Kiến trúc đã thống nhất cho Plate Studio: app shell dùng service worker theo hướng
   network-first khi online và cache fallback khi offline; PWA có shortcut mở thẳng
   `?capture=1`. Reload dùng RPC manifest một lượt để so revision + số bản ghi rồi chỉ
   tải collection thay đổi, nhưng phải fallback an toàn về REST khi migration chưa có.
   Ảnh camera được ghi vào IndexedDB theo workspace + user trước khi upload, giữ cùng
   `reportId`/image hash khi resume và chỉ xóa blob local sau xác nhận server. Người
   dùng được đóng camera ngay khi ảnh đã bền vững trên máy; queue tự tiếp tục khi có
   mạng hoặc lần mở sau, không hiện cảnh báo rời trang cho ảnh đã được IndexedDB giữ.
8. Lượt triển khai local-first/camera nhanh ngày 2026-10-02 chỉ được coi là bàn giao
   xong sau khi runner Windows hoạt động lại, QA được chạy lại trên diff cuối, migration
   `202610020001_workspace_sync_manifest.sql` được đẩy lên Supabase, và commit chọn lọc
   được push lên remote. Không gộp nhầm các thay đổi KiotViet đang tồn tại song song;
   lỗi runner `CreateProcessWithLogonW 1909` là trạng thái hạ tầng, không phải QA pass.
   Khi tiếp tục deploy, phải xác nhận migration đã áp dụng và kiểm tra nội dung staged
   trước commit để chỉ đưa phần local-first/camera lên remote. Lỗi `CreateProcessWithLogonW
   1909` có thể thuộc tài khoản sandbox riêng của Codex (`CodexSandboxOffline`), không
   chứng minh màn hình hay tài khoản người dùng đang bị khóa. Khi gặp lỗi này, thử lại và
   kiểm tra runner/tài khoản sandbox trước; chỉ đề nghị đăng nhập lại hoặc khởi động lại
   Codex khi lỗi còn kéo dài sau kiểm tra, và không được báo đã triển khai khi chưa xác nhận.
9. Âm thanh chụp là tùy chọn, không được chặn camera hoặc âm mặc định local vì đang
   chờ metadata/thư viện âm thanh cloud. Nạp asset mặc định độc lập; nếu tài khoản có
   âm riêng thì chuyển sang âm đó sau khi tải xong. QA phải mô phỏng truy vấn cloud
   chậm/không phản hồi và chờ buffer theo trạng thái bất đồng bộ, không kiểm tra đồng bộ.
10. Mỗi lần mở web phải tự quét IndexedDB để khôi phục mọi ảnh camera chưa được server
   xác nhận và tự tải nền, không phụ thuộc người dùng mở lại giao diện camera hoặc bấm
   “Thử lại”. Lỗi tạm thời phải retry có backoff và được đánh thức khi online/quay lại
   tab; nút thử lại chỉ là đường chủ động dự phòng. Giữ tương thích với hàng chờ đã có,
   không đổi ID/blob và không xóa bản local cho tới khi server xác nhận bản ghi nghiệp vụ.
11. Nếu ảnh mới đồng loạt không gửi được trên nhiều thiết bị, coi đây là sự cố đường tải
   dùng chung chứ không chỉ là lỗi retry phía client: phải kiểm tra Edge Function, hiệu
   lực token nhân viên, Storage và bước ghi `batch_reports`. Không yêu cầu chụp lại hoặc
   xóa dữ liệu trình duyệt; hàng local phải tiếp tục được giữ và thử lại sau khi dịch vụ
   được sửa. Không báo đã khắc phục chỉ bằng thay đổi client khi bản deploy chưa xác nhận.
12. Commit `efb62c2` ngày 2026-10-05 chỉ sửa startup/retry của phiên staff, không được
   coi là đã khép sự cố ảnh chung. HAR sau deploy cho thấy luồng tài khoản đăng nhập tạo
   được `batch_reports` nhưng ảnh gốc và thumbnail đều bị Storage trả `403 new row
   violates row-level security policy`: upload bền vững dùng `upsert:true`, nên policy
   `plate-media` phải có đủ `SELECT`, `INSERT`, `UPDATE` giới hạn đúng bucket + thư mục
   `auth.uid()`. Mọi kết luận sửa xong phải kiểm tra cả link staff qua Edge Function và
   tài khoản đăng nhập upload trực tiếp, áp dụng migration live, xác nhận ảnh cũ tự retry;
   không yêu cầu nhân viên chụp lại hoặc xóa dữ liệu trang.

## Nhập báo cáo bán hàng KiotViet (mandatory)

Phạm vi rà soát ngày 2026-10-08: người dùng báo trang Bán hàng có nhiều lỗi và
mất dữ liệu; phải kiểm tra toàn luồng nhập file/Chrome/bù ngày, cache, archive,
đồng bộ, lịch sử, lọc/biểu đồ và in lại. Phân biệt lỗi đã tái hiện với dữ liệu live
chưa xác minh; kiểm thử trên dữ liệu cô lập. Không coi QA giao diện trước đây là
bằng chứng dữ liệu bán đã an toàn. Kết quả rà soát: docs/sales-audit-2026-10-08.md.

Đối chiếu ngày 2026-10-09: người dùng hỏi vì sao SP012001 / Lót ly hoa / Flower
Coasters có 3 bán, 131.552 đ ở trang Bán hàng nhưng 0 bán, 0 đ trong chi tiết model,
trong khi tồn cửa hàng vẫn là 9. Đã tái hiện bằng dữ liệu cô lập: trang Bán hàng đọc
`salesImports`/archive, còn `getModelKiotMetrics` và `modelKiotVariantRows` đọc cache
phiên cũ `kiotViet.sales`; settings cloud chủ động bỏ cache này khi archive đã sẵn
sàng. Chênh lệch hiển thị không tự chứng minh báo cáo bị mất; phải đối chiếu nguồn
và kỳ trước khi kết luận. Người dùng đã đồng ý sửa đồng bộ bảng chi tiết và metrics
gửi AI; không chỉ phần xem nhanh trên thẻ model. Dùng báo cáo cùng kỳ đang chọn ở
trang Bán hàng (fallback cùng bộ lọc ngày), ghi rõ kỳ; cache chỉ dùng khi revision
khớp, chi tiết chưa tải/lỗi phải là chưa biết, có tải lại, không coi là số 0. AI
chờ chi tiết đầy đủ và không gửi khi thiếu dữ liệu/quyền; kết quả cũ khác báo cáo/
revision không được trình bày như đánh giá kỳ hiện tại. Chỉ patch vùng Kiot trong
dialog, giữ ảnh, cuộn và không mở lại model khi người dùng đã đóng/đổi model. Giữ
nguyên báo cáo nguồn và ledger; QA dùng dữ liệu cô lập, không sửa dữ liệu live.
Regression: tools/model-sales-qa.mjs kiểm tra cả bảng model, tóm tắt Kiot, metrics
AI, tải lại/cache lệch revision, tải nền/lỗi/thử lại, kỳ cũ và zero thật, hai theme
trên mobile/desktop. Phần xem nhanh 30 ngày phải tiếp tục ghi rõ kỳ riêng.

Người dùng đã yêu cầu sửa các lỗi rà soát này. Báo cáo và ledger bán phải lưu/xóa
nguyên tử, kiểm tra revision và retry cùng request ID. Bản nhập chưa xác nhận phải
được lưu bền trước khi gửi, không cắt lịch sử, không compact chi tiết chưa archive,
không báo cloud thành công hoặc xác nhận ngày cho bridge khi còn lỗi. File nhiều
ngày không được ghi vào ngày cuối. Cache chi tiết phải khớp revision, tải đủ mọi
trang và có trạng thái lỗi/thử lại hữu hạn. In bù dùng đủ thành phần và hệ số của
SKU; không tự chọn model thay thế. Không sửa/xóa dữ liệu live cũ để kiểm thử.

1. Không coi việc có bản ghi theo ngày là đã nhập thành công: ngày chỉ được
   hoàn tất nếu báo cáo có chi tiết bán hoặc metadata tổng hợp xác nhận SKU/số
   lượng/doanh thu lớn hơn 0. Báo cáo rỗng phải hiển thị riêng và có thể đưa vào
   luồng bù ngày.
2. Trước khi lưu file từ Chrome cho một ngày được yêu cầu, đối chiếu kỳ ghi bên
   trong file với ngày của job. Nếu không khớp, dừng và giữ nguyên báo cáo cũ;
   không âm thầm gắn file của ngày khác vào ngày đang xử lý.
3. Luồng bù chỉ thay bản ghi cùng ngày sau khi file đúng kỳ được parse có dòng
   bán hợp lệ và thao tác lưu hoàn tất. Ngày đã có doanh số hợp lệ không bị lấy
   lại/ghi đè tự động; ngày thiếu hoặc bản ghi rỗng được phép chạy lại.
4. QA phải bao gồm ngày chưa nhập, ngày có báo cáo rỗng, ngày có doanh số hợp
   lệ, file sai kỳ và file rỗng; kiểm tra rằng bù ngày rỗng không xóa dữ liệu
   tốt, không cộng lặp biến động tồn kho và chỉ xác nhận lượt sau khi lưu xong.
5. Parser báo cáo phải nhận diện header hàng hóa theo tiền tố/biến thể KiotViet
   (ví dụ “Mã hàng hóa”, “Tên hàng hóa”), không phụ thuộc đúng một cách viết;
   vẫn phải loại trừ dòng tổng và chỉ lưu SKU có số lượng bán hợp lệ.
