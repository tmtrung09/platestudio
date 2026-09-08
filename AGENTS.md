# Quy tắc chất lượng giao diện Plate Studio

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

## Định nghĩa hoàn tất

Một sửa lỗi UI chỉ hoàn tất khi đã có: sửa ở nguồn dùng chung hoặc lý do rõ ràng cho
ngoại lệ; regression guard; QA pass; và thay đổi được đẩy lên remote theo quyền đã
được người dùng cấp. Quy tắc này áp dụng cho mọi thay đổi tương lai trong repository.
