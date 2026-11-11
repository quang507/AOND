# scripts/archive — script nạp nguồn ngoài đã NGỪNG (SRS-5.1zzzzzzz401, 11/11/2026)

Chỉ để tra cứu cách dữ liệu dự án từng được nạp. **Không chạy lại**: chạy là ghi đè nhãn / cột nguồn `mogi` / `rever` / `moso` lên
bảng `projects`, phá chuẩn duy nhất `aond` (SRS-5.1zzzzzzz396). Các script đọc khoá từ `.env` cạnh chính nó (`scripts/archive/.env` —
không có), nên lỡ chạy cũng không ghi được DB.

| Tệp | Từng làm gì |
|---|---|
| `thu-du-an.mjs` | Dựng kho dự án từ mogi (OPEN-56 / FR-114 d) |
| `thu-du-an-rever.mjs` | Làm giàu kho dự án từ rever (SRS-5.1zzzzzzz324) |
| `thu-du-an-moso.mjs` | Làm giàu kho dự án từ MOSO (SRS-5.1zzzzzzz388); tệp dữ liệu `moso_projects_hcm.json` đã xoá — lấy lại ở lịch sử git |
| `crawl_mogi_projects.py`, `crawl_moso_projects.py` | Cào trang nguồn ra JSON cho hai script trên |

Script duy nhất còn dùng cho kho dự án: `scripts/hop-nhat-nguon-du-an.mjs`. Bài kiểm hàm thuần của hai script rever / moso vẫn chạy
(`bot/tests/thu-du-an-rever.mjs`, `bot/tests/thu-du-an-moso.mjs`) để giữ ghi nhận cách bóc / ghép từng dùng.
