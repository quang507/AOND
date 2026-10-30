# 10 — Kế hoạch kiểm thử

Nền có sẵn: 13 kịch bản nghiệm thu AC-01…13 (`docs/07 §7`) và bảng kiểm chứng NFR
(`docs/07 §6`). File này là kế hoạch 4 tầng (§10.1–10.6), bộ test chạy tay đang
sống kèm kết quả mới nhất (§10.7) và nghiệm thu theo tài liệu 04/09/2026 (§10.8).
**28/10/2026:** bộ não là lõi Python `src/aioi/`, bot TypeScript đã gỡ, CTV bỏ hẳn [nguồn: chủ dự án 28/10/2026, chat] —
sổ đăng ký §10.7.0 viết lại theo hiện trạng; mục TS kiểm thứ đã gỡ mang `[deprecated 28/10/2026]`. §10.8 là ảnh chụp 04/09, giữ làm lịch sử.
Nguyên tắc: công cụ **free-tier trước** (NFR-16); mọi test case truy về FR/AC/NFR.

## 10.1 Kiểm thử chức năng

Suite theo nhóm FR. Dữ liệu mẫu: 24 kịch bản chat trong `chats w B.docx` (đã ẩn
danh) — không bịa thêm. Mỗi AC ≥ 1 test E2E; NLU (FR-09/22/23/92) kiểm bằng bảng
quyết định câu vào → trường ra, bắt buộc chạy lại trước khi đổi model/prompt.

| Suite | Phạm vi | Trọng tâm | Ca chạy được (§10.7) |
|---|---|---|---|
| TS-WEB | FR-01…17 | search parse đúng taxonomy §4.6 · trang tag không 404 · deep-link Zalo mang ngữ cảnh (AC-01) | TS-WEB2, TS-SEO, TS-CACHE |
| TS-BOT | FR-20…32 | 4 bất biến I1–I4 (SRS-5.1) chặn release: ≤3 listing/tin · kết thúc bằng câu hỏi · không khẳng định điều chưa xác minh · không hỏi SĐT sai chỗ | TS-PY-01, TS-PROD-01…03 (28/10/2026; TS-CHATREPLY, TS-E2E, TS-V48, TS-VAI deprecated) |
| TS-ASK | FR-40…47, FR-110 | hỏi kho trước, hỏi S sau · idempotency · timeout 24h/48h · AC-03 | TS-PY-01, TS-HOICHU-02 (TS-CTV, TS-IDEM, TS-IDEM2 deprecated 28/10/2026) |
| TS-VIEW | FR-50…57 | từ chối cho SĐT vẫn đặt được lịch (AC-04) · email [VIEWING] | TS-MATCH-06, TS-GIUCHAN-01 |
| TS-RET | FR-60…65 | mốc 5 ngày / ≥6 ngày giữ kết nối · nội dung xoay vòng không lặp (AC-06) | TS-GIUCHAN, TS-V48 |
| TS-ADM | FR-70…81 | 20 mục/trang · 4 loại email đúng subject/body (AC-09/10) | TS-ADM2, TS-DANGTIN |
| TS-SEL | FR-90…103, FR-109 | bóc ≥4 trường (AC-07) · rao từng bước trong Zalo · không spam S | TS-PY-01, TS-PROD-01, TS-THONGSO (DB), TS-SQL-01 (TS-KD, TS-NEO, TS-OUNG deprecated 28/10/2026) |
| TS-BROKER | FR-104…112 | ẩn danh hai chiều (lọc SĐT/Zalo/địa chỉ trong relay) · vòng đời listing · sold → báo interests | TS-SEC-10, TS-V48, TS-GIUCHAN |
| TS-PROJECT | FR-113…117 | AC-13: căn theo unit_status · câu tầng dự án không sinh info_request · unique (project_id, unit_code) | TS-V48 |

## 10.2 Kiểm thử kỹ thuật

| Mục | Kiểm gì | Tham chiếu | Ca chạy được |
|---|---|---|---|
| API contract | schema SRS-4.x; request_id trùng → trả kết quả cũ, không nhân đôi; mã 404/409 | FR-41/43 | TS-WEB2 (S), TS-IDEM |
| Database | RLS: anon chỉ đọc tin lên kệ + media công khai của tin đó; unique/enum/CHECK; trigger toàn vẹn | SRS-3.9, FR-113/116/163/167 | TS-SEC, TS-SEC2, TS-TOANVEN |
| Webhook Zalo | [deprecated 28/10/2026] `zalo-webhook` gỡ 18/10/2026; kênh là bridge zca-js gọi lõi `127.0.0.1:8000` (OPEN-33, OPEN-34 đóng) | SRS-4.4 | — |
| Hàng đợi | worker sập / hết lượt thử → 0 tin mất (dựng cảnh sập bằng tay, không giết được instance Edge Function) | NFR-04, FR-166 | TS-JOB |
| Kho file | signed URL ≤15 phút; bucket riêng không đọc thẳng; adapter đổi backend không đụng bot | NFR-06, FR-111/165 | TS-KHO, TS-WEB2 (P) |
| Migration | chạy được trên project trống + có dữ liệu; không phá dữ liệu cũ | — | TS-SEC sau mỗi migration |
| Còi báo lỗi | lỗi HTTP lẫn lỗi trả 200 đều vào sổ | FR-152, FR-168 | TS-HEALTH, TS-LOG, TS-CHUONG |

## 10.3 Kiểm thử giao diện & trải nghiệm

| Bài | Kiểm gì | Công cụ |
|---|---|---|
| Đối chiếu thiết kế | từng màn so với `06` (canvas/Figma và `design/tokens.json` đã xoá 08/09/2026); token thật là `app/globals.css` — sai token là lỗi, không phải "gần đúng" | soi tay |
| Responsive | 375/768/1440px; bảng rộng cuộn trong container, body không cuộn ngang; sticky CTA Zalo mobile | Playwright |
| Tone giọng chat | 7 quy tắc + mục Cấm (`docs/06 §6.8`) trên 50 hội thoại: đếm câu hỏi/lượt, tin kết thúc "?", từ cấm | script đếm trên log |
| Accessibility | tương phản ≥4.5:1, vùng chạm ≥44px, focus ring, alt ảnh | axe-core + duyệt tay (persona P3) |
| Trạng thái | ma trận loading/rỗng/lỗi cuối `docs/05`, mỗi ô một test; "0 kết quả" nói rõ đã nới gì | Playwright |
| Hiệu năng cảm nhận | Lighthouse mobile ≥ 90, LCP < 2,5s/4G (NFR-02) | Lighthouse CI |

## 10.4 Kiểm thử phi chức năng

Bảng NFR-01…18 với cách đo nằm ở `docs/07 §6` (nguồn sự thật). Bài chuyên sâu:

| Bài | Nội dung | Công cụ |
|---|---|---|
| Tải | 50 tin đồng thời p95 < 3s (NFR-01); seed 5.000 listing + 300 hội thoại không suy giảm (NFR-05) | k6/script |
| Bảo mật | pen-test 3 hướng: prompt-injection dụ bot lộ SĐT (FR-104); đoán URL `/ds/token` + signed URL; RLS bypass qua PostgREST | tay + TS-SEC2 |
| Riêng tư | 100 hội thoại: 0 lần hỏi SĐT ngoài viewing (NFR-07); dữ liệu B không rời hệ thống | rà log |
| SEO | 100 URL tag index, 0 lỗi structured data (NFR-09) | Search Console |
| Chi phí | mỗi tuần đối chiếu usage Supabase/Vercel/AI với ngưỡng free (NFR-16); vượt dự báo là finding | dashboard + `/admin` |

## 10.5 Môi trường & công cụ (free-tier)

- Unit: Vitest · E2E web: Playwright · A11y: axe-core · Perf: Lighthouse CI · bot: pytest `tests/` cho lõi Python (model giả) + ô bắn thử production TS-PROD (§10.7.0). Bộ `bot/tests/e2e` cũ gỡ 18/10/2026.
- CI: GitHub Actions free, `.github/workflows/kiem.yml` (soát 28/10/2026) — mỗi PR chạy 9 job: `web` (tsc + `next build`), `bot` (`test:bot` + pytest lõi Python + `test:sql` trên Postgres tạm), `baomat` (TS-SEC-AUTO, DB thật), `truyvet`, `rohang` (TS-ROHANG), `migration` (TS-MIG), `soatdb` (TS-DB), `kieubot` (TS-KIEU), `doichieutien` (TS-LUAT-01). Vercel preview mỗi PR. **Chưa vào CI:** TS-SEC bài phá huỷ, TS-SEC3 (cần quyền SQL), TS-LIVE (cần bridge), ô bắn thử TS-PROD (tiền thật, chạy tay), Lighthouse/axe/k6 — xem `docs/11 §11.4`.
- DB: `nhadat-cc` là môi trường chính, **không** chạy test phá hoại; ca ghi bọc `do … raise exception` để cuộn lại. Zalo: bridge zca-js trên tài khoản Zalo clone, ID thử theo `la_id_thu` (OA không dùng — OPEN-09).
- Bí mật chỉ trong biến môi trường / Vault; khoá đã dán vào chat phải rotate.

## 10.6 Lịch chạy theo giai đoạn phát hành (SRS §8)

| Phase | Suite bắt buộc xanh để thoát phase |
|---|---|
| P0 Nền | TS-SEL, Migration, Database, Bí mật |
| P1 Nguồn hàng | TS-WEB, UI/UX, SEO, Lighthouse |
| P2 Chat | TS-BOT (I1–I4 chặn), TS-ASK, TS-PROJECT, Webhook, Tone giọng |
| P3 Giao dịch | TS-VIEW, TS-ADM, TS-BROKER, pen-test ẩn danh |
| P4 Giữ chân | TS-RET, Tải, Riêng tư, Chi phí |

Bug tìm thấy sau release phải có test tái hiện trước khi sửa — suite chỉ phình, không teo.

## 10.7 Bộ test chạy tay (sổ đăng ký viết lại 28/10/2026)

> **28/10/2026 — hiện trạng.** Bộ não là lõi Python `src/aioi/` từ 18/10/2026 (SRS-5.1zzzzzzz31, SRS-5.1zzzzzzz46); bot
> TypeScript (`chat-reply`, `zalo-webhook`, `nudge`, `ask-seller`, `ctv-report`, `inbound-sweep`) và các bộ kiểm của nó
> (`bot/tests/e2e/`, `fr159/161/164/176/177-*.mjs`, `giong/`, `do-boc/`, `mo-phong/`, `phat-lai/`, `chat/`, `ban-thu/kich-ban.md`)
> đã gỡ. CTV bỏ hẳn [nguồn: chủ dự án 28/10/2026, chat]. Mục TS nào kiểm thứ đã gỡ mang `[deprecated 28/10/2026]` ở tiêu đề;
> ID giữ nguyên, không cấp lại. Sổ đăng ký §10.7.0 là danh sách bộ ĐANG SỐNG.

Lệnh dán vào chạy được, không phải mô tả. ID bất biến. Cột cuối là kết quả **mới
nhất** (dd/mm); ⏭ = chưa chạy lại được trong sandbox (cần deploy/bridge/trình
duyệt). Ca ghi trên DB thật bọc `do … raise exception` hoặc `begin … rollback`;
bí mật lấy bằng `get_secret()` ngay trong SQL, không in ra.

### 10.7.0 Sổ đăng ký bộ test — chạy bằng lệnh nào, cần môi trường gì

Bảng này là danh sách ĐỦ. Một bộ test không có tên ở đây là một bộ không ai
chạy. Đừng gõ lệnh rời: người và CI dùng chung script trong `package.json`, không
thì "máy xanh, máy tao đỏ" và không ai biết bên nào đúng.

**Chạy máy, offline — CI chạy mỗi PR (`.github/workflows/kiem.yml`):**

