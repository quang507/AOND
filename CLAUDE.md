# CLAUDE.md — Harness dự án nhadat.cc

Tài liệu điều hướng cho mọi phiên làm việc trên repo này. Đọc file này trước khi
chạm vào bất kỳ file nào khác.

## 1. Dự án là gì

**nhadat.cc** — dịch vụ môi giới bất động sản "chat-first" tại TP.HCM, khởi điểm
là thị trường **Quận 5**. Luận điểm cốt lõi: *listing chỉ là mồi, giao dịch xảy
ra trong cuộc trò chuyện, và cuộc trò chuyện không bao giờ kết thúc.*

- **Người mua (B)** không trả phí, không phải để lại số điện thoại, tương tác qua
  **Zalo OA** với trợ lý AI trực 24/7.
- **Người bán (S)** — gồm **CCRB** (chính chủ rao bán) và **NMG** (nhà môi giới) —
  rao tin bằng một câu rao thông thường, AI bóc tách trường và viết lại.
- **Website nhadat.cc** là kênh SEO + listing + phễu đẩy người dùng sang Zalo OA.
- Doanh thu 100% từ phía bán: CCRB 1%, NMG 0.5% giá trị giao dịch.

Chi tiết đầy đủ: `docs/`.

## 2. Bộ tài liệu BA (nguồn sự thật)

Thứ tự đọc = thứ tự phụ thuộc. Tài liệu sau **không được mâu thuẫn** tài liệu trước.

| # | File | Nội dung | ID prefix |
|---|---|---|---|
| 0 | `docs/00-dinh-huong.md` | **Định hướng** — BRD hợp nhất Aioinhadat × nhadat.cc: thương hiệu Aioinhadat (viết AI Ơi Nhà Đất), trợ lý mỗi khách một tên người thật (FR-181; kho •ai bỏ 14/10/2026, SRS-5.1zzzzzzz9); mặt bán theo SRD AOND, mặt mua + web theo nhadat.cc, câu khách hỏi đi về CTV (FR-173); bất biến, sao Bắc Đẩu, lộ trình, quyết định treo. Đứng trên mọi tầng dưới | `DH-` |
| 0 | `docs/00-glossary.md` | Từ điển thuật ngữ (B, S, CCRB, NMG, CTV, HXH…) | — |
| 1 | `docs/01-research.md` | Nghiên cứu thị trường, người dùng, đối thủ, insight | `INS-` |
| 2 | `docs/02-requirements.md` | Mục tiêu KD, persona, yêu cầu chức năng / phi chức năng | `BR- FR- NFR-` |
| 3 | `docs/03-user-flows.md` | Luồng người dùng end-to-end | `UF-` |
| 4 | `docs/04-information-architecture.md` | Sitemap, URL/SEO, content model, taxonomy | `IA-` |
| 5 | `docs/05-wireframes.md` | Wireframe low-fi từng màn hình | `WF-` |
| 6 | `docs/06-ui-design.md` | Design system, token, component, tone giọng | `UI-` |
| 7 | `docs/07-srs.md` | Đặc tả phần mềm: kiến trúc, data model, API, acceptance | `SRS-` |
| 8 | `docs/08-traceability.md` | Ma trận truy vết BR → FR → UF → WF → SRS | — |
| 9 | `docs/09-open-issues.md` | Mâu thuẫn / quyết định còn treo, cần chủ dự án chốt | `OPEN-` |
| 10 | `docs/10-ke-hoach-kiem-thu.md` | Kế hoạch kiểm thử 4 tầng: chức năng, kỹ thuật, UI/UX, phi chức năng | `TS-` |
| 11 | `docs/11-quy-trinh.md` | Quy trình BA và tester: hai vòng làm việc, ba cổng, máy kiểm gì / người kiểm gì, định nghĩa XONG. Không sinh ID mới | — |
| — | `docs/SRD-AI-Oi-Nha-Dat.docx` | **SRD gộp .docx** theo bố cục SRD Aioinhadat (06/10/2026, chủ dự án: "đổi thành đuôi docx như bên AOND"). **Bản XUẤT, không phải nguồn sự thật**: `bun run srd` sinh lại từ các file md trên bằng `scripts/sinh-srd-docx.mjs`; sửa nội dung thì sửa md rồi sinh lại, đừng sửa tay .docx | — |

## 3. Tài liệu gốc & Phân định phạm vi

**Tài liệu gốc 2024 KHÔNG còn trong repo** (xoá ở commit `459008d` ngày 08/09/2026 cùng `design/`, `SS/`, `hình samples/`, dữ liệu crawl; chủ dự án 10/09: "tài liệu nào bị cũ thì xoá đi"). Chúng là tư liệu lịch sử nhadat.cc 2024, đã ngưng kế thừa (OPEN-48). Muốn xem lại thì `git show 459008d^:"<tên file>"`. Các trích dẫn `[nguồn: biz model.docx §…]` trong `docs/` giữ nguyên làm dấu vết lịch sử — không phải lời mời đi tìm file.
**Nguồn sự thật chuẩn duy nhất hiện nay của hệ thống là:**
1. Bộ tài liệu `docs/` đã được chuẩn hóa theo **Aioinhadat 2026**.
2. Kịch bản Gemini mới của Sếp: `Kịch bản huấn luyện môi giới (Gemini 07-09-2026).md`.
   Chat Gemini gốc của dự án (21–27/06/2026, share `EEX3PutTDZDt`), chưng cất ở
   `Kịch bản AI Ơi Nhà Đất (Gemini 21-06-2026, share).md` — chủ dự án đối chiếu với
   hệ thống ngày 09/09/2026 và chốt 14 dòng ở `docs/09` OPEN-55 → FR-181…186.
3. SRD Aioinhadat `AOND req + chat examples.docx` — đã chưng cất hết vào `06 §6.8`, `09` OPEN-20/21; file gốc cũng đã xoá.

Bản đồ "file gốc (đã xoá) → chưng cất ở đâu", để đọc `[nguồn: …]` trong docs mà không phải mở file:

| File gốc | Được chưng cất vào |
|---|---|
| `Tài liệu hệ thống nhadat.cc.pdf`, `SS/` | `07-srs.md` (kiến trúc, tech stack) |
| `nhadat.cc website.docx` | `02`, `04`, `05`, `06` (website & SEO) |
| `biz model.docx` / `.pdf` | `01`, `02` (mô hình KD, OKRs, phí) |
| `S's side.docx` | `02`, `03` (luồng người bán, API S↔B) |
| `chats w B.docx` | `03`, `06` (kịch bản chat, tone giọng), `07` (backend B Side) |
| `demo2Vitalify.docx` | `01` (concept gốc bằng tiếng Anh) |
| `OKRs eo2024.pptx` | `01` (định vị: *permanent agent of agents*) |
| `dự kiến vốn 6 tháng đầu.xlsx` | `01` (ngân sách, ràng buộc nguồn lực) |
| `AOND req + chat examples.docx` | `06` §6.8 (kịch bản người bán), `09` OPEN-20/21 (gamification, vai người rao) |
| `hình samples/` | `05`, `06` (ảnh listing mẫu) |
| `Kịch bản huấn luyện môi giới (Gemini 07-09-2026).md` | `02` FR-177 (hỏi người bán 1 thông tin/lần + khích lệ, bản nháp tin, điểm 7 tiêu chí), `09` OPEN-49 |
| `Kịch bản AI Ơi Nhà Đất (Gemini 21-06-2026, share).md` | `09` OPEN-55 (14 dòng chốt 09/09), `02` FR-181 (tên trợ lý theo khách), FR-183 (điểm người rao), FR-184 (bán rồi), FR-185 (ảnh vào kho), FR-186 (câu hỏi theo loại; tối 09/09 thêm 4 loại toà nhà/đất nông nghiệp/đất SKC/kho xưởng + nhóm hỏi bù `sau_dang`), FR-187 (JSON chia nhóm từng tin), FR-173 a (chủ nhà trước 12 giờ), FR-114 d (kiến thức dự án), FR-177 h (giá thị trường khu vực) |

## 4. Quy ước làm việc

1. **Mọi câu khẳng định trong `docs/` phải truy được về nguồn.** Dùng cú pháp
   `[nguồn: biz model.docx §Doanh thu]`. Không có nguồn → ghi
   `[giả định BA]` hoặc đưa vào `09-open-issues.md`.
2. **Không tự ý chốt điều còn mơ hồ.** Mâu thuẫn giữa hai tài liệu gốc → tạo
   `OPEN-xx`, nêu hai phương án và khuyến nghị, chờ chủ dự án.
3. **ID là bất biến.** Không đánh số lại `FR-`, `UF-`… khi chèn mục mới — cấp ID
   kế tiếp và đánh dấu mục cũ `[deprecated]`.
4. **Sửa tài liệu tầng trên → phải cập nhật `08-traceability.md` cùng commit.**
5. Ngôn ngữ tài liệu: **tiếng Việt**, giữ nguyên thuật ngữ kỹ thuật tiếng Anh
   (listing, webhook, fingerprint…). Tên biến/bảng/API: **tiếng Anh, snake_case**.
6. Sơ đồ: **Mermaid** (render được trên GitHub). Wireframe: ASCII box.

## 5. Ranh giới bảo mật — TUYỆT ĐỐI

Các thư mục sau từng nằm cạnh repo (nay không còn trên máy chủ dự án — soát 10/09/2026), vẫn giữ trong `.gitignore` và **không bao giờ** được
đọc-rồi-chép nội dung vào `docs/`, commit message, hay PR nếu ai đó chép lại:

- `admin logins/` — credential.
- `sổ đỏ samples/` — sổ đỏ, CCCD, địa chỉ thật của người dân.
- `masterDB/` — dữ liệu nhà + ảnh thật (~179MB).
- `ThemeForest/` — theme thương mại có bản quyền (~274MB).

Số điện thoại, Zalo ID, tên thật xuất hiện trong tài liệu gốc phải được **ẩn
danh** khi trích vào `docs/` (`0903xxxxxx`, `chị D.`).

## 6. Mã nguồn app

