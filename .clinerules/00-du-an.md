# Luật dự án nhadat.cc (Cline rules)

Đọc `CLAUDE.md` ở gốc repo trước khi làm bất cứ việc gì — đó là harness đầy đủ.
File này chỉ nhắc các luật bất di bất dịch:

1. Repo này là **tầng đặc tả**. Nguồn sự thật là `docs/00` → `docs/09`.
   Tài liệu gốc 2024 đã xoá khỏi repo (08/09/2026, commit 459008d); trích dẫn
   `[nguồn: file §mục]` trong docs là dấu vết lịch sử, không cần mở file.
2. Mọi khẳng định trong `docs/` phải có nguồn: `[nguồn: file §mục]`
   hoặc `[giả định BA]`. Mơ hồ → tạo `OPEN-xx` trong `docs/09`, không tự chốt.
3. ID (`FR- UF- WF- SRS- AC- INS- OPEN-`) là bất biến — không đánh số lại,
   mục bỏ thì đánh dấu `[deprecated]`.
4. Sửa tầng trên → cập nhật `docs/08-traceability.md` CÙNG commit.
5. TUYỆT ĐỐI không đọc-chép nội dung từ `admin logins/`, `sổ đỏ samples/`,
   `masterDB/`, `ThemeForest/` vào docs, commit hay chat.
   Số điện thoại / Zalo ID / tên thật phải ẩn danh (`0903xxxxxx`, `chị D.`).
6. Ba câu hỏi cho mọi tính năng mới: (a) nó đẩy người dùng VỀ Zalo hay kéo ra?
   (b) có phá lời hứa không-thu-số-ĐT không? (c) có khiến hệ thống khẳng định
   điều chưa xác minh không?
7. Ngôn ngữ docs: tiếng Việt; tên bảng/trường/API: tiếng Anh snake_case.
8. Commit lên branch làm việc hiện tại, không push thẳng main.
9. Sửa lỗi bot/web (từ 01/10/2026): ghi trong docs/07 ba mục — **lớp lỗi** (cơ chế gốc cho lỗi lọt, không phải câu khách cụ
   thể), **chỗ khác cùng lớp** đã soát, **bài kiểm đỏ khi tắt bản sửa** (kèm một cách nói mới). Lỗi "máy đoán ý bằng từ
   khoá" thì không thêm từ vào regex — đưa sang AI đọc theo nghĩa, từ khoá làm lưới đỡ (CLAUDE.md §6, mẫu SRS-5.1q).