| Bộ | ID | Lệnh | Job CI | Kiểm cái gì |
|---|---|---|---|---|
| `tests/` (157 file pytest) | **TS-PY-01** | `bun run test:py` (= `python -m pytest -q tests`; cài trước `pip install -e ".[dev]" httpx` như CI) | `bot`, bước "Lõi Python — pytest" | Lõi Python: phiên chat, định tuyến bán / mua, bóc tách có bằng chứng, câu mẫu, phí, xưng hô, lưới soát lời bot, gợi căn, báo căn mới, gửi nhắc, lệnh Zalo, pháp lý. Model giả: chỉ kiểm code nhận đúng KHI model trả đúng, không kiểm model hiểu đúng |
| các file `bot/tests/*.mjs` liệt kê trong script `test:bot` | TS-RANHGIOI, TS-NHAC, TS-LUAT-03, TS-NHAN-01, TS-SEC-AUTO (tự kiểm) | `bun run test:bot` | `bot` | Code TypeScript còn sống: web (`lib/`), ba edge function, `_shared/` còn lại, bridge, script nạp mẫu / đo tìm nhà (tự kiểm offline) |
| `bot/tests/sql/*.sql` | **TS-SQL-01**, TS-STREET-DA-01 | `bun run test:sql` | `bot` | Trigger / hàm SQL chạy thật trên Postgres tạm. Thoát 2 = máy không có Postgres = chưa kiểm được |
| `scripts/xuat-ro-hang.tu-kiem.mjs` | TS-ROHANG | `bun run test:rohang` | `rohang` | Bản xuất rổ hàng không ghi vào repo, không nuốt dòng thiếu |
| `scripts/soat-truy-vet.sh` | — | `bun run truyvet` | `truyvet` | ID gãy, truy vết thiếu, số đếm README, PII, khoá service_role |
| `tsc` + `next build` | TS-CACHE, TS-SEO | `bun run kieu`, `bun run build` | `web` | Kiểu dữ liệu web; trang tin còn `●` trong bảng route |
| `deno check` ba edge function | TS-KIEU-01 | `bun run kieu:bot` | `kieubot` | `escalation-feed`, `geocode-listings`, `media-cleanup` không lỗi kiểu |
| luật tiền TS ↔ SQL | TS-LUAT-01 | `bun run doi-chieu:tien` | `doichieutien` | `docTien` và `parse_vnd` ra cùng số trên mọi ca |

`bun run kiem` = `kieu` + `kieu:bot` + `build` + `test:bot` + `test:rohang` + `truyvet`. **`test:py` KHÔNG nằm trong `kiem`**
— sửa `src/aioi/` thì chạy thêm `bun run test:py` tay; CI chạy nó ở job `bot`.

**Cần môi trường thật — không chạy được trong sandbox:**

| Bộ | ID | Cần gì | Chạy sao | Đọc kết quả |
|---|---|---|---|---|
| `bot/tests/ts-sec-anon.mjs` | TS-SEC-AUTO | **Internet tới `*.supabase.co`** + DB production đang chạy. KHÔNG cần secret: bắn bằng khoá publishable công khai | `bun run test:sec` — CI job `baomat`, **cố ý không nằm trong `kiem`** | Thoát 0 = đạt · 1 = có cửa mở · **2 = CHƯA KIỂM ĐƯỢC** (proxy chặn, DB ngủ). Thoát 2 KHÔNG phải "đạt" |
| `scripts/soat-migration.mjs`, `scripts/soat-db.mjs` | TS-MIG-01/02, TS-DB-01 | Internet + khoá công khai | `bun run soat:migration`, `bun run soat:db` — CI job `migration`, `soatdb` | Đỏ khi repo ↔ DB lệch hoặc có phát hiện mới ngoài bản nền |
| `bot/tests/vai-tro.sql` | **TS-SEC3** | **Quyền SQL trên DB thật.** CI chỉ có khoá công khai | Dashboard → SQL Editor → dán cả file → Run; hoặc MCP `execute_sql` | Kết bằng `raise exception 'KQ: …'` nên mọi dòng chèn TỰ CUỘN LẠI. Mọi mục phải `OK`; một chữ `HONG` là một cửa mở |

**Bắn thử production — tiền thật, chạy tay qua workflow `apply-migration.yml` ô `dung_lai`:** mỗi ô chạy
`bot/tests/<ô>.sh` (đầu file ghi kịch bản và SRS gốc), chat với lõi trên VPS bằng ID thử (`la_id_thu`) rồi tự dọn. Không vào CI.
Chạy sau mỗi lần cài lõi (`cai-vps` khởi động lại lõi — báo trước người đang chat thử). Pytest xanh với model giả KHÔNG chứng minh
model thật làm đúng; lỗi thấy ở đây thì viết ca pytest tái hiện trước khi sửa.

| Ô `dung_lai` | ID | Kiểm cái gì |
|---|---|---|
| `ban-thu-ban`, `ban-thu-mua`, `ban-thu-vm`, `ban-thu-srd`, `ban-thu-ai`, `ban-thu-kb`, `ban-thu-dc`, `ban-thu-xa`, `ban-thu-sau`, `ban-thu-nhieu-can`, `ban-thu-dap-y`, `ban-thu-5-khach` | **TS-PROD-01** | Kịch bản viết sẵn trên lõi production: luồng bán, mua, vừa bán vừa mua, kịch bản SRD anh Luận, các mục AI đọc theo nghĩa, địa chỉ số hẻm, đất ở xã, bộ câu môi giới, một tin hai căn, đáp ý khách, 5 tính cách khách |
| `ban-thu-khach-ao` | **TS-PROD-02** | 5 khách ảo có cảm xúc do model đóng vai (`bot/tests/khach-ao.py`), giám khảo chấm và trích lỗi kèm đoán nguồn. Là gợi ý để người đọc, không phải phép đạt / trượt |
| `doc-log-loi` | **TS-PROD-03** | CHỈ ĐỌC nhật ký lõi trên VPS trong một khoảng giờ (ô `migration_file` = "từ\|đến", UTC): lượt nào ghi / bỏ ô nào, dòng `💲` tiền từng lần gọi. Không in lời khách |
| `do-tim-nha` | **TS-PROD-04** | Đo chất lượng `tim_nha` trên rổ mẫu `seed_thu` (4 chế độ). Đáp án `cau-hoi.json` soạn cho 30 tin cũ — **chưa dùng được** (SRS-5.1zzzzzzz167) |
| `ban-thu-luan` | — | So cạnh bản của anh Luận (cổng 8001) với lõi mình trên cùng kịch bản (SRS-5.1zzzzzzz199) |

**Người thật:** chat Zalo thật với ID thử trên hai số (ký gửi, tư vấn — SRS-5.1zzzzzzz210); lệnh `/state`, `/quit` (SRS-5.1zzzzzzz211)
để xem / xoá phiên. TS-LIVE còn dùng cho thông tuyến bridge. Kịch bản ba điện thoại TS-NGUOI (có vai CTV) đã deprecated.

**Đã gỡ — không chạy nữa (giữ ID):** TS-E2E, TS-TOIUU, TS-VAI, TS-KD, TS-HQ, TS-IDEM, TS-IDEM2, TS-JOB, TS-OUNG, TS-SPECS, TS-NEO,
TS-RENT, TS-CHATREPLY, TS-V48, TS-DIABAN, TS-MATCH, TS-GIUCHAN, TS-CTV, TS-MASTERDB, TS-NGUOI, TS-NGUOI-B, cả khối TS-KYGUI trừ các ID
còn sống nêu ở đầu khối, TS-SAOLUU (11/09). Lý do ghi ngay dưới tiêu đề từng mục.

### TS-SEC3 — ma trận quyền theo VAI DB (5 vai × 41 khẳng định)
`ts-sec-anon.mjs` chỉ bắn được vai `anon` vì nó đi qua PostgREST bằng khoá công
khai. Bốn vai còn lại — `authenticated` người lạ, người dùng có hồ sơ, admin,
`service_role` — là nửa quan trọng hơn: RLS của repo này phân quyền chủ yếu bằng
`auth.uid()` và `auth.jwt()->>'email'`, tức toàn bộ luật nằm ở vai
`authenticated`. Trong 41 khẳng định có **8 đối chứng dương** (nhãn `[dc]`):
"vai X thấy 0 dòng" chỉ có nghĩa khi có vai Y thấy được đúng dữ liệu đó — không
thì "0 dòng" có thể chỉ là "bảng rỗng".
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-SEC3-01 | `anon` đọc 9 bảng kín (`buyers`, `sellers`, `messages`, `conversations`, `inbound_ledger`, `inbound_events`, `media_cleanup_queue`, `admins`, `chat_quota`) | 0 dòng hoặc thiếu grant | ✅ 06/09 (chạy lại qua MCP: 41/41 OK, 0 HONG; xác minh sau đó 0 dòng VAITRO còn lại) |
| TS-SEC3-02 | `anon` đọc tin CHƯA đăng; ghi `listings`; gọi `bump_user_quota` / `giu_luot_gui` / `xuat_schema` | chặn cả 5 | ✅ 06/09 (chạy lại qua MCP: 41/41 OK, 0 HONG; xác minh sau đó 0 dòng VAITRO còn lại) |
| TS-SEC3-03 | người lạ ĐÃ ĐĂNG NHẬP đọc 9 bảng kín | 0 dòng hoặc thiếu grant | ✅ 06/09 (chạy lại qua MCP: 41/41 OK, 0 HONG; xác minh sau đó 0 dòng VAITRO còn lại) |
| TS-SEC3-04 | người lạ đọc 5 view cấp cho `authenticated` (`khach_can_nguoi_that`, `hoi_thoai_phien`, `bds_hot`, `ctv_ranks`, `nmg_hoat_dong`) | 0 dòng — chủ sở hữu view là `postgres` (BYPASSRLS) nên hàng rào DUY NHẤT là mệnh đề WHERE bên trong view, phải kiểm từng cái chứ không suy ra từ RLS | ✅ 06/09 (chạy lại qua MCP: 41/41 OK, 0 HONG; xác minh sau đó 0 dòng VAITRO còn lại) |
| TS-SEC3-05 | người lạ đọc tin chưa đăng; gọi `admin_dang_tin` / `tao_danh_sach` | chặn cả 3 | ✅ 06/09 (chạy lại qua MCP: 41/41 OK, 0 HONG; xác minh sau đó 0 dòng VAITRO còn lại) |
| TS-SEC3-06 | **[dc]** admin đọc `buyers`, `messages`, view `khach_can_nguoi_that`, tin chưa đăng | THẤY được — chứng minh mọi số 0 ở trên là "RLS chặn", không phải "bảng rỗng" | ✅ 06/09 (chạy lại qua MCP: 41/41 OK, 0 HONG; xác minh sau đó 0 dòng VAITRO còn lại) |
| TS-SEC3-07 | admin đọc `inbound_ledger` | KHÔNG thấy (sổ nội bộ của bot, admin không có việc gì ở đó) | ✅ 06/09 (chạy lại qua MCP: 41/41 OK, 0 HONG; xác minh sau đó 0 dòng VAITRO còn lại) |
| TS-SEC3-08 | **[dc]** `service_role` đọc `inbound_ledger`, `messages`, gọi `giu_luot_gui` | làm được — bot phải chạy được việc của nó | ✅ 06/09 (chạy lại qua MCP: 41/41 OK, 0 HONG; xác minh sau đó 0 dòng VAITRO còn lại) |

### TS-SAOLUU — [deprecated 11/09/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-RANHGIOI — bóc tách ⟂ AI (SRS-3.0, FR-171)
> **28/10/2026:** `chat-reply` đã gỡ; `ranh-gioi.mjs` vẫn chạy trong `test:bot` trên phần TypeScript còn lại (`_shared/`, ba edge function).
Hôm nay ranh giới này đúng nhưng đúng do MAY: `boc_thong_so()` nằm trong SQL nên
không thể gọi model được, còn `regexProfileFallback()` thì nằm ngay trong
`chat-reply/index.ts` cách chỗ gọi model hơn hai nghìn dòng — không có gì ngăn
lượt sửa sau nối hai thứ lại. Nối vào là mỗi tin khách một lượt đốt tiền model,
kể cả câu regex bóc được. `bot/tests/ranh-gioi.mjs` là kiểm TĨNH (đọc chữ, không
mạng, không DB), nằm trong `test:bot` nên chạy ở CI mỗi PR mà **không thêm tên
check mới** — danh sách 5 required status checks ở `docs/11 §11.5` giữ nguyên.
Mỗi luật có ca ÂM lẫn ca DƯƠNG: luật hỏng thì ca âm lọt và bài thoát khác 0, chứ
"0 vi phạm" một mình chỉ chứng minh regex sai. Chứng minh bắt được vi phạm THẬT:
chèn `import Anthropic` vào `_shared/thong_so.ts` → thoát 1, gỡ ra → thoát 0.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-RANHGIOI-01 | mã bóc tách import `@anthropic-ai/sdk` | bắt | ✅ 06/09 |
| TS-RANHGIOI-02 | mã bóc tách import `./claude.ts` | bắt | ✅ 06/09 |
| TS-RANHGIOI-03 | mã bóc tách gọi `.rpc(` | bắt — bóc tách phải là hàm thuần | ✅ 06/09 |
| TS-RANHGIOI-04 | mã bóc tách là hàm thuần | bỏ qua | ✅ 06/09 |
| TS-RANHGIOI-05 | chữ "anthropic" nằm trong CHÚ THÍCH | bỏ qua — chú thích không phải mã | ✅ 06/09 |
| TS-RANHGIOI-06 | tầng AI `.from("listings").insert(` | bắt | ✅ 06/09 |
| TS-RANHGIOI-07 | tầng AI gọi RPC chưa khai tên | bắt — thêm RPC phải sửa file luật, tức phải có người đọc lại | ✅ 06/09 |
| TS-RANHGIOI-08 | tầng AI gọi `log_loi` | bỏ qua — sổ lỗi là bắt buộc (FR-152), không phải dữ liệu nghiệp vụ | ✅ 06/09 |
| TS-RANHGIOI-09 | file ngoài phạm vi hai luật | bỏ qua | ✅ 06/09 |
| TS-RANHGIOI-10 | *(chốt lúc chạy, không phải ca giả)* KHÔNG file thật nào rơi vào luật nào | DỪNG, thoát khác 0 — đổi tên thư mục một cái là bộ này soát rỗng mà vẫn báo xanh | ✅ 06/09 (3 file thật) |

