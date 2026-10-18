---
name: ba-pipeline
description: Quy trình chuẩn để tạo mới hoặc cập nhật một tầng tài liệu BA của dự án nhadat.cc (Research, Requirements, User Flow, IA, Wireframe, UI Design, SRS) mà không phá vỡ truy vết. Dùng khi được yêu cầu viết, sửa, bổ sung hay rà soát bất kỳ file nào trong docs/.
---

# BA Pipeline — nhadat.cc

Bản rút gọn của `docs/11-quy-trinh.md` (§11.2 vòng BA). Vòng tester, ba cổng và
định nghĩa XONG nằm ở file đó — đọc khi việc chạm tới kiểm thử hay phát hành.

## Khi nào dùng

Bất cứ khi nào chạm vào `docs/`: thêm yêu cầu mới, sửa luồng, cập nhật SRS, hoặc rà
soát tính nhất quán của bộ tài liệu.

## Nguyên tắc bất di bất dịch

1. **Tài liệu gốc 2024 đã xoá khỏi repo** (08/09/2026, commit `459008d`, OPEN-48). Nguồn
   sự thật là `docs/` + hai file `Kịch bản … (Gemini …).md` ở gốc. Trích dẫn `[nguồn: file §mục]`
   cũ giữ nguyên làm dấu vết; cần đọc lại thì `git show 459008d^:"<tên file>"`.
2. **Mọi khẳng định phải có nguồn**: `[nguồn: <file> §<mục>]` hoặc `[giả định BA]`.
3. **Không tự chốt điều mơ hồ** — tạo `OPEN-xx` trong `docs/09-open-issues.md` với
   phương án + khuyến nghị.
4. **ID bất biến.** Không đánh số lại; mục bỏ đi thì đánh dấu `[deprecated]`.
5. **Sửa tầng trên → cập nhật `docs/08-traceability.md` cùng commit.**
6. Ngôn ngữ: tiếng Việt; tên bảng/trường/API bằng tiếng Anh `snake_case`.
7. **Ẩn danh** mọi số điện thoại, Zalo ID, tên thật khi trích vào `docs/`.

## Quy trình thêm một yêu cầu mới

```
1. Nó đến từ đâu?
   ├── Tài liệu gốc  → trích dẫn nguồn
   ├── Insight mới   → thêm INS-xx vào 01-research.md trước
   └── Ý muốn tự phát → dừng, hỏi chủ dự án hoặc ghi OPEN-xx

2. Cấp FR-xxx tiếp theo trong 02-requirements.md (M/S/C + nguồn)
   — TỪ 30/09/2026 KHÔNG BẮT BUỘC cho sửa lỗi / cải tiến: ghi thẳng mục SRS ở docs/07
     (ca gốc, nguyên nhân, chỗ sửa, cách kiểm), cùng commit với code. Xem docs/11 §11.2.

3. Đi hết chuỗi — bỏ mắt xích nào là tài liệu vỡ:
   FR → UF (03) → WF (05) → SRS (07) → AC (07 §7)
   Nếu chạm cấu trúc trang/URL → cập nhật 04
   Nếu chạm component/copy      → cập nhật 06

4. Thêm dòng vào 08-traceability.md §8.3

5. Tự kiểm (checklist dưới)
```

## Checklist tự kiểm trước khi commit

- [ ] `bun run kiem` xanh (kiểu + dựng + e2e bot + soát truy vết). Chỉ soát tài
      liệu thì `bun run truyvet` — nó bắt luôn ID gãy, FR thiếu dòng truy vết,
      số đếm README lệch và SĐT thật lọt vào `docs/`.
- [ ] Mọi `FR-` mới đều xuất hiện trong `08-traceability.md`.
- [ ] Mọi `UF-`, `WF-`, `SRS-`, `AC-` được tham chiếu đều **tồn tại thật**.
- [ ] Không có ID trùng, không có ID bị nhảy cóc mà không giải thích.
- [ ] Yêu cầu mới không mâu thuẫn với: NFR-07 (không hỏi số ĐT), FR-24 (tối đa 3
      listing/tin nhắn), RSK-03 (không khẳng định điều chưa xác minh).
- [ ] Không rò rỉ dữ liệu từ `admin logins/`, `sổ đỏ samples/`, `masterDB/`.
- [ ] Sơ đồ Mermaid render được (nhãn có ký tự đặc biệt phải bọc `"…"`).
- [ ] `docs/README.md` §"Trạng thái từng tầng" còn đúng.

## Ba câu hỏi luôn phải trả lời cho mọi tính năng mới

1. **Nó đẩy người dùng về Zalo hay kéo họ ra khỏi Zalo?** (IA-P1 — kéo ra là sai hướng.)
2. **Nó có làm hỏng lời hứa không-thu-số-điện-thoại không?** (NFR-07.)
3. **Nó có khiến hệ thống khẳng định điều chưa xác minh không?** (RSK-03.)

## Trích xuất tài liệu gốc

Không còn file `.docx/.pdf/.pptx` trong repo. Nếu chủ dự án đưa tài liệu mới dạng đó, trích bằng
`python-docx` / `pypdf` / `python-pptx` vào scratchpad của phiên, **không** commit file gốc lẫn output.
