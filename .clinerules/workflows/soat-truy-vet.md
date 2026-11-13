# Workflow: Soát truy vết docs/

Chạy khi SỬA `docs/`, một lần trước khi push — không chạy sau từng commit nhỏ, commit nháp (WIP) không cần
(CLAUDE.md §7.1 Smart Scoping, SRS-5.1zzzzzzz387 / 464).

1. Chạy đúng một lệnh và báo kết quả (đừng gõ lệnh `grep`/`comm` rời — người và máy dùng chung script trong
   `package.json`, CLAUDE.md §7):
```bash
bun run truyvet   # = bash scripts/soat-truy-vet.sh: ID gãy (FR/UF/WF/OPEN… kể cả OPEN dạng dòng bảng `| OPEN-xx |`),
                  # FR thiếu truy vết, FR nhắc trong mã nguồn, số đếm README, PII, khoá service_role, raw.githubusercontent
```
2. Nếu có ID gãy: sửa docs (thêm định nghĩa hoặc sửa tham chiếu), KHÔNG xoá lặng lẽ.
3. Số đếm lệch với bảng trong `README.md` → cập nhật README.
4. Kiểm tra nhanh: không có số điện thoại thật / Zalo ID thật trong diff
   (`git diff --cached | grep -E '09[0-9]{8}'` phải rỗng).
5. Báo tổng kết: sạch / đã sửa gì. Soát sâu hơn thì gọi agent `soat-truy-vet` (CLAUDE.md §9).