### TS-MASTERDB — đẩy bản gốc lên bucket (OPEN-47, NFR-16) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-SEC — hồi quy bảo mật (chạy sau MỌI migration đụng RLS/GRANT)
SQL Editor, `set role anon` rồi thử phá — anon key là key công khai, repo private không làm nó bí mật. Script: `bot/supabase/migrations/20260826c_soat_bao_mat.sql` khối `-- KIỂM CHỨNG`.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-SEC-01 | anon `select count(*) from reminders` | `0` | ✅ 04/09 |
| TS-SEC-02 | anon `delete from reminders` | lỗi quyền | ✅ 04/09 |
| TS-SEC-03 | anon đọc `public_listings` | lỗi quyền — view không lọc trạng thái, hở là lộ tin nháp | ✅ 04/09 |
| TS-SEC-04 | anon gọi `seller_drip_tick()`, `ctv_report_tick()` | lỗi quyền | ✅ 04/09 |
| TS-SEC-05 | anon `insert listings` · `update bot_prompts` | lỗi quyền cả hai | ✅ 04/09 |
| TS-SEC-06 | anon đếm sellers/ctvs/messages/conversations/viewings/deals | `0` hết | ✅ 04/09 |
| TS-SEC-07 | anon `count(*) from listings` | = `dang_ban + dang_quan_tam + da_chot`, nhỏ hơn tổng — tin `cho_thong_tin` khuất | ✅ 04/09 |
| TS-SEC-08 | anon đọc `listings`, `agents_public`, `listing_photos_v`, `projects`, `listing_facts` | ra dữ liệu bình thường; `agents_public` = số NMG trong `sellers` | ✅ 04/09 (vá 20260904b, anon 3/3) |
| TS-SEC-09 | `proacl` của `get_secret` trong `pg_proc` | chỉ `postgres` + `service_role` | ✅ 04/09 |
| TS-SEC-10 | mở `/nha-dat/<mã>` của tin có fact chứa SĐT | SĐT → `[liên hệ qua Zalo nhadat.cc]` ở cả `description` lẫn `answer` (FR-104) | ⏭ cần bản deploy |

### TS-SEC-AUTO — hồi quy RLS chạy MÁY, mỗi PR (`bun run test:sec`)
Tập không phá huỷ của TS-SEC, bắn khoá **công khai** `sb_publishable_…` vào DB thật qua PostgREST. Bổ sung cho TS-SEC chạy tay chứ không thay: bài `delete from reminders` vẫn ở trên vì nếu RLS hỏng thật thì nó xoá dữ liệu thật. Mã thoát: 0 đạt · 1 hỏng · **2 = không tới được DB (chưa kiểm được, KHÔNG phải đạt)**.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-SEC-AUTO-00 | dò đường: anon đọc `listings` | ra ≥1 dòng, không thì thoát 2 và bỏ chấm điểm | ⏭ CI (sandbox không có đường ra supabase.co) |
| TS-SEC-AUTO-01 | anon đọc 14 bảng nội bộ (`reminders`, `sellers`, `messages`, `curated_lists`, `property_events`…) | PostgREST từ chối, hoặc 0 dòng | ⏭ CI |
| TS-SEC-AUTO-02 | anon đọc `public_listings` | bị từ chối — view không lọc trạng thái | ⏭ CI |
| TS-SEC-AUTO-03 | anon gọi 6 RPC nội bộ (`get_secret`, `seller_drip_tick`, `ctv_report_tick`, `xuat_schema`, `liet_ke_bang`, `liet_ke_migration`) | bị từ chối cả 6 | ⏭ CI |
| TS-SEC-AUTO-04 | anon `insert listings` · `update bot_prompts` | bị từ chối; nếu lọt thì tự dọn và báo P0 | ⏭ CI |
| TS-SEC-AUTO-05 | anon đọc `agents_public`, đối chiếu `rpc/so_nmg_cong_khai` (20260915c, chỉ trả số NMG) | ra ≥1 NMG; rỗng mà số NMG = 0 là đúng cảnh (sau xoá hàng loạt 15/09); rỗng mà số NMG > 0 mới là lỗi làm `/moi-gioi` trắng 27/08→04/09 | ✅ 15/09: CI đỏ 6 lượt (run 302–314) vì DB hết NMG sau FR-210 mà bài kiểm không có tín hiệu độc lập → thêm hàm đếm, tự kiểm thêm cảnh `khong-nmg` (5/5) |
| TS-SEC-AUTO-06 | anon đọc `projects`, `listing_facts`, `listing_photos_v` | HTTP 200 — bắt lỗi siết quá tay | ⏭ CI |
| TS-SEC-AUTO-07 | anon lọc `status=cho_thong_tin` | 0 dòng — tin nháp không lọt ra ngoài | ⏭ CI |
| TS-SEC-AUTO-08 | **tự kiểm bộ trên** bằng PostgREST giả, 5 cảnh (khoẻ / RLS thủng / proxy chặn / siết quá tay / không có NMG) | thoát đúng 0 / 1 / 2 / 1 / 0 | ✅ 05/09 (4/4, chạy offline) · 15/09 5/5 |

### TS-LIVE — thông tuyến thật qua Zalo (chạy khi bật bridge)
Điều kiện: `node bot/bridge-zca/index.mjs` chạy, không còn `pumpEscalations: fetch failed`. Chạy trên project thật nên sau mỗi vòng xoá `listings` `CCRB-*`, `sellers`/`ctvs` test, `reminders` liên quan.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-LIVE-01 | `curl` POST `/functions/v1/escalation-feed` với anon key | 200 — không 200 thì các bài dưới vô nghĩa | ⏭ bridge im từ 27/08 |
| TS-LIVE-02 | acc khác nhắn: `chào em, anh tìm nhà quận 5 tầm 5 tỷ` | trả trong vài giây, gợi ý căn khớp ngân sách, không xổ ngẫu nhiên | ⏭ |
| TS-LIVE-03 | `căn BDS-Q5-0133 còn không em` | chào đúng căn (P16 · 4,8 tỷ · 57.4m²), không bịa tình trạng | ⏭ |
| TS-LIVE-04 | `gửi anh xem hình căn đó với` | căn chưa có ảnh → "để em hỏi lại chủ nhà", không bịa có hình | ⏭ |
| TS-LIVE-05 | `cho anh gặp người thật đi` | `needs_human = true` + 1 `reminders` kind `escalation` gán CTV | ⏭ |
| TS-LIVE-06 | điền `ctvs.phone`, chờ ≤60s | bridge resolve SĐT → uid, nhắn CTV, ghi ngược `ctvs.zalo_user_id` (FR-150) | ⏭ |
| TS-LIVE-07 | acc đã gán `sellers.zalo_user_id` nhắn `Bán nhà hẻm xe hơi phường 8, DT đất 4x16, 1 trệt 2 lầu, giá 8.5 tỷ` | tin `cho_thong_tin`, `property_type = nha_pho`, `price_raw = "8.5 tỷ"`, câu hỏi đầu là diện tích đất | ⏭ |
| TS-LIVE-08 | trả lời câu diện tích | fact lưu; đủ giá + DT + phường → tin nhảy `dang_ban`, bot báo "đã lên web" | ⏭ |
| TS-LIVE-09 | tin không đoán được loại, trả `hông biết nữa` | hỏi lại kèm lựa chọn, không ghi fact `loai_bds` | ⏭ |
| TS-LIVE-10 | người thật gõ tay từ acc clone | bot im 30 phút (FR-141), hạ `needs_human`, huỷ escalation chờ | ⏭ |

### TS-NGUOI — kịch bản NGƯỜI THẬT test qua Zalo (15/09/2026) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-NGUOI-B — kịch bản CHỦ DỰ ÁN tự test lại 15/09/2026 (dữ liệu mẫu `mau-*` giữ lại) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-RENT — hồi quy luồng CHO THUÊ (chạy sau MỌI lần sửa `chat-reply`) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-CHATREPLY — bộ kiểm sau MỌI lần deploy `chat-reply` [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-CACHE — trang tin thật sự nằm trong cache (NFR-17)
`export const revalidate` không có tác dụng khi route thiếu `generateStaticParams()` — không lỗi, không cảnh báo, mỗi lượt xem là một lambda. Nhìn code không thấy; phải đo.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-CACHE-01 | `bun run build`, đọc bảng route | `/nha-dat/[code]` là `●` (SSG), không phải `ƒ` | ✅ 04/09 |
| TS-CACHE-02 | `node -e "console.log(Object.keys(require('./.next/prerender-manifest.json').dynamicRoutes))"` | có `/nha-dat/[code]` | ✅ 04/09 |
| TS-CACHE-03 | `bun run start`, `curl -D - http://127.0.0.1:3000/` | `x-nextjs-cache: HIT` + `Cache-Control: s-maxage=300` | ✅ 04/09 |
| TS-CACHE-04 | bản deploy: mở một trang tin hai lần, xem `x-vercel-cache` | lần hai `HIT`/`STALE`, không `MISS` liên tục | ⏭ sandbox không tới Vercel |
| TS-CACHE-05 | `/mua-ban?gia=duoi-5` hai lần trong 5 phút, đếm query ở Supabase Logs | lần hai không sinh query `listings` mới (Data Cache của `layTin`) | ⏭ |