> **18/10/2026 — BỘ NÃO DUY NHẤT LÀ LÕI PYTHON `src/aioi/`** (chủ dự án: "lõi chuẩn duy nhất của AOND là PYTHON… phần TypeScript
> chat-reply trên Supabase chỉ là tàn dư cũ… dồn 100% vào lõi Python, tránh hai con AI sửa chéo"). Logic nghiệp vụ, prompt, bóc tách,
> xưng hô, phí, phiên chat: sửa ở `src/aioi/` (test `tests/`, chạy `bun run test:py`), chạy trên VPS `aond-core.service` cổng 8000 tại
> `/opt/aond_core`; bridge gọi `http://127.0.0.1:8000/chat-reply`; `cai-vps` (workflow `apply-migration`, ô `dung_lai`) đưa `src/aioi`
> lên và khởi động lại. Edge function TypeScript `chat-reply`, `zalo-webhook`, `nudge`, `ask-seller`, `ctv-report`, `inbound-sweep` đã
> gỡ khỏi repo (SRS-5.1zzzzzzz31); còn `escalation-feed` (bridge kéo việc / báo sống / QR), `geocode-listings`, `media-cleanup`.
> `_shared/` còn vì web (`lib/` nhập luật tiền, luật che liên hệ, nhãn, phường) và ba edge function dùng. **18/10 tối (SRS-5.1zzzzzzz46):
> gỡ nốt tàn dư TS** — 53 file `_shared/` chỉ chat-reply dùng (prompts.ts, ai/*, bóc tách regex, Groq/Gemini), 44 file test của chúng,
> trang `/admin/prompt` + `/admin/mau-cau`, workflow `go-ham-ts`; DB (`20261018i`): 10 bảng (`bot_prompts`, `mau_cau`, `van_kich`,
> `inbound_ledger`, `inbound_events`, `ai_ghi_thu`, `ctv_daily_reports`, `du_an_can`, `du_an_tai_lieu`, `project_fact_phieu`), 3 view, 26 hàm
> và trigger `listing_insert_drip` (đang bắn tới `/ask-seller` đã xoá). Nội dung chủ dự án soạn chép sang `luu_tru.ts_*_20261018`. **Mọi đoạn bên dưới
> nói về chat-reply / prompt TypeScript / bot_prompts / e2e 1440 ca / trang chat thử / bộ đo bóc tách / khách mô phỏng là LỊCH SỬ**,
> không còn là chỗ sửa bot.
> **19/10/2026 (SRS-5.1zzzzzzz56): kho tệp = Supabase Storage, SharePoint / OneDrive đã bỏ.** Ảnh căn → `listing-public/<uuid tin>/`
> (web đọc qua `listing_media` + `listing_photos_v`), sổ đỏ / giấy tờ / PDF / tệp dự án → `listing-private` (`src/aioi/kho_anh.py`);
> kiến thức dự án lõi học được → bảng `du_an_kien_thuc` (không còn chỉ ở SQLite trên VPS).
> **19/10/2026 (SRS-5.1zzzzzzz66): bảng `listing_facts` đã gỡ** — ô tin một nguồn `listings.boc_tach`; hàm DB đọc ô qua `o_boc_tach()`.
> Mọi đoạn bên dưới nói `listing_facts` / `ghi_fact_listing` / `listing_facts_sync_cols` / `listing_missing_facts` là LỊCH SỬ.
> **Bộ câu hỏi theo loại BĐS chỉ ở `src/aioi/schema.py`** (`CORE_FIELDS` theo nhóm, `CORE_THEO_LOAI` đè cho loại riêng — SRS-5.1zzzzzzz68);
> bảng `required_facts` gỡ 19/10/2026 (`20261019g`), mọi đoạn bên dưới nhắc nó / `priority` / nhóm `sau_dang` là LỊCH SỬ.
> **Tìm nhà cho khách mua (SRS-5.1zzzzzzz138, 22/10/2026):** `mua.can_phu_hop` → hàm DB `tim_nha` (lọc cứng bán / thuê / loại / giá, khu vực + diện tích + phòng ngủ + xe hơi chỉ cộng điểm, vector `listings.nhung` cộng điểm; mỗi căn kèm `ly_do` từ cột thật). Quota: không lời tả nhu cầu thì không nhúng; nhúng nhớ theo chữ; kết quả nhớ 60 s. Thiết kế đầy đủ (chưa làm hết): SRS-5.1zzzzzzz137. Đo chất lượng tìm (30 câu có đáp án viết trước, 4 chế độ so tin gốc với mô tả AI): `bot/tests/tim-nha/`, ô `do-tim-nha` (SRS-5.1zzzzzzz144) — đừng chỉnh trọng số `tim_nha` khi chưa có số đo. **Lời bot giới thiệu căn cho khách mua (SRS-5.1zzzzzzz145, 23/10/2026):** không nói mã tin / chữ "rổ", từ SRS-5.1zzzzzzz160 mỗi lượt MỘT căn (khách đòi thêm mới đưa căn kế) viết bốn đoạn cách nhau dòng trống = bốn tin Zalo: mở lời · thông số + vì sao hợp · link `AIOI_SITE_URL/nha-dat/<mã>` · một câu hỏi ngắn (trước đó: tối đa 2 căn, mỗi căn một câu) (mặc định `aioinhadat.vercel.app`; `nhadat.cc` chưa trỏ về web, 404), căn vượt ngân sách xếp sau và nói rõ, kết bằng một lời khen; ảnh từ `listing_photos_v` (`src/aioi/anh_can.py`): tối đa 4 mỗi lượt — một căn được cả 4, nhiều căn chia đều.
> **Khách mua: gợi ý căn trước, hỏi sau (SRS-5.1zzzzzzz146, 23/10/2026):** khách nêu khu vực hoặc ngân sách (`mua.co_tieu_chi`) thì tin trả lời đi theo thứ tự khen → 1–2 căn kèm link → MỘT câu hỏi ngắn (~15 chữ) ở CUỐI; chưa có khu vực / ngân sách thì KHÔNG gợi ý căn (`can_phu_hop` trả rỗng), chỉ hỏi. Đừng đưa câu hỏi dài hay giải thích "vì sao hỏi" vào `build_buyer_chat_system`.
> **Nạp lại phiên sau khi lõi khởi động lại (SRS-5.1zzzzzzz147, 23/10/2026):** `SupabaseConversationStore.load` phải đọc CẢ hội thoại mua (`conversations.buyer_id`), và dòng `listings` rỗng của lượt chào KHÔNG làm khách thành người bán (`_tin_that`). Một Zalo vừa mua vừa bán là hai bản ghi (`sellers` + `buyers`) — đừng giả định chỉ có `sellers`. Triển khai `cai-vps` khởi động lại lõi: nói trước với người đang chat thử.
> **Ngoại lệ của hai luật cũ (SRS-5.1zzzzzzz148, chủ dự án 23/10/2026): "số điện thoại khách lúc xem thử thì lấy được nha"; "số liệu tài chính cứ để số tượng trưng đã, sau tôi sẽ sửa".** Người mua vẫn không phải để lại số ở mọi chỗ khác, nhưng bot xin MỘT lần khi khách chốt lịch xem; số ghi vào `viewings.phone` + báo người phụ trách (`mua.ghi_sdt_hen_xem`), khách không biết số admin. Số tài chính tham khảo (sinh lời / lãi suất) chỉ ở `src/aioi/tai_chinh.py`, là số TƯỢNG TRƯNG chưa kiểm — đừng coi là số liệu thị trường; bot chỉ nói khi khách tự hỏi, kèm "tham khảo".
> **Một Zalo = một khách = một hội thoại (SRS-5.1zzzzzzz149, chủ dự án 23/10/2026: "1 zalo tính là 1 khách, 1 chỗ trong tin nhắn thôi, không tách ra"; cũng chốt GIỮ 63 cột `listings`, OPEN-64):** hội thoại chung gắn cả `seller_id` và `buyer_id`; mọi đường ghi / đọc hội thoại đi qua `supabase_store._hoi_thoai_chung` / `_tim_hoi_thoai`, đừng tự tạo hội thoại theo vai ở chỗ khác; vai của phiên nạp lại suy từ người KHÁCH nói cuối; khách ở vai mua không có dòng `sellers`. Dòng mua dùng tên Zalo, không "Khách Zalo ####".
> **Báo khách mua có căn mới vừa nhu cầu (SRS-5.1zzzzzzz150, chủ dự án 23/10/2026: "nhắn thẳng vào zalo", "khung giờ 8–20 giờ", "căn vượt ngân sách một chút báo luôn"):** lõi tự quét mỗi 10 phút (`server._vong_bao_can_moi`, tắt bằng `BAO_CAN_MOI=tat`), logic ở `src/aioi/bao_can_moi.py`: chỉ 8–20 giờ Việt Nam, tối đa 1 tin / khách / 24 giờ, 1 căn / tin, không báo lại một căn, khớp CỨNG khu vực + loại + giá ≤ ngân sách × 1,15 (vượt thì nói rõ %); câu chữ code ghép (câu mẫu `bao_can_moi` / `bao_can_moi_vuot`), sổ ở `reminders` kind `match`. Trigger DB cũ `bao_tin_moi_khop` (FR-64) đọc khoá `area` / `budget` mà lõi không ghi nên không còn khớp ai — đừng sửa nó cho khớp rồi bật `nudge` lại (hai đường đẻ nhắc là hai chủ).
> **Tin báo căn mới gửi kèm ảnh (SRS-5.1zzzzzzz151, 23/10/2026; từ SRS-5.1zzzzzzz159 tối đa 4 ảnh và tách 4 tin Zalo — mỗi đoạn câu mẫu cách nhau dòng trống là một tin, ảnh đi ngay sau tin có link)** qua `/send` của bridge (`photos`, chỉ https; vòng tải ảnh chỉ ở `guiAnhQuaUrl`, chat và tin chủ động dùng chung); căn chưa có ảnh thì chỉ gửi chữ (tin mẫu `SEED` có ảnh minh hoạ từ SRS-5.1zzzzzzz168). **Overpass gọi từ DB (SRS-5.1zzzzzzz152):** máy công cộng chặn IP edge (403 / 406 mỗi tick), nên `geocode-listings` gọi `rpc("tra_overpass")` như Nominatim (`tra_nominatim`) — đừng đổi lại thành `fetch` từ edge; thêm máy Overpass phải thêm cả vào danh sách cho phép trong hàm DB (`bot/tests/tien-ich.mjs` đỏ khi lệch).
> **Khách vừa mua vừa bán (SRS-5.1zzzzzzz153, chủ dự án 23/10/2026: "đồng ý sửa cả hai"):** vai của lượt theo `user_intent` của lượt đó, KHÔNG dính phía bán chỉ vì từng rao bán (`engine.py`, chỗ định tuyến `dang_giua_viec_ban`): "buy" → vai mua trừ lúc đang chờ duyệt bản nháp / xác nhận ẩn tin, "sell" → vai bán, lượt mơ hồ ở lại vai mua; nạp lại sau khi lõi khởi động lại theo tin KHÁCH gần nhất (`messages.sender`). Việc của người mua (lịch hẹn, số điện thoại, quan tâm) chỉ chạy ở vai mua. Giờ hẹn khách nhắn rời nhiều tin nhận khi mọi chữ có trong 3 tin khách gần nhất; căn lấy từ link bot vừa báo nếu khách không gõ mã. Lượt không ghi gì thì model bị dặn KHÔNG nói "đã chuyển / đã giữ lịch" (`khoi_viec_vua_ghi([])`). Tin nhắc 5 phút của người bán không gửi cho khách ở vai mua. Bắn thử: ô `ban-thu-vm` (lần đầu 23/10 TRƯỢT ba phép lịch hẹn / báo người phụ trách / số điện thoại, nguyên nhân chưa rõ — log `Mua:` ở `_viec_mua` để truy, xem SRS-5.1zzzzzzz154 mục 5; đừng coi "ghi lịch hẹn" là xong khi chưa thấy `ban-thu-vm` đạt).
> **Khách mua chỉ bị hỏi tối đa hai câu về nhu cầu (SRS-5.1zzzzzzz154, chủ dự án 23/10/2026: "hỏi nhiều quá, 1 hoặc 2 câu hỏi thôi"):** đã có khu vực hoặc ngân sách (`co_tieu_chi`, đủ để gợi ý căn) thì sau `MAX_CAU_HOI_MUA = 2` câu bot thôi hỏi nhu cầu, chỉ giới thiệu căn và hẹn xem (`BuyerLead.next_question_field`, bộ đếm `fields["_so_cau_hoi"]`). Chưa có khu vực / ngân sách thì vẫn hỏi. 7 câu tư vấn (SRS-116) vì vậy không còn được hỏi sau hai câu đầu. Số căn mỗi tin vẫn tối đa 2 (SRS-145).
> **Bản tin rao không tự thêm hẻm / mặt tiền (SRS-5.1zzzzzzz155, chat thử 23/10: tiêu đề "Bán nhà hẻm Lê Lai" khi khách chưa nói hẻm):** `engine._hem_mt_khong_co_du_lieu` trong `_soat_hinh_thuc` — bản tin 📋 có hẻm / HXH / ngõ / mặt tiền / MT mà căn chưa ghi `lo_gioi_hem` / `mat_tien` và khách chưa nói chữ đó (địa chỉ có dấu "/" tính là hẻm) thì gọi lại model một lần. Chưa rõ vì sao bản nháp ra mà không hỏi hẻm trước (SRS-155 mục 3) — đừng coi là đã hiểu hết ca này.
> **Lịch hẹn xem + mặt tiền theo tên đường (SRS-5.1zzzzzzz157, chat chị Ngân 23/10: bot tự thêm "chiều nay" rồi hỏi lại "ngày nào"; chủ dự án: "địa chỉ chỉ có tên đường thì tự ghi là mặt tiền"):** giờ khách nói thêm gộp vào lịch chờ đã ghi (`mua.gop_gio_hen`), lời đáp phía mua có khối `LỊCH HẸN XEM ĐÃ GHI` (không tự thêm ngày, đủ ngày + giờ thì xác nhận MỘT lần); `Property.update` ghi `lo_gioi_hem = "Mặt tiền"` khi có tên đường, không có "/" / hẻm / ngõ. Phép soát DB số 8 không đếm `escalation` vào người mua (SRS-156, migration `20261023c`).
> **Số điện thoại sai độ dài (SRS-5.1zzzzzzz161, chat chị Ngân 23/10: gõ thiếu một số mà bot vẫn "cảm ơn đã gửi số"):** `mua.giong_sdt_sai` — bot đã xin số mà khách gõ dãy giống số điện thoại nhưng `tim_sdt` không nhận thì lượt đó model bị dặn KHÔNG cảm ơn / không nói đã ghi, xin gõ lại MỘT lần; nhắc khách "chú ý điện thoại", cấm chữ "máy" (chủ dự án 23/10). Lời "chú ý điện thoại" do model viết, chưa là câu mẫu cố định.
> **Khách gõ "ok" liên tiếp (SRS-5.1zzzzzzz162):** khối `LỊCH HẸN XEM ĐÃ GHI` dặn model: khách chỉ đáp ngắn đồng ý sau khi lịch đã xác nhận thì đáp MỘT câu rất ngắn, không lặp câu xác nhận / người phụ trách sẽ gọi. Do model đọc nghĩa, không dò từ khoá ở code; chưa thử Zalo thật.
> **Thả tim + xưng hô theo giới tính Zalo (SRS-5.1zzzzzzz163, chủ dự án 23/10/2026):** lõi trả `tha_tim` (lời chào / "ok" do AI đọc qua `loi_xa_giao` có cụm trích, duyệt bản nháp, vừa ghi ô địa chỉ) → bridge `addReaction(HEART)` lên tin khách cuối của lượt; bridge gửi `gioi_tinh` từ hồ sơ Zalo → `conv.xung_ho_goi_y` ("anh" / "chi"), CHỈ gợi ý khi khách chưa tự xưng, tắt bằng env `XUNG_HO_THEO_ZALO=tat`. Giới tính Zalo là khách tự khai, chưa kiểm cách Zalo trả cho người ẩn; chưa thử Zalo thật.
> **Lịch xem đã chốt báo admin (SRS-5.1zzzzzzz164, chủ dự án 23/10/2026: "2 bên đã chốt giờ thì báo admin cũng được"):** CTV trả lời `#mã: ok giờ` → ngoài báo khách còn một nhắc `escalation` về admin (migration `20261023f`). Nhắc của lịch xem chỉ tới CTV hoặc admin, CHƯA nhắn thẳng chủ nhà (nhắc không gắn `seller_id`) — chuỗi chủ nhà → CTV → admin của `escalation-feed` chỉ chạy khi nhắc có `seller_id`.
> **Lịch xem đi thẳng admin, bỏ bước CTV (SRS-5.1zzzzzzz165, chủ dự án 23/10/2026: "bỏ qua bước ctv luôn để đưa thông tin cho admin luôn"):** trigger `viewings_bao_ctv_va_email` đặt `v_ctv := null` — nhắc và câu `xac_nhan_lich` luôn giao admin (migration `20261023g`); thay phần "CTV" của SRS-164. Chỉ lịch xem; câu khách hỏi chủ nhà và báo cáo CTV vẫn còn bước CTV.
> **Prompt caching theo ranh giới (SRS-5.1zzzzzzz166, chủ dự án 23/10/2026: "Prompt Caching và Batch API cái nào áp dụng dc thì áp dụng"):** chuỗi system đi tới Claude được cắt hai khối ở `RANH_GIOI_CACHE` (`llm/base.py`) — phần chữ cố định trước dấu có điểm cache riêng nên lượt sau / khách khác đọc lại được; dựng prompt MỚI thì đặt dấu ngay sau đoạn cố định, trước phần đổi mỗi lượt. Đã đặt ở `build_chat_system`, `build_buyer_chat_system`, lượt lập thao tác; Gemini / Groq bỏ dấu (`bo_ranh_gioi`). Batch API KHÔNG hợp (chat thời gian thực). Hiệu quả chưa đo — so `cache_write` / `cache_read` ở `bot_usage_model` sau triển khai.
> **Rổ 130 tin mẫu thử mua (SRS-5.1zzzzzzz167, 23/10/2026):** `seed_thu` SEED0001..0130 của người bán thử `thu-seed-001`, sinh tất định bằng `bot/tests/tim-nha/nap-tin-mau-lib.mjs` (`sinhTatCa`) và nạp bằng ô `nap-tin-mau` (chạy lại được, tạo người bán nếu thiếu). 30 tin đầu là bản SINH LẠI sau khi bản nạp tay mất khỏi DB (nguyên nhân mất chưa biết) — đáp án `cau-hoi.json` của bộ đo `do-tim-nha` soạn cho 30 tin cũ nên CHƯA dùng được. Xoá tin nhắn / làm sạch thì đừng đụng `listings` `source = 'seed_thu'`.
> **Ảnh căn nói thật + rổ mẫu 228 tin (SRS-5.1zzzzzzz168, chat thử Lê Quang 24/10/2026: bot hứa "ảnh em gửi ngay" mà không ảnh nào tới):** mỗi dòng căn đưa cho model ghi số ảnh THẬT (`_so_anh`, đếm ở `listing_photos_v` — cùng nguồn `anh_can`); chưa có ảnh thì bot phải nói thật, KHÔNG hứa gửi. Đừng đưa vào lời dặn một việc hệ thống làm có điều kiện như thể luôn làm. Rổ `seed_thu` nay SEED0001..0242 (`sinhTatCa`, ô `nap-tin-mau`) + ảnh minh hoạ "ẢNH MẪU" (ô `nap-anh-mau`, `bot/tests/tim-nha/anh-mau/`); mỗi quận đô thị có đủ nhà phố hẻm xe hơi / căn hộ bán / căn hộ thuê 2PN / nhà phố thuê. `cau-hoi.json` của `do-tim-nha` vẫn soạn cho 30 tin cũ — chưa dùng được.
> **Khách xin ảnh thì được gửi ảnh (SRS-5.1zzzzzzz169, chủ dự án 24/10/2026: "người mua hỏi ảnh cũng đưa cho họ dc"; xin lại trong 24 giờ trước đó chỉ được nhắc "ảnh ở trên"):** lượt lập thao tác đọc `mua.xin_anh` theo nghĩa (cụm trích phải có trong tin khách), `_viec_mua` đặt `TurnResult.xin_anh`, `anh_can_gui_kem(xin=…)` gửi bỏ chặn 24 giờ và gửi tiếp ảnh chưa gửi (hết thì quay lại từ đầu); căn chưa có ảnh thì bot nói thật. Tin bot TỰ giới thiệu căn vẫn chặn 24 giờ. Chưa thử Zalo thật.
> **Câu khách hỏi chủ nhà bỏ bước CTV (SRS-5.1zzzzzzz170, chủ dự án 24/10/2026: "Bỏ bước CTV luôn đi" → "báo thẳng admin"):** tin không có chủ nhà trên hệ thống → `info_requests.assignee = 'admin'`; chủ nhà quá hạn → nhắc `escalation` về admin ngay (migration `20261024a`). Cùng SRS-165 thì mọi đường báo của phía mua đều đi thẳng admin; chỉ còn dòng CŨ giao CTV và `assign_ctv_round_robin` (gán `conversations.ctv_id`, không đẻ nhắc).
> **Bot không gọi khách là "mình" (SRS-5.1zzzzzzz171, chủ dự án 24/10/2026: "sao nó xưng mình z" → "cấm gọi khách là mình"):** ~~chỉ khi khách xưng "em" bot mới xưng "mình"~~ (từ 27/10 bot KHÔNG xưng "mình" với ai — SRS-5.1zzzzzzz214, xem ghi chú đầu mục); các cách xưng khác `khoi_xung_ho` dặn cấm và `_soat_hinh_thuc` gọi lại model một lần nếu lời còn "mình" ngôi hai (`_goi_khach_la_minh`; "nhà mình / căn mình…" vẫn được). Chưa thử Zalo thật.
> **Bỏ gán CTV cho hội thoại (SRS-5.1zzzzzzz172, chủ dự án 24/10/2026: "bỏ luôn assign_ctv_round_robin"; "sau khi chốt thì admin tự báo qua zalo đến ctv để dẫn khách"):** gỡ trigger `trg_conversations_assign_ctv` + hàm `assign_ctv_round_robin` (migration `20261025a`); bot không nhắn CTV dẫn khách — admin tự báo. Thay đoạn "chỉ còn … `assign_ctv_round_robin`" ở ghi chú SRS-170. Còn cột `conversations.ctv_id` cũ và dòng cũ giao CTV.
> **Bỏ nhánh CTV xác nhận lịch (SRS-5.1zzzzzzz173, chủ dự án 25/10/2026: "bỏ luôn nhánh CTV xác nhận lịch"):** `info_request_bao_lai_khach` không còn nhắc admin "lịch đã chốt do CTV xác nhận" (migration `20261025b`, bỏ phần cuối SRS-164); admin trả lời `#mã: ok giờ` vẫn chốt lịch + báo khách. Còn vòng 2 `info_request_sla_tick` và nhánh `ctv` của `notify_info_request_escalation` cho dòng cũ.
> **Khách mua tắt báo căn + chê căn (SRS-5.1zzzzzzz175, soát UX 25/10/2026):** `mua.ngung_bao` (`tat` / `bat`) → `buyers.bao_can_moi`, vòng `bao_can_moi` bỏ khách đã tắt; `mua.khong_hop` + `ly_do` (cụm trích trong lời khách) → `interests.trang_thai = khong_hop` — `engine._can_goi_y` là MỘT cửa lấy căn gợi ý (bỏ căn đã chê qua `can_phu_hop(loai_tru=…)`), `bao_can_moi` và `bao_can_da_chot` cũng bỏ. Thêm đường gợi căn cho khách mua thì đi qua `_can_goi_y`, đừng gọi `can_phu_hop` trần. Lời chào mẫu `chao_lan_dau` / `chao_lam_moi` nay hỏi cả "tìm mua" (SRS-5.1zzzzzzz174) — đổi câu mẫu thì đổi cả `MAC_DINH` và migration `*_cau_mau_*`. Chưa thử Zalo thật.
> **Kho pháp lý nạp sẵn (SRS-5.1zzzzzzz176, chủ dự án 25/10/2026: "Nạp sẵn đi nạp vào luôn, tôi ko biết duyệt"):** câu hỏi thủ tục / thuế phí / giấy tờ chỉ trả lời từ `src/aioi/phap_ly.MAC_DINH` (24 mục, mỗi mục có `nguon` + `CAP_NHAT`; bảng `kien_thuc_phap_ly` admin sửa `tra_loi`, lõi đọc đè 60 giây). AI chọn khoá theo nghĩa (`hoi_phap_ly` + cụm trích), `khac` → nói thật chưa có, `phap_ly_nhay_cam` → báo admin qua `can_nguoi_that`. **Nội dung AI soạn, CHƯA người có chuyên môn duyệt** (`kiem_duyet = chua`) — bot luôn nói "tham khảo"; đừng bỏ câu đó. Không cho bot search web. Thêm mục = thêm khoá ở `MAC_DINH` + `python scripts/sinh-migration-phap-ly.py <tên>` (test `test_phap_ly.py` đỏ khi lệch). Chưa thử Zalo thật.
> **Năm sửa từ audit hội thoại thật 24/10 (SRS-5.1zzzzzzz177, chủ dự án 25/10: "Sửa luôn 5 cái đó đi"):** (1) bridge gửi ảnh cần `imageMetadataGetter` (zca-js ≥ 2) — `bot/bridge-zca/kich-thuoc-anh.mjs`, `cai-vps.sh` ghim `zca-js@2.2.0`; nâng zca-js là đọc CHANGELOG trước, đừng `npm i zca-js` trần; (2) khách hỏi việc ngoài nhà đất khi chưa tỏ ý bán / mua: `hoi_ngoai_viec` → không ghi ô, không tạo tin, `khoi_ngoai_viec` (lần 2 đề nghị nối người), `followup` không nhắc; (3) `save` không tạo dòng `listings` khi chưa có ô thật — lời chào không đẻ tin rỗng; (4) `bao_can_moi.can_da_gioi_thieu`: căn bot đã dán link trong chat thì không báo lại; (5) `mua.danh_dau_lech` + `dong_can` nói thẳng "ÍT phòng ngủ / CHƯA RÕ số phòng ngủ / NHỎ hơn diện tích" — thêm tiêu chí mềm mới cho `tim_nha` thì thêm dấu lệch ở đây. Chưa thử Zalo thật.
> **Một khối ưu tiên mỗi lượt + lượt không cần câu hỏi (SRS-5.1zzzzzzz178, 25/10/2026):** các khối "ƯU TIÊN LƯỢT NÀY" không xếp chồng — `engine` chọn MỘT theo thứ tự cần người > pháp lý > ngoài việc > hỏi về (phí / uy tín / link / tình hình / định giá), có khối ưu tiên thì không thêm khối khen theo lượt và nối `prompts.KHOI_MOT_UU_TIEN`; thêm khối ưu tiên mới thì đặt vào chuỗi `or` đó, đừng `system +=` rời. Hỏi gộp cụm đã gỡ hẳn khỏi prompt (hỏi sau đăng mỗi lượt MỘT ô, `_sau_da_hoi` ghi `sau:<ô>`); độ dài "cả lượt ≤ ~40 từ, mỗi đoạn ≤ ~20", bỏ "25–40 từ". Lượt ĐƯỢC không hỏi khi khách hẹn gửi sau / bot vừa trả lời câu khách hỏi / khối ưu tiên bảo không hỏi — đừng thêm lưới "lời phải có câu hỏi". Chưa thử Zalo thật.
> **Rổ mẫu `seed_thu` và lịch dọn dữ liệu thử (SRS-5.1zzzzzzz179 mục 1, 25/10/2026):** `don_du_lieu_thu()` (lịch 14:00 UTC) từng xoá 242 tin mẫu vì người bán `thu-seed-001` khớp `la_id_thu` — nay hàm bỏ qua tin `source = 'seed_thu'` và người bán giữ chúng (`20261025f`); đây là "nguyên nhân chưa biết" ở SRS-167. Thêm bảng tạm / đường xoá dữ liệu thử mới thì loại `seed_thu` ở đó; xoá rổ mẫu có chủ ý thì `reset_nguoi_test('thu-seed-001')` tay. **Tiện ích quanh căn (mục 2):** `tim_nha` nhận `p_tien_ich` (5 loại cùng `geocode.ts`: truong_hoc / benh_vien / cho / sieu_thi / cong_vien, `mua.TIEN_ICH_LOAI`), ô `buyer_lead.tien_ich_mong_muon`; căn không có `tien_ich_gan` hoặc loại đó > 1 km → dòng căn "CHƯA RÕ có gần … không", bot KHÔNG được nói "gần". **Thuế phí theo căn (mục 3):** `phap_ly.khoi_phi_theo_can` nhân tỷ lệ với `price_vnd` của căn bot vừa dán link (`engine._can_dang_noi`), biểu công chứng TT 257/2016 AI soạn chưa duyệt — luôn "tham khảo". **Giá/m² + chính chủ (mục 4):** `mua.gia_moi_m2`, cờ `chinh_chu` từ `tim_nha`. **Số trong lời bot phía mua (mục 5):** `engine._so_khong_co_trong_can` — số kèm đơn vị phải có trong dòng căn / lời khách / khối số tính sẵn (sai số 5 %), lệch thì gọi lại model một lần; thêm khối số code tính cho model thì mở đầu bằng "SỐ TÍNH THEO CĂN" hoặc đưa dấu mốc vào hàm đó. Chưa thử Zalo thật.
> **Câu chuẩn 16 dòng trong phần cache + dọn hàm DB mồ côi (SRS-5.1zzzzzzz180, 25/10/2026):** `cau_chuan_mau` lấy `CAU_CHUAN_TOI_DA = 16` dòng, câu sửa tay trước câu chỉ chấm; `engine._ghep_cau_chuan` chèn khối TRƯỚC `RANH_GIOI_CACHE` — thêm khối cố định mới cho model thì cũng chèn trước dấu, đừng `+=` cuối. 84 dòng "[Claude chấm sơ bộ]" cố ý `dung_lam_mau = false`. Đã gỡ (`20261025h`): `tim_phuong_theo_nghia`, `tim_du_an_theo_nghia`, `tim_tin_theo_nghia`, `tin_gan_moc`, `moc_khop`, `ensure_*_conversation`, trigger + hàm `bao_tin_moi_khop` — vector Gemini đi qua `tim_dia_danh_theo_nghia` (5 bảng, đều đã nhúng đủ) và `tim_nha(p_vec)`; muốn tìm theo nghĩa thì gọi hai hàm đó, đừng dựng lại hàm từng bảng. Kho dự án 2.362 dòng hiện chỉ phía BÁN dùng (`project_for(conv.prop)`), khách mua hỏi dự án chưa tra.
> **Phía mua tra kho dự án (SRS-5.1zzzzzzz184, chủ dự án 25/10/2026: "cho bot phía mua tra kho dự án đi"):** AI đọc `mua.hoi_du_an` (tên dự án khách hỏi, phải nằm nguyên trong tin khách), `supabase_store.tra_du_an` tra `projects` + `du_an_kien_thuc` (chỉ đọc), `du_an_mua.khoi_du_an` đưa khối "DỰ ÁN TRONG KHO" cho model — thay câu "khách mua hỏi dự án chưa tra" ở ghi chú SRS-180. Luật: chỉ nói dữ kiện trong khối, thiếu / dòng ⚠ thì nói thật chưa có, không đưa link mogi, không bình luận giá; số trong lời bot soát bằng `_so_khong_co_trong_can`. Lời dặn trong khối KHÔNG chứa chữ số (số hợp lệ giả). Chưa thử Zalo thật.
> **Tin báo căn mới xoay 4 kiểu văn phong (SRS-5.1zzzzzzz188, chủ dự án 26/10/2026: "tin thứ 2 thì phải khác chứ"):** `bao_can_moi.chay_mot_luot` chọn kiểu = số tin báo đã gửi cho khách trong 30 ngày % `SO_KIEU` (4) → câu mẫu `bao_can_moi` / `_2` / `_3` / `_4` (và `_vuot…`), chữ mở "vì sao hợp" đổi theo kiểu; thêm kiểu mới thì thêm khoá ở `MAC_DINH` + migration `*_cau_mau_*` + tăng `SO_KIEU`. Các tin nhắc cố định khác (`nhac_hoi_lai`, `nhac_xin_anh`) CHƯA xoay. Chưa thử Zalo thật.
> **GỠ lệnh `$$$$$`, chế độ test và lệnh `json` (SRS-5.1zzzzzzz195, chủ dự án 26/10/2026: "làm y hệt đi, xóa $$$$$ và json", "bên kia ra sao mình trả như vậy"):** gõ `$$$$$` / `json` trên Zalo nay chỉ là tin thường (như bên anh Luận); công cụ test chỉ còn `cli.py` (`/state` theo facet, dòng chi phí `$extract` / `$chat` in TRƯỚC lời bot). Muốn xoá phiên một tài khoản thử: `POST /reset/<id>` của lõi hoặc `reset_nguoi_test` — Zalo không còn lệnh xoá. GIỮ tiền tố `$$$$$ ` của tin nội bộ gửi CTV / admin (SRS-134) và cột `conversations.che_do_test` (không còn bật). **Mọi đoạn bên dưới / ở §7 nói `$$$$$` là lệnh làm mới / chế độ test / tin phụ debug, hay lệnh `json` / `/json`, là LỊCH SỬ.** Chưa thử Zalo thật.
> **`cli.py /state` theo facet + gỡ luật cấm khen chung chung (SRS-5.1zzzzzzz194, chủ dự án 26/10/2026: "xóa mấy cấm để giống bên AOND đi"):** `/state` gom ô theo facet (`schema.FACETS` / `Property.by_facet()`, chỉ hiển thị) kèm "đủ để RAO ✓" và dòng chi phí mỗi lượt; luật hỏi / ra bản nháp VẪN theo `CORE_FIELDS` / `CUM_HOI` (mô hình facet của anh Luận 68129e4 chưa port). `LUAT_KHEN` không còn cấm "vị trí đẹp / rất phù hợp / rất thuận tiện / an tâm" (thay quyết định 19/10 SRS-75); GIỮ cấm bịa số liệu thị trường, bình giá, bịa chi tiết khách chưa nói. Chưa thử model thật.
> **Bot đáp vào ý nghĩa điều khách vừa nói (SRS-5.1zzzzzzz193, chủ dự án 26/10/2026: "tôi cần nó trả lời tương tác với người ta"; chọn phương án A: chỉ sửa prompt, giữ Haiku):** `LUAT_KHEN` có bước "ĐÁP VÀO Ý NGHĨA" — lời khách có hệ quả rõ (đang có hợp đồng thuê → dòng tiền ngay; sổ riêng → giao dịch nhanh) thì nói MỘT câu hệ quả, được nhắc MỘT chi tiết then chốt, cấm kèm số / lợi suất / nhận định thị trường; `LUAT_MO_LUOT` và luật "cấm nhại lại" có ngoại lệ tương ứng. Gốc: luật CẤM xếp chồng triệt luôn hành vi mong muốn; so với anh Luận prompt chat của mình ~3.500 từ, của anh ~770 từ và chat bằng Sonnet-4-6 (theo ảnh 26/10). Chưa thử model thật, chưa đo lại — đo bằng trang chat thử / `ban-thu-ban` sau triển khai; nếu vẫn khô thì xét rút gọn prompt (CONVERSATION_POLICY ~2.000 từ) trước khi xét đổi model.
> **Lệnh gõ tay trên Zalo (SRS-5.1zzzzzzz211, chủ dự án 26/10/2026: "/quit … dùng nó để reset xóa dữ liệu"; "trên zalo cũng bấm dc mấy cái này"):** `src/aioi/lenh_zalo.py` — chữ đầu của tin đúng tên lệnh mới tính. `/quit` xoá sạch phiên người gõ, im lặng, giữ `so_nhan`; `/state` `/listings` `/whoami` trả tin debug `$$$$$ `; `/import <link>`, `/project <mô tả>`, `/link <url>` như `cli.py`; `/seller` không dùng trên Zalo. `server.chat_reply` chạy lệnh TRƯỚC model và trả về trước mọi đường ghi lịch sử / CRM — thêm lệnh mới thì thêm vào `TEN_LENH` + `chay`, đừng để lời lệnh lọt vào `conv.history`. Thay câu "Zalo không còn lệnh xoá" của SRS-195; `$$$$$` / `json` vẫn là tin thường. Chưa thử Zalo thật.
> **Câu ghi nhận MỘT lần mỗi cuộc chat (SRS-5.1zzzzzzz229, chủ dự án 27/10/2026: "đừng trùng 3 4 câu em ghi nhận 1 lần là dc") — THAY "bỏ hẳn" của SRS-131 / 208 / 214:** `engine._co_cau_ghi_nhan` soi mọi câu (bỏ chữ nối "Vậy / Ok…"), gọi lại chỉ khi lượt trước đã có một câu ghi nhận. Phía bán, lời bot "em gửi ảnh" cho chủ nhà là ngược vai → gọi lại (`_bot_hua_gui_anh`). Khẳng định thị trường / đoán ý người mua: chủ dự án "để đó, ổn" — đừng đặt lại luật cấm.
> **Khen hay + đỡ lặp (SRS-5.1zzzzzzz228, chủ dự án 27/10/2026: "làm cả a b c"):** `GIONG_VUI` không còn câu minh hoạ hoàn chỉnh (model chép), khen = MỘT lợi ích cụ thể, minh hoạ chỉ là cặp ý — đừng thêm lại câu ví dụ; dòng "Kho hẻm" chỉ vào lượt hệ thống hỏi phường; phường hỏi tối đa 2 lần rồi báo admin; "anh ơi" hai lượt liền gọi lại; bản gọi lại còn lệch luật cứng (`_ly_do_cung`: Dạ / "mình" / phí) thì gọi thêm một lần. Thêm luật cứng mới thì thêm vào `_ly_do_cung`.
> **Con số phí do lưới kiểm (SRS-5.1zzzzzzz227, 27/10/2026):** mức phí % trong lời bot phía bán phải bằng `prompts.muc_phi(vai, thuê)` (`engine._phi_lech_vai` trong `_soat_hinh_thuc`) — vai chưa rõ thì nêu cả 1% và 0,5% hoặc hỏi vai, không đoán. Đổi chính sách phí thì đổi ở `muc_phi`, lưới theo luôn.
> **Chữ cố định theo cùng luật lời bot (SRS-5.1zzzzzzz226, 27/10/2026):** luật "không gọi khách là mình" một nguồn `xung_ho.goi_khach_la_minh` — lưới lời model, câu mẫu (`MAC_DINH` + câu sửa tay ở CRM: vi phạm thì `cau()` dùng mặc định) và gợi ý câu hỏi `NATURAL_QUESTIONS` cùng qua nó (`tests/test_cau_mau_khong_goi_minh.py`). Thêm câu mẫu / gợi ý / câu code ghép gửi khách thì gọi khách bằng `{goi}`, đừng "mình". Kịch bản mẫu SRD anh Luận: e2e `tests/test_kich_ban_srd_aond.py`, bắn thử ô `ban-thu-srd` (SRS-225).
> **Toạ độ tin lấy từ điển `duong` trước (SRS-5.1zzzzzzz224, 27/10/2026):** `geocode-listings` tra `duong` (tên đường + phường mới) trước Nominatim — Nominatim chưa biết tên phường mới nên tin rơi về tâm phường; `tim_moc` ghi tỉnh khi dòng đường không có phường (Tây Ninh / Đồng Nai lưu `phuong = ''`) và xếp TP.HCM trước. Thêm nguồn toạ độ mới thì đặt SAU từ điển, đừng trước.
> **Dấu 📋 do code giữ (SRS-5.1zzzzzzz222, ban-thu-ban 27/10):** bản tin cập nhật model viết "… Bản tin cập nhật:" thiếu 📋 thì `engine._gan_dau_ban_tin` gắn lại (đầu `_soat_hinh_thuc` + bản gọi lại), cùng cách dòng mở bản nháp đầu (`cat_truoc_mo_dau`). Đổi prompt quanh bản tin thì giữ dòng mở là dòng RIÊNG có 📋 — mọi bước nhận bản tin (bản khách duyệt, lưới số, tiêu đề) dựa vào dấu này.
> **Link web một nguồn + phường mới + bản đồ trùng chỗ (SRS-5.1zzzzzzz220/221, chủ dự án 27/10/2026: "sao không thấy trên tin ko thấy trên biểu đồ", "9 căn mà zoom vào có 1 căn"):** mọi link / tên miền bot nói lấy từ `src/aioi/web.py` (`SITE_URL` = env `AIOI_SITE_URL`, `link_tin(mã)`) — `aioinhadat.com` chưa trỏ về web, ĐỪNG viết tay tên miền vào prompt / câu mẫu (câu mẫu dùng `{web}`); đổi tên miền thì đặt env trên VPS. Báo đăng tin MỘT lần (`_da_bao_dang`, gỡ khi có bản tin 📋 mới). Phường cũ về đúng một phường mới → `TraDiaDanh.phuong_cu_moi`, khối địa danh + lưới bản tin đòi tên mới; ô `phuong` vẫn là lời khách. "<gọi> ạ" hai lượt liền → gọi lại (`_goi_a`). Bản đồ: `cumGhim` gom tới zoom 22, cụm trùng chỗ (toạ độ cấp đường) bấm ra danh sách `popupNhieuCan`; `tim_moc` tìm cả `duong` (đường / hẻm kèm phường). Chưa thử Zalo thật.
> **Giọng phía bán một khối (SRS-5.1zzzzzzz219, chủ dự án 27/10/2026: "sửa cho nó thành vui vẻ, tự nhiên, nhanh nhạy, thêm cảm thán… dãn câu mẫu ra thành prompt cụ thể"):** `prompts.GIONG_VUI` là CHỖ DUY NHẤT dặn giọng (môi giới trẻ hào hứng, cảm thán khi điều khách nói thật sự tốt, gọi căn bằng tên đường + nhắc một chi tiết khách vừa kể, mỗi lượt một vẻ), đứng trước dấu cache ở `build_chat_system` và `build_fee_followup_system` — đổi giọng thì sửa khối này, đừng thêm gạch giọng rời vào GHI CHÚ NGHIỆP VỤ hay từng prompt; minh hoạ chỉ là lời ĐÁP, không câu hỏi (SRS-196). Lượt có 📋: `_soat_hinh_thuc` soát phần chat quanh bản tin (`_phan_chat_quanh_ban_tin` — câu dẫn + câu chốt đứng sau câu mời Zalo) bằng hai lưới lặp cũ; prompt sửa tin dặn câu dẫn đáp ý khách, câu chữ làm tươi, câu chốt đổi mỗi lần. Ba chỗ máy móc ở chat anh Luận KHÔNG do câu mẫu (câu mẫu `hoi_ban_nhap` chỉ cho bản nháp đầu). Phía mua và lời đọc ảnh chưa nối khối giọng. Chưa thử model thật.
> **Bản tin sửa theo ý chủ nhà (SRS-5.1zzzzzzz218, chủ dự án 27/10/2026: "làm hết A đến E đi… sửa các gốc vấn đề là vì sao nó lại chat như thế"; chat anh Luận 26/10):** lời khách dặn CÁCH VIẾT bản tin (nhấn / bớt / icon / không lặp) là ô planner `yeu_cau_viet` (cụm trích trong tin khách) → sổ `_yeu_cau_viet` theo căn (khoá `_`, `Engine._nho_yeu_cau_viet`) → khối `prompts.khoi_yeu_cau_viet` sau dấu cache ở MỌI prompt soạn tin — lời dặn mới thì đừng nhét vào ô tin hay ví dụ, thêm vào đường này. `_soat_hinh_thuc`: khách vừa dặn mà không có 📋 hoặc bản 📋 giống bản trước ≥ 0,92 (`_do_giong_ban_tin`) → gọi lại; bản tin phía BÁN nay bị soát số như phía mua (`_so_khong_co_trong_tin`: số kèm đơn vị phải có ở ô tin / lời khách, KHÔNG cộng tích ngang × dài — "41,6m²" = 5,2 × 8 là lỗi cần bắt). Giá trị ô kết "?" hoặc bằng nguyên cả tin khách ≥ 10 từ bị bỏ (`_gia_tri_la_cau`); `thoi_gian_ban_giao` gộp vào `tinh_trang_ban_giao` cho loại có ô đó (`_gop_y`). Icon: mặc định 2–3, chủ nhà xin thì theo, tối đa 6. Bot KHÔNG tự học qua chat — đổi hành vi chỉ qua câu chuẩn / câu mẫu / code. Chưa thử model thật.
> **Bản đồ gom cụm + địa danh (SRS-5.1zzzzzzz217, chủ dự án 27/10/2026: "làm cho cái bản đồ nó nhảy như vầy nè", ảnh hifriendz.com):** `lib/cum-ghim.ts` (gói `supercluster` 8.0.1, ghim HTML của mình) — bong bóng "N căn" bấm thì `easeTo` tới zoom tách cụm; dùng ở `/ban-do` và `MapView`; thêm lớp cần gom thì gọi `cumGhim`, đừng viết vòng Marker rời. Ô "Quanh địa danh" → rpc `tim_moc` (`tien_ich` + `projects`, chỉ tên / loại / toạ độ, mở anon) → ghim có tên + `flyTo` 15, URL `?moc=` ghi cùng `?khung=` qua `ghiUrl`. Không chép code trang tham khảo. Kiểm bằng chụp bản build thật (không có bài tự động).
> **Bốn lời hứa đã nối (SRS-5.1zzzzzzz216, chủ dự án 27/10/2026: "sửa 1, 2 không cần sửa, 3 làm đi, làm 4 đi … lõi python tự gửi. 5 làm đi"):** (1) nhắc `followup` / `sold` / `feedback` do trigger DB tạo (từ 18/10 gỡ `nudge` KHÔNG ai gửi) nay do LÕI gửi — `src/aioi/gui_nhac.py`, vòng `server._vong_gui_nhac` mỗi 60 s (tắt `GUI_NHAC=tat`), câu mẫu `bao_tra_loi_chu_nha` / `bao_lich_da_chot` / `bao_can_da_ban` / `hoi_cam_nhan_sau_xem` điền từ cột thật, 8–20 giờ, hụt 5 lần → `dead`; đừng ghi `noi_dung_gui` khi còn pending (escalation-feed cũng kéo dòng đó → gửi đúp); thêm loại nhắc cho khách thì thêm vào `KIND_LOI` + `soan_tin`, đừng mở đường gửi thứ hai. (3) khối "ĐIỂM TIN" (`prompts.khoi_diem_tin`, sau dấu cache) đưa điểm / hạng / ô thiếu THẬT cho model phía bán — "lên Top hiển thị" trên web vẫn CHƯA có. (4) bridge `human_note` nay lõi đọc: lời admin vào lịch sử + CRM sender `human`, `Conversation.nhuong_san_den` (SQLite) = 30 phút bot im; ô gửi tin ở /admin/tin-nhan → RPC `admin_gui_tin` → nhắc `admin_reply` (chữ ở `note`) → cùng vòng (1) gửi; phép soát DB 8 bỏ `admin_reply`. (5) file > 20 MB đi đường `can_nguoi_that` (tin 🙋 cho admin) thay vì `admin_escalations` bộ nhớ. Bỏ lời hứa không có đường: `KHOI_DINH_GIA` ("chuyên viên sẽ xem … báo lại"), `chua_co_ban_ve` ("xin bên dự án"). Tên miền `aioinhadat.com` trong câu mẫu / prompt là trang đỗ Namecheap — chủ dự án: "2 không cần sửa". Chưa thử Zalo thật.
> **Ví dụ câu chuẩn phải hợp luật đang áp (SRS-5.1zzzzzzz215, chủ dự án 27/10/2026: "con của mình cứ em ghi nhận hoài", "thả lỏng ra, ai ghi câu mẫu ghi nhận đâu"):** nguồn "ghi nhận" là bảng `cau_chuan` (67/376 dòng tester sửa 21/10 mở bằng "Em ghi rồi / Em nhận thông tin…") đưa vào prompt làm ví dụ — `prompts.mau_cau_chuan_hop_le` lọc ví dụ mở bằng ghi nhận / "Dạ" / "đã đăng" (regex `MO_DAU_GHI_NHAN_RE` một nguồn với lưới `_mo_dau_ghi_nhan`), "Câu bot cũ" chỉ in khi có điểm. Đổi luật hình thức thì đổi bộ lọc này, đừng sửa tay dữ liệu CRM. Phường cũ bị chia → ô hỏi lượt đó LÀ phường (một lần, `_phuong_chia_da_hoi`), không để dòng hỏi và khối địa danh kéo hai hướng. Lời dặn viết THUẬN, không cấm kèm ví dụ ("Không mở bằng \"Em ghi nhận…\"" là nhắc mẫu cho model); dòng xưng hô cứng của anh Luận nhường khối xưng hô theo lượt. Chưa thử model thật.
> **Xưng hô theo tên trợ lý + gợi căn cần đủ hai ô (SRS-5.1zzzzzzz214, chủ dự án 27/10/2026: "hạng giữ lại, người ta xưng em thì mình xưng anh hoặc chị tùy tên, xưng cháu thì cô hoặc chú, 3 ừ"):** một nguồn `src/aioi/xung_ho.py` (`goi_toi(pronoun, ten)`; giới tính tên ở `TEN_NU` / `TEN_NAM` là [giả định BA], chủ dự án chỉnh ở đó) — khách xưng "em" → bot xưng anh / chị theo tên, khách TỰ XƯNG "cháu" / "con" (`xung_ho = chau`, cần cụm trích) → cô / chú; bot KHÔNG xưng "mình" với ai nữa (thay SRS-86 / 171); câu mẫu biến thể `_em` dùng `{goi}` + `{toi}` / `{Toi}` (migration `20261027a`), đừng viết tay "mình" hay bảng anh / chị ở chỗ khác. `mua.co_tieu_chi` = khu vực VÀ ngân sách (thay "hoặc" của SRS-146) — khách mới nói khu vực thì hỏi ngân sách trước khi gợi căn. Lưới `_mo_dau_ghi_nhan` bắt mọi "<bot> (đã) ghi …" (ảnh chat 27/10 "Em đã ghi giá 6,2 tỷ…" lọt vì liệt kê cụm); `build_chat_system` CHO khen giá định tính một câu khi khách vừa nêu giá (không số liệu thị trường) — khách HỎI cao / thấp thì `KHOI_DINH_GIA` vẫn quyết. Hạng Đồng/Bạc/Vàng trong prompt: GIỮ (chủ dự án). Chưa thử model thật. **Cổng web hỏi phường báo admin MỘT lần mỗi căn** (cờ `_phuong_bao_admin` ở ô tin — bản SRS-213 kiểm bằng `y_luot` nên bắn 15 tin 🙋 trong 10 phút với anh Luận 27/10; mọi cờ "đã báo / đã hỏi" phải nằm ở chỗ nhớ qua lượt, không ở `y_luot`); phép soát DB 8 không đếm tin nội bộ gắn `seller_id` (`20261027b`). **Khách không chọn phường mới → ghi tạm CẢ HAI** (chủ dự án 27/10 "lưu cả 2 luôn"): hỏi một lần, lượt sau kho có 2–4 ứng viên (`_ung_vien_phuong`) thì ô `phuong` = "Phường A / Phường B" + cờ `_phuong_he_thong`, cột `ward` lấy phường đầu tra được (`ward_source = suy_doan`), thôi hỏi, không báo admin — ngoại lệ có chủ đích của SRS-73; không có ứng viên mới đi đường báo admin.
> **Cache chỉ ghi khối ổn định (SRS-5.1zzzzzzz213, chủ dự án 26/10/2026: "sửa luôn cache đi"):** `ClaudeProvider._sys` đặt điểm cache CHỈ ở phần trước `RANH_GIOI_CACHE`; đuôi đổi mỗi lượt gửi trần (ghi cache 1,25× mà không ai đọc lại). Prompt bản nháp / sau duyệt nay cũng có dấu — dựng prompt mới thì đặt dấu sau phần cố định, dữ liệu khách sau dấu. Đo bằng dòng `💲` trong `doc-log-loi` (cache_w / cache_r từng lần gọi). **Khách ảo có cảm xúc:** ô `ban-thu-khach-ao` (`bot/tests/khach-ao.py`) — 5 persona do Haiku đóng vai, giám khảo chấm + trích lỗi kèm đoán nguồn; tiền thật, tự dọn `thu-ka-`. Lượt 26/10 (run 40377269267) lỗi nặng nhất là LẶP (1,4/5): gỡ gói luật giọng ở SRS-207 làm mất lưới `_cung_mo_dau` — nay đặt lại + `_cau_lap_luot_truoc`; đổi giọng thì ĐỪNG gỡ hai lưới hình thức này. Vai người rao (`seller_role`) chỉ nhận khi `seller_role_trich_dan` GỌI TÊN vai và có trong lời khách (`_vai_co_bang_chung`) — phí theo vai đoán là báo sai tiền. Cổng web hỏi phường cũng đếm lờ, lần 3 báo admin qua `can_nguoi_that`. Còn treo chủ dự án quyết (SRS-213 mục 5): câu "hạng Đồng/Bạc/Vàng", "≥10 căn lên Top" trong `BUSINESS_CONTEXT` / `FEE_VALUE_POINTS` (web đã ẩn hạng 27/08); xưng "mình" khi khách xưng em; gợi căn khi mới có khu vực.
> **Bắn thử 5 khách + câu hỏi không dẫn dắt (SRS-5.1zzzzzzz212, chủ dự án 26/10/2026: "kiểm tra gốc vì sao lại có lỗi trước khi fix … sửa hết đi"):** ô bot THẬT SỰ hỏi do lượt AI đọc (`bot_vua_hoi`) và cộng vào sổ lờ — sổ cũ chỉ ghi ô hệ thống chọn nên model hỏi lệch ô thì ô đó bị hỏi lại như mới; khối phí / uy tín / định giá có ở CẢ nhánh mua (`khoi_hoi_ve_mua`) — thêm khối "hỏi về" mới thì nối cả hai nhánh; lượt duyệt không hỏi "biết phí chưa" khi đã báo phí (`_phi_da_bao`); khối căn phía mua KHÔNG dặn hứa "hỏi chủ nhà rồi báo lại" khi chưa ghi việc; xưng hô nhận chữ tắt e / a / c và "gọi bot là con / cháu"; tin chờ phường chỉ kể phường kho tra được (`_goi_y_phuong`), đã hỏi thì hỏi số nhà / gần đâu. Câu mẫu `hoi_ban_nhap` không còn "hấp dẫn chưa"; câu hỏi nhu cầu người mua là câu MỞ — đừng thêm lại ví dụ Có/Không hay gợi sẵn đáp án vào prompt. Công cụ: ô `ban-thu-5-khach`. Chưa bắn lại model thật.
> **Hai số Zalo: ký gửi + tư vấn người mua (SRS-5.1zzzzzzz210, chủ dự án 26/10/2026: "số hiện tại làm số ký gửi, nhắn nhầm vẫn trả lời, tin nội bộ và nhắc người bán vẫn đi từ số hiện tại", "đặt trên VPS"):** một lõi, hai bridge — `SO_NHAN=tu_van` (`nhadat-bridge-tu-van.service`, phiên `zalo-session-tu-van.json`, QR 8788, `/send` 5006, dòng `bridge_dang_nhap` id = 2, nhịp tim `bridge-zca-tu-van`). Lõi giữ `Conversation.so_nhan`: lượt mơ hồ ở số tư vấn vào vai mua + lời chào `chao_tu_van`; tin chủ động cho khách đi đúng số khách đang nhắn; `escalation-feed` không giao việc cho số tư vấn. **Triển khai `escalation-feed` + migration `20261026e` TRƯỚC `cai-vps`** (feed cũ ghi QR số tư vấn đè dòng id = 1). Thêm chỗ giữ trạng thái bridge mới thì tách theo `so_nhan`. Chưa kiểm: mã Zalo của một người có trùng giữa hai acc không; chưa thử Zalo thật.
> **Sửa năm lỗi bắn thử trên giọng mới (SRS-5.1zzzzzzz208, chủ dự án 26/10/2026: "mấy cái này mới lỗi thôi… bình giá chấp nhận được, khoe khan hiếm chấp nhận dc"):** câu ghi nhận bị gọi lại cả ở lượt có 📋 (`_mo_dau_ghi_nhan` thêm "ghi thêm / lưu / lên thông tin"); ô sàn khách lờ một lần thì `_o_hoi_ke` lùi xuống cuối (hết hỏi giá cách lượt); bản tin có tiện ích quanh nhà / tình trạng nhà khách không nói, hoặc in tên khối "Gạch đầu dòng:", thì `_soat_hinh_thuc` gọi lại model. **Bình giá và khoe khan hiếm trong tin rao: chủ dự án chấp nhận — đừng chặn.** Chưa thử model thật.
> **Giọng phía bán = nguyên bản anh Luận (SRS-5.1zzzzzzz207, chủ dự án 26/10/2026: "lấy 100% của bên aond… cái nào cần gỡ bớt cho tự do thì gỡ, nhưng phần bóc tách… thì ko lấy"):** `build_chat_system` theo khuôn `luan8560/AOND` 207a145 (~30 từ, khen điểm mạnh trước rồi hỏi 1 ý, xưng em gọi anh/chị) + khối "GHI CHÚ NGHIỆP VỤ"; `AD_FORMAT` nguyên văn anh Luận (tiêu đề 15–25 từ) + một đoạn chống bịa. ĐÃ GỠ `LUAT_KHEN`, `LUAT_MO_LUOT`, `LUAT_TACH_Y`, `CONVERSATION_POLICY`, khối "LƯỢT THÔNG TIN THỨ N", lưới "cùng mở đầu", ví dụ mẫu bản nháp — **mọi ghi chú bên dưới về luật khen (SRS-75/119/124/131/178/193/194/198), tách hai đoạn, 25–40 / ~40 từ, tiêu đề 20–25 từ (SRS-190/192) là LỊCH SỬ.** Đổi giọng thì sửa trong khuôn đó, ĐỪNG thêm lại luật giọng chồng lên (lớp lỗi của SRS-207). Giữ: bóc tách, câu mẫu CRM, chống bịa, cấm mở "Dạ" + cấm gọi khách "mình" (chờ chủ dự án nói có gỡ). Chưa thử model thật.
> **Bản đồ web MapLibre + OpenFreeMap, tìm theo khung (SRS-5.1zzzzzzz206, chủ dự án 26/10/2026: "giữ OpenStreetMap, làm tìm theo khung + lớp dự án đường đi" → chọn "Đổi sang MapLibre + OpenFreeMap"):** Leaflet đã gỡ; `maplibre-gl` GHIM `6.13.0`; phần chung ở `lib/ban-do.ts` (nền OpenFreeMap sáng / tối + vệ tinh Esri — điều khoản Esri CHƯA kiểm). **Nạp thư viện qua `napMapLibre()`, đừng `import("maplibre-gl")` trần**: MapLibre 6 tìm worker qua `import.meta.url`, Next đóng gói không mang theo → bản đồ trống mà `tsc` / build vẫn xanh. `/ban-do` tĩnh, trình duyệt gọi rpc `ban_do_khung` (mỗi lớp ≤ 300, lớp đường chỉ khi khung ≤ 0,08° — cùng ngưỡng ở hàm DB và `BanDoKhung`, đổi thì đổi cả hai; chỉ mục `duong_ban_do`). Sửa bản đồ thì chụp bản build thật — không có bài kiểm tự động.
> **Lấy nốt từ anh Luận (SRS-5.1zzzzzzz205, chủ dự án 26/10/2026: "lấy lời hứa… làm theo anh Luận. Ô tự do uu_the lấy lun") — THAY phần "kiểu lời do code chọn" của SRS-203 ngay dưới:** `AD_FORMAT` quay lại câu mẫu + luật "mỗi tin một vẻ" như anh Luận (KHÔNG còn `KIEU_LOI_TIN_RAO`); lời chốt khi hết ô cần hỏi HỨA "liên hệ lại khi có khách quan tâm" (chưa kiểm hệ thống có thật sự nhắn người bán — đừng thêm lời hứa khác khi chưa có đường gửi); ô tự do `uu_the` (mảng cụm ngắn khách tự nói, cộng dồn, chỉ giữ cụm nằm nguyên trong lời khách qua `Engine._loc_uu_the`, không phải ô hỏi, không chặn bản nháp). Chưa đo model thật.
> **Lượt trình bản nháp phải ra bản tin (SRS-5.1zzzzzzz204, bắn thử 26/10: Âu Cơ 8 lượt không có bản tin vì `listing_proposed` bật trước khi biết model có gửi bản tin):** `Engine.handle` gọi lại model MỘT lần khi lượt `trinh_nhap` không phải bản tin (`_la_ban_nhap`) hoặc thiếu chữ "Zalo"; vẫn không ra thì `listing_proposed = False` để lượt sau trình lại. Lượt BẢN SỬA chưa có lưới này. `AD_FORMAT` cấm gọi người đọc là "bạn". Chưa đo model thật.
> **Kiểu lời mỗi tin rao do CODE chọn + pháp lý không mất (SRS-5.1zzzzzzz203, chủ dự án 26/10/2026: "làm cả hai đi"):** `prompts.KIEU_LOI_TIN_RAO` (5 kiểu mở mô tả + hướng câu mời nhắn Zalo) chọn theo băm địa chỉ của căn (không theo giá) và chèn ngay sau `AD_FORMAT`; `AD_FORMAT` KHÔNG còn câu mẫu hoàn chỉnh — thêm câu mẫu vào là model chép lại (cùng lớp SRS-196). Ô pháp lý bị đè thì ý cũ cất ở `_phap_ly_cu`, cột `legal_status` lấy mã đầu tiên đọc được trong `Property.phap_ly_da_noi()`. Chưa đo model thật.
> **Ngưỡng soạn bài hai tầng (SRS-5.1zzzzzzz202, chủ dự án 26/10/2026: "sửa đi" theo anh Luận ce11491) — THAY phần "cổng = sàn tối thiểu" của SRS-200 ngay dưới:** `can_publish` (loại hình + vị trí + giá) chỉ là sàn; `summary_ready` (tự SOẠN bài) = sàn VÀ còn ≤ 1 facet chính trống trong `FACET_CHINH` (vị thế · đất · công trình · pháp lý, `Property.facet_trong`); chưa đủ thì hỏi MỖI facet trống MỘT ô. Khách bảo đăng sớm vẫn chỉ cần sàn. Đừng thêm facet vào `FACET_CHINH` hay nâng `FACET_TRONG_TOI_DA` khi chưa đo số lượt tới bản nháp. `AD_FORMAT` cấm khoe khan hiếm / chép lời khen của bot vào tin (SRS-202 mục 3). Chưa thử model thật.
> **Cổng "đủ rao" theo anh Luận (SRS-5.1zzzzzzz200, chủ dự án 26/10/2026: "đổi cách quyết 'đủ rao chưa' thành loại hình + vị trí + giá của anh Luận luôn, đừng có nhắn trùng thế"):** `Property.minimal_missing()` = loại hình + vị trí (`dia_chi` / `duong` / `du_an`) + `gia`; `summary_ready` / `thieu_toi_thieu` / cổng khách bảo đăng đều theo nó, công thức 75 % và ô bắt buộc theo loại (phường, hai diện tích, kết cấu) KHÔNG còn chặn bản nháp (thay SRS-79 / 52 / 76 phần cổng). Ra bản nháp đầu thì ô còn thiếu thành `hoan` — hỏi SAU khi duyệt, mỗi lượt một ô, mỗi facet (`FACETS`) một câu (`_facet_da_co`); ô vừa hỏi mà khách chưa trả lời thì lượt sau ĐỔI cách hỏi (`hoi_lai`). `blocking_fields()` còn là điều kiện LÊN WEB, không còn cho bản nháp. Đừng thêm ô "bắt buộc" vào `minimal_missing`; muốn hỏi thêm thì thêm vào `CORE_FIELDS` / facet. Chưa thử model thật.
> **Tin rao giọng rao chợ, lấy từ anh Luận (SRS-5.1zzzzzzz201, chủ dự án 26/10/2026: "lấy bên anh Luận qua"):** `AD_FORMAT` có 4 khối — tiêu đề · mô tả giọng chợ (nói thẳng với đám đông) · gạch đầu dòng · CÂU MỜI CHỐT nhắn Zalo gắn FOMO — và luật "MỖI TIN MỘT VẺ": ví dụ trong prompt chỉ minh hoạ, cấm chép (cùng lớp SRS-196). Giữ của mình: tiêu đề 20–25 từ, không HOA toàn bộ / `**`, nội dung chỉ từ dữ liệu căn, FOMO chỉ là lời thúc chung. Thêm ví dụ vào `AD_FORMAT` thì phải giữ dòng "chỉ minh hoạ". Chưa đo bằng model thật.
> **Ô thu nhập thuê + một ô hiện trạng (SRS-5.1zzzzzzz197, chủ dự án 26/10/2026):** `thu_nhap_thue` (tiền thuê thu mỗi tháng, tin BÁN có hợp đồng thuê) hỏi SAU khi tin lên web, chỉ khi ô phân loại `co_hdt` = "co" (AI đọc nghĩa hiện trạng, `engine._O_PHAN_LOAI`, không dò từ khoá); `Property.update` gom `hien_trang_su_dung` về `tinh_trang_ban_giao` cho loại có ô đó (căn hộ giữ ô riêng), `_has` coi hai tên là một ý. Cột `listings.rent_income_vnd` CHƯA kiểm có đọc `thu_nhap_thue` không. Chưa thử model thật.
> **Giọng sôi nổi được phép (SRS-5.1zzzzzzz198, chủ dự án 26/10/2026):** `LUAT_KHEN` cho mở lượt bằng MỘT tiếng cảm thán ("Wow,", "Tuyệt vời!"…) khi điều khách nói thật sự tốt; VẪN cấm "đắc địa", bình giá, bịa số liệu thị trường và dự đoán người mua sẽ thích / quan tâm (trừ khi chủ dự án nói gỡ). Chưa thử model thật — đo xem có lạm dụng không.
> **Bot hỏi lại giá đã có (SRS-5.1zzzzzzz196, chat Bình Hưng 26/10: "sao lại mất dạng cái giá… phải trả lời lại"):** giá KHÔNG mất (DB `boc_tach.gia` còn nguyên, `gia` không nằm trong `missing_fields()`) — ví dụ quy tắc 5 của `build_chat_system` ghi sẵn câu hỏi "…mong muốn thu về giá bao nhiêu" sau lời "nhà mình đang ở" nên model chép theo. Nay ví dụ trong prompt chỉ có lời ĐÁP, câu hỏi chỉ lấy từ "Thông tin cần hỏi tiếp theo"; **đừng đặt câu hỏi của một ô cụ thể vào ví dụ trong prompt** (`tests/test_vi_du_khong_hoi_o_khac.py`), và đừng nhắc cụm "Thông tin cần hỏi tiếp theo" trong phần cố định trước `RANH_GIOI_CACHE`. Chưa bắn model thật.
> **Tiêu đề 20–25 từ, giọng vui (SRS-5.1zzzzzzz192, chủ dự án 26/10/2026: "cho 20-25 từ đi, chốt từ đây", "rao cho zui zui lên"):** `prompts.AD_FORMAT` — thay "tối đa 15 từ" của SRS-190: 20–25 từ khi dữ liệu đủ (ít dữ liệu thì ngắn, KHÔNG độn / bịa cho đủ), vẫn vị trí · diện tích · giá, 2–3 điểm mạnh từ dữ liệu, "chỉ <giá>", tối đa 2 biểu tượng (hợp loại ở cuối), được mở bằng lời mời ngắn ("Mời xem … 👋"); giọng VUI MÀ CHUYÊN NGHIỆP như môi giới lão luyện, không sến / "nè" / "nha" (chủ dự án: "vui mà hay kiểu 1 môi giới chuyên nghiệp"). Đổi con số này phải đổi cả `ban-thu-kb.sh` / `ban-thu-ban.sh` (đếm `wc -w`) và `engine._soat_hinh_thuc`. Chưa thử model thật.
> **Phường cũ đánh số bị chia về nhiều phường mới (SRS-5.1zzzzzzz191, chat anh Luận 26/10: "phường 6" Bình Thạnh → Bình Lợi Trung / Gia Định):** `dia_danh.khoi_dia_danh` báo model NGAY khi khách nói phường số mà phường đó bị chia (tra `phuong_cu` + `wards`, cần quận) và dặn kể hai lựa chọn, không hỏi trống; khách GỌI TÊN một phường mới ở ô `phuong` thì `SupabaseConversationStore._phuong_chia_da_chon` ghi phường đó dù `dia_chi` còn chữ "phường 6". Không đoán phường khi khách chưa chọn. Chưa thử Zalo thật.
> **Tiêu đề tin rao hấp dẫn hơn (SRS-5.1zzzzzzz190, chủ dự án 26/10/2026: "sửa lại tiêu đề cho hay hay vào"):** `prompts.AD_FORMAT` — vẫn vị trí · diện tích · giá, tối đa 15 từ, thêm MỘT điểm mạnh có trong dữ liệu + "chỉ <giá>" + MỘT biểu tượng cuối dòng (🏠 / 🏢 / 🌱, không tính vào 15 từ), viết thường, cấm chữ khoe ("hot", "giá sốc", "rẻ"…). Chỉ sửa prompt, chưa thử model thật. Đổi giọng tiêu đề thì sửa ở `AD_FORMAT` (test `test_tieu_de_hap_dan_vi_du_trong_prompt_tu_tuan_luat` bắt ví dụ trong prompt tự phạm luật).
> **`$$$$$` xoá cả hồ sơ người mua (SRS-5.1zzzzzzz189, chủ dự án 26/10/2026: "reset để chat lại mà nhu cầu mua vẫn lưu"):** `SupabaseConversationStore.reset` giờ xoá `interests` + `reminders` kind `match` của khách và đặt `buyers.preferences = {}` (bản cũ chỉ xoá phía `sellers` nên vòng `bao_can_moi` vẫn bắn theo nhu cầu cũ); giữ dòng `buyers` vì `viewings` / `info_requests` / `deals` trỏ vào, và những bảng đó KHÔNG bị `$$$$$` xoá. Thêm nơi giữ trạng thái khách mới thì thêm vào `reset`. Chưa thử Zalo thật.
> **Toạ độ từ điển đường (SRS-5.1zzzzzzz186, 25/10/2026):** `duong` đủ vector + `lat`/`lng` 100% dòng; mỗi dòng là MỘT điểm cấp đường (không phải số nhà). 19 dòng đường Tân Phú (Đồng Nai) nằm nhầm dưới Phường Tân Phú TP.HCM đã xoá (`20261025i`); `nap-duong.mjs` nay bỏ dòng cách tâm phường > 50 km. **Gốc (SRS-5.1zzzzzzz187, 26/10):** OSM có hai relation cùng tên (Phường Tân Phú / Long Bình TP.HCM ↔ Đồng Nai) mà `gomDuong` đếm đa giác theo TÊN nên phép chặn `soArea` không kêu; nay đếm theo `::id` và chọn relation gần tâm phường (`chonRelationGanTam`). Trùng tên ở xa mới bị lọc 50 km bắt, trùng gần (Long Bình, ~12 km) chỉ lộ khi đếm theo ID. Tây Ninh / Đồng Nai lưu `phuong = ''` nên không so được với tâm phường.
> **Tra dự án phía mua theo nghĩa (SRS-5.1zzzzzzz185, chủ dự án 25/10/2026: "vector hóa nó"):** `projects.nhung` đã nhúng đủ sẵn; `tra_du_an` khi chữ không ra thì gọi `TraDiaDanh.du_an_theo_nghia` (nhánh `du_an` của `tim_dia_danh_theo_nghia`). Kết quả vector chỉ là `gan` / `nhieu` để khách xác nhận, không bao giờ `ro`. Ngưỡng 0,55 / biên 0,04 chưa đo riêng cho tên dự án — đo bằng cách bắn thử trước khi tin. Chưa thử Zalo thật.
> **Tên trợ lý có chấm giữa, 13 tên (SRS-5.1zzzzzzz183, chủ dự án 25/10/2026: "Ph•ái L•ài Ho•ài dc 3 cái này nữa, tên vẫn có cái chấm giữa"):** `assistants.ASSISTANT_NAMES` = Th•ái, M•ai, H•ải, L•ai, Kh•ải, T•ài, Đ•ại, Đ•ài, Nh•ài, Gi•ai, Ph•ái, L•ài, Ho•ài (viết ĐÚNG có chấm; thay hình thức không chấm của SRS-182 và dùng lại họ •ai đã bỏ 14/10); thêm tên mới chỉ khi chủ dự án duyệt, và viết kèm chấm. Khách đang chat có thể đổi tên (chia theo băm).
> **Kho tên trợ lý chỉ còn 10 tên "phụ âm + ai" (SRS-5.1zzzzzzz182, chủ dự án 25/10/2026: "xóa các tên không có ai phía sau"):** Thái, Mai, Hải, Lai, Khải, Tài, Đại, Đài, Nhài, Giai — thay câu "thêm cạnh kho cũ" ở ghi chú SRS-181 ngay dưới; `assign_assistant` chia theo băm nên khách đang chat có thể đổi tên; thêm tên mới chỉ khi chủ dự án duyệt.
> **Gắn `project_id` + 10 tên trợ lý mới (SRS-5.1zzzzzzz181, chủ dự án 25/10/2026: "tên gần giống địa chỉ giống thì cho vào thẳng luôn"):** `supabase_store._du_an` gắn thẳng khi tên GẦN GIỐNG (`ten_gan_giong_du_an`) và cùng đường với đúng một dự án trong kho (kho mogi: cả 2.361 dự án có `location_raw`); còn lại chỉ khi kho có đúng MỘT dự án cùng đường thì bot hỏi xác nhận một lần (`engine._khoi_hoi_du_an`, cờ `_goi_y_du_an`). Quy tắc "trong 100 m thì hỏi" CHƯA có vì toạ độ tin mới ở mức đường (`toa_do_muc`), không phải số nhà. `ASSISTANT_NAMES` thêm Thái, Mai, Hải, Lai, Khải, Tài, Đại, Đài, Nhài, Giai — chia theo băm nên khách đang chat có thể đổi tên trợ lý; tên mới chỉ thêm khi chủ dự án duyệt. Chưa thử Zalo thật.
> **Phía người mua trong lõi (SRS-5.1zzzzzzz70):** `src/aioi/mua.py` ghi `buyers` / `interests` / `viewings` / `info_requests` / `deals`;
> giao việc, nhắc, báo lại khách là trigger DB có sẵn. Lịch `ctv-sla-tick` bật lại (`20261019i`) — đừng tắt khi còn ghi `info_requests`.
> **Ô tin chỉ ghi điều KHÁCH nói (SRS-5.1zzzzzzz73):** mỗi ô mới / đổi từ lượt lập thao tác phải có `bang_chung` nằm nguyên trong
> lời khách (`_co_bang_chung`); câu bot hỏi và lời AI tả ảnh chụp (`DAU_TA_ANH_CHUP`) không phải bằng chứng. Thêm đường ghi ô mới thì
> qua cùng cổng này. Bắn thử lõi production: `apply-migration` ô `ban-thu-mua` / `ban-thu-ban` (ID thử, tự dọn).
> **Câu chuẩn (SRS-5.1zzzzzzz88, 20/10/2026):** chủ dự án / tester chấm điểm và sửa tay câu bot ở `/admin/cau-chuan` (bảng `cau_chuan`,
> ngữ cảnh chép kèm); lõi đọc 8 dòng đã sửa / chấm làm ví dụ (`khoi_cau_chuan`, nhớ 60 giây). Đổi giọng bot theo ca cụ thể thì sửa ở đó trước.
> **Câu mẫu cố định (SRS-5.1zzzzzzz106, 21/10/2026):** câu bot nói NGUYÊN VĂN (duyệt tin, hỏi phí, nhắc bản nháp, xin chấm sao, giữ chỗ khi
> lỗi; từ SRS-5.1zzzzzzz110 cả lời chào, dòng mở bản nháp, ẩn / giữ rổ hàng, nhận ảnh / link / tệp, tin nhắc; SRS-5.1zzzzzzz111 câu báo phí `{phi}`) chỉ ở `src/aioi/cau_mau.py` (`MAC_DINH`) — chủ dự án sửa ở khung "Câu mẫu cố định" trang `/admin/cau-chuan` (bảng `cau_mau`, đè câu gốc,
> nhớ 60 giây). Đừng viết tay câu đó ở chỗ khác (`tests/test_cau_mau.py` đỏ); thêm câu mới = thêm khoá + migration nạp dòng. Khoá `ghi_nhan_mau` (SRS-5.1zzzzzzz120) đã GỠ 22/10 (SRS-5.1zzzzzzz131, chủ dự án: "xóa hết mấy cái em ghi nhận") — bot KHÔNG mở lượt bằng câu ghi nhận, mở bằng lời khen (`LUAT_MO_LUOT`); lượt đầu cảm ơn NGẮN, không "đã tin tưởng gửi thông tin nhà cho bên em".
> **Ô riêng của chủ nhà (SRS-5.1zzzzzzz116, 21/10/2026):** `listings.boc_tach` ĐỌC CÔNG KHAI qua API với tin đang bán — ô chủ nói riêng
> (người đứng tên, lý do bán / bán gấp, giờ dẫn khách xem, chìa khoá) là `schema.O_NOI_BO`, lõi ghi bảng `listing_noi_bo` (chỉ admin), không
> vào bản tin. Thêm ô riêng mới = thêm khoá vào `O_NOI_BO` (+ nhãn ở `SuaTinModal`). Câu hỏi thêm sau khi tin lên web: `schema.CUM_SAU_DANG`.
> **Tra địa danh (SRS-5.1zzzzzzz60):** phường / quận / đường khách nói → `src/aioi/dia_danh.py` (chữ trước, vector Gemini sau, máy
> kiểm tên gần chữ khách); vector do lịch `nhung-tick` / `nhung-dia-danh-tick` nuôi — đừng gỡ hai lịch đó. **Xã / phường tỉnh Tây Ninh (Long An cũ, SRS-5.1zzzzzzz128):** bảng RIÊNG `xa_tinh_khac` (96 dòng, NQ 1682/NQ-UBTVQH15, sinh bằng `scripts/sinh-xa-tay-ninh.py`), `dia_danh.tra_xa` — KHÔNG nhét vào `wards` (TP.HCM, nguồn duy nhất của `listings.ward`); từ 01/07/2025 không còn cấp quận / huyện. **Đồng Nai (hợp nhất Bình Phước, SRS-5.1zzzzzzz129):** cùng bảng, 95 dòng (NQ 1662/NQ-UBTVQH15, `scripts/sinh-xa-dong-nai.py`), khoá chính `(tinh, ten_day_du)`, cột `tinh_cu`; xã Bình Phước cũ → `_ngoai_vung` (`TINH_CU_NGOAI_VUNG`); `tinh_cu` là suy từ thứ tự khoản NQ, không phải nguồn chính thức.

> **QUYẾT ĐỊNH CHỦ DỰ ÁN — KHÔNG ĐƯA RA BÀN LẠI, KHÔNG CHẤM LÀ LỖI KHI REVIEW / ĐÁNH GIÁ UX (20/10/2026).** Chủ dự án: "supabase
> free và zalo clone là ý chí của tui, ko cần bàn lại"; "hello là tôi đang test, đó là ý của tôi".
> - **Supabase gói Free** (không tự sao lưu) và **bridge zca-js trên tài khoản Zalo clone** là lựa chọn có chủ đích.
> - **[ĐÃ GỠ 26/10/2026, SRS-5.1zzzzzzz195 — xem ghi chú đầu mục; phần còn lại của dòng này là lịch sử]** **Làm mới phiên = gõ đúng `$$$$$` (năm dấu đô)** (`Engine.handle`, `LENH_LAM_MOI`; chủ dự án 22/10/2026: "đừng để hello thành reset nữa"). "hello / hi / chào em / 👋 / sticker chào" chỉ CHÀO, không xoá phiên (thay quyết định 20/10); lời chào đầu tiên do AI đọc (`khoi_chao_lan_dau`, mẫu `chao_lan_dau`), không còn danh sách từ khoá (SRS-5.1zzzzzzz125). Các lệnh cũ `/reset`, `/clear`, `/xoa`, "reset session", "xóa hết" đã bỏ (22/10, SRS-5.1zzzzzzz127: "chỉ còn cái $$$$$ mới xóa hết"). **`$$$$$` còn bật CHẾ ĐỘ TEST (SRS-5.1zzzzzzz130, `src/aioi/che_do_test.py`):** lệnh im lặng (xoá sạch, không trả lời, không gọi model — chủ dự án 22/10: "không cần thông báo"), tin kế tiếp đi như người mới; từ đó mỗi lượt bot gửi thêm một tin phụ bắt đầu bằng `$$$$$`, TỐI ĐA 4 dòng (SRS-5.1zzzzzzz139: ghi ô nào kèm câu khách nói · ô bị bỏ vì sao · còn thiếu / hỏi tiếp · tốn bao nhiêu đô) — code ghép, không phải AI, không vào lịch sử hay CRM; bảng giá chép từ `lib/gia-model.ts` (test so từng dòng); chưa có lệnh tắt.
> - **Văn tin rao** thêm ý chung ("phù hợp ở kết hợp kinh doanh") — chủ dự án: "kệ".
> - **Theo bản anh Luận** (`luan8560/AOND`, SRS-5.1zzzzzzz81): khách duyệt bản nháp thì hỏi "có biết phí môi giới của tụi em chưa"; hẻm /
>   mặt tiền và hiện trạng hỏi TRƯỚC bản nháp; gửi model 30 tin gần nhất.
> - **Giữ của mình, không theo anh Luận:** ~~hỏi gộp theo cụm (SRS-5.1zzzzzzz79)~~ — BỎ 22/10 (SRS-5.1zzzzzzz136: mỗi lượt một câu hỏi ngắn, ý dài tách tin riêng, tin `$$$$$` gửi TRƯỚC tin cho khách), khách lờ một ô 2 lần thì để sau (SRS-5.1zzzzzzz80), khen
>   có cơ sở (21/10/2026 sếp: "cần nó khen nhiều hơn" — khen điểm tốt thật mỗi lượt có điểm tốt, vẫn cấm bịa thị trường, SRS-5.1zzzzzzz119; 22/10 khen thêm cách khách cung cấp thông tin, tối đa hai ý khen mỗi lượt, bên mua có luật khen riêng, SRS-5.1zzzzzzz124; 22/10 chiều: BA lượt thông tin đầu 100% mở bằng lời khen — kể cả vị trí khách nêu — thay câu ghi nhận, từ lượt 4 khen khi có điểm tốt thật (chủ dự án: "3 lần khách đưa thông tin đầu tiên thì 100% khen hết"; lõi đếm `so_luot_thong_tin`, khối `khoi_khen_theo_luot`) — **25/10 NỚI (SRS-5.1zzzzzzz178, chủ dự án "chốt"): ba lượt đầu chỉ ƯU TIÊN tìm điểm khen, không có gì để khen thì cảm ơn ngắn rồi hỏi, không khen gượng / bịa chi tiết**, vẫn cấm bịa thị trường / bình luận giá / thêm chi tiết khách chưa nói, SRS-5.1zzzzzzz131), cấm mở đầu "Dạ", tên trợ lý người thật (FR-181), kênh vừa mua vừa bán (lời chào hai lựa chọn).
> - **Model:** mọi lượt dùng Haiku (chủ dự án: "Vẫn haiku"). Claude hỏng (hết số dư, quá tải…) thì lượt đó trả lời bằng Gemini rồi Groq
>   (`llm/du_phong.py`, SRS-5.1zzzzzzz117, 21/10/2026) — Claude vẫn là đường chính. Vòng dự phòng có TRẦN (SRS-5.1zzzzzzz133, 22/10: "rút ngắn đi"): mỗi lần gọi ≤ 15 s, cả vòng ≤ 40 s, model quá hạn thì bỏ khoá còn lại và NGHỈ 10 phút (lượt sau đi thẳng Groq) — bridge chỉ chờ 90 s, lượt dài hơn là lời bot mất; đừng nới lại. **Tin nội bộ (🙋 ⭐ 🩺, báo cáo) gửi CTV / admin mở bằng `$$$$$ ` (SRS-5.1zzzzzzz134, chủ dự án 22/10: "tin cho debug phải bắt đầu với $$$$$") — `escalation-feed` đánh cờ `noi_bo` theo đích, bridge gắn tiền tố; tin cho khách thật không bao giờ có. Khoá Gemini chat một nguồn Vault (`GEMINI_API_KEY`…`_4`) → `.env` lõi qua `cai-vps`.** Gemini chậm ở lượt TRẢ LỜI (bóc tách vẫn 3 s) là hiện tượng thật 22/10, không phải hết hạn mức.
> - **Độ dài lời bot (21/10/2026, SRS-5.1zzzzzzz97):** "cứ ngắn vừa vừa thôi, khách không hiểu thì mình hỏi tiếp" — nói ý chính rồi dừng,
>   không thêm câu giải thích khi khách chưa hỏi. Phí thuê viết "0.75 tháng tiền thuê" (chủ dự án duyệt câu tester). Câu chữ thực như môi
>   giới nhắn Zalo, không văn mẫu (tester: "AI quá khách ngán"); câu tester sửa thì dùng nguyên văn. Ghi nhận "vừa ngắn vừa lịch sự" ("ngắn không thì nó láo", SRS-5.1zzzzzzz102); khách duyệt tin → "Em xin phép đăng
>   tin ạ!" (bỏ "Dạ", "ngắn thì tốt", SRS-5.1zzzzzzz103).
> - **Khách chấm sao cho AI (21/10/2026, SRS-5.1zzzzzzz104, chủ dự án "chốt"):** hỏi MỘT lần mỗi khách (bán: sau tin lên web + nói phí;
>   mua: khách báo đủ thông tin căn), câu code sinh "Anh/chị chấm giúp em 1–5 sao…", AI đọc điểm theo nghĩa, bảng `danh_gia_ai`,
>   CRM `/admin/danh-gia`, ≤ 2 sao báo admin qua escalation.
> - **Dữ liệu dự án chủ dự án nhập tay là chắc chắn (21/10/2026, SRS-5.1zzzzzzz96):** phiếu `chac_chan:` thắng ngay, phiếu khách vẫn bầu.
> - **Vùng nhận tin (20/10/2026, SRS-5.1zzzzzzz86):** chỉ TP.HCM, Bình Dương, Bà Rịa – Vũng Tàu, Long An, Tây Ninh, Đồng Nai (chủ dự
>   án: "hcm long an tây ninh bình dương đồng nai vũng tàu thôi"); nơi khác bot nói khéo chưa nhận, không hỏi, không soạn tin. Một nguồn:
>   `prompts.VUNG_NHAN_TIN`. Bình Phước cũ (nay thuộc Đồng Nai): KHÔNG nhận (chủ dự án 20/10: "bỏ").
> - **Cũng 20/10 (SRS-5.1zzzzzzz86):** tiêu đề tin tối đa 15 từ — giữ ("có"; **NỚI 26/10 thành 20–25 từ giọng vui, SRS-5.1zzzzzzz192**); mã căn của căn trong dự án "có thì tốt, không có thì vẫn
>   nhận" (hỏi, không chặn bản nháp); lời chat suy từ dữ kiện khách nói (vd "hẻm 3m thì ô tô nhỏ vào được") là OK — "trả lời này vẫn
>   ok mà", đừng chấm là lỗi. Ô tin vẫn chỉ ghi điều khách nói (cổng `_gia_tri_ghi`).

Từ 24/08/2026 (quyết định chủ dự án) code nằm **trong repo này**, hai mảnh:

- **Web** (Next.js 15 + TS + Tailwind 4, App Router) ở **root repo**:
  `app/`, `components/`, `lib/`, `public/` — Vercel project `nhadat-cc` build
  từ root, package manager **Bun** (`bun.lock`). Dữ liệu đọc Supabase bằng
  publishable key qua RLS; mô tả listing luôn qua `sanitizeDescription()`
  (lọc SĐT — FR-104) trước khi render.
- **Bot**: bộ não là lõi Python `src/aioi/` (xem khung trên); `bot/` còn bridge Zalo (`bot/bridge-zca/`), migration + schema, và 3 edge function phụ (`bot/README.md` không có trong repo AOND — bản cũ ở repo Nhadat.cc).
- **Script vận hành** ở `scripts/` — chạy trên máy local, không deploy.
  `up-anh.mjs` đẩy ảnh thật lên bucket `listing-public` theo UUID của tin và
  ghi kèm dòng `listing_media` (FR-165; lối cũ theo mã tin của FR-148 đã bỏ);
  nó chỉ ĐỌC `masterDB/`, không bao giờ copy ảnh vào repo. **Đã chạy thật
  07/09/2026**: `listing_media` 1005 dòng, `listing_photos_v` 945, **171/173 tin
  có ảnh** (`BDS-Q5-0113` và `BDS-Q5-0124` trống vì thư mục nguồn rỗng, không
  phải lỗi script). Trước hôm đó `storage.objects` = 0 và web hiện ảnh giữ chỗ
  cho MỌI tin — nếu thấy lại cảnh đó thì kiểm `listing_media` trước tiên.
  Lần chạy đầu để lộ một bẫy đáng nhớ: `sort_order` là `int4`, hai ảnh mang tên
  là dấu thời gian 14 chữ số làm tràn kiểu, insert nổ **sau khi** file đã lên
  kho nên nhánh dọn dẹp xoá mất file vừa up, để lại một dòng lỗi trôi giữa 1005
  dòng thành công. Vá ở CẢ HAI tầng (`20260907a`: `CHECK sort_order 0..9999`;
  script: chỉ nhận số ≤4 chữ số) — vì `1700000000` vừa khít `int4` nên kiểu dữ
  liệu một mình không bắt được.
  **Không còn sao lưu** (chủ dự án bỏ 11/09/2026: "không cần backup ở trên
  OneDrive nữa… chơi đơn giản", chọn "bỏ hết sạch"). Đã gỡ `sao-luu.mjs`,
  `phuc-hoi.mjs`, `soat-phuc-hoi.mjs`, `xuat-onedrive.mjs`, hai bài tự kiểm,
  CI job `saoluu`/`phuchoi` và `docs/12`. Lịch Windows "Nhadat - dong bo
  OneDrive" đã xoá. **Supabase gói Free không tự sao lưu — mất dữ liệu là
  không lấy lại được.** Chủ dự án biết và chấp nhận (OPEN-25).
  Soát 11/09/2026: VPS không còn cron / timer / file khoá sao lưu nào
  (`bot/bridge-zca/VPS.md §8`); máy văn phòng không còn lịch Windows nào. Còn
  lại DUY NHẤT lịch `nhadat-sao-luu.cmd` trên máy Quang Lê Bá Duy — phải xoá
  tay trên máy đó. Thư mục `nhadat-backup/` đã xoá: script nào cần chỗ ghi
  thì ghi vào `train/out/` (gitignore) hoặc thư mục tạm. `liet_ke_bang()`
  (chỉ sao lưu dùng) xoá ở `20260911h`. Cần bản cũ thì lấy trong git:
  `git log --diff-filter=D -- scripts/sao-luu.mjs`.
  **Tầng bốn — chống tái phát (11/09/2026).** Ba việc, mỗi việc một cổng:
  (1) **Kiểm kiểu cho bot** — `tsconfig.json` loại hẳn `bot` nên 3.900 dòng
  `chat-reply` chưa từng qua kiểm kiểu. `bun run kieu:bot` (nằm trong `kiem`, cổng CI
  thứ 9) chạy `deno check --node-modules-dir=auto` — cờ đó thay cho một `deno.json`,
  vì thêm deno.json vào thư mục function là đổi luôn cách Supabase CLI đóng gói.
  Lần bật đầu: 15 lỗi, tất cả là kiểu khai sai so với dữ liệu thật.
  (2) **Luật MỘT NGUỒN** — luật tiền ở `_shared/extraction/luat-tien.ts`, luật che
  liên hệ ở `_shared/extraction/luat-lien-he.ts`; bot, bộ bóc tách VÀ web (`lib/`,
  qua đường `@/bot/...`) cùng nhập từ đó. Trước đó luật tiền có năm bản chép tay
  lệch nhau đúng ở chỗ đã cắn người thật ("5 tới 6 tỷ", "2 tỏi 5"). SQL `parse_vnd` không
  import được TS nên nó phải trả lời CÙNG MỘT BẢNG CA (`bot/tests/luat/tien.json`) —
  `bun run doi-chieu:tien` (cổng CI thứ 10) đỏ khi hai bản lệch. **Sửa luật tiền là
  sửa ở luat-tien.ts + parse_vnd + thêm ca vào tien.json, không đi tìm năm chỗ.**
  Lượt gom bắt được một lỗi có sẵn từ 02/09: che SĐT bằng hai lượt `replace` nối
  nhau làm LỒNG NHÃN (nhãn có chữ "Zalo", luật mạng xã hội khớp chữ đó) — nay một
  lượt, không bao giờ quét lại chữ vừa chèn.
  Từ 18/09 thêm **từ điển nhãn tìm kiếm** `_shared/extraction/nhan.ts` (FR-211): bot gắn,
  web lọc, cùng một file — thêm nhãn là thêm khoá ở đó + ca trong `bot/tests/nhan.mjs`, KHÔNG
  ghi tay vào `listings.nhan`. Văn bản nhúng vector đọc tên nhãn qua `ten_nhan()` (SQL, `20260930c`) — thêm nhãn thì thêm dòng
  `when` bằng migration mới; `bot/tests/ten-nhan-sql.mjs` đỏ khi hai bên lệch. Từ 21/09 thêm **từ điển tên đường** bảng `duong` (FR-212, `20260921b`,
  ~5.200 tên lượt đầu 21/09; đếm 12/10/2026 sau `nap-duong`: TP.HCM 37.146 dòng gồm hẻm, đủ 168/168 phường — Đặc khu Côn Đảo nằm ngoài hộp bao chung, nạp nhờ `BBOX_RIENG`; Tây Ninh 1.598, Đồng Nai 677; OSM theo phường mới): bot gọi `tim_duong` ở MỌI chỗ ghi địa chỉ — không dấu → có dấu
  ngay, sai 1–2 ký tự → hỏi xác nhận (`boc_tach.duong_goi_y`), không có → giữ nguyên chữ khách; nạp lại
  bằng `node scripts/nap-duong.mjs`, KHÔNG ghi tay. `listings` nay 63 cột (đếm lại 22/10/2026 sau khi gỡ 7 cột chết, SRS-5.1zzzzzzz140; số "56", "67", "70" cũ đã lệch).
  (3) **Luật phá dữ liệu phải có bảng câu KHÔNG được kích** — `bot/tests/luat/khong-duoc-kich.json`:
  mỗi luật tìm-chuỗi mà khớp là ghi đè dữ liệu có `phai_kich` (để không vá quá tay) và
  ≥ 8 `khong_duoc_kich`. `luat-pha-du-lieu.mjs` còn đếm chỗ ghi đè trong chat-reply:
  **thêm một chỗ ghi đè mới mà không thêm luật vào bảng là đỏ.**
  **`soat-db.mjs` là CỔNG CI THỨ 8 — soát TRẠNG THÁI DB, không phải danh sách.**
  Tám phép chỉ đọc, chạy trong DB qua `soat_db_cong_khai()` (`20260910p`), dưới
  một giây: policy chặn theo tên có phủ hết khoá đang sống · view nào đọc xuyên
  RLS · hàm nào trùng chữ ký (PostgREST trả `PGRST203`) · bảng nào thiếu khoá
  chính · `SECURITY DEFINER` thiếu `set search_path` · RLS bật mà không policy
  trong khi web có quyền · trigger BEFORE sai thứ tự · ai nhận quá 2 tin chủ
  động một ngày. Cả năm lỗi nặng ngày 10/09 đều KHÔNG nhìn thấy được từ danh
  sách migration — chúng nằm trong catalog, và đây là chỗ soi.
  Hàm chỉ trả KẾT LUẬN (mã · mức · số · chi tiết ngắn), Zalo ID che còn 4 số
  cuối, không có nội dung tin nhắn — nó mở cho `anon` nên chính chỗ đó là chỗ
  dễ biến một cổng kiểm thành một lỗ rò.
  Cổng đỏ khi có phát hiện KHÁC bản nền `scripts/soat-db-da-biet.json`. **Thêm
  dòng vào bản nền là một quyết định kèm lý do, không phải cách làm cổng xanh**
  — xoá một dòng ở đó nghĩa là tuyên bố đã sửa xong. Lượt chạy đầu 10/09 để lại
  ba dòng nền: 9 view thiếu `security_invoker` (7 có cổng admin trong WHERE, 2
  thì không), 3 hàm trùng chữ ký kiểu tập-con, 4 bảng RLS-không-policy cố ý.

  **`soat-migration.mjs` so DB ↔ repo, và từ 10/09 nó là CỔNG CI THỨ 7.** Ngày
  đó hai lượt soát code đọc `schema.sql` ở hai mốc thời gian khác nhau trong lúc
  DB đang được vá, rồi kết luận ngược nhau — một bên báo 5 lỗ, một bên báo 5 báo
  động giả. Không ai sai; cái thiếu là một chỗ NÓI RA rằng repo đang tụt sau DB.
  Cổng chạy bằng KHOÁ CÔNG KHAI qua `liet_ke_migration_cong_khai()`
  (`20260910o`, chỉ trả version + name, KHÔNG bao giờ trả nội dung DDL) — nhét
  service_role vào CI của một repo đang PUBLIC là mở toang, mà tên migration thì
  vốn đã công khai trong chính thư mục này.
  Nợ cũ 21/08 → 01/09 (OPEN-46) nay có hồ sơ thay vì kêu mãi: 52 migration áp
  không file đã có **file dấu vết** (chỉ chú thích, chạy không tạo gì — nội dung
  gốc mất vĩnh viễn), và 11 file áp dưới tên khác ghi trong
  `bot/supabase/migrations/DA-DOI-CHIEU.json`. Cảnh báo kêu mãi thì thành tiếng
  ồn, rồi cái thứ 53 — trôi THẬT — chìm lẫn vào đó. **Thêm dòng vào
  DA-DOI-CHIEU.json là một quyết định, không phải cách làm cổng xanh.**
  Dựng lại từ số không: chỉ nạp `schema.sql` (+ ba file schema `so`) theo
  `scripts/dung-lai-db.mjs` (đầu file; chạy qua `apply-migration.yml` ô `dung_lai`) — KHÔNG replay thư mục migration. Câu cũ ở
  đây ("nạp schema.sql rồi áp migration từ 20260902") lệch với README; soát 13/09
  còn thấy 34 hàm trên DB có thân KHÁC file migration cuối cùng định nghĩa chúng
  (bản áp qua MCP không giống file), nên replay là dựng ra hàm cũ.
  `xuat-ro-hang.mjs` xuất rổ hàng ra thứ NGƯỜI đọc được — mỗi tin một thư mục
  (`tin.md` + `anh/`) kèm `ro-hang.csv` mở thẳng Excel; nó **không phải bản sao
  lưu** (chỉ 3/31 bảng, không giữ UUID/khoá ngoại) và `manifest.json` của nó ghi
  thẳng chữ `KHONG_PHAI_BAN_SAO_LUU`.
  `thu-du-an.mjs` nạp KHO DỰ ÁN (HCM/Bình Dương/Đồng Nai/Long An/Tây Ninh, nguồn mogi
  theo lệnh chủ dự án 10/09) — chỉ lấy DỮ KIỆN, mô tả viết lại từ dữ kiện, giữ
  `source_url`.

**AI bóc tách tin người bán có BỐN chế độ, công tắc `app_config.boc_tach_ai`** (`tat` · `bong` · `ghi` · **`chinh`** từ 21/09/2026, FR-208 f). `chinh` = ĐẢO TẦNG: chat-reply CHỜ lượt AI (qua kiểm bằng chứng `kiem-bang-chung.ts`) trước khi luật quyết — câu treo, fact kèm, cột lõi lúc tạo tin đều lấy của AI; luật tìm-chuỗi chỉ đỡ khi model hỏng hoặc cho khoá AI không có chỗ nói (`KHOA_FACT_AI_BIET`). Hệ quả cho người sửa luật: **một luật regex mới trong `khop-cau-tra-loi.ts` / `boc-cau-rao.ts` cho khoá nằm trong `KHOA_FACT_AI_BIET` sẽ KHÔNG chạy ở production** khi AI còn sống — muốn AI đọc ra thứ đó thì sửa LUAT trong `_shared/ai/boc-rao.ts` (prompt) hoặc thêm một VÍ DỤ MẪU ở `_shared/ai/vi-du-boc-rao.ts` (FR-208 g — ví dụ phải qua `bun bot/tests/vi-du-boc-rao.mjs`: dạy model thứ code sẽ bỏ là đỏ), và thêm ca ở `bot/tests/kiem-bang-chung.mjs`. Không train model; "học" ở đây là ví dụ trong prompt. Từ 01/10/2026 lượt AI bóc tách đọc NGỮ CẢNH (câu bot vừa nói nguyên văn + 4 lượt gần nhất + câu còn định hỏi — SRS-5.1t); ngữ cảnh để hiểu, trích dẫn vẫn phải nằm trong tin. Từ 02/10/2026 thêm "bộ nhớ": nguyên văn mọi tin chủ nhà gần đây (≤ 6.000 chữ, SRS-5.1za), và nhánh chia mảnh theo tin cũng ghi ô bằng AI — `nhanDienNhieuFact` chỉ còn là lưới đỡ. Đổi công tắc ở Table Editor là có hiệu lực lượt kế, không cần deploy; e2e mô phỏng bằng `globalThis.__cauHinh.boc_tach_ai`. **Từ 07/10/2026 (SRS-5.1zzzd) có thêm lượt AI CHỐT TIN trước mọi bản nháp** (`chotTinAi`, chế độ `ai`; từ 18/10 cả người rao nhiều căn nhưng chỉ đọc tin vừa nhắn — SRS-5.1zzzzzzz21): đọc TOÀN BỘ tin chủ nhà qua cùng bộ bóc tách + `LUAT_CHOT`, giá trị qua kiểm trích dẫn đè lỗi dồn từ từng lượt, AI để trống thì giữ; bản nháp chỉ in ý thêm AI đã lọc. Lỗi bóc tách ra tới bản nháp thì xem lượt chốt trước khi vá từng lượt.

**Nhánh MUA có trợ lý có công cụ, công tắc `app_config.tro_ly`** (`tat` · `thu` = chỉ ID thử theo `la_id_thu` · `bat`; SRS-5.1y, 02/10/2026). `_shared/ai/tro-ly.ts` chạy vòng tool use trên CÙNG ngữ cảnh lượt mua: công cụ ĐỌC (`tim_tien_ich_quanh`, `xem_can`) chạy thật; công cụ GHI chỉ gom về khuôn `LuotMua` nên mọi bước sau lượt model và lưới chặn bịa vẫn chạy như đường cũ. Công cụ ghi điều khách nói phải có trích dẫn trong lời khách (code kiểm). Thêm công cụ mới thì: định nghĩa ở `CONG_CU_MUA`, công cụ đọc nối ở `docCongCuMua` (chat-reply) và kết quả phải vào `duLieuCongCu` (không thì lưới gọt tên bịa sẽ gọt luôn dữ liệu thật), thêm ca ở `bot/tests/tro-ly.mjs`. Trợ lý gọi THẲNG Claude (`anthropicTrucTiep`) — lưới Groq/Gemini bỏ `tools`; trợ lý hỏng thì đường JSON cũ trả lời ngay trong lượt.

**Văn phong người bán theo demo AOND (05/10/2026, SRS-5.1zzi).** Chủ dự án: "bớt luật viết máy mà phụ thuộc AI hơn… sếp muốn văn phong như nó". Câu lệnh r1/r2 cho model là khuôn `ĐÃ BIẾT` / `CHỦ NHÀ VỪA NHẮN` / `CẦN HỎI: <ý>` — hệ thống chỉ đưa Ý, model tự đặt câu; câu mẫu `CAU_HOI_MAU` chỉ tới model khi là câu CODE tra ra mang lựa chọn (đường, phường, viết tắt, số hẻm) hoặc chủ dự án đã sửa câu đó ở dashboard. **Muốn đổi giọng thì sửa prompt (`TONE_RULES`/`SELLER_SCRIPT_RULES`/`SELLER_FEWSHOT`), đừng thêm van sửa văn**; van mới chỉ cho lớp chống bịa / lời hứa / ghi đúng ô, van sửa văn phải treo theo `app_config.luat_loi_bot` (gọn = tắt). Bong bóng 🤖 có chế độ `bao_lai_da_luu = admin`: ghi `messages` cho /admin, không gửi khách. Bóc tách của demo KHÔNG học (ảnh 05/10: bịa đường, ghi sai ô, ghi đè mất địa chỉ) — bảng bỏ/giữ ở `docs/06 §6.8`. **06/10/2026 (SRS-5.1zzn): `luat_loi_bot` gọn (mặc định) nay tắt TOÀN BỘ van sửa văn, cả xưng hô / gạch chéo / gạch dài / "mình" / ghi nhận trùng / lặp / khen; chỉ còn lưới an toàn + ghi đúng ô. Mọi van đổi lời ghi sổ `van_kich` (`so-van.ts`, `20261006b`) — đọc `van_kich_7_ngay` trước khi quyết bỏ hay bật lại một van; thêm van mới thì đặt `mocVan("tên")` ngay sau nó.** **Cùng ngày (SRS-5.1zzo): bốn lưới luôn bật mới — `damBaoCauHoi` (mở ô chờ thì lời phải có câu hỏi, r1/r2/r2b), `canTheoAi` (AI trả `so_can ≥ 2` có đánh số `can` thì chia tin theo AI, regex `nhanDienNhieuCan` chỉ đỡ), `docHoiLai` đòi bằng chứng chủ đề `ve_bot` và nhường `vai` tự nói, `traLoiSeller` bỏ mệnh đề "đang rao / đã đăng" khi người bán không còn tin mở (r3 chỉ liệt kê tin mở). Thêm lưới cùng lớp thì đặt vào đúng hàm đó, không rải regex.** **Bước 3 (SRS-5.1zzp): lời model lệch ô ở r1/r2 → `goiLaiChoDungO` gọi lại model một lần với lý do, câu mẫu chỉ là lưới cuối; câu mẫu địa chỉ lần đầu nay "Nhà {ac} ở đâu vậy, ở Hồ Chí Minh đúng không?" (thay quyết định 09/09 kèm lý do). Thứ tự hỏi không tự do: `required_facts.priority` theo loại, AI chỉ chọn trong các ý còn thiếu.** **Câu phí là MỘT NGUỒN `cauPhi()` trong `_shared/prompts.ts` (SRS-5.1zzq): theo vai + `deal` (thuê = 3/4 tháng, vai chưa rõ = không số) — không viết tay "1% giá chốt" ở chỗ khác; `FEE_RULES` cho model phải nói cùng một thứ.** **Ô QUAN TRỌNG ghi NGUYÊN VĂN cụm khách gõ (SRS-5.1zzr): bảng `O_NGUYEN_VAN` theo loại BĐS trong `kiem-bang-chung.ts` là chỗ duy nhất quyết ô nào; model chỉ chỉ ra cụm (`cum_goc`), code ghi đúng cụm đó — muốn ô nào nguyên văn / không thì sửa bảng, đừng vá từng ô.**

**Bất biến, không vá từng ca (09/10/2026, SRS-5.1zzzzj — chủ dự án: "lại fix vá từng trường hợp nữa à"; "cả bộ luật không được mâu thuẫn nhau").** Mỗi trường / đầu ra có MỘT chủ, chặn ở MỘT chỗ. **Cột `listings.ward` chỉ mang `wards.ten_day_du` hoặc null**: mọi đường ghi qua `tenPhuongCot` (`khop-phuong.ts`; fact qua `ghiFact` trong `_shared/ghi-fact.ts` — không gọi `rpc("ghi_fact_listing"` chỗ khác, `bot/tests/ghi-phuong-mot-cua.mjs` đỏ), DB (`20261009b`) chỉ CHẶN lần cuối: chữ lạ → để trống + sổ lỗi; tra không ra → không ghi, bot hỏi (phường số cũ thiếu bảng: OPEN-60, đừng bịa dòng). **Chữ in cho khách đọc từ cột chuẩn / bộ in một nguồn** (`diaChiHienThi` cho địa chỉ, `donViGiaDep` cho giá), không chép `location_raw` / `price_raw` thô — cột vẫn lưu nguyên văn. **Địa chỉ một cửa (14/10/2026, SRS-5.1zzzzzzm):** fact `vi_tri` qua `ghiFact` được chuẩn hoá bằng `_shared/extraction/dia-chi.ts` (số nhà trước, tên đường theo từ điển `duong`) — đừng chuẩn hoá địa chỉ ở chỗ ghi; phường gợi ý từ tên đường LUÔN tra bảng `duong` trước (`cauHoiPhuongGoiY`, kể 2–4 phường kèm quận cho chọn, Nominatim chỉ là lưới đỡ), câu trả lời câu phường có MỘT quyết định (tên khách / AI nói → gật), phường kho dự án chỉ cho căn hộ. Con số phí chỉ do `cauPhi(vaiPhi(…))` nói (vai đã xác nhận: `sellers.seller_type_source` — chỉ thành `tu_nhan` khi cụm trích GỌI TÊN vai, `vaiTuCau`; "bán lô đất", "chú có căn nhà" không phải). Câu nói trạng thái tin (đã đăng / lên kệ / đang rao) có MỘT chủ: lưới ở `traLoiSeller` đọc trạng thái THẬT của tin đang nói (SRS-5.1zzzzk) — đừng thêm lưới riêng ở r1 / r2. Bộ e2e soát năm BẤT BIẾN (phường · địa chỉ · giọng · phí · trạng thái) sau MỌI lượt của MỌI ca — thêm luật mà vỡ một bất biến là đỏ; thêm luật chạm trường / đầu ra đã có chủ thì ghi vào bảng chủ sở hữu ở SRS-5.1zzzzj và `bot/tests/luat-khong-mau-thuan.mjs`.

**Người bán gửi FILE và LINK (05/10/2026, SRS-5.1zzj…zzm, chủ dự án "Lấy đi" năm mục từ demo AOND).** Webhook OA nhận thêm `user_send_file` / `user_send_link`, bridge nhận file qua `href` + tên có đuôi; chat-reply có `file_url` / `file_name` / `link_url`. Tải về qua `_shared/kho_tep.ts` — **mọi URL ngoài đi qua `taiTep` (rào SSRF, kiểm lại từng bước chuyển hướng, trần 20 MB), không `fetch` tay**; loại file nhận bằng BYTE ĐẦU. CSV / XLSX = rổ hàng môi giới → `nhap-ro-hang.ts` (ánh xạ cột tất định, cột SĐT / Zalo / CCCD **bỏ dù viết thế nào** — thêm cột là thêm bí danh + ca `bot/tests/kho-tep.mjs`). PDF / ảnh bảng giá / phân lô / brochure → `_shared/ai/doc-tai-lieu-du-an.ts` đọc ra căn theo mã lô vào **kho `du_an_can`** (`20261006a`, chung cho dự án; giá là giá NIÊM YẾT, không bao giờ thành `price_raw`), file vào `listing-private/du-an/…`; bot nối khối `CĂN TRONG DỰ ÁN` cho model và tin rao "căn A12" tự điền diện tích từ kho (`dienTuKhoDuAn`). Link Google Drive: file công khai tải được không cần khoá, THƯ MỤC cần `GOOGLE_API_KEY` trong Vault (chưa có → bot nói gửi từng file). Gom nhiều căn ("chỉ giữ căn A, ẩn hết còn lại", "gỡ hết") do AI đọc (`doc-y-luot.ngung_hang_loat`), luật `laNgungHangLoat` chỉ đỡ, **hỏi xác nhận rồi gật mới ẩn** (`xac_nhan_ngung_hang_loat`); người rao ≥ 2 căn thì mọi tin đều qua lượt AI nhỏ. Nhịp gửi: `app_config.nhip_go = bat` → chat-reply trả `nhip_go[]`, webhook và bridge cùng nghỉ theo đó (mặc định vẫn 300 ms của 25/08). Bong bóng tài liệu / nhập bảng là chữ code ghép từ dữ liệu vừa ghi — hai van `boCauM2KhongCo` / `boCauGhiTienKhongCo` bỏ qua chúng.

**[LỊCH SỬ — `prompts.ts` lẫn bảng `bot_prompts` đã gỡ 18/10/2026 (SRS-5.1zzzzzzz46); prompt nay chỉ ở `src/aioi/prompts.py`]** Prompt bot có HAI BẢN, DB đè code. Bản trong git là bot/supabase/functions/_shared/prompts.ts (có PR, có review); bản sửa tay là bảng bot_prompts trong Supabase Table Editor — sửa ở đó bot đổi giọng trong vòng 60 giây, KHÔNG cần deploy, và nó ĐÈ bản trong code. Vì đè nên hai bên trôi xa nhau mà không ai thấy: 10/09 cau_hoi_mau trong DB cũ hơn code, bot chạy bộ câu hỏi cũ suốt. Nay bun run prompt so md5 hai bên và in khoá nào lệch; --day đẩy code lên DB, --keo in bản DB ra để dán ngược vào code rồi mở PR. Chạy nó sau mỗi lần sửa prompt ở một trong hai nơi. **Chỗ thứ ba (07/10/2026): trang chat thử** (`chat-web.yml`) kéo công tắc `app_config` + mẫu câu + `bot_prompts` production xuống DB giả (`bot/tests/chat/keo-that.mjs`), có nút "Sửa prompt" — sửa ở đó KHÔNG đổi production; khi tắt trang bản sửa được cất ở nhánh `chat-web/sua-prompt-<run_id>`, gộp vào `prompts.ts` bằng PR rồi `--day`. Ô `bam_log` (sha256 của một khoá ngẫu nhiên — chỉ nhập MÃ BĂM, log Actions công khai) mở `GET /nhat-ky` (header `x-khoa`, `?tu=N&tin=1`): nhật ký mọi người thử (từ 07/10 kèm dòng `ai`: loại lượt model + đầu ra, để truy ô bị mất), không mất khi bấm Xoá chat, để Claude đọc trong lúc test; tắt trang là mất. Từ 08/10/2026 trang có nút 📷 gửi ảnh: ảnh cất trong bộ nhớ trang, phục vụ ở `/anh/…`; CHỈ bản bot đóng gói cho trang thử thêm `trycloudflare.com` vào `HOST_ANH` (SEC-08) — code bot và production vẫn chỉ nhận ảnh CDN Zalo. Cũng từ 08/10: trang sống tới 350 phút và (ô `tu_cap_nhat` = co, mặc định) mỗi phút soi nhánh — có commit mới thì tắt tiến trình (chat.mjs `--luu-trang` cất lịch sử, DB giả, nhật ký, ảnh, bản sửa prompt), kéo code, bật lại và nạp; đường hầm không tắt nên LINK GIỮ NGUYÊN, người đang chat chờ ~10–20 giây. Code mới không bật được thì quay về commit cũ. Sửa chính `chat-web.yml` thì phải chạy lượt mới. Chạy 24/7 trên VPS: `bot/tests/chat/cai-vps.sh` (user riêng `trangthu`, chỉ nghe 127.0.0.1:3100, đường hầm `trang-thu-ham`, timer `trang-thu-cap-nhat` mỗi phút; xem link bằng `trang-thu-link`); khoá Anthropic nằm ở `/etc/trang-thu.env` (chỉ root đọc) — dùng khoá riêng có hạn mức chi.

**08/10/2026: project production cũ `tbcdpupiarkuxtntmosl` bị xoá nhầm** (gói Free — Supabase trả lời không khôi phục được;
dữ liệu cũ toàn là dữ liệu thử). Project mới **`rqxmmqmctpklqcmbfxuj`** (Tokyo) dựng lại bằng `scripts/dung-lai-db.mjs` qua
`apply-migration.yml` ô `dung_lai` — quy trình và những gì lượt diễn tập bắt được ở `scripts/dung-lai-db.mjs` (đầu file; chạy qua `apply-migration.yml` ô `dung_lai`).
Mọi chỗ ghi mã project / khoá publishable trong repo đã đổi sang project mới (migration cũ giữ nguyên làm lịch sử).

**Migration ghi THAY ĐỔI, `schema.sql` mới dựng lại được** (soát lại 07/09/2026).
Câu cũ ở đây nói "migration là nguồn sự thật của schema" — sai. Số đo 07/09: DB
đã áp **114** migration, `main` có **72** file, tức **41 migration áp thẳng qua
MCP mà không ai lưu file** — gần hết là khối 21/08 → 27/08 dựng schema lõi (30
bảng, RLS, projects, conversations, reminders, CTV, drip). Nội dung chúng mất
vĩnh viễn (OPEN-46). Không ai thấy suốt hai tuần vì không có gì đối chiếu hai
bên. Nay: thay đổi schema vẫn BẮT BUỘC đi qua một file trong
`bot/supabase/migrations/`, `soat-migration.mjs` chặn trôi thêm, và
`bot/supabase/schema.sql` là lưới an toàn để dựng lại từ số không (quy trình
đầy đủ ở `scripts/dung-lai-db.mjs` (đầu file; chạy qua `apply-migration.yml` ô `dung_lai`) — chỉ ra DB rỗng, vì không
còn sao lưu dữ liệu).

**Vết đó suýt lặp lại 07/09.** `20260907a_sort_order_la_so_thu_tu` áp lên
production xong, file thì nằm trên một nhánh đã đẩy lên remote **mà không ai mở
PR** — đúng hình lỗi đẻ ra OPEN-46, chỉ khác là bắt được sau vài giờ chứ không
phải hai tuần (nay là PR #35). **Áp migration xong mà chưa mở PR cho file của nó
thì việc chưa xong.** Đẩy nhánh lên không phải là đưa file về repo.

**`bun run build` có thể im lặng bỏ sót lớp Tailwind MỚI** (bắt 07/09/2026 lúc
dựng lại `/admin`). Lượt build đầu sau khi sửa giao diện sinh ra CSS **thiếu
`mt-16`, `gap-x-2.5`, `pb-24`, `max-w-[70ch]`** — đúng những lớp vừa đặt lần đầu
trong dự án; các lớp đã dùng ở chỗ khác (`mt-12`, `mt-8`, `gap-x-3`) thì có đủ.
Không lỗi, không cảnh báo: `tsc` sạch, build xanh, trang lên — chỉ là các khối
dính vào nhau vì margin không tồn tại. `rm -rf .next/cache && bun run build` là
hết. **Vercel có khôi phục `.next/cache` giữa các lần build, nên vết này ra được
tới production.** Sửa giao diện mà thấy khoảng cách sai so với mã nguồn thì
việc đầu tiên là soi CSS đã build (`grep -o 'mt-16' .next/static/css/*.css`),
đừng sửa lại mã theo cái mình thấy — cách đó dẫn tới việc bịa số cho vừa một
bản dựng hỏng. Đây cũng là lý do phải CHỤP MÀN HÌNH bản dựng thật khi đổi bố
cục: đọc mã nguồn không bao giờ thấy được lớp bị rụng.

**Trang tin phải nằm trong cache** (NFR-17). Route động có tham số đường dẫn mà
thiếu `generateStaticParams()` thì `export const revalidate` là chữ chết —
Next 15 để `prerender-manifest.dynamicRoutes` rỗng và mỗi lượt xem là một lambda
+ đủ số query. Kiểm bằng bảng route sau `bun run build`: trang tin phải là `●`
hoặc `○`, thấy `ƒ` là hỏng. Route đọc `searchParams` thì không ISR được, phải
bọc truy vấn trong `unstable_cache`. **`generateStaticParams` trả `[]`, KHÔNG hỏi DB** (02/10/2026,
SRS-5.1z): trả danh sách đầy đủ là mỗi lượt build (CI mỗi PR + Vercel) dựng sẵn mọi dòng — `/du-an` từng đốt 83% request
REST của cả project. Mảng rỗng vẫn ra `●` + ISR khi có người xem; `bot/tests/giam-egress.mjs` canh luật này và luật chọn cột.

**Đường đi ĐÚNG THIẾT KẾ không được ghi vào sổ lỗi** (bắt 08/09/2026). Sổ lỗi
`bot_errors` là ĐẦU VÀO của còi: `bot_health_tick` mỗi giờ đếm lỗi trong một giờ
qua, có lỗi thì đẻ một tin 🩺 gửi Zalo admin. `escalation-feed` có một nhánh từ
chối học `zalo_user_id` của admin (bản vá SEC-03, hoàn toàn đúng) — nhưng nhánh
đó lại `log_loi`. Bridge gửi tin 🩺 xong gọi `ack`, rơi đúng nhánh ấy, ghi thêm
một dòng lỗi, giờ sau còi lại đếm được. **Vòng tự nuôi**: sổ lỗi 07/09 có đúng
một dòng `escalation-feed admin uid` mỗi giờ có tin 🩺 được gửi, liên tục 05:00
→ 10:00 UTC, và tin nào cũng chỉ nói "1 lỗi trong 1 giờ qua" mà không nói lỗi
gì. Nay nhánh đó `console.log`. Thêm bất kỳ `log_loi` nào thì hỏi: đây là SỰ CỐ
hay là đường đi bình thường?

**Bot hỏi thứ chính luật cấm hỏi** (cùng ngày). `20260907h` xếp nhóm `phu`
(hướng, quy hoạch, năm xây) priority ≥ 20 với ý "không bao giờ tới lượt" — nhưng
khi các nhóm trên trả lời hết thì `phu` LÀ nhóm còn lại, `chonCauKe()` bốc ngay.
Log 07/09 đúng vậy. Ngưỡng ưu tiên không phải là cấm; muốn cấm thì phải LỌC.
Nay `listing_missing_facts` bỏ hẳn `nhom = 'phu'`, và mock e2e bỏ theo — mock
lệch bản thật ở chỗ nào thì bộ e2e đo sai ở chỗ đó.

**`schema.sql` tụt lại sau migration mà không ai biết** (cùng ngày). Nó do
`xuat_schema()` sinh ra; áp migration qua MCP rồi quên sinh lại là nó lặng lẽ
cũ đi — `20260907h` merge hôm trước mà `schema.sql` không hề có `diem_tin`,
`can_chu_duyet`. Đúng hình lỗi OPEN-46 nhưng thiếu NGƯỢC (repo thiếu so với DB),
nên `soat-migration.mjs` không thấy.

**Hai lưới cũ đều thủng, nay so NỘI DUNG** (review code 13/09/2026). `soat-truy-vet.sh`
chỉ soi TÊN hàm (`create or replace` đè hàm đã có thì luôn xanh), `soat-migration.mjs`
so MTIME (sau `git clone` mọi file cùng mtime, nhánh đỏ không bao giờ chạy) — trong
lúc `schema.sql` mang `parse_vnd` bản TRƯỚC vá 42 ca. Nay cổng CI thứ 7 so **md5 từng
thân hàm** `schema.sql` ↔ DB qua `ham_md5_cong_khai()` (`20260913c`, chỉ tên + md5, mở
cho anon vì thân hàm đã công khai trong chính file này). So với DB chứ không so với
file migration — DB là bản thật (34 hàm lệch file, xem trên). **Cổng đỏ vì schema.sql
thì sinh lại, đừng sửa tay:** `node scripts/sinh-schema.mjs` (đọc service_role từ
`scripts/.env`, gọi `xuat_schema()`, từ chối ghi nếu thấy chuỗi giống khoá bí mật;
chạy thật lần đầu 13/09/2026). Lệnh curl tương đương:

```bash
curl -s -X POST "https://rqxmmqmctpklqcmbfxuj.supabase.co/rest/v1/rpc/xuat_schema" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -d '{}' | jq -r . > bot/supabase/schema.sql
```

Dòng "Sinh lại" ở đầu `schema.sql` từng trỏ tới `scripts/sao-luu.mjs` (đã
xoá). Migration `20260911h` sửa chữ đó ngay trong hàm `xuat_schema()` trên DB,
nên sinh lại giờ ra đúng câu "gọi rpc xuat_schema()". Không sửa migration cũ;
muốn đổi gì trong `xuat_schema()` thì viết migration mới.

**Đừng tin `cron.job_run_details.status`** (NFR-18). `net.http_post()` trả về
ngay khi xếp hàng nên cron luôn báo `succeeded`, kể cả lúc edge function trả
500. Kết quả thật nằm ở `net._http_response`, và được `bot_health_tick()` quét
sang `bot_errors` (FR-152). Xem sức khoẻ ở trang `/admin`.

**Luật đó áp cho CẢ CÁI CÒI, không chỉ cho cron** (soát 06/09/2026). Chính
`bot_health_tick` đã tái phạm: nó gọi `canh_bao_ngoai()` — hàm này cũng chỉ
XẾP HÀNG một `net.http_post` — rồi đóng dấu `bot_health(who='ntfy')` ngay và
dùng con dấu đó để im lặng một giờ. Bắt tại trận: dấu lúc `00:00:00.054` trỏ
request 2221, mà request 2221 là `Timeout of 5000 ms` lúc `00:00:00.212`. 24
lượt timeout như vậy từ 27/08, nhiều lượt đúng phút `:00` — mỗi lượt là một giờ
không ai được báo, và không có gì nói ra điều đó. Nay (`20260906a`) còi ĐỌC LẠI
`net._http_response` của lượt trước rồi mới quyết im, hạn chờ nới 5→15 s, và
lượt hụt tự ghi một dòng `coi ntfy`. **Thêm bất kỳ đường báo động nào thì phải
hỏi: cái gì chứng minh nó tới nơi? "Đã gọi hàm gửi" không phải bằng chứng.**

**SĐT không được vào sổ lỗi.** `sellers.phone` có UNIQUE, nên một lượt chèn
trùng sinh lỗi 23505 mà PostgREST kèm nguyên `Key (phone)=(09…)`; một
`ghiLoi(client, "...", e)` trên đường đó là SĐT khách nằm vĩnh viễn trong
`bot_errors`, trái §5 và repo đang PUBLIC. `log_loi` nay che qua `che_sdt()` —
che ở một chỗ vì mọi đường ghi sổ (edge function, bridge qua escalation-feed,
web qua `instrumentation.ts`) đều chảy qua đó.

**Mọi `catch` mới phải nối dây vào sổ** (FR-152 d). `console.error` một mình là
mất: log edge function bậc Free chỉ giữ 1 ngày, còn loại lỗi nguy nhất ở đây
lại TRẢ 200 nên `bot_health_tick` — vốn chỉ soi mã HTTP — không thấy gì. Trong
edge function dùng `ghiLoi(client, "tên chỗ", e)` của `_shared/claude.ts`;
trong bridge dùng `ghiLoi("tên chỗ", detail)`; phía web thì `instrumentation.ts`
đã bắt sẵn mọi lỗi server chưa bắt. Thêm `catch` mà quên nối là thêm một chỗ
hỏng im lặng.

**`=` trong khối `NOT (…)` của SQL là bẫy NULL** (bắt 25/09/2026). `listing_missing_facts` loại câu đã có dữ liệu
bằng `NOT (… OR access_type = 'mat_tien' …)`; `access_type` trống → NULL → `NOT NULL` vẫn NULL → WHERE bỏ luôn dòng
"thiếu hẻm": tin nào chưa có loại đường vào thì câu hẻm KHÔNG BAO GIỜ được hỏi. Mock e2e chạy bằng JS nên xanh suốt.
So sánh bằng trên cột có thể trống thì dùng `IS NOT DISTINCT FROM`; `bot/tests/null-ba-tri.mjs` soi `schema.sql`.

**Nhúng `listings ↔ sellers` PHẢI chỉ tên khoá ngoại** (bắt 15/09/2026). Từ
`20260827h` bảng `sellers` có `active_listing_id → listings`, nên giữa hai bảng
có HAI quan hệ và PostgREST từ chối `sellers(...)` trần trên select đi từ
`listings` bằng 300 PGRST201. Ba chỗ dính mà không chỗ nào đọc `error`: hỏi bù
(`ask-seller`) chết im 6 ngày với 313 dòng sổ lỗi ghi SAI nguyên nhân ("listing
không tồn tại"), chốt kèo không vào `deals`, nhắc đến hạn rơi rỗng. Viết
`sellers!listings_seller_id_fkey(...)`; `bun bot/tests/nhung-mo-ho.mjs` (trong
`test:bot`) soi mã nguồn chặn tái phát — mock e2e KHÔNG mô phỏng PGRST201 nên
e2e xanh không chứng minh được gì ở đây. Và một `catch`/`maybeSingle` không đọc
`error` là một chỗ hỏng im: 313 lần còi kêu "1 lỗi" mà không ai truy.

**Bốn bucket Storage, đừng lẫn** (`masterdb-raw` thêm 07/09, `20260907b`):

| Bucket | Chứa gì | Ai vào được |
|---|---|---|
| `listing-public` | ảnh ĐÃ nén (sharp ≤2500px q80) phục vụ web — 1005 file / 148 MB | **công khai** |
| `listing-private` | sổ đỏ, giấy tờ — link ký sống 15 phút | policy riêng (NFR-06) |
| **`masterdb-raw`** | **bản GỐC masterDB, chưa đụng vào, KHÔNG phục vụ ai** | **chỉ `service_role`** |
| `listing-photos` | lối cũ FR-148 đã bỏ — đã bịt bằng trần 1 byte + mime không tồn tại | (đã khoá) |

**09/09/2026: `masterDB/` KHÔNG còn trên máy chủ dự án** (chủ dự án chốt xoá dữ liệu cũ; thư mục đã không tồn tại ở máy này khi soát), `masterdb-raw` và `listing-public` đều 0 file — `up-anh.mjs`/`up-masterdb.mjs` không còn nguồn để chạy. Rổ hàng từ đây là tin rao THẬT qua chat.
Đường đẩy là **`scripts/up-masterdb.mjs`** (chạy trên máy local, `--dry` xem trước).
Nó **KHÔNG nén** — ai định thêm `sharp` vào đó thì đọc lại: `up-anh.mjs` nén để
phục vụ web, file này giữ nguyên byte để mai kia còn dựng lại được thứ khác từ
bản gốc. Chạy lại được (bỏ qua file đã có đúng kích thước — 179 MB qua mạng nhà
đứt giữa chừng là chuyện thường), và **cuối cùng đối chiếu đếm đĩa ↔ đếm bucket
rồi mới dám báo xong**: Storage trả `200` cho một lượt PUT rồi không cất file
thì vòng lặp vẫn chạy hết và vẫn báo thành công — cùng một hình lỗi với
`net.http_post` ở NFR-18. Bài tự kiểm TS-MASTERDB (24 ca, Storage giả) canh
đúng chỗ đó.

`masterdb-raw` **cố ý không có policy nào** cho `anon` lẫn `authenticated`: RLS trên
`storage.objects` đang bật nên không policy = không ai vào, trừ `service_role`. Đó
là chủ đích, không phải quên — bản gốc mang địa chỉ nhà dân (§5). **Đừng trỏ web
vào bucket này**, nó là tủ hồ sơ chứ không phải CDN. Nó sinh ra để trả lời OPEN-47:
bucket `listing-public` không nằm trong bản sao nào, dựng lại được chỉ vì `masterDB/`
còn trên một ổ đĩa cá nhân. **Nhưng dựng cái tủ không phải là cất đồ vào tủ** — chừng
nào chưa đẩy `masterDB/` lên thì lưới an toàn vẫn y như cũ.

**Dữ liệu THỬ và THẬT tách bằng `la_id_thu(zalo)`** (FR-245, 29/09/2026). Đó là chỗ DUY NHẤT giữ tiền tố ID thử
(`thu- b15- hoi- z- e2e- b- lx- do-`) — bắn thử production thì dùng đúng các tiền tố đó, thêm tiền tố mới là sửa hàm này.
`reset_nguoi_test` từ chối ID thật; xoá khách thật chỉ qua `admin_xoa_khach`. Nút "Xoá hàng loạt" chép mọi dòng sang schema
`luu_tru` trước khi xoá — khôi phục bằng `admin_khoi_phuc_lan_xoa(lan)`. Kho lưu cùng DB, KHÔNG phải sao lưu (OPEN-25);
`xuat_schema()` không quét `luu_tru` nên dựng lại từ số không phải chạy thêm `20260929b` (như schema `so`).
`soat_du_lieu_tin()` soi dấu vết lỗi bóc tách trên tin thật; workflow `apply-migration` in số đếm của nó và xuất
`schema.sql` thành artifact (sinh lại schema không cần service_role trên máy). **05/10/2026:** phiên không tải được artifact
(gh nội bộ không theo redirect) thì dispatch workflow trên NHÁNH của PR với ô `commit_schema` = "commit" — workflow tự commit
`schema.sql` về nhánh đó (không bao giờ về `main`). Lưu ý commit đó do `github-actions[bot]` đẩy nên KHÔNG kích CI; push thêm
một commit thật (hoặc dispatch `kiem.yml` trên nhánh) để CI chạy trên head mới.

**Dữ liệu hội thoại đã dọn sạch 07/09.** Xoá 286 dòng bã kiểm thử: `messages` 69,
`reminders` 192, `ctv_daily_reports` 15, `conversations` 3 (hai dòng
`channel='zalo_personal_test'`), `buyers` 3 (một dòng `zalo_user_id='e2e-sweep-user'`),
`inbound_ledger`/`inbound_events`/`property_events`. **Giữ nguyên** `listings` 173,
`listing_media` 1005, `projects` 1, `ctvs` 2 (cấu hình FR-173), và **`sellers` 3 —
"Trai/Ngai/Lai" tạo 21/08 đang sở hữu 60 tin, là NMG THẬT chứ không phải test**;
khoá `listings_seller_id_fkey` là `NO ACTION` nên có xoá cũng bị chặn. Mốc sao Bắc
Đẩu nay đếm từ số 0 thật (`docs/10 §10.9`), không còn lẫn lượt thử của nhóm làm.

**Chú thích bảng nằm TRONG DB, không nằm trong docs** (`20260906b`). 46/46 bảng (soát 18/09: `tien_ich` từng thiếu, vá `20260918a`; `duong` thêm 21/09; `nhung_viec`, `nhung_viec_du_an` thêm 23/09; `nhung_viec_dia_danh`, `phuong_cu`, `quan_cu` thêm 30/09; `du_an_tai_lieu`, `du_an_can` thêm 05/10; `van_kich` thêm 06/10)
và 19/19 view (public, soát 18/09) đã có `comment on`, cộng 69 chú thích cột; tiền tố `[RỔ HÀNG]`
`[NGƯỜI & HỘI THOẠI]` `[BOT & HÀNG ĐỢI]` `[CTV]` `[HỆ THỐNG]` để Table Editor
xếp A→Z mà mắt vẫn gom được theo việc. Thêm bảng hay cột mới thì **thêm
`comment on` trong cùng migration** — chú thích ở chỗ khác là chú thích sẽ lệch.
Bản in ra giấy (sơ đồ quan hệ + đường bóc tách) ở `docs/07-srs.md §SRS-3.0`;
đừng mở `docs/architecture/` song song với `07-srs.md`, hai nguồn sự thật là
đúng cái bẫy đã đẻ ra OPEN-46. Mở rổ hàng bằng mắt người thì dùng view
`ro_hang_ban` chứ đừng mở `listings` 70 cột — hoặc chọn schema **`so`** trong
Table Editor (`20260907c`): ba view `so.ro_hang` (9 cột đầu đúng thứ tự
sheet Excel gốc Q5 trong `masterDB/`), `so.nguoi_ban` và `so.hoi_thoai` (log chat đọc
được, `20260907g` — muốn xem lại bot nói gì với khách thì mở đây, đừng mở `messages`
trần), không lẫn ruột bot, PostgREST không phơi, `anon`/`authenticated` bị revoke; `xuat_schema()` không quét `so` nên
dựng lại phải chạy thêm file migration đó. **View MỚI ở project này mặc định
LỘ**: `alter default privileges` cấp sẵn toàn quyền cho `anon` và
`authenticated`, nên `grant select` không siết được gì — phải `revoke all …
from anon, authenticated` TRƯỚC rồi mới grant.

**Bóc tách và AI là hai tầng, có máy canh** (`bot/tests/ranh-gioi.mjs`, trong
`bun run test:bot`). Mã bóc tách tiền định không được import SDK Anthropic hay
`claude.ts` hay gọi RPC — nó phải chạy và kiểm được mà không tốn một đồng. Tầng
AI không được ghi bảng nghiệp vụ; ba RPC ngoại lệ đã khai tên trong file luật
(`get_secret`, `log_loi`, `cong_token`), muốn thêm thì phải sửa file đó, tức
phải có người đọc lại câu "cái này có phải dữ liệu nghiệp vụ không?". Hôm nay
ranh giới đúng nhưng đúng do may: `regexProfileFallback()` vẫn nằm trong
`chat-reply/index.ts` cạnh chỗ gọi model, và nhánh NGƯỜI MUA đang chạy ngược —
model trước, regex chỉ đỡ khi model chết.

**Repo hiện đang PUBLIC** (kiểm 26/08/2026 qua API GitHub: `"private": false`).
Nghĩa là mọi file đang track đều đọc được công khai, kể cả tài liệu gốc ở thư
mục gốc: `biz model.docx`, `dự kiến vốn 6 tháng đầu.xlsx`, `chats w B.docx`,
`S's side.docx`, `Tài liệu hệ thống nhadat.cc.pdf`, `hình samples/`. Muốn đóng
thì đổi visibility ở GitHub Settings — nhưng đóng KHÔNG xoá được lịch sử người
khác đã clone.

Dù public hay private, **đừng để web trỏ tới
`raw.githubusercontent.com/quang507/Nhadat.cc/...`**: nó buộc ảnh của web phụ
thuộc vào một thiết lập GitHub chẳng liên quan gì, set private một cái là raw
trả 404 và ảnh vỡ sạch. Tài nguyên tĩnh để trong `public/` rồi tham chiếu bằng
đường dẫn tương đối (`/img/house1.jpg`).

Thư mục `nhadat-cc/` cũ (máy local) không dùng nữa.

**Từ 01/10/2026 (chủ dự án: "sửa từ cái gốc nguyên nhân nào mà làm nó sai, sau này có lỗi tương tự như này nữa ko, từ đây về sau phải xét như vậy"): mỗi lần sửa lỗi bot/web phải trả lời ba câu, ghi trong mục docs/07 của lần sửa đó.** (1) **Lớp lỗi**: nguyên nhân gốc chung là gì — không phải "câu X của khách", mà là cơ chế nào cho câu X lọt (vd "đoán Ý khách bằng từ khoá trên chữ bỏ dấu"). (2) **Chỗ khác cùng lớp**: soát và liệt kê các chỗ dùng cùng cơ chế, cái nào đã sửa, cái nào còn. (3) **Bài kiểm đỏ khi tắt bản sửa**, kèm ít nhất một cách nói MỚI chưa từng bắn. Lỗi thuộc lớp "máy đoán ý bằng từ khoá" thì KHÔNG vá bằng cách thêm từ vào regex — đưa quyết định sang AI (đọc theo nghĩa, code kiểm trích dẫn), từ khoá lùi xuống lưới đỡ khi AI không chạy (mẫu: SRS-5.1q).

**Từ 30/09/2026 (chủ dự án: "bỏ luôn giờ ko cần FR nữa, viết vào trong docs đi"): sửa lỗi / cải tiến bot và web KHÔNG cần cấp FR trước khi code.** Thay vào đó ghi thẳng vào tài liệu tầng liên quan (thường là `docs/07` — một mục SRS kèm ca gốc, nguyên nhân, chỗ sửa, cách kiểm; ví dụ SRS-5.1a), cùng commit với code và test. FR cũ giữ nguyên số, vẫn là tham chiếu; ai muốn cấp FR cho một tính năng lớn vẫn được, chỉ không còn là cổng bắt buộc.

## 6b. Nguồn thiết kế

`design/` (token, 13 artboard, canvas) và việc Figma đã **xoá** 08/09/2026 (commit `459008d`); OPEN-45 đóng 10/09. Nguồn thiết kế còn lại là `docs/06-ui-design.md` (tone giọng, component) và chính code (`app/globals.css` là token thật). Không dựng lại Figma trừ khi chủ dự án yêu cầu.

## 7. Cách chạy pipeline BA

Quy trình đầy đủ (BA + tester + ba cổng + định nghĩa XONG): `docs/11-quy-trinh.md`.
Bản rút gọn nạp tự động cho agent: `.claude/skills/ba-pipeline/SKILL.md`.

**Cổng kiểm — chạy trước mọi commit:**

```bash
bun run kiem   # = kieu (tsc) + build + test:bot (256 e2e + FR-159/161/164/176/177 + tự kiểm TS-SEC) + truyvet
bun run test:sec   # TS-SEC thật trên DB thật — cần Internet, nên KHÔNG nằm trong `kiem`
bun run chat       # chat thử với bot trong terminal: DB giả trên máy; `-- --that` bắn production bằng ID thử (FR-246 e)
```

**Bộ đo bóc tách** (`bot/tests/do-boc/`, TS-DO-BOC-01, 23/09/2026): 110 ca cố định, cho con số "bot ghi đúng bao
nhiêu phần trăm" thay cho kiểu "5 ca vừa bắn thì qua". `bun run do-boc:nen` (trong job CI `bot`) đỏ khi luật
một mình TỤT so với `nen.json`. Số production đo bằng cách bắn Zalo thử `do-*` (README của bộ đo) — bắn
mẻ ≤ 20 người: 110 cùng lúc làm DB Free huỷ `tao tin rao` vì quá giờ và số đo sai. **Thêm ca mới đạt thì cập
nhật `nen.json` cùng PR; xoá ca khỏi `nen.json` là chấp nhận tụt, phải ghi lý do.** **Tiền (04/10/2026):** mỗi tin bắn
production ≈ 3 lượt AI, cả bộ ≈ 450 lượt credit thật — chỉ chạy `do-boc.yml` khi PR đụng bóc tách và chọn `nhom`; để trống
`nhom` phải gõ `ca bo` (SRS-5.1zw). Bộ e2e offline là miễn phí, dựa vào nó trước.

**Khách mô phỏng** (`bot/tests/mo-phong/`, TS-MO-PHONG-01, 11/10/2026): model đóng vai 1–5 kiểu chủ nhà (`persona.json`) chat với bot
production bằng Zalo thử `thu-mp-*`, chấm ghi đúng / lỗi lời bot / giám khảo AI (lỗi phải trích nguyên văn). Chạy tay qua `mo-phong.yml`,
tiền thật (~10 lượt × ~4 lượt AI mỗi persona), không vào CI; tự dọn dữ liệu thử. Bộ chấm tự kiểm offline nằm trong `test:bot`.

**Phát lại** (`bot/tests/phat-lai/`, TS-PHAT-LAI-01, 11/10/2026, SRS-5.1zzzzzd): tin khách mô phỏng mang cờ `ghi_ai` → chat-reply ghi nguyên đầu ra
model của lượt vào `ai_ghi_thu` (chỉ ID thử, giữ 2 ngày), log `mo-phong.yml` in dòng `PHAT_LAI_JSON`; `lay-tu-log.mjs` cắt thành ca ở `ca/`,
`phat-lai.mjs` (trong `test:bot`) bơm lại qua handler thật trên DB giả, không tốn tiền. **Lỗi thấy ở khách mô phỏng: lấy ca, thêm `ky_vong`, thấy
đỏ trên code cũ rồi mới sửa; ca không xoá khi sửa xong.** e2e dùng model giả chỉ kiểm giả định của người sửa — đừng coi e2e xanh là đủ.

Bốn job đó chạy trong CI (`.github/workflows/kiem.yml`) mỗi PR, kể cả `test:sec`.
**Thoát 2 của `test:sec` nghĩa là "chưa kiểm được", không phải "đạt"** — bản đầu
của nó coi mọi HTTP ≥400 là bị chặn và báo 24/24 xanh trong lúc proxy chặn sạch,
chưa request nào tới Supabase. Bài tự kiểm offline
(`bot/tests/ts-sec-anon.tu-kiem.mjs`) dựng PostgREST giả để chứng minh nó không
tái phạm; sửa bộ probe thì phải chạy lại bài đó. Người và
máy dùng chung script trong `package.json` — đừng gõ lệnh rời, không thì "máy
xanh, máy tao đỏ" và không ai biết bên nào đúng. `scripts/soat-truy-vet.sh` bắt
ID gãy, FR thiếu dòng truy vết, số đếm README lệch, SĐT thật lọt vào `docs/`,
khoá service_role bị ghi vào file, và web trỏ `raw.githubusercontent.com`.

**Skill PM mượn ngoài** (`phuryn/pm-skills`, MIT — kiểm license 03/09/2026;
marketplace đã khai ở `.claude/settings.json` không ghim commit, nên nội dung
skill đổi theo thượng nguồn; Claude Code sẽ hỏi cài lần đầu mở repo). Dùng làm
*khung trình bày*, không thay `ba-pipeline`; chúng viết bằng tiếng Anh và không
biết ID truy vết, nên kết quả phải đổi sang tiếng Việt và gắn `BR-/FR-/DH-` tay:

| Việc | Skill | Đã dùng ở |
|---|---|---|
| Canvas chiến lược 9 ô | `/product-strategy` | `docs/00-dinh-huong.md §0.4` |
| Chỉ số sao Bắc Đẩu + chỉ số đầu vào | `/north-star-metric` | `§0.5` |
| Phản biện kế hoạch (giả định chịu lực) | `/strategy-red-team` | `§0.7` |
| Đối chiếu tài liệu ↔ code theo ranh giới tin cậy | `/intended-vs-implemented` | soát bảo mật kiểu FR-167 |
| Kịch bản kiểm thử từ tiêu chí nghiệm thu | `/test-scenarios` | nháp cho `docs/10` (giữ ID `TS-` của mình) |
| Job story cho tính năng chat | `/job-stories` | nháp UF mới |

Không dùng: `competitor-analysis` / `competitive-battlecard` (tìm nguồn tiếng
Anh, không biết batdongsan/mogi), `pm-toolkit`, `pm-data-analytics`.

## 8. Dùng với Cline (VS Code, chạy local)

`.clinerules/` chứa bản đồ tương đương cho Cline: luật dự án tự nạp +
3 workflow gõ bằng lệnh slash trong chat Cline:

| Lệnh | Việc |
|---|---|
| `/ba-pipeline.md` | Thêm/sửa yêu cầu giữ truy vết |
| `/soat-truy-vet.md` | Soát ID gãy trước commit |
| `/review-docs.md` | Review diff đụng docs/ |

Claude Code và Cline dùng chung nguồn sự thật (`docs/`) — harness
hai bên phải được cập nhật song song khi quy ước đổi.

## 9. Agent vai phụ (.claude/agents/)

Hai vai gọi được từ mọi phiên Claude Code mở repo này (`figma-builder` xoá 10/09/2026 cùng `design/`):

| Agent | Việc | Khi nào |
|---|---|---|
| `soat-truy-vet` | Soát ID gãy, truy vết thiếu, số đếm lệch, PII | Trước mọi commit đụng docs/ |
| `reviewer` | Review diff/PR theo checklist BA, chỉ báo finding | Khi review PR |

Routine nền: soát docs hằng đêm 22:00 (giờ VN) trên phiên mới, chỉ báo khi có lỗi.
