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
4. Khi rút gọn copy, quét cả họ component và mọi breakpoint; thêm regression check
   cho nguyên tắc mới thay vì chỉ cắt chữ ở ảnh người dùng gửi.

## Định nghĩa hoàn tất

Một sửa lỗi UI chỉ hoàn tất khi đã có: sửa ở nguồn dùng chung hoặc lý do rõ ràng cho
ngoại lệ; regression guard; QA pass; và thay đổi được đẩy lên remote theo quyền đã
được người dùng cấp. Quy tắc này áp dụng cho mọi thay đổi tương lai trong repository.