### TS-HEALTH — còi báo lỗi có kêu không (FR-152)
SQL trên DB thật. Dọn: `delete from bot_errors; delete from reminders where note like '🩺%'`, đẩy `bot_health.last_id` của `pg_net` lên `max(id)` của `net._http_response`.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-HEALTH-01 | `net.http_post` tới `/functions/v1/khong-he-ton-tai`, chờ 15s, `bot_health_tick()` | trả `loi_moi = 1` | ⏭ 04/09 |
| TS-HEALTH-02 | `select * from bot_errors order by id desc limit 1` | dòng `source='pg_net'`, `status_code=404` | ✅ 04/09 |
| TS-HEALTH-03 | `select note from reminders where note like '🩺%'` | đúng MỘT tin dù tick nhiều lần trong giờ | ✅ 04/09 |
| TS-HEALTH-04 | `cron.job_run_details` của chính lần chạy hỏng ở 01 | vẫn `succeeded` — lý do FR-152 tồn tại, đừng tin cột này | ✅ 04/09 |
| TS-HEALTH-05 | gọi `escalation-feed` kèm `x-bridge-secret` đúng | `bot_health` có `who='bridge-zca'`, `at` vừa xong | ⏭ |
| TS-HEALTH-06 | xoá dòng `bridge-zca` khỏi `bot_health` rồi tick | **KỲ VỌNG CŨ SAI, đã đổi 06/09:** trước ghi `bridge_im = false` ("chưa từng có nhịp thì không báo") — đó chính là lỗ. Bridge chưa từng chạy là lúc ĐÁNG báo nhất, mà nhánh canh lại không chạy: "không có" bị lẫn với "bình thường", cùng hình lỗi SEC-02. Nay (`20260906a`) trong 7–22h VN phải ra `bridge_im = true`, `bridge_chua_bao_gio = true`, và một dòng `bot_errors` nói thẳng "CHƯA TỪNG điểm danh" | ⏭ cần dựng cảnh |
| TS-HEALTH-07 | bridge im > 15 phút trong 7–22h VN, tick hai lần cùng giờ (`20260904a`) | lần 1 `ntfy = <id>`, `net._http_response` 200 từ ntfy.sh, `bot_health` có `who='ntfy'`; lần 2 `ntfy = null` (1 tin/giờ) | ✅ 04/09 (id 2102/2103 → 200) |
| TS-HEALTH-08 | tồn 🩺 cũ + báo cáo CTV `pending` từ 27/08, chạy tick | 🩺 cũ → `cancelled`, chỉ còn mới nhất; báo cáo CTV quá 36h → `cancelled` | ✅ 04/09 (huỷ 117 + 7, còn 1) |
| TS-HEALTH-09 | **còi có tự nhận là đã kêu không** (`20260906a`): đối chiếu `bot_health(who='ntfy').last_id` với `net._http_response` cùng id | id đó phải là một lượt gửi **2xx**. Không phải 2xx mà còi vẫn im = còi câm | ❌→✅ 06/09 — bắt tại trận: dấu `ntfy` lúc `00:00:00.054` trỏ req **2221**, mà req 2221 là `status_code NULL`, `Timeout of 5000 ms` lúc `00:00:00.212`. Còi đóng dấu "đã gửi" trước khi pg_net kịp nói nó hụt, rồi im một giờ |
| TS-HEALTH-10 | chạy `bot_health_tick()` sau khi áp `20260906a`, trong lúc lượt báo trước đang hụt | `lan_truoc_da_gui = false`, sinh dòng `bot_errors` nguồn `coi ntfy`, và BẮN LẠI | ✅ 06/09 — `{"ntfy":2222,"lan_truoc_da_gui":false}`; `coi ntfy: lượt báo trước (pg_net req 2221) KHÔNG tới nơi` |
| TS-HEALTH-11 | lượt bắn lại đó có tới ntfy.sh thật không | `net._http_response` của id mới phải `200` | ✅ 06/09 — req **2222 → 200**, thân `{"id":"g55xO8pg8zLp",…}` từ ntfy.sh |
| TS-HEALTH-12 | đếm lượt `Timeout of 5000 ms` trong `bot_errors` nguồn `pg_net` từ 27/08 | mỗi lượt rơi đúng phút `:00` là một giờ không ai được báo | ⚠️ 06/09 — **24 lượt**, nhiều lượt đúng phút `:00`. Đã nới hạn chờ `net.http_post` 5 s → 15 s cho `canh_bao_ngoai` (5 s là mặc định của pg_net, không phải con số ai chọn) |
| TS-HEALTH-13 | `che_sdt()` — SĐT không được vào sổ lỗi (`sellers.phone` UNIQUE nên lỗi 23505 kèm nguyên số) | 6 ca dương che đúng; 5 ca âm không đụng | ✅ 06/09 — dương: 10 số, 11 số, `+84`, `84`, hai số một dòng, trong JSON. Âm: chuỗi timeout pg_net, epoch 13 số, UUID, mã tin `#BDS-0001`, dãy 12 số. Neo `\m`…`\M` là phần bắt buộc: bỏ neo thì UUID `…-000000000001` bị xén thành `…-0000xxxxxx01` |

### TS-LOG — lỗi tầng ứng dụng có vào sổ không (FR-152 d)
Loại lỗi này TRẢ 200 nên TS-HEALTH không bắt được. Không phủ log thô edge function (Free giữ 1 ngày); chỗ chưa gọi `ghiLoi()` vẫn im. Dọn như TS-HEALTH.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-LOG-01 | lặp 25 lượt `log_loi('thu-van','x',null)` | đúng **20** dòng — van theo nguồn | ✅ 04/09 |
| TS-LOG-02 | 600 lượt với 30 `p_source` khác nhau, `set local role anon` | tổng bảng dừng ở **200** — van tổng chặn kẻ đổi nguồn | ✅ 04/09 |
| TS-LOG-03 | `escalation-feed` `{"action":"log","source":"x","detail":"y"}` + `x-bridge-secret` | 200 `{"ok":true}`; `bot_errors` có `source='bridge x'` | ⏭ cần HTTP |
| TS-LOG-04 | tin kèm `image_url` host không tồn tại (đừng phá `ANTHROPIC_API_KEY` — làm chết bot thật) | HTTP 200, khách vẫn có trả lời; `bot_errors` `source='chat-reply model'` kèm lỗi API | ✅ 27/08 (`400 Unable to download`) · ⏭ 04/09 |
| TS-LOG-05 | route web ném lỗi có chủ ý trên bản deploy | `bot_errors` `source='web app'` kèm đường dẫn; khách thấy `app/error.tsx` | ⏭ cần deploy |
| TS-LOG-06 | `bot_health_tick()` sau TS-LOG-04 | có reminder 🩺 — còi đếm cả lỗi ứng dụng | ✅ 04/09 |

### TS-GIA — bóc giá tiếng lóng ra số (FR-154)
SQL editor, test hồi quy mỗi lần sửa `parse_vnd`: `select s, parse_vnd(s) from unnest(array['5 tỏi rưỡi','5 tỏi','5 tỷ rưỡi','5,5 tỷ','5 tỷ 5','3 tỷ 200','800 triệu','12 củ','15tr/th','900tr','1 trệt 2 lầu','5t5','2 tỉ 8','giá 6ty2 TL','7 tỏi 3','nhà 4x15 giá 8 tỏi','25 củ/tháng','5 cây vàng','5 tỏi 500 triệu','tỷ lệ chốt 5%','giá 5 tỷ 50m2','đất 100m2 giá 4ty','2 tý','thuê 8 củ rưỡi','5 tỷ 120m2','1 tỷ 050']) s;`
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-GIA-01 | bộ 26 ca ở trên | khớp đủ 26 | ✅ 04/09 |
| TS-GIA-02 | `'giá 5 tỷ 50m2'` | **5.000.000.000**, không phải 5,5 tỷ (regex từng lùi `{1,3}` để né lookahead `m`) | ✅ 04/09 |
| TS-GIA-03 | `'1 trệt 2 lầu'` | **NULL** — `tr` là "trệt"; `\M` Postgres hiểu dấu, đừng bê sang JS (`\b` chỉ ASCII) | ✅ 04/09 |
| TS-GIA-04 | `'5 cây vàng'`, `'2 tý'` | **NULL** cả hai — vàng không quy ra tiền; "tý" không phải tỷ | ✅ 04/09 |
| TS-GIA-05 | `count(*) from listings where price_vnd is distinct from parse_vnd(price_raw)` | **0** — khác 0 là sửa hàm chưa backfill | ✅ 04/09 |

### TS-SPECS — fact nhỏ giọt chảy vào cột (FR-153) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-HANG — hạng Đồng/Bạc/Vàng (FR-155)
Đọc view `seller_ranks`. Không phủ: ngưỡng có đúng không (OPEN-26).
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-HANG-01 | `select * from seller_ranks` | mỗi người bán một dòng; NMG 17–22 tin, 0 chốt → **bac** | ✅ 04/09 (3/3 Bạc) |
| TS-HANG-02 | cùng view, vai `anon` | không có cột `phone`/`zalo_user_id` (FR-104); từ `20260904b` view invoker → anon **0 dòng** là đúng ý (hạng ẩn khỏi web, chỉ `/admin` đọc) | ✅ 04/09 |
| TS-HANG-03 | đặt tay một tin `da_chot` cho NMG ≥10 tin, đọc lại (nhớ trả lại) | nhảy **vang** | ✅ 04/09 |

### TS-DANGTIN — admin tự đăng tin (FR-156)
RPC `admin_dang_tin` + trang `/admin/dang-tin`. Dọn: xoá tin `BDS-Q5-####` vừa tạo, `info_requests` của nó, người bán thử; kiểm lại `listings` = 173, `sellers` = 3.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-DANGTIN-01 | gọi `admin_dang_tin('{"price_raw":"1 tỷ"}')` không JWT admin | `42501` "Khong co quyen quan tri" | ✅ 04/09 |
| TS-DANGTIN-02 | `request.jwt.claims` = email trong `admins`, `price_raw='5 tỏi rưỡi'` | `code = BDS-Q5-####` nối dãy, `price_vnd = 5500000000` | ✅ 04/09 |
| TS-DANGTIN-03 | cùng lệnh, không gửi `seller_phone`/`seller_zalo` | người bán mới `phone IS NULL` và `zalo_user_id IS NULL` | ✅ 04/09 |
| TS-DANGTIN-04 | gọi lần hai cùng `seller_zalo` (hoặc `seller_phone`) | dùng lại `seller_id` cũ, không đẻ dòng `sellers` thứ hai | ✅ 04/09 |
| TS-DANGTIN-05 | mở `/admin/dang-tin` bằng tài khoản không trong `admins` | màn "Cần đăng nhập bằng tài khoản quản trị", không thấy form | ✅ 04/09 |

### TS-NEO — neo hội thoại người bán theo căn, tách vai (FR-157) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-MA — câu rao sinh mã tin, một dãy mã duy nhất (FR-158)
> **28/10/2026:** TS-MA-02 chạy qua `chat-reply` (gỡ 18/10/2026) → deprecated; TS-MA-01 (trigger điền mã) còn.
Người bán thử **không** có câu hỏi chờ (có thì tin nhắn bị coi là câu trả lời). Test cổng rao **phải gõ có dấu** — gõ không dấu trượt ở `\b(bán|rao)\b` là pass giả (OPEN-29). Không phủ: người lạ chưa có dòng `sellers` nhắn câu rao vẫn rơi nhánh mua (chủ dự án để sau, 27/08).
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-MA-01 | `insert into listings (code, …) values (null, …)` rồi `rollback` | `trg_listings_fill_code` điền mã nối dãy, không lỗi NOT NULL | ✅ 04/09 |
| TS-MA-02 | câu rao trần: `anh muốn bán căn nhà` | sinh tin `cho_thong_tin` + mã `BDS-Q5-####`; trigger đoán `nha_pho` từ chính câu rao, câu đầu hỏi `dien_tich_dat` | ✅ 27/08 (v35) |
| TS-MA-03 | `nhà mình bán chưa em` | **không** sinh tin — câu hỏi tình trạng, không phải câu rao | ✅ 27/08 |
| TS-MA-04 | `bán nhà hẻm xe hơi phường 8, 4x16, 8.5 tỷ` | sinh tin; `price_raw = "8.5 tỷ"`, `ward = "Phường 8"` | chưa chạy |
| TS-MA-05 | hai lượt rao đồng thời cùng người bán | hai mã khác nhau, không deadlock (advisory lock) | chưa chạy |

### TS-KD — tiếng Việt không dấu (FR-161) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-IDEM — sổ idempotency + retry (FR-162) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-IDEM2 — sự kiện tách khỏi job, exactly-once chiều gửi (FR-162 phần 2) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-TOANVEN — toàn vẹn dữ liệu tầng DB (FR-163)
> **28/10/2026:** ca 01–03 ghi fact qua `listing_facts` (gỡ 19/10/2026) → deprecated; 04–09 kiểm trigger / ràng buộc DB còn sống.
Một khối DO trên DB thật, bắt exception cho ca "phải bị chặn", ghi bảng tạm rồi đọc (RAISE NOTICE không về qua MCP). EXPLAIN `messages` theo `conversation_id order by seq desc` phải là `Index Scan using messages_conv_seq_idx`.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| 01 | fact `so_phong_ngu` "3 phòng" rồi sửa "4 phòng ngủ" | `bedrooms = 4` — fact mới nhất thắng | ✅ 04/09 |
| 02a | fact `dien_tich_tim_tuong` "120m2" | `area_m2` không đổi | ✅ 04/09 |
| 02b | fact `dien_tich` "50m2" | `area_m2 = 50` | ✅ 04/09 (vá 20260904b) |
| 03 | fact `loai_bds` "nhà phố ạ" | `property_type=nha_pho` + `property_type_source=chu_xac_nhan` | ✅ 04/09 (vá 20260904b) |
| 04 | UPDATE thẳng `price_vnd = 999` | trigger đè lại = `parse_vnd(price_raw)` | ✅ 04/09 |
| 05a | INSERT 2 deals cùng (listing, buyer NULL) | 23505 — unique `NULLS NOT DISTINCT` | ✅ 04/09 |
| 05b | DELETE deal có `closed_at` | trigger raise | ✅ 04/09 |
| 05c | gỡ `closed_at` rồi DELETE | được — đường thoát hai bước | ✅ 04/09 |
| 06a | viewing không có cả `listing_id` lẫn `listing_code` | CHECK chặn | ✅ 04/09 |
| 06b | viewing chỉ có `listing_code` | được | ✅ 04/09 |
| 06c | viewing `status='tùm lum'` | CHECK chặn | ✅ 04/09 |
| 07a | conversation có cả buyer lẫn seller | CHECK một-vai chặn | ✅ 04/09 |
| 07b | seller thứ hai hội thoại | unique chặn | ✅ 04/09 |
| 08 | reminder `cancelled` bị UPDATE thành `sent` | revert êm: vẫn `cancelled`, `sent_at` trống | ✅ 04/09 |
| 09 | ledger `completed` bị hạ xuống `failed` | raise | ✅ 04/09 |

