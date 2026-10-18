# Bộ tài liệu BA — nhadat.cc

Phiên bản: **v1.0** · Ngày: **2026-08-21** · Trạng thái: **Draft để review**

## Pipeline

```mermaid
flowchart LR
    D[00 Định hướng] --> R
    D --> Q
    D -.quyết định treo.-> O
    R[01 Research] --> Q[02 Requirements]
    Q --> UF[03 User Flow]
    UF --> IA[04 Information Architecture]
    IA --> WF[05 Wireframe]
    WF --> UI[06 UI Design]
    Q --> SRS[07 SRS]
    UF --> SRS
    IA --> SRS
    UI --> SRS
    SRS --> T[08 Traceability]
    R -.mâu thuẫn.-> O[09 Open Issues]
    Q -.-> O
    SRS -.-> O
```

## Mục lục

| File | Mô tả | Đối tượng đọc |
|---|---|---|
| [00-dinh-huong.md](00-dinh-huong.md) | **Định hướng (BRD hợp nhất Aioinhadat × nhadat.cc)** — thương hiệu Aioinhadat / AI Ơi Nhà Đất, trợ lý mỗi khách một tên •ai (FR-181); sản phẩm hôm nay là gì, giữ gì của bên nào, câu khách hỏi đi về chủ nhà rồi CTV, sao Bắc Đẩu, lộ trình, quyết định treo | Founder, PO, mọi người mới vào |
| [00-glossary.md](00-glossary.md) | Từ điển thuật ngữ | Tất cả |
| [01-research.md](01-research.md) | Bối cảnh thị trường, người dùng, đối thủ, ràng buộc | PO, Founder, Marketing |
| [02-requirements.md](02-requirements.md) | Mục tiêu KD, persona, FR/NFR | PO, Dev Lead, QA |
| [03-user-flows.md](03-user-flows.md) | 13 luồng end-to-end | UX, Dev, QA |
| [04-information-architecture.md](04-information-architecture.md) | Sitemap, URL/SEO, content model | UX, SEO, Dev |
| [05-wireframes.md](05-wireframes.md) | Wireframe low-fi 14 màn hình | UX, UI, Dev |
| [06-ui-design.md](06-ui-design.md) | Design system + tone giọng chat | UI, Dev, Content |
| [07-srs.md](07-srs.md) | Đặc tả kỹ thuật: kiến trúc, DB, API, NFR | Dev, QA, Vendor |
| [08-traceability.md](08-traceability.md) | Ma trận truy vết | PO, QA |
| [09-open-issues.md](09-open-issues.md) | 62 vấn đề (36 đã chốt hoặc đã đóng — dọn 07/09, chốt thêm 09/09 theo chat Gemini OPEN-55 và OPEN-40, đóng OPEN-45 10/09; 26 cần chủ dự án chốt, mới nhất OPEN-60…62 phường số cũ / vai người rao / giọng 09/10) | Founder, PO |
| [10-ke-hoach-kiem-thu.md](10-ke-hoach-kiem-thu.md) | Kế hoạch kiểm thử 4 tầng (suite TS-*) | QA, Dev, PO |
| [11-quy-trinh.md](11-quy-trinh.md) | **Quy trình BA và tester** — hai vòng làm việc, ba cổng, máy kiểm gì / người kiểm gì, định nghĩa XONG | Tất cả |
| [SRD-AI-Oi-Nha-Dat.docx](SRD-AI-Oi-Nha-Dat.docx) | **SRD gộp (.docx)** — bản đọc nhanh theo bố cục SRD Aioinhadat 06/2026 (7 mục I–VII + đối chiếu + còn treo + thư viện kịch bản + hội thoại giả lập 30 câu). **Bản xuất, không phải nguồn sự thật**: sinh từ các file md ở đây bằng `bun run srd` (`scripts/sinh-srd-docx.mjs`, 06/10/2026 theo yêu cầu chủ dự án "đổi thành đuôi docx như bên AOND"); sửa nội dung thì sửa md rồi sinh lại, không sửa tay file .docx | Sếp, chủ dự án, người mới, đối tác đọc một lần |
| [13-so-do-nhan-va-boc-tach.md](13-so-do-nhan-va-boc-tach.md) | **Sơ đồ luồng bot** (09/09/2026) — tin Zalo vào → nhận vai → bóc tách tiền định → hỏi câu kế → prompt bot 4 lượt → JSON chia nhóm; hai tầng bóc tách ⟂ AI; cron người bán. Mermaid, không sinh ID | Dev, chủ dự án |

## Đọc từ đâu

- **Founder / nhà đầu tư** → `00-dinh-huong` rồi `01`, rồi `09`.
- **Vendor phát triển (Vitalify)** → `07` là hợp đồng kỹ thuật; `02` là phạm vi.
- **Designer** → `03` → `04` → `05` → `06`.
- **QA** → `02` (FR/NFR) + `08` (truy vết) để dựng test case.

## Trạng thái từng tầng

| Tầng | Độ đầy đủ | Chặn bởi |
|---|---|---|
| 00 Định hướng | 95% — tên đã chốt (Aioinhadat; trợ lý mỗi khách một tên •ai từ 09/09), địa bàn đã chốt nửa đầu (Sài Gòn phường mới + Long An); chờ phạm vi loại BĐS, nhà cung cấp model, ngưỡng CTV; địa bàn nửa sau chốt 15/09 (lưu tên phường mới, bảng `wards`, FR-209); 07/09 thêm: bớt kế thừa nhadat.cc (OPEN-48); hỏi người bán đã chốt theo kịch bản Gemini → FR-177 | OPEN-40, OPEN-41, OPEN-42, OPEN-27, OPEN-48 |
| 01 Research | 85% — thiếu số liệu thị trường sơ cấp | OPEN-01 |
| 02 Requirements | 90% | OPEN-02, OPEN-05 |
| 03 User Flow | 90% | OPEN-04 |
| 04 IA | 80% — chờ danh sách TOP-100 keyword | OPEN-06 |
| 05 Wireframe | 85% | — |
| 06 UI Design | 75% — chờ chốt theme thương mại | OPEN-07 |
| 07 SRS | 80% — API S↔B còn mâu thuẫn với thiết kế Slack | OPEN-03 |