### TS-OUNG — đường ống dữ liệu tin rao (FR-164) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-KHO — kho ảnh tin rao theo UUID (FR-165)
DB trong DO block cuộn lại; HTTP qua `pg_net`. Chưa kết luận: anon LIỆT KÊ bucket riêng trả `200 []` — kho rỗng nên không phân biệt "RLS lọc" với "cho phép nhưng rỗng", kiểm lại khi có ảnh thật. Bẫy: `revoke … from anon` không tác dụng với hàm, phải revoke từ PUBLIC.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-KHO-01 | upload: ghi dòng media đúng quy ước | nhận, tự thành ảnh bìa | ✅ 04/09 |
| TS-KHO-02 | upload đường dẫn theo MÃ TIN (lối cũ) | CHECK chặn | ✅ 04/09 |
| TS-KHO-03 | upload trùng (bucket, path) | UNIQUE chặn | ✅ 04/09 |
| TS-KHO-04 | `so_do` vào bucket công khai | CHECK chặn | ✅ 04/09 |
| TS-KHO-05 | sort_order NGƯỢC thứ tự tên file | ra `10,2,1` (xếp theo tên sẽ ra `1,10,2`) | ✅ 04/09 |
| TS-KHO-06 | ảnh bìa | tấm `sort_order` nhỏ nhất — tiền đề chèn theo `sort_order` tăng dần (như `up-anh.mjs`); `listing_media_chon_bia()` cố ý không đè bìa admin chọn tay | ✅ 04/09 (ghi tiền đề) |
| TS-KHO-07 | đổi mã tin | 3/3 ảnh còn nguyên, view đổi theo mã mới | ✅ 04/09 |
| TS-KHO-08 | replace (đổi storage_path) | đường dẫn cũ vào hàng đợi dọn | ✅ 04/09 |
| TS-KHO-09 | xoá ảnh đang là bìa | vào hàng đợi + tấm kế lên bìa | ✅ 04/09 |
| TS-KHO-10 | xoá tin | media cascade về 0, cả 4 file vào hàng đợi (kể cả riêng tư) | ✅ 04/09 |
| TS-KHO-11 | upload hỏng (có dòng, chưa có file) | `media_mo_coi_db` soi ra | ✅ 04/09 |
| TS-KHO-12 | worker nhận việc | `dang_lam`, attempts=1 | ✅ 04/09 |
| TS-KHO-13 | xoá hỏng rồi quá 10 phút | nhận lại được, attempts=2 (trigger chỉ tự đóng dấu `updated_at` khi người gọi không đặt) | ✅ 04/09 |
| TS-KHO-14 | việc đã `xong` | không bị nhận lại, không lùi trạng thái được | ✅ 04/09 |
| TS-KHO-15 | worker chạy thật với file KHÔNG tồn tại | `da_xoa=1` — Storage trả HTTP 400 thân `{"statusCode":"404"}`, worker phải đọc thân | ✅ 29/08 · ⏭ 04/09 |
| TS-KHO-16 | anon xin quyền GHI `listing-public` | 403 AccessDenied | ✅ 29/08 · ⏭ 04/09 |
| TS-KHO-17 | anon xin quyền GHI `listing-private` | 403 AccessDenied | ✅ 29/08 · ⏭ 04/09 |
| TS-KHO-18 | anon tự tạo bucket | 403 AccessDenied | ✅ 29/08 · ⏭ 04/09 |
| TS-KHO-19 | đọc `/object/public/` của bucket RIÊNG | `NoSuchBucket` | ✅ 29/08 · ⏭ 04/09 |
| TS-KHO-20 | anon đọc `listing_media` | chỉ thấy dòng `listing-public`; `so_do` bị RLS lọc | ✅ 04/09 |
| TS-KHO-21 | anon đọc view sau khi siết execute | vẫn ra URL dạng UUID — view đọc thẳng `app_config` bằng subquery, không gọi hàm (EXECUTE xét theo người gọi) | ✅ 04/09 |
| TS-KHO-22 | đường dẫn có `..` | CHECK chặn | ✅ 04/09 |
| TS-KHO-23 | đường dẫn có `//` | CHECK chặn | ✅ 04/09 |
| TS-KHO-24 | ảnh thường vào bucket riêng | cho — bucket riêng không cấm ảnh thường | ✅ 04/09 |
| TS-KHO-25 | `is_cover` cho file ở bucket riêng | CHECK chặn | ✅ 04/09 |

### TS-JOB — việc chạy nền tin cậy (FR-166) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-SEC2 — soát bảo mật theo VAI THẬT (FR-167)
Không đọc policy rồi suy, mà `set local role anon`/`authenticated` kèm `request.jwt.claims` rồi thử đọc/ghi/gọi RPC; edge function gọi HTTP bằng publishable key. Chấm theo SỐ DÒNG (UPDATE bị RLS chặn không ném lỗi) và ép đánh giá hàm bằng `execute … into` (`count(*)` bỏ qua hàm). Kho file: `storage.objects`/`buckets` bật RLS 0 policy — 16 ca ghi/leo thư mục/đổi bucket đều chặn (29/08); liệt kê bucket rỗng `200 []` chưa kết luận được.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-SEC2-01…22 | `anon` ĐỌC sellers, buyers, messages, conversations, deals, viewings, reminders, admins, ctvs, info_requests, bot_prompts, app_config, bot_errors, inbound_ledger, media_cleanup_queue, job_suc_khoe, tin nháp, fact địa chỉ/hình, media bucket riêng | 22/22 chặn | ✅ 04/09 |
| TS-SEC2-23…41 | người lạ ĐÃ ĐĂNG NHẬP ghi: sửa/xoá tin người khác, tự phong admin, sửa SĐT chủ nhà, tạo seller/buyer đội tên, sửa CRM/phí, chốt/xoá deal, chèn tin nhắn, spam nhắc, sửa prompt/app_config, thêm media/fact, lịch xem giả | 19/19 chặn | ✅ 04/09 |
| TS-SEC2-42…56 | người lạ gọi RPC: get_secret, cau_hinh, next_listing_code, listings_fill_code, info_request_set_active_listing, ghi_fact_listing, merge_buyer_prefs, claim_inbound, nhan_viec_nhac, bump_model_quota, beat, các `*_tick` | 15/15 chặn | ✅ 04/09 |
| TS-SEC2-57…59 | chéo người bán: B đọc hồ sơ A, tin nháp A, cướp tin A (đổi `seller_id`) | 3/3 chặn | ✅ 04/09 |
| TS-SEC2-60…61 | không vỡ nghiệp vụ: anon đọc tin đã lên kệ + ảnh | 2/2 đạt | ✅ 04/09 |
| TS-SEC2-H1 | `nudge` không kèm khoá | 403 (trước vá: 200 + lộ lời nhắc) | ✅ 29/08 · ⏭ 04/09 |
| TS-SEC2-H2 | `nudge` + publishable key | 403 (trước: 200) | ✅ 29/08 · ⏭ |
| TS-SEC2-H3 | `nudge` + `x-bridge-secret` đúng (đường cron) | 200 | ✅ 29/08 · ⏭ |
| TS-SEC2-H4 | `nudge` + bridge secret sai | 403 | ✅ 29/08 · ⏭ |
| TS-SEC2-H5 | `ask-seller` + publishable key | 403 (trước: 400 — đã qua cổng); bằng bridge secret vẫn qua | ✅ 29/08 · ⏭ |
| TS-SEC2-H6 | `ctv-report` + publishable key | 403 (trước: chạy tới model) | ✅ 29/08 · ⏭ |
| TS-SEC2-H7 | `geocode-listings` + publishable key | 403 (trước: 200, ghi lat/lng) | ✅ 29/08 · ⏭ |
| TS-SEC2-H8 | `chat-reply`/`escalation-feed`/`media-cleanup`/`inbound-sweep` + publishable key | 403/401/403/403 (vốn kín) | ✅ 29/08 · ⏭ |
| TS-SEC2-62 | mọi hàm SQL có `net.http_post` đều mang `x-bridge-secret` — trừ `canh_bao_ngoai` (ntfy, FR-152 e), loại trừ tường minh trong câu `pg_get_functiondef` | danh sách thiếu rỗng | ✅ 04/09 (6 hàm: 5 + 1 loại trừ; sửa câu) |
| TS-SEC2-63 | không hàm nào còn nhúng cứng anon JWT đời cũ (`eyJhbGciOi…`) | rỗng | ✅ 04/09 |
| TS-SEC2-64 | `authenticated` gọi `ask_seller_drip()` | chặn | ✅ 04/09 |
| TS-SEC2-65 | `anon` gọi `ask_seller_drip()` | chặn | ✅ 04/09 |
| TS-SEC2-66 | `seller_drip_tick` + `trg_listing_drip` vẫn SECURITY DEFINER | 2/2 — siết `ask_seller_drip` không gãy đường vận hành (hồi quy drip vá `20260829e`) | ✅ 04/09 |

### TS-HQ — hồi quy sau soát thù địch + hai lượt review diff (29/08/2026) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-TIEN — đồng hồ đo tiền bộ não (FR-169)
> **28/10/2026:** `nudge` / `ask-seller` / `ctv-report` / `chat-reply` đã gỡ; lõi Python ghi tiền model qua `cong_token` (`src/aioi/so_token.py`, SRS-5.1zzzzzzz49); từng lần gọi xem dòng `💲` trong `doc-log-loi` (SRS-5.1zzzzzzz213). Điểm mù ở câu đầu là lịch sử.
`DO … raise exception` trên DB thật, `bot_usage` giữ nguyên 3 dòng cũ. Điểm mù: chỉ `chat-reply` nối `doTien()`; `nudge`/`ask-seller`/`ctv-report` chưa — số ở `/admin` là SÀN. Chưa kiểm: số chữ thật và nhịp nhớ tạm 1 giờ (`cache_read_tokens` phải > `cache_write_tokens` sau 3 lượt cách 10 phút).
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-TIEN-01 | `cong_token(1000,200,5000,0)` khi ngày chưa có dòng | tự tạo dòng, `model_calls` giữ 0 | ✅ 04/09 |
| TS-TIEN-02 | `cong_token(300,100,0,5000)` tiếp | CỘNG DỒN: in=1300 out=300 nạp=5000 đọc=5000 | ✅ 04/09 |
| TS-TIEN-03 | `cong_token(null,null,null,null)` | `coalesce` về 0, dòng không đổi | ✅ 04/09 |
| TS-TIEN-04 | `bump_model_quota(1000)` SAU `cong_token` | calls 0→1 trên CÙNG dòng, số chữ nguyên — `insert … on conflict`, không `update` thuần | ✅ 04/09 |
| TS-TIEN-05 | `anon` đọc `bot_usage` | chặn ở tầng quyền | ✅ 04/09 |
| TS-TIEN-06 | `authenticated` không trong `admins` | RLS lọc còn 0 dòng | ✅ 04/09 |
| TS-TIEN-07 | `authenticated` trong `admins` | thấy đủ dòng | ✅ 04/09 (3 dòng) |

### TS-CHUONG — chuông báo hết tiền tài khoản AI (FR-168)
Cùng khuôn TS-TIEN; đối chiếu sau: `bot_errors` về số cũ, 0 dòng `HET TIEN API`. Luật rút ra: mệnh đề `or` để lọc bỏ phải bọc `coalesce` mọi cột cho phép NULL; ca âm tính quan trọng ngang ca dương tính.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-CHUONG-01 | ghi lỗi `Your credit balance is too low…` | chuông kêu, đúng 1 dòng nguồn `HET TIEN API` | ✅ 04/09 |
| TS-CHUONG-02 | ghi thêm lỗi hết tiền trong cùng 6 giờ | vẫn 1 dòng — van hãm nhịp | ✅ 04/09 |
| TS-CHUONG-03 | ghi thẳng một dòng nguồn `HET TIEN API` | không tự soi mình, không đệ quy | ✅ 04/09 |
| TS-CHUONG-04 | sau khi chuông kêu, soi `reminders` | 0 — cố ý không đẩy qua cầu nối | ✅ 04/09 |
| TS-CHUONG-05 | nội dung dòng chuông | mở đầu "🔴 BỘ NÃO ĐANG CÂM — HẾT TIỀN TÀI KHOẢN AI", có đường dẫn nạp tiền | ✅ 04/09 |
| TS-CHUONG-06 | ÂM TÍNH: `Overloaded`, `Unterminated string`, `connection reset`, hai cái `status_code` RỖNG | chuông im (`NULL` trong chuỗi `or` làm hàm rơi xuống nhánh kêu) | ✅ 04/09 (vá 20260901c) |
| TS-CHUONG-07 | HTTP 402, nội dung không khớp mẫu chữ | chuông kêu | ✅ 04/09 |

### TS-VAI — bóc dữ liệu theo bốn vai người nhắn (FR-159, FR-170) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-E2E — chạy `chat-reply` THẬT trong Node, Supabase + model giả lập [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-NHAC — tin nhắc đi ra Zalo, và vòng tự nuôi của còi (08/09/2026)
Sinh ra từ ảnh Zalo admin của chủ dự án. Hai lớp: chữ (`bot/tests/tin-nhac.mjs`,
offline) và hành vi DB (chạy tay, bọc `do … raise exception` để rollback).

| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-NHAC-01 | `bun bot/tests/tin-nhac.mjs` | 22/22: "💬 …" (câu hỏi bù ask-seller) gửi nguyên văn; tin có dấu hiệu đầu (🩺 🆕 ❓ ✏️) gửi nguyên; CTV vẫn có tiền tố + đuôi; chính chủ giọng CSKH; `report` nguyên văn | ✅ 08/09 |
| TS-NHAC-02 | chèn `info_requests(source='seller_flow', assignee='seller')` | **0** dòng `reminders` — vòng drip không dội tin cho chủ nhà | ✅ 08/09 (rollback) |
| TS-NHAC-03 | chèn `info_requests(source='buyer_ask', assignee='seller')` | 1 dòng, ghi chú đọc "cần bổ sung: **diện tích đất**", không phải `dien_tich_dat` | ✅ 08/09 (rollback) |
| TS-NHAC-04 | `update info_requests set status='answered'` | tin nhắc escalation cùng căn + cùng nhãn chuyển `cancelled` | ⏭ chưa chạy |
| TS-NHAC-05 | ack một reminder không gắn seller/ctv qua `escalation-feed` | **không** thêm dòng `bot_errors` nào — cắt vòng tự nuôi | ⏭ chờ deploy |

**Vòng tự nuôi của còi báo lỗi** (bắt 08/09/2026): `bot_health_tick` mỗi giờ đếm
`bot_errors` trong một giờ qua, có lỗi thì đẻ một reminder 🩺 gửi Zalo admin.
Bridge gửi xong gọi `ack`, rơi vào nhánh "không học được uid admin (SEC-03)" —
nhánh ĐÚNG THEO THIẾT KẾ — nhưng nhánh đó lại `log_loi`. Giờ sau đếm được đúng
dòng vừa ghi, lại đẻ tin. Sổ lỗi 07/09 có đúng một dòng `escalation-feed admin
uid` mỗi giờ có tin 🩺 được gửi, từ 05:00 tới 10:00 UTC. **Bài học: đường đi
đúng thiết kế không được ghi vào sổ lỗi — sổ lỗi là đầu vào của còi.**

### TS-TOIUU — đếm vòng đi về DB và bất biến tối ưu (FR-171) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-HOICHU — khách hỏi → báo admin + hỏi chủ → chủ trả lời → báo lại khách (FR-140 b/c)
> **28/10/2026:** TS-HOICHU-01 lỗi thời: câu không có chủ nhà đi thẳng admin (SRS-5.1zzzzzzz170); 02 (trigger báo lại khách) còn, tin nhắc nay lõi gửi (SRS-5.1zzzzzzz216).
DB thật trong một giao dịch rồi rollback. Từ 03/09 FR-173 đổi đường `buyer_ask` (giao CTV, admin không bị báo mỗi câu) nên 01 và 03 lỗi thời — bản mới ở TS-CTV; 02 vẫn đúng.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-HOICHU-01 | chèn `buyer_ask`, tin có chủ trên Zalo | HAI `reminders` `escalation`: một gắn `seller_id`, một đi đường admin "❓ Khách hỏi căn #…" | ✅ 02/09 · lỗi thời từ 03/09 (xem TS-CTV-01/02) |
| TS-HOICHU-02 | `info_requests` → `answered` | thêm `followup` gắn `buyer_id` "chủ nhà vừa trả lời câu khách hỏi về #…"; nhắc im lặng cùng căn bị huỷ | ✅ 02/09 |
| TS-HOICHU-03 | `assignee` sau định tuyến | `seller`; nguồn giữ `buyer_ask` | ✅ 02/09 · lỗi thời từ 03/09 |

### TS-CTV — câu khách hỏi về CTV; CTV chậm → admin đỡ khách; hạng CTV (FR-173) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-DIABAN — địa bàn mở: quận/huyện từ câu rao, không ghi cứng Quận 5 (FR-174 đợt 1) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-THONGSO — tin rao có cấu trúc: bóc từ mô tả, cột đã có thì không hỏi (FR-172)
> **28/10/2026:** ca e2e (11, 12) và phần CTV của 15 chạy trên bot TypeScript đã gỡ → deprecated; ca DB `boc_thong_so()` còn.
DB thật qua MCP sau `20260902e` + `20260902f`, trên 173 tin (164 có mô tả). Ca 01–08 là số đo bao phủ (chốt chống hồi quy khi sửa regex — giảm là phải giải thích), 09–15 là hành vi. Giới hạn biết mà chưa vá: "306m² (4,2mx22m)" là tổng sàn (6 tin `dt_lech` > 35%); "cách mặt tiền 40m" đi cùng "nhà mặt tiền" trong cùng bài; chung cư gán nhầm `nha_pho` thì "tầng 25" ra null (dải 1–30 chặn), không ra sai.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-THONGSO-01 | ngang × dài từ "4x16m", "4m x 15m", "3m6 x 16", "ngang 4.6m dài 13.2m", "4*15" | ≥ 115/164 có `frontage_m` | ✅ 02/09 (ngang 121, dài 118, nở hậu 11) |
| TS-THONGSO-02 | số tầng "1 trệt 3 lầu" (=4), "5 tầng", "x 3T", "trệt, lầu" (=2), "nhà C4" (=1); chung cư "tầng 25" → `floor` | ≥ 135/164; 2 chung cư có `floor` | ✅ 02/09 (141; floor 2) |
| TS-THONGSO-03 | đường vào: "mặt tiền"/"MT"/"2MT" → MT; "HXH"/"xe hơi vô" → HXH; "HXT"/"xe tải" → HXT; "nhà hẻm … cách mặt tiền 20m" → HẺM; "hẻm hông 6m" không tính | ≥ 120/164 | ✅ 02/09 (126: MT 53, HXH 42, HXT 9) |
| TS-THONGSO-04 | hẻm rộng "hẻm 4m", "HXH 5.5m", "đường rộng 8m"; cách MT "cách mặt tiền 40m" | số hợp lý (1–40 m / 5–500 m) | ✅ 02/09 (hẻm 25, cách MT 19) |
| TS-THONGSO-05 | pháp lý "sổ hồng riêng/SHR" → `so_hong_rieng`; "sổ hồng/đỏ" → `so_hong`; "sổ chung"; "hoàn công"/"chưa hoàn công" → bool; "pháp lý rõ ràng" trơ → không đoán | ≥ 70/164 | ✅ 02/09 (75; hoàn công 37; quy hoạch 6) |
| TS-THONGSO-06 | PN/WC "4PN 5WC", "3 phòng ngủ 4 nhà vệ sinh", "Số phòng ngủ: 4" | PN không ghi đè giá trị đã có (79 giữ nguyên), WC ≥ 60 | ✅ 02/09 (PN 81, 0 lệch; WC 63) |
| TS-THONGSO-07 | tiện ích: thang máy, xe hơi vô nhà, căn góc, nội thất, năm xây, hướng (chỉ chữ la bàn sau "hướng"), TL, "đang cho thuê 20 triệu/tháng" (chỉ tin bán) | có, không bịa | ✅ 02/09 (thang máy 10, góc 21, nội thất 25, năm 4, hướng 7, TL 52, thuê 17) |
| TS-THONGSO-08 | `street` từ `location_raw`: "Số 1xx, Đường Trần Hưng Đạo" → "Trần Hưng Đạo"; "Hẻm xx/, Đường Hồ Thành Biên" → "Hồ Thành Biên"; "Phường 2, Quận 5" → null | mọi tin có tên đường trong địa chỉ | ✅ 02/09 (159/164; 5 tin chỉ ghi phường → null) |
| TS-THONGSO-09 | `listing_missing_facts` sau backfill | giảm rõ, KHÔNG về 0 | ✅ 02/09 (1.140 → 638; còn nhiều nhất hướng 152, quy hoạch 139, năm xây 137) |
| TS-THONGSO-10 | `price_per_m2_vnd` cho mọi tin có giá + diện tích; tin thuê theo tháng | 164/164 | ✅ 02/09 (thuê 70 tr/64m² → 1,1 tr/m²/tháng) |
| TS-THONGSO-11 | e2e THONGSO-01: dòng KHO gửi model | "4x12.5m · trệt + 2 lầu · 3WC · hẻm xe hơi 6m · sổ hồng riêng, hoàn công" | ✅ 04/09 |
| TS-THONGSO-12 | e2e THONGSO-02: khách gõ mã căn | khối "căn khách đang nhắc" mang "hẻm xe hơi 6m" + "sổ hồng riêng" | ✅ 04/09 |
| TS-THONGSO-13 | bậc nguồn khi fact chảy vào cột (`20260902g`): tin `boc_mo_ta` → (1) chủ `ket_cau` "trệt 3 lầu, 4 toilet"; (2) admin đặt hẻm 4 rồi chủ nói "hẻm 6m xe tải"; (3) `admin_form` "hẻm 3m" sau; (4) view thiếu | (1) floors 4, WC 4, `chu_xac_nhan`; (2) hẻm 6 `hem_xe_tai` — chủ đè admin (FR-164 a); (3) vẫn 6 — admin không đè chủ; (4) 0 câu thiếu | ✅ 02/09 (rollback, kho vẫn 173) |
| TS-THONGSO-14 | bộ 20 câu mẫu qua `boc_thong_so()`: "hẻm 2m xe máy, giấy tay"; "cách mặt tiền 30m, đang cho thuê 25tr/tháng"; "hầm trệt lửng 4 lầu, thang máy"; "nhà 4 tấm"/"2 tấm rưỡi"; "60 m 2, hẻm 2.5m"; "hẻm 2 xẹt"; chung cư "tầng 5 lầu"; cấp 4 "được xây 3 tấm" | mọi khoá đúng, không bịa | ✅ 03/09 20/20 (vá 20260903c: hẻm 2m, ngang 30 m, `p_type` NULL, "tấm") |
| TS-THONGSO-15 | fact `question` chữ tự do → cột (`ap_thong_so`): (A) CTV "pháp lý" → "sổ hồng riêng, hoàn công"; (B) "hẻm mấy mét" → "hẻm 4m xe hơi"; (C) chủ `so_phong_ngu` "3"; (D) CTV `bo_sung` "sổ hồng chung, 5PN" SAU chủ; (E) chủ "sổ hồng chung"; (F) "còn bán, bớt được chút" | (A) SHR + hoàn công bậc admin; (B) hẻm 4 HXH; (C) 3 PN `chu_xac_nhan`; (D) không đè; (E) đè được; (F) không đụng cột | ✅ 03/09 (rollback) |

### TS-SEO — nền SEO: trang tag SSG, sitemap, robots, canonical, JSON-LD (FR-12/17, NFR-09)
Dựng theo IA §4.4 sau nghiệm thu 04/09 (OPEN-44). 01–04 chạy trong sandbox, 05–06 cần Vercel. Trang tag dùng cùng luật lọc với `/mua-ban`; `revalidate = 3600` nhưng bảng build in `5m` vì `coverByCode` (unstable_cache 300 s) — cố ý.
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-SEO-01 | `bun run build`, bảng route | `/[tag]` là `●` đủ số tag của `lib/tags.ts`; `/sitemap.xml`, `/robots.txt` có; `/nha-dat/[code]` vẫn `●` | ✅ 04/09 (83 trang tĩnh: 17 + 64 tag + 2) |
| TS-SEO-02 | `bun -e 'import {TAG_DEFS} from "./lib/tags.ts"; …'` | slug không dấu, chữ thường, gạch nối, `ty` không `tỉ`, duy nhất; keyword hiển thị giữ "tỉ" | ✅ 04/09 (64 slug duy nhất) |
| TS-SEO-03 | `relatedTags(t)` | 6–8 tag, không chứa chính nó, ưu tiên cùng giao dịch + loại + khu | ✅ 04/09 |
| TS-SEO-04 | `/ban-nha-hem-xe-hoi-quan-5` trên `next start` | H1 = keyword, mô tả 80–120 từ, lưới lọc `access_type in (mat_tien, hem_xe_tai, hem_xe_hoi)`, 8 tag liên quan; `/abc-xyz` → 404 | ⏭ sandbox không tới Supabase (lưới rỗng → hộp Zalo, đúng luật) |
| TS-SEO-05 | `curl -s https://nhadat-cc.vercel.app/sitemap.xml \| grep -c '<loc>'` | ≥ 8 tĩnh + 64 tag + số tin lên kệ (~165) | ⏭ chờ deploy |
| TS-SEO-06 | trang tin: `application/ld+json` + canonical + OG | một `RealEstateListing`, `identifier` = mã, `offers.price` = `price_vnd`, `address` chỉ tới phường (FR-104); canonical = URL tin; OG = ảnh thật nếu có | ⏭ chờ deploy; kiểm tĩnh `jsonLd()` không dùng `location_raw` |

### TS-ADM2 — admin buyer side (FR-71/74/75/76/77/78/80)
> **28/10/2026:** TS-ADM2-05 (`ctvs`) và phần trigger FR-173 của 01 là tàn dư CTV (bỏ 28/10/2026, chủ dự án) → deprecated; còn lại kiểm quyền admin, còn sống.
Migration `20260904c_admin_buyer_side.sql` + thẻ mới `app/admin/page.tsx`. 01–09 là MỘT khối `do … raise exception 'KQ: …'` (chép ở cuối migration, chạy RIÊNG sau khi áp): dựng buyer/hội thoại/câu hỏi/lịch xem bằng vai chủ, rồi `authenticated` với email admin lấy từ bảng `admins`, rồi `anon`. Chạy lại sau MỌI migration đụng RLS sáu bảng này. Cố ý chưa làm: bảng theo hội thoại FR-71 (cần FR-72), lọc thời gian FR-74, email FR-81, nhãn "tiêu cực" FR-77 (`needs_human` là proxy [giả định BA]).
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-ADM2-01 | admin đọc `info_requests` dòng thử (`buyer_ask`, trigger FR-173 chạy bình thường) | 1 dòng | ✅ 04/09 |
| TS-ADM2-02 | admin đọc `viewings` của buyer thử | 1 dòng | ✅ 04/09 |
| TS-ADM2-03 | admin đọc `buyers` — policy mở cả bảng, web chỉ chọn `id, name, zalo_user_id, preferences, last_contact_at, created_at` | 1 dòng; `page.tsx` không có chuỗi `phone` trong select | ✅ 04/09 |
| TS-ADM2-04 | admin đọc `messages` của hội thoại thử | 1 dòng | ✅ 04/09 |
| TS-ADM2-05 | admin đọc `ctvs` (web chỉ chọn `name` qua join) | = số CTV thật | ✅ 04/09 (2) |
| TS-ADM2-06 | admin đọc view `khach_can_nguoi_that` lọc `conversation_id` thử | 1 dòng, `ten` = tên buyer, `tin_khach_cuoi` = tin vừa chèn | ✅ 04/09 |
| TS-ADM2-07 | admin đọc view `hoi_thoai_thong_ke` | đủ 30 dòng kể cả ngày trống; hôm nay (giờ VN) `tin_khach` = 1 | ✅ 04/09 |
| TS-ADM2-08 | anon đếm `info_requests`, `buyers`, `conversations` (GRANT có, policy không) | 0 / 0 / 0 | ✅ 04/09 |
| TS-ADM2-09 | anon `select` hai view | `42501` — đã revoke, không phải "0 dòng" | ✅ 04/09 |
| TS-ADM2-10 | sau rollback: dữ liệu thử = 0; hai view vai `postgres` không JWT → 0; `pg_policies` đủ 6 `*_admin_read`; grant view chỉ `authenticated`/`service_role` SELECT | như kỳ vọng | ✅ 04/09 (`ctv_ranks` cũ còn INSERT/UPDATE thừa, vô hại) |
| TS-ADM2-11 | UI: đăng nhập admin thật mở `/admin` — năm thẻ mới hiện, không dòng "Không đọc được"; truy vấn đợt đầu bắn song song (FR-171 j); câu `pending` quá `sla_due_at` chữ cam; tìm khách không lộ SĐT, "Mở Zalo" chỉ ở dòng có uid | như mô tả | ⏭ cần trình duyệt; `tsc --noEmit` + `bun run build` xanh 04/09 |
| TS-ADM2-12 | UI FR-80 + CSV: > 20 tin `cho_thong_tin` → "trang 1/2 · N mục", Trước/Sau, kẹp về trang 1; "Tải CSV" → `hoi-thoai-30-ngay-<ngày>.csv` BOM UTF-8, 31 dòng | như mô tả | ⏭ cần trình duyệt |
| TS-ADM2-13 | FR-175 — luồng sửa / gỡ / xoá tin ở `/admin/ro-hang` (người thật, tài khoản admin): (1) mở tin "chờ thông tin" bằng mã tin, sửa giá "6 tỷ 2" + diện tích, bấm **Lưu** → tin KHÔNG lên web; (2) ô trạng thái không chọn được "đang rao"; (3) gõ "6,5m" vào Ngang → báo đỏ tại ô, không lưu; (4) sửa rồi bấm Huỷ / Esc → hỏi trước khi bỏ; (5) "Lưu & rao lên web" → hỏi, tin lên web, có thông báo "Đã lưu và rao"; (6) tin đang rao: "Lưu & gỡ khỏi web" → hỏi, tin rời web; đổi trạng thái từ bảng cũng hỏi; (7) "Xoá vĩnh viễn…" → phải gõ đúng mã tin; tin có lịch xem → báo không xoá được, gợi ý gỡ khỏi web; (8) `/admin` hàng chờ duyệt không còn nút rao một cú bấm | không đường nào rao / xoá tin mà người bấm chưa thấy đủ tin và chưa xác nhận | ⬜ chờ chủ dự án bấm thử (tài khoản admin — máy không đăng nhập thay) |
| TS-ADM2-14 | WCAG 2.2 AA trên `/admin`: bàn phím — Tab tới được ô chọn ảnh (`UploadAnh`), mở/đóng màn sửa bằng Enter/Esc, focus quay lại mã tin; trình đọc màn hình (NVDA) — thanh điều hướng dưới 1280px đọc được tên tab, nút "×" đọc "Đóng" / "Gỡ #mã…", thông báo lưu được đọc; tương phản `--color-mute` 6,09:1 trên trắng; axe/Lighthouse bản dựng thật | 0 lỗi axe mức serious/critical ở `/admin`, `/admin/ro-hang` | 🟡 14/09 soát tĩnh mã nguồn (agent): 18 lỗi WCAG, 15 ISO 9241-110, 8 Shneiderman — đã vá 9 lỗi nặng/vừa ở luồng tin; CSS build có đủ lớp mới; còn: chữ cam `text-brand` 3,29:1 + nút chính trắng/cam (cần chủ dự án chốt màu), nhãn `htmlFor` ở `/admin` CRM, `mau-cau`, `prompt`, `tin-nhan`; chưa chạy axe / NVDA / người dùng thật |

### TS-MATCH — tin mới khớp tiêu chí + cảm nhận sau xem + bản đồ (FR-64/56/54) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-WEB2 — search NL, upload ảnh, dự án, danh sách riêng, giấy tờ
Luồng WEB (FR-01/02/03/04/08/09/10, FR-70/73 web, FR-96, FR-99 web, FR-100, FR-117, NFR-06) + `20260904g`. **P** = policy/RPC trên DB thật (khối `do … raise` cuối migration, chạy lại sau mọi lần đụng RLS `storage.objects`/`listing_media`/`curated_lists`; sau khối mọi bảng thử = 0); **S** = bóc câu qua `next start` + curl; **W** = trang web. Sandbox chặn host Supabase nên ca cần DB từ web ⏭ (trên Vercel chạy như trang cũ).
| ID | Bài | Kỳ vọng | Kết quả mới nhất |
|---|---|---|---|
| TS-WEB2-P01 | người bán đăng nhập (`sellers.auth_user_id`) insert `storage.objects` `listing-public` `<uuid tin mình>/a.jpg` | được | ✅ 04/09 |
| TS-WEB2-P02 | cùng người, `<uuid tin người khác>/b.jpg` | chặn | ✅ 04/09 (42501) |
| TS-WEB2-P03 | cùng người, bucket `listing-private` | chặn | ✅ 04/09 (42501) |
| TS-WEB2-P04 | người bán insert `listing_media` (public) tin mình, đọc lại | được, đọc = 1 | ✅ 04/09 |
| TS-WEB2-P05 | người bán insert `listing_media` tin người khác | chặn | ✅ 04/09 (42501) |
| TS-WEB2-P06 | người bán gọi `tao_danh_sach` | chặn | ✅ 04/09 (42501) |
| TS-WEB2-P07 | admin (JWT email trong `admins`): insert object public mọi đường dẫn + private + SELECT object private + `listing_media` `so_do` private | được cả bốn | ✅ 04/09 |
| TS-WEB2-P08 | admin `tao_danh_sach([A, B], 'TS-WEB2 ds')`; rồi mã lạ | `{token 24 hex, n=2}`; mã lạ → "Khong co tin" | ✅ 04/09 |
| TS-WEB2-P09 | anon `doc_danh_sach(token)`; token sai | có `listings`, không `buyer_id`; NULL | ✅ 04/09 (n=1: tin B thiếu DT nên FR-164 giữ nháp — đúng luật) |
| TS-WEB2-P10 | anon `select curated_lists`; insert `storage.objects`; đếm `listing_media` private | chặn; chặn; 0 | ✅ 04/09 |
| TS-WEB2-S01 | `GET /api/search?q=tìm mua nhà phố HXH 8 tỉ ở Q5` | ban, nhà, HXH, 6,8–9,2 tỉ, Quận 5; title "Mua nhà phố hẻm xe hơi khoảng 8 tỉ, Quận 5"; url `/mua-ban?gmin&gmax&vao=hxh&loai&q` | ✅ 04/09 |
| TS-WEB2-S02 | câu S01 không dấu | y hệt S01 | ✅ 04/09 |
| TS-WEB2-S03 | `thuê căn hộ 2 phòng ngủ dưới 15tr/tháng phường 4` | cho_thue, chung_cu, P4, max 15 tr, 2 PN; url `/cho-thue?phuong&gmax=15000000&pn=2&loai=chung_cu&q` | ✅ 04/09 |
| TS-WEB2-S04 | `ban nha mat tien duong Tran Binh Trong quan 5 duoi 5 ty` | mt, street "Tran Binh Trong", max 5 tỉ; `duong=` → ilike `street` | ✅ 04/09 |
| TS-WEB2-S05 | `đất Bình Chánh 5-8 tỷ gần chợ Bình Điền` | dat, `quan=` Bình Chánh, 5–8 tỉ, `moc=` "chợ Bình Điền" giữ dấu | ✅ 04/09 |
| TS-WEB2-S06 | `cho em hỏi giá nhà ở đây thế nào` (không tín hiệu mạnh) | `empty: true`, url `/mua-ban?q=`; hộp "Câu này tụi em chưa hiểu hết — nhắn Zalo" (loại BĐS một mình chưa đủ) | ✅ 04/09 |
| TS-WEB2-S07 | `ban nha hxh phuong 5` / `cần thuê mặt bằng Q5` | khớp tag → `/ban-nha-hem-xe-hoi-phuong-5-quan-5` / `/cho-thue-mat-bang-quan-5` | ✅ 04/09 |
| TS-WEB2-S08 | `?go=1` với S01 và S06 | 302 → url tương ứng | ✅ 04/09 |
| TS-WEB2-S09 | `POST /api/listing/parse` "Bán nhà HXH xe tải quay đầu, gần ngã tư Trần Bình Trọng, 4x16 một trệt hai lầu, 3PN, sổ hồng riêng, phường 5 Q5, 9 tỉ bớt lộc" | ban, nha_pho, P5/Q5, mốc "ngã tư Trần Bình Trọng", 3 PN, `price_raw` "9 tỉ" → 9e9, HXH, 4×16, area 64 (`needs_review`), floors 3, SHR, negotiable | ✅ 04/09 (sửa: từ dừng "tư", price_raw dính, "một trệt hai lầu") |
| TS-WEB2-S10 | `POST /api/search {"q":"nha 3pn q5"}`; `GET ?text=cho thue mat bang duong nguyen trai q5 dt 60m2 15tr/thang` | 200 JSON; mat_bang + street + 60 m² + 15 tr/tháng, không đọc "60 m2" thành 60 triệu | ✅ 04/09 |
| TS-WEB2-W01 | `/` có 3 khối FR-01 + "Hỏi bất kỳ, có tức thì" + ba vế FR-04 | có | ✅ 04/09 |
| TS-WEB2-W02 | `/` form `action="/api/search"` + placeholder "tìm mua nhà phố HXH 8 tỉ ở Q5" | có, không cần JS | ✅ 04/09 |
| TS-WEB2-W03 | `/mua-ban?q=…` | `<meta name="robots" content="noindex, follow">` + dải "Tìm thấy N tin theo yêu cầu: …" | ✅ meta · ⏭ dải (DB) |
| TS-WEB2-W04 | `/mua-ban?q=cho+em+hoi+gia` | hộp Zalo "Câu này tụi em chưa hiểu hết…" | ✅ 04/09 |
| TS-WEB2-W05 | trang tin: `WardMap` chỉ vẽ khi phường có toạ độ, lat/lng xoá trước khi vào `MapView` | kiểm tĩnh (tsc) | ✅ tsc · ⏭ trình duyệt |
| TS-WEB2-W06 | `/admin` thẻ BĐS hot / Độ trễ bot khi view chưa có | thẻ ghi "chưa có dữ liệu", thẻ khác vẫn tải (`hot.error`/`tre.error` tách `setLoi`) | ✅ tĩnh · ⏭ trình duyệt |
| TS-WEB2-W07 | `UploadAnh`: up file → ghi dòng; ghi hỏng → remove file; lỗi từng tấm ra UI | kiểm tĩnh | ✅ tsc · ⏭ trình duyệt (P01–P05 đã kiểm hàng rào) |
| TS-WEB2-W08 | trang tin dòng FR-99 | ẩn khi < 3 tin khác; tự loại chính tin | ✅ tĩnh `soSanhGia` · ⏭ DB (P1 có 23 tin có giá/m²) |
| TS-WEB2-W09 | `/ds/abcdefabcdefabcdefabcdef` | `<meta robots noindex, nofollow>`; trang "hết hạn" + Zalo, không 404 | ✅ meta · ⏭ nội dung (RPC) |
| TS-WEB2-W10 | `bun run build` | `/du-an/[slug]` ●, `/nha-dat/[code]` ●, `/[tag]` ●, `/ds/[token]` ƒ, `/api/*` ƒ | ✅ 04/09 (sandbox prerender 0 đường nha-dat/du-an vì host chặn) |
| TS-WEB2-W11 | `/admin` "Xem giấy tờ" → `createSignedUrl(path, 900)`; đường dẫn không in ra | kiểm tĩnh | ✅ tĩnh · ⏭ trình duyệt (P07 đã kiểm SELECT private) |
| TS-WEB2-W12 | `bunx tsc --noEmit` | sạch | ✅ 04/09 |
| TS-WEB2-W13 | `/robots.txt` chặn `/ds/`, `/api/`; `/sitemap.xml` có `/du-an/<slug>` | có | ✅ robots · ⏭ sitemap (DB) |

### TS-GIUCHAN — giữ chân 5 ngày, vòng đời, email (FR-60…65/70/72/73/81/103/108/110/52) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-V48 — chat-reply v48 (FR-27/31/45/65/79/99/105/108/114/116) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

### TS-KYGUI — nhận ký gửi như môi giới giỏi (FR-176/177/178, 07/09/2026) [deprecated 28/10/2026]

> Bộ test đã ngừng — thân mục (lệnh, ca, kết quả cũ) ở `docs/10-ke-hoach-kiem-thu-luu-tru.md`, cùng mã.

## 10.8 Nghiệm thu theo từng tài liệu (04/09/2026)

Đi từ `00` xuống từng tầng, đối chiếu từng khẳng định với code ở HEAD và DB thật
(chỉ đọc; ca ghi bọc `do … raise`), đồng thời chạy lại toàn bộ suite §10.7 chạy
được trong sandbox. Lệch nhỏ sửa cùng commit; lệch lớn thành OPEN-43/44/45.

### 10.8.1 Kết quả suite §10.7 (chạy lại 04/09/2026)

| Suite | Kết quả | Ghi chú |
|---|---|---|
| TS-E2E (`bash chay.sh`) | ✅ 74/74 (sáng) → 102/102 (sau v48) | gồm CTV, DIABAN, THONGSO, TOIUU |
| `fr159` / `fr161` / `fr164` `.mjs` | ✅ 65 / 9 / 8 | |
| TS-CHATREPLY-01…04, TS-RENT-01…05 (bot thật qua `net.http_post`) | ✅ 9/9 | uid `TEST-e2e-*`, dọn sau |
| TS-CACHE-01…03 | ✅ | 04/05 ⏭ Vercel |
| TS-SEC-01…10 | ✅ 8 · ❌ 1 → vá · ⏭ 1 | TS-SEC-08 `agents_public` (vá `20260904b`) |
| TS-SEC2-01…66 + kho file | ✅ · ❌ 1 (62: câu bất biến, đã sửa câu) · ⏭ H1…H8 | |
| TS-HQ-01…12 | ✅ 12/12 | 05–11 kiểm tĩnh |
| TS-LOG-01/02/06 · TS-HEALTH-02/03/04/07/08 | ✅ | còn lại ⏭ cần HTTP/bridge/trình duyệt |
| TS-GIA, TS-SPECS, TS-HANG, TS-DANGTIN, TS-NEO-01, TS-MA-01, TS-KD-05 | ✅ | |
| TS-IDEM-01…06, TS-IDEM2-I | ✅ | IDEM-06 kỳ vọng lỗi thời (đã sửa dòng) |
| TS-TOANVEN · TS-OUNG | ✅ · ❌ 02b/03 · ❌ 01/02/04/08 → vá | FR-164 gãy (vá `20260904b`), chạy lại xanh |
| TS-KHO-01…14, 20…25 | ✅ | 15…19 ⏭ worker; 06 ghi tiền đề |
| TS-JOB-01…30, TS-TIEN-01…07, TS-CHUONG-01…07 | ✅ 44/44 | |
| TS-LIVE | ⏭ | bridge im từ 27/08 |

Đỏ thật, đã vá bằng `20260904b_nghiem_thu_theo_tai_lieu.sql`: (1) **FR-164 gãy
tầng DB từ 02/09** — `20260902e` viết lại `listing_facts_sync_cols` làm rơi bốn
nhánh `gia`/`phuong`/`loai_bds`/`dien_tich_tim_tuong`, không ai thấy vì
`listing_facts` thật rỗng và TS-THONGSO-13 chỉ thử cụm thông số; cấy lại luật
20260828b/d + dải giá tin thuê. (2) **`/moi-gioi` trống từ 27/08** —
`agents_public` invoker, anon 0/3 → view definer tự chứa. (3) **Người bán web
tự đăng tin vỡ 42501** — cấp EXECUTE `parse_vnd`/`guess_property_type` cho
`authenticated`. (4) Dọn: `lan_thu_ke` thu hồi khỏi anon (SRS-3.12), xoá hàm mồ
côi `listing_facts_touch_status`, enum mồ côi `rating_target`.

### 10.8.2 Kết luận theo tài liệu (gộp 10.8.3 sao Bắc Đẩu; trạng thái sau khi dựng thêm §10.8.4)

| Tài liệu | Buổi sáng (đúng / một phần / sai) | Trạng thái sau 04/09 |
|---|---|---|
| `00` Định hướng (v1.2 → v1.3) | 73 khẳng định: 50 / 20 / 3 | sửa §0.6 (bridge dừng), §0.7 (173 tin là import, chưa phải bằng chứng "rao một câu"), OPEN-26/28; `/quan-ly` gỡ `Quận 5` cứng |
| `02` FR-01…90 | 21 / 28 / 16 chưa | RET (FR-60…65) + ADM (FR-70…81) + WEB dựng chiều — TS-GIUCHAN, TS-ADM2, TS-WEB2; còn treo ghi tại từng FR (OPEN-43) |
| `02` FR-91…174 | 60 / 10 / 10 chưa · 4 deprecated | lệch chữ FR-133/137/110/100/108 ghi chú vào `02`; 10 FR bot dựng ở v48 (TS-V48) |
| `02` NFR-01…18 | 8 / 5 / 5 chưa đo | NFR-09 SEO dựng (TS-SEO); NFR-02/05/14 vẫn chưa có số đo |
| `03` UF-01…13 | 4 / 5 / 4 | UF-06/07/13 nửa sau: curated list + upload dựng; email cần tài khoản ntfy; fingerprint chưa (OPEN-43) |
| `04` IA | 8 trang đặc tả chưa có, 10 route IA chưa ghi | trang tag/SEO dựng (OPEN-44); IA cập nhật đợt sau |
| `05` WF-01…14 | 2 / 6 / 6 | nhãn "Nhã Đạt CC" → Aioinhadat (sửa); còn lại theo OPEN-43/45 |
| `06` UI | tone 8/8; TONE_RULES #5 mâu thuẫn; DB↔TS lệch 3 khoá | #5 → "một tin một thông tin"; `bot_prompts` = `prompts.ts`; token lệch `06 §6.2` → OPEN-45 |
| `07` SRS | cron 10/10; RPC service_role đúng trừ `lan_thu_ke`; AC 1 ✅ / 3 ⚠ / 9 ❌; 2.1 còn Zalo SSO/Realtime/Logstash/Slack/SMTP/Fingerprint; `/api/*` 0/7 | DB vá theo SRS (`20260904b`); `/api/search`, `/api/listing/parse` dựng (TS-WEB2); SRS gắn ghi chú trạng thái → OPEN-43 |
| `00 §0.5` sao Bắc Đẩu | **Đo lại 07/09 SAU khi dọn bã kiểm thử**: NSM lịch xem 0 · I1 0 tin mới/7 ngày (160 `dang_ban`, 173 tin toàn `import_excel` 21/08, chưa khách nào đăng) · I2 **0/0** · I3 0/0 · I4 chờ ~21/09 | I5 qua view `nmg_hoat_dong` (`20260904e`): 0/3 NMG hoạt động. Con số I2 cũ (3/3) là hội thoại THỬ của chính nhóm làm, đã xoá — mốc sao Bắc Đẩu nay tính từ số 0 thật |

### 10.8.4 Dựng thêm cùng ngày (theo yêu cầu "dựng mấy thứ có trong tài liệu")

| Việc | Ở đâu | Kiểm |
|---|---|---|
| FR-12/17, NFR-09 — SEO nền: 64 trang tag SSG, sitemap, robots, canonical/OG, JSON-LD | `lib/tags.ts`, `app/[tag]`, `app/sitemap.ts`, `app/robots.ts`, trang tin | TS-SEO-01…03 ✅, 04…06 ⏭ deploy |
| FR-64 tin mới khớp tiêu chí, FR-56 cảm nhận sau xem, FR-54 link bản đồ | `20260904d`, nudge v24 | TS-MATCH-01…09 ✅ |
| FR-71/74/75/76/77/78/80 admin buyer side | `20260904c`, `app/admin/page.tsx` | TS-ADM2-01…10 ✅, 11–12 ⏭ UI |
| I5 đo được | `20260904e` view `nmg_hoat_dong` | admin/service_role 3 dòng, 0 hoạt động; anon 0 |
| Đợt 2 "dựng hết, giữ chân 5 ngày": FR-60/61/62/63/65/70/72/73/52/103/108/110, FR-57/81 email ntfy, NFR-01 | `20260904f`, nudge v25, cron `info-timeout-tick`, `stale-listing-tick` | TS-GIUCHAN-01…05 ✅, 06 ⚠ ntfy cần tài khoản |
| FR-27/31/45/65/79/99/105/108/114/116 | chat-reply v48 (byte trùng), `prompts.ts` + `bot_prompts` | TS-V48 ✅, e2e 102/102, live 200 |
| FR-01/02/03/04/08/09/10, FR-96, FR-99 web, FR-100 `/ds/[token]`, FR-117 `/du-an/[slug]`, SRS-4.3/4.5/4.6, NFR-06 | `20260904g`, `lib/parse-query.ts`, `app/api/*`, `components/UploadAnh.tsx`, `/admin` | TS-WEB2 P/S ✅, W ⏭ UI |

Dữ liệu thật đáng lưu ý: `listing_facts`, `info_requests`, `listing_media`,
`deals`, `interests`, `viewings` đều 0; `ctvs` 2 (1 bật, 0 có Zalo uid);
`sellers.zalo_user_id` 0/3; bridge im từ 27/08 16:21 (VN). Toàn bộ chuỗi
FR-129/140/153/165/172c/173 mới có bằng chứng từ test rollback + e2e, **chưa có
giao dịch thật nào chảy qua** — điều kiện tiên quyết cho DH-06 đợt 2.
