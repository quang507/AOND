# 07 — Software Requirements Specification

**Hệ thống**: Aioinhadat (AI Ơi Nhà Đất) × nhadat.cc · **Phiên bản**: v3.0 · **Ngày**: 2026-10-28
**Cơ sở**: `02-requirements.md`, `03-user-flows.md`, `04-information-architecture.md`,
code ở HEAD (`src/aioi/`, `bot/`, `app/`) và DB thật project **`rqxmmqmctpklqcmbfxuj`** (Tokyo, gói Free).
Project cũ `tbcdpupiarkuxtntmosl` bị xoá nhầm 08/10/2026; mã đó chỉ còn trong các mục lịch sử.

Tài liệu này tả **hệ thống như đang chạy**. Nguồn của mọi khẳng định là code
trong repo và DB thật. v3.0 viết lại §1, §2, §4 theo kiến trúc lõi Python
(chủ dự án 28/10/2026: "Kiến trúc đúng — bỏ"; "bỏ hẳn CTV đi") `[nguồn: chủ dự án 28/10/2026, chat]`.
§3 chỉ sửa chỗ nhắc bảng đã gỡ và CTV. Các mục `SRS-5.1…` ở §5 là nhật ký sửa, giữ nguyên.
Mục thiết kế chưa dựng chỉ còn một dòng "Không dựng — thay bằng …" để giữ ID
cho `08-traceability.md`.

---

## 1. Giới thiệu

### 1.1 Mục đích
Đặc tả phần mềm đang vận hành để nghiệm thu (`§7`), kiểm thử (`docs/10`) và
mở rộng mà không lệch khỏi yêu cầu ở `02-requirements.md`.

### 1.2 Phạm vi hệ thống

| Mã | Phân hệ | Đường thật |
|---|---|---|
| `WEB` | Website công khai | Next.js ở root repo: `/`, `/[tag]`, `/mua-ban`, `/cho-thue`, `/nha-dat/[code]`, `/du-an`, `/du-an/[slug]`, `/ban-do`, `/moi-gioi`, `/thong-ke`, `/ds/[token]`, `/bao-cao-gia/[code]` (SRS-5.1zzzzzzz455), `/raoban`, `/tai-khoan`, `/yeu-thich`, `/tinh-lai-vay`, `/thue-hay-mua`, `/cam-nang`, `/cam-nang/[slug]`, `/gan`, `/gan/[slug]` |
| `BOT` | Bộ não hội thoại (B và S) | Lõi Python `src/aioi/` trên máy 146 "NguyetTu" (Windows, Task Scheduler `AOND Core`, `C:\aond\aond_core`, cổng 8000), endpoint `POST /chat-reply`; một lõi cho cả người mua lẫn người bán, vai theo ý định từng lượt (SRS-5.1zzzzzzz153) |
| `KENH` | Kênh Zalo | Bridge `zca-js` 2.2.0 (`bot/bridge-zca/index.mjs`) trên tài khoản Zalo cá nhân (clone), HAI tiến trình trên máy 146 (`C:\aond\bridge-zca`, Task Scheduler): số ký gửi (`AOND Zalo Bridge`, `/send` :5005) và số tư vấn người mua (`AOND Zalo Bridge Tu Van`, :5006, `SO_NHAN=tu_van`) (SRS-5.1zzzzzzz210, SRS-5.1zzzzzzz401). Zalo OA không dùng |
| `SEL` | Phía người bán | Cùng lõi, nhánh bán; `/quan-ly` + `/dang-nhap` cho NMG trên web |
| `ADM` | Admin | `/admin`, `/admin/tin-nhan`, `/admin/cau-chuan`, `/admin/danh-gia`, `/admin/dang-tin`, `/admin/ro-hang`; việc nội bộ (câu khách hỏi, lịch xem, cần người thật) đi thẳng admin qua `reminders` → `escalation-feed` → bridge; cảnh báo ntfy |

**CTV không còn là phân hệ** (chủ dự án 28/10/2026: "bỏ hẳn CTV đi"). Mọi việc từng giao CTV nay giao admin, hoặc chủ nhà
khi tin có chủ nhà trên hệ thống (SRS-5.1zzzzzzz165, SRS-5.1zzzzzzz170, SRS-5.1zzzzzzz172, SRS-5.1zzzzzzz173).
Code và DB đã gỡ CTV (SRS-5.1zzzzzzz238 / 239): không còn bảng `ctvs`, view `ctv_ranks`, cột `ctv_id`, hàm `chon_ctv`; `la_nhan_vien`
chỉ tra bảng `admins`. Còn lại duy nhất giá trị enum `msg_sender = 'ctv'` (không ai ghi) `[nguồn: bot/supabase/schema.sql, 01/11/2026]`.

### 1.3 Tài liệu tham chiếu
`docs/00`…`docs/06`, `docs/09-open-issues.md`, `docs/10-ke-hoach-kiem-thu.md`, `docs/13-so-do-nhan-va-boc-tach.md` (sơ đồ một lượt chat),
`scripts/trien-khai-146.sh` (đưa lõi lên máy 146; VPS bỏ 06/11/2026, script VPS cũ đã xoá 13/11/2026, lấy lại ở lịch sử git), `CLAUDE.md` §6 (luật đang áp, mỗi dòng kèm `SRS-…`).

---

## 2. Kiến trúc tổng thể

`[nguồn: src/aioi/server.py, src/aioi/engine.py, bot/bridge-zca/index.mjs, scripts/trien-khai-146.sh, bot/supabase/functions/, bot/supabase/schema.sql, 28/10/2026; máy chạy cập nhật 12/11/2026]`

```mermaid
flowchart TB
    ZK["Zalo app khách<br/>(người mua / người bán)"]
    ZA["Zalo app admin"]
    W["Web Next.js 15 · Vercel<br/>aond.vercel.app"]
    subgraph M146["Máy 146 NguyetTu · Windows · Task Scheduler"]
        BR1["bridge zca-js · số ký gửi<br/>AOND Zalo Bridge · /send 5005"]
        BR2["bridge zca-js · số tư vấn<br/>AOND Zalo Bridge Tu Van · /send 5006"]
        CORE["Lõi Python aond-core<br/>FastAPI 127.0.0.1:8000<br/>POST /chat-reply · GET /health<br/>vòng nền: gui_nhac 60 s · nhip_loi 60 s · bao_can_moi 10 phút<br/>giu_ket_noi · hoi_con_ban · qc_anh · xoa_logo · hoi_sau_dang"]
        SQL[("SQLite aioi.db<br/>kho phụ của lõi")]
    end
    subgraph SB["Supabase rqxmmqmctpklqcmbfxuj"]
        DB[("Postgres + RLS + pgvector<br/>bảng · trigger · RPC · view")]
        EF["Edge Functions (Deno)<br/>escalation-feed · geocode-listings · media-cleanup"]
        CRON["pg_cron → pg_net"]
        ST[("Storage<br/>listing-public · listing-private")]
        VA["Vault"]
    end
    CL["Claude<br/>chat + bóc tách: Sonnet 5.5"]
    DP["Dự phòng khi Claude hỏng<br/>Gemini → Groq"]
    EMB["Gemini embedding 768 chiều"]
    WH["Groq Whisper<br/>(tin thoại)"]
    OSM["Nominatim · Overpass<br/>MapLibre + OpenFreeMap"]
    NTFY["ntfy.sh"]

    ZK <--> BR1
    ZK <--> BR2
    ZA <--> BR1
    BR1 -->|POST /chat-reply| CORE
    BR2 -->|POST /chat-reply| CORE
    CORE -->|POST /send| BR1
    CORE -->|POST /send| BR2
    CORE --> SQL
    CORE -->|REST + RPC, service_role| DB
    CORE --> ST
    CORE <--> CL
    CORE <--> DP
    CORE --> EMB
    CORE --> WH
    BR1 -->|pull · ack · log · qr<br/>x-bridge-secret| EF
    BR2 -->|log · qr · pull trả rỗng| EF
    EF --> DB
    EF --> ST
    CRON -->|http_post + x-bridge-secret| EF
    CRON --> DB
    CRON --> EMB
    DB -->|tra_nominatim · tra_overpass| OSM
    DB -->|canh_bao_ngoai| NTFY
    W -->|publishable key, RLS| DB
    W --> ST
    W --> OSM
```

Ba điều hay hiểu nhầm:
- **Bộ não chỉ có một: lõi Python.** Edge function `chat-reply`, `zalo-webhook`, `nudge`, `ask-seller`, `ctv-report`,
  `inbound-sweep` đã gỡ 18/10/2026 (SRS-5.1zzzzzzz31, SRS-5.1zzzzzzz46). Prompt chỉ ở `src/aioi/prompts.py`.
- **Tin chủ động cho khách do lõi gửi**, qua `POST /send` của bridge: nhắc `followup` / `sold` / `feedback` / `admin_reply` / `len_web`
  (`gui_nhac.py`, SRS-5.1zzzzzzz216), báo căn mới (`bao_can_moi.py`, SRS-5.1zzzzzzz150), nhắc người bán 5 phút (`followup.py`).
  Tin gửi đúng số khách đang nhắn (`Conversation.so_nhan`).
- **Tin nội bộ cho admin / chủ nhà** đi đường khác: trigger DB đẻ `reminders(kind = 'escalation' | 'report')`, bridge số ký
  gửi kéo qua `escalation-feed`, tin cho admin mở bằng `$$$$$ ` (SRS-5.1zzzzzzz134). Số tư vấn không nhận việc này.

### SRS-2.1 — Tech stack

`[nguồn: package.json, src/aioi/config.py, src/aioi/llm/, bot/cau-hinh-loi.env, scripts/trien-khai-146.sh, bot/supabase/schema.sql; soát 28/10/2026, máy chạy 12/11/2026]`

| Lớp | Công nghệ |
|---|---|
| Lõi hội thoại | Python, FastAPI (`src/aioi/server.py`), chạy trên máy 146 "NguyetTu" (Windows) bằng Task Scheduler `AOND Core` (SYSTEM), mã ở `C:\aond\aond_core` (không phải git, chép file), venv `C:\aond\venv`, cổng 8000 (chỉ 127.0.0.1; vào máy qua Tailscale). Đưa mã lên và khởi động lại bằng `scripts/trien-khai-146.sh` (SRS-5.1zzzzzzz397); VPS và ô `cai-vps` gỡ 06–08/11/2026 (SRS-5.1zzzzzzz401) |
| Module lõi chính | `engine.py` (phiên chat, định tuyến bán / mua) · `prompts.py` (mọi prompt, `GIONG_VUI`, `AD_FORMAT`, `muc_phi`, `VUNG_NHAN_TIN`) · `schema.py` (`CORE_FIELDS`, `CORE_THEO_LOAI`, `FACETS`, `O_NOI_BO`) · `mua.py` (phía người mua) · `supabase_store.py` (kho Supabase) · `dia_danh.py` · `phap_ly.py` · `cau_mau.py` · `xung_ho.py` · `bao_can_moi.py` · `gui_nhac.py` · `lenh_zalo.py` · `anh_can.py` · `kho_anh.py` · `web.py` · `llm/` |
| Kho trạng thái | Supabase là nguồn chính (`SupabaseConversationStore`); SQLite `aioi.db` trên máy 146 là kho dự phòng khi thiếu khoá Supabase (`SqliteConversationStore`) |
| Kênh chat | Zalo cá nhân qua bridge `zca-js` 2.2.0 (ghim, SRS-5.1zzzzzzz177), tài khoản clone (quyết định chủ dự án 20/10/2026). Hai số: ký gửi và tư vấn (SRS-5.1zzzzzzz210). Bridge thả tim (`addReaction`), gửi ảnh qua `guiAnhQuaUrl` |
| AI chat | Claude **Sonnet 5.5** cho lượt trả lời khách thật (`AIOI_CHAT_MODEL`: một nguồn ở `bot/cau-hinh-loi.env`, chạy thật đặt trong `.env` lõi trên máy 146 — SRS-5.1zzzzzzz235 / 401); ID thử theo `AIOI_CHAT_MODEL_THU` (SRS-5.1zzzzzzz234) |
| AI bóc tách | Claude Sonnet 5.5 (`AIOI_EXTRACT_MODEL`, đồng bộ model chat — SRS-5.1zzzzzzz316 / 392; trống thì lấy model chat): lượt lập thao tác, đọc ảnh |
| Dự phòng | `llm/du_phong.py`: Claude hỏng thì Gemini rồi Groq; mỗi lần gọi ≤ 15 s, cả vòng ≤ 40 s (SRS-5.1zzzzzzz117, SRS-5.1zzzzzzz133) |
| Prompt caching | Cắt chuỗi system ở `RANH_GIOI_CACHE` (`llm/base.py`); chỉ phần trước dấu có điểm cache (SRS-5.1zzzzzzz166, SRS-5.1zzzzzzz213) |
| Tìm theo nghĩa | Gemini `gemini-embedding-001`, 768 chiều. Câu khách nhúng lúc chat (`dia_danh.py`); dữ liệu nhúng bằng lịch `nhung-tick`, `nhung-dia-danh-tick`, `nhung-luat-tick`. RPC: `tim_nha` (vector `listings.nhung`), `tim_dia_danh_theo_nghia`, `tim_dieu_luat` |
| Tin thoại | Groq Whisper chép ra chữ trước khi vào lõi (`server.py`, `transcribe_voice_url`) |
| DB | Supabase Postgres, RLS trên mọi bảng, trigger + RPC `security definer`, `pgvector`. Lõi đọc / ghi bằng `service_role` qua REST |
| Serverless | 3 Edge Functions (Deno): `escalation-feed`, `geocode-listings`, `media-cleanup` (`§4`); `_shared/` còn `claude.ts`, `gate.ts`, `geocode.ts`, `tin_nhac.ts`, `extraction/` (`luat-tien.ts`, `luat-lien-he.ts`, `nhan.ts`, `ds-phuong.ts`, `tien-ich.ts`) |
| Lịch / HTTP nội bộ | `pg_cron` + `pg_net` (`net.http_post`). Lịch nhắc tên trong repo: `nhung-tick`, `nhung-dia-danh-tick`, `nhung-luat-tick`, `geocode-tick`, `info-request-sla-tick` (chạy `info_request_sla_tick`), `bot-health-tick`, `media-cleanup-tick`, `don-du-lieu-thu`. Danh sách đủ ở SRS-5.3 |
| Bí mật | `.env` lõi trên máy 146 (`C:\aond\aond_core\.env`: khoá Claude, Gemini `GEMINI_API_KEY`…`_4`, Groq, service_role, khoá nội bộ `AIOI_NOI_BO_KEY` SRS-5.1zzzzzzz400; đặt tay, `trien-khai-146.sh` không động tới; quyền tệp siết bằng `scripts/siet-acl-146.ps1`, SRS-5.1zzzzzzz399); Vault giữ `BRIDGE_SECRET` và khoá cho hàm DB, đọc qua `get_secret()` chỉ `service_role` |
| Kho file | Supabase Storage (SRS-5.1zzzzzzz56): `listing-public/<uuid tin>/` (ảnh căn, công khai), `listing-private` (sổ đỏ, giấy tờ, PDF, tệp dự án; signed URL). SharePoint / OneDrive đã bỏ |
| Web | Next.js 15 (App Router) + TypeScript + Tailwind 4, Bun, deploy Vercel từ root repo. Link bot gửi lấy từ `src/aioi/web.py` (`AIOI_SITE_URL`, mặc định `https://aond.vercel.app` — project Vercel mới từ 05/11/2026, SRS-5.1zzzzzzz383; `aioinhadat.com` / `nhadat.cc` chưa trỏ về web) |
| Auth | Supabase Auth: Google OAuth + magic link email (NMG, admin, tài khoản B tự nguyện); không Zalo SSO |
| Bản đồ | MapLibre `maplibre-gl` 6.13.0 + nền OpenFreeMap, nạp qua `napMapLibre()` (`lib/ban-do.ts`), gom cụm `lib/cum-ghim.ts` (SRS-5.1zzzzzzz206, SRS-5.1zzzzzzz217). Toạ độ tin: từ điển `duong` trước, rồi Nominatim qua rpc `tra_nominatim`; tiện ích quanh tin qua rpc `tra_overpass` (SRS-5.1zzzzzzz152, SRS-5.1zzzzzzz224) |
| Cảnh báo | ntfy.sh (`canh_bao_ngoai`), `bot_health_tick` đọc `net._http_response` (NFR-18) |
| Quan trắc | `bot_errors` / `bot_health` / `bot_usage` / `bot_usage_model` + `/admin`; log lõi ghi tệp trong `C:\aond\logs` trên máy 146, đọc bằng `bot/tests/doc-log-loi.sh` qua ssh (TS-PROD-03, SRS-5.1zzzzzzz405); còi máy 146 báo lõi / bridge chết, Zalo văng phiên (SRS-5.1zzzzzzz402) |
| Kiểm thử | `bun run kiem` (tsc, `kieu:bot`, build, `test:bot`, `test:rohang`, `truyvet`); bắn thử production bằng ID thử qua `bot/tests/ban-thu-*.sh`, chạy từ máy cá nhân ssh vào máy 146 (SRS-5.1zzzzzzz405, `docs/10`) |

### SRS-2.2 — Đường giao tiếp S↔B

`[nguồn: src/aioi/mua.py, src/aioi/engine.py, src/aioi/gui_nhac.py, bot/supabase/schema.sql, 28/10/2026]` Một đường duy nhất, bằng bảng + trigger.
Không có HTTP giữa hai "side", không còn bước CTV.

1. Khách mua hỏi về căn → lõi ghi `info_requests(source = 'buyer_ask')` (`mua.py`). Trigger `route_info_request` giao:
   tin có chủ nhà trên hệ thống → `assignee = 'seller'`, hạn `chu_nha_han_gio()`; không có → `assignee = 'admin'` (migration `20261024a`, SRS-5.1zzzzzzz170).
2. Trigger `notify_info_request_escalation` sinh `reminders(kind = 'escalation')` cho người được giao, kèm mẫu "`#mã: câu trả lời`";
   bridge số ký gửi kéo qua `escalation-feed` rồi nhắn từ tài khoản clone. Chủ nhà quá hạn → nhắc admin ngay.
3. Người trả lời:
   - **Chủ nhà** đang chat với bot: lượt AI đọc ý thấy câu trả lời (`tra_loi_khach_hoi`) → `tra_loi_cau_hoi` đóng câu (`engine._handle`).
   - **Admin** nhắn "`#mã: …`" → `lenh_tra_loi` + `la_nhan_vien` + `tra_loi_theo_ma` (`engine._handle`, `mua.py`).
4. `info_requests.status = 'answered'` → trigger `info_request_bao_lai_khach` đẻ `reminders(kind = 'followup')` cho khách;
   **lõi gửi** qua `gui_nhac.py` (vòng `server._vong_gui_nhac`, 60 s, khung 8–21 giờ — SRS-423), câu mẫu `bao_tra_loi_chu_nha` (SRS-5.1zzzzzzz216).
5. Quá hạn: `info_request_sla_tick` (lịch `info-request-sla-tick`): chủ nhà quá `chu_nha_han_gio()` (12 giờ) → giao admin hạn
   `admin_han_gio()` (5 giờ); admin quá hạn → nhắc lại + email. Lịch xem (`viewings`) đi thẳng admin (`viewings_bao_admin_va_email`, SRS-5.1zzzzzzz165); admin trả lời `#mã: ok giờ` thì chốt lịch và báo khách.

[deprecated 28/10/2026 — bỏ CTV, chủ dự án] Bản v2.0 của mục này: giao CTV ít việc nhất, SLA 120 phút `ctv_sla_phut()`,
`chat-reply` nhánh `nguoi_noi_bo`, `nudge` gửi followup, vòng nhỏ giọt `ask-seller` / `ask_seller_drip()`. `chat-reply`, `nudge`,
`ask-seller`, `ask_seller_drip()`, `nguoi_noi_bo`, `ctv_sla_phut()` đã gỡ.

---

## 3. Mô hình dữ liệu

`[nguồn: information_schema + pg_constraint + pg_policies, DB 04/09/2026; soát lại theo bot/supabase/schema.sql 28/10/2026]`

> **Soát 28/10/2026, đếm lại 13/11/2026 (SRS-5.1zzzzzzz464).** `schema.sql` hiện có **46 bảng** `public`. Đã gỡ, mọi chỗ nhắc dưới đây là LỊCH SỬ: `listing_facts` (SRS-5.1zzzzzzz66,
> ô tin một nguồn `listings.boc_tach`), `required_facts` (`20261019g`, bộ câu hỏi nay ở `src/aioi/schema.py`), `bot_prompts`, `mau_cau`,
> `van_kich`, `inbound_ledger`, `inbound_events`, `ai_ghi_thu`, `ctv_daily_reports`, `du_an_can`, `du_an_tai_lieu`, `project_fact_phieu`
> (`20261018i`), `boc_tach_bong`, `ratings_log`, `project_facts`; trigger `listing_insert_drip`, `bao_tin_moi_khop`,
> `trg_conversations_assign_ctv` + hàm `assign_ctv_round_robin` (`20261025a`); view `listing_missing_facts`, `job_suc_khoe`; bảng `media` (`20261102a`).
> Bảng mới sau 08/10: `bot_usage_model`, `cau_chuan`, `cau_mau`, `danh_gia_ai`, `du_an_kien_thuc`, `giao_lo`, `kien_thuc_phap_ly`,
> `listing_noi_bo`, `van_ban_luat`, `dieu_luat`, `nhung_viec_luat`, `xa_tinh_khac`; sau 28/10: `buyer_needs` (`20261029f`), `ranh_gioi_phuong` (`20261103b`), `loai_phap_ly` (`20261112g`). CTV: bỏ hẳn (chủ dự án 28/10/2026), phần CTV còn
> trong DB là tàn dư chưa dọn (§1.2).
Khối: `cột:kiểu`, `!` = NOT NULL, `=` = default, `→` = FK. PK `uuid` trừ khi ghi khác. Enum thật:
`listing_deal(ban, cho_thue)`, `property_type(nha_pho, nha_cap4, chung_cu, dat, biet_thu, phong_tro, mat_bang, toa_nha, dat_nong_nghiep, dat_kinh_doanh, kho_xuong, chua_ro)` (4 loại sau thêm `20260909i`),
`seller_type(ccrb, nmg, unknown)`, `request_status(pending, answered, expired)`, `msg_sender(buyer, seller, bot, ctv, system, human)`,
`unit_status(con_ban, giu_cho, da_coc, da_ban)`.

### SRS-3.0 · Bản đồ 46 bảng và đường ghi ô tin

`[nguồn: pg_class + pg_description, DB 06/09/2026]`

Ba tháng sau mở lại repo, thứ mất trước tiên là *cái nào thuộc về cái nào*. Mục
này là bản đồ đó. Nó KHÔNG đẻ nguồn sự thật thứ hai: chú thích tương ứng đã nằm
trong chính DB (`comment on table/column`, migration `20260906b`), hiện ra ngay
dưới tên bảng trong Supabase Table Editor. Đây là bản in ra giấy của thứ đó.

**Năm nhóm, 46 bảng** (đếm `create table` trong `bot/supabase/schema.sql`, soát lại 13/11/2026). Tiền tố `[NHÓM]` nằm ngay đầu chú thích mỗi
bảng (`comment on table` trong migration), nên Table Editor xếp A→Z mà mắt vẫn gom được theo việc. `bot_usage_model`, `chat_quota`,
`bridge_dang_nhap` xếp theo việc [giả định BA: chưa thấy dòng `comment on table` của ba bảng này trong migration].

| Nhóm | Bảng |
|---|---|
| `[RỔ HÀNG]` (15) | `listings` `listing_media` `listing_noi_bo` (SRS-5.1zzzzzzz116) `media_cleanup_queue` `projects` `listing_views` `wards` (FR-209) `tien_ich` (FR-204) `duong` (FR-212) `phuong_cu` `quan_cu` (`20260930a`) `giao_lo` (SRS-5.1zzzzzzz43) `xa_tinh_khac` (SRS-5.1zzzzzzz128) `ranh_gioi_phuong` (SRS-5.1zzzzzzz360) `loai_phap_ly` (SRS-5.1zzzzzzz435). Bảng `media` lối cũ đã gỡ (`20261102a`) |
| `[NGƯỜI & HỘI THOẠI]` (11) | `buyers` `buyer_needs` (SRS-5.1zzzzzzz286) `sellers` `conversations` `messages` `interests` `info_requests` `viewings` `deals` `reminders` `danh_gia_ai` (SRS-5.1zzzzzzz104) |
| `[BOT & HÀNG ĐỢI]` (15) | `bot_errors` `bot_health` `bot_usage` `bot_usage_model` `chat_quota` `cau_chuan` (SRS-5.1zzzzzzz88) `cau_mau` (SRS-5.1zzzzzzz106) `nhung_viec` `nhung_viec_du_an` (FR-216) `nhung_viec_dia_danh` (`20260930a`) `nhung_viec_luat` `du_an_kien_thuc` (SRS-5.1zzzzzzz56) `kien_thuc_phap_ly` (SRS-5.1zzzzzzz176) `van_ban_luat` `dieu_luat` (SRS-5.1zzzzzzz231) |
| `[CTV]` (0) | Đã gỡ: `ctvs` (SRS-5.1zzzzzzz238), `ctv_daily_reports` (`20261018i`) — không còn vai CTV (chủ dự án 28/10/2026) |
| `[HỆ THỐNG]` (5) | `admins` `app_config` `curated_lists` `property_events` `bridge_dang_nhap` (FR-201; một dòng mỗi số Zalo, SRS-5.1zzzzzzz210) |

**Quan hệ chính** — chỉ khoá ngoại thật, không vẽ luồng chạy:

```mermaid
erDiagram
  projects  ||--o{ listings      : "project_id"
  sellers   ||--o{ listings      : "seller_id"
  listings  ||--o{ listing_media : "ảnh (neo UUID)"
  listings  ||--o{ interests     : ""
  listings  ||--o{ info_requests : ""
  listings  ||--o{ deals         : ""
  listings  ||--o{ viewings      : ""
  buyers    ||--o{ interests     : ""
  buyers    ||--o{ deals         : ""
  buyers    ||--o{ buyer_needs   : "mỗi bộ nhu cầu một dòng"
  buyers    ||--o{ conversations : "buyer_id"
  sellers   ||--o{ conversations : "seller_id"
  conversations ||--o{ messages  : "sắp theo seq"
  van_ban_luat  ||--o{ dieu_luat : ""
```

Một hội thoại có thể gắn CẢ `seller_id` và `buyer_id` (một Zalo = một khách = một hội thoại, SRS-5.1zzzzzzz149). Khoá ngoại
Cột `ctv_id` đã gỡ khỏi `conversations`, `info_requests`, `reminders`, `deals` (SRS-5.1zzzzzzz238).

Ba chỗ hay hiểu nhầm, nói thẳng ở đây:

- **Không có bảng `buyer_preferences`.** Bộ nhu cầu ĐANG NÓI nằm ở cột `buyers.preferences` (jsonb); mỗi bộ nhu cầu của khách
  (mua ở, đầu tư, tìm giùm con…) một dòng `buyer_needs` (SRS-5.1zzzzzzz286).
- **Không có bảng câu hỏi theo loại BĐS.** Bộ câu hỏi theo loại chỉ ở `src/aioi/schema.py` (`CORE_FIELDS` theo nhóm,
  `CORE_THEO_LOAI` đè cho loại riêng, SRS-5.1zzzzzzz68). Bảng `required_facts` đã gỡ (`20261019g`).
- **Ảnh căn chỉ ở `listing_media`.** Bảng `media` lối cũ (trỏ file NGOÀI Supabase) đã gỡ (`20261102a`). `listing_media` (FR-165) là ảnh
  trong Storage, neo `listings.id`; web đọc qua view `listing_photos_v`. Từ 09/09/2026 không còn `masterDB/` trên máy chủ dự án,
  rổ hàng đến từ tin rao thật qua chat và rổ mẫu `seed_thu` (SRS-5.1zzzzzzz167, SRS-5.1zzzzzzz168).

**Đường ghi ô tin — một nguồn `listings.boc_tach`** (SRS-5.1zzzzzzz66). Hình trạng hiện tại:

```mermaid
flowchart TB
  k["tin khách (chat Zalo)"] --> ai["lõi: lượt AI lập thao tác<br/>Engine._lap_ke_hoach<br/>vòng agent Sonnet (agent_gop) · form dự phòng<br/>AIOI_EXTRACT_MODEL = Sonnet 5.5"]
  ai --> gate["cổng bằng chứng<br/>_loc_o_tin → _gia_tri_ghi<br/>cụm trích phải nằm trong lời khách"]
  gate --> prop["ô tin của căn<br/>Property.update"]
  prop --> save["supabase_store.save<br/>listings.boc_tach + cột listings"]
  save --> trg["trigger listings BEFORE<br/>chuẩn hoá cột · giá · loại · boc_thong_so · mã · lên kệ"]
  trg --> db[("listings")]
  web["/admin/dang-tin, /raoban"] --> db
```

Không còn nhánh regex TS và `listing_facts`; luật bậc `bac_nguon()` đã gỡ khỏi DB. Ô chủ nhà nói riêng (`schema.O_NOI_BO`) ghi
bảng `listing_noi_bo`, không vào `boc_tach` công khai (SRS-5.1zzzzzzz116).

**Ranh giới bóc tách ⟂ AI có máy canh** (phần TS còn lại ở `bot/supabase/functions/`; lõi Python không thuộc bài này).
`bot/tests/ranh-gioi.mjs` (nằm trong `bun run test:bot` / `bun run kiem`; CI `kiem.yml` vẫn chạy nhưng không chặn — commit thẳng `main`, chủ dự án 11/11/2026) chặn hai chiều: mã bóc tách tiền định
không được import SDK Anthropic / `claude.ts` / gọi RPC; tầng AI không được ghi
bảng nghiệp vụ, chỉ ba RPC đã khai tên (`get_secret`, `log_loi`, `cong_token`).
Bài có ca âm nên luật hỏng thì bài đỏ, không im.

**Đọc rổ hàng bằng mắt người:** [deprecated] view `ro_hang_ban` đã gỡ (`20261102a`) — dùng `so.ro_hang` dưới đây.

**Nhìn như Excel:** schema `so` (`20260907c`) tách riêng khỏi `public` để Table
Editor / Schema Visualizer không lẫn 38 bảng + 19 view ruột bot (đếm trên DB 18/09/2026). Hai view:
`so.ro_hang` — 9 cột đầu đúng thứ tự sheet Excel gốc Q5 (trong `masterDB/`) (stt · bán
hay thuê · vị trí · diện tích · giá · mô tả · SĐT · người bán), cột thêm xếp
sau, cả bán lẫn cho thuê; `so.nguoi_ban` — mỗi người bán một dòng, đếm tin;
`so.hoi_thoai` (`20260907g`) — log chat đọc được: lúc · ai · nội dung · phía bán/mua,
lọc theo `hoi_thoai` để đọc trọn một cuộc (nguồn `messages`, không SĐT).
PostgREST không phơi schema này, `anon`/`authenticated` bị revoke,
`security_invoker = on`. Khác Excel: cột SĐT là SĐT **người bán đã ký** (60/173
tin), DB không giữ SĐT theo tin (FR-104). `xuat_schema()` chỉ quét `public` nên
`so` không nằm trong `schema.sql`; dựng lại phải chạy thêm hai file migration
(`20260907c`, rồi `20260907f` — ô đọc một dòng: mô tả gộp xuống dòng thành
` · `, vị trí bỏ đuôi `, Quận 5, Hồ Chí Minh`, diện tích dấu phẩy thập phân)
[giả định BA: chấp nhận vì view không mang dữ liệu].

### SRS-3.1 · `listings`

```text
id:uuid!  code:text! unique ('BDS-Q5-0001', trigger listings_fill_code)  legacy_sst:int
seller_id:uuid→sellers  deal:listing_deal!=ban  status:text!=cho_thong_tin
district:text!='Quận 5'  ward:text  street:text  location_raw:text  lat,lng:numeric
property_type:property_type=chua_ro  project_id:uuid→projects  unit_code:text  unit_status:unit_status
area_m2,legal_area_m2,built_area_m2:numeric  frontage_m,length_m,rear_width_m:numeric
floors:int  floors_text:text  floor:int  bedrooms:int  bathrooms:int  direction:text
access_type:text  alley_width_m,distance_to_street_m:numeric
legal_status:text  has_completion:bool  planning_status:text
has_elevator,car_in_house,corner_lot,negotiable:bool  furnishing:text  year_built:int
price_raw:text  price_vnd:bigint  price_per_m2_vnd:bigint(generated)  rent_income_vnd:bigint
description:text  source:text!=import_excel  source_url,cc_link:text
property_type_source,price_source,ward_source:text!=suy_doan  specs_source:text
last_confirmed_at,last_interest_at:timestamptz  created_at,updated_at:timestamptz!
nhan:text[]!='{}' (FR-211, chỉ mục GIN, khoá theo từ điển `_shared/extraction/nhan.ts`; ghi qua RPC `them_nhan_tin`)
```
Soát 28/10/2026: khối trên là bản 04/09. `schema.sql` nay có 66 cột (đếm lại 13/11/2026; SRS-5.1zzzzzzz140, OPEN-64): KHÔNG còn `legacy_sst`, `unit_status`,
`source_url`, `cc_link`, `specs_source`, `last_confirmed_at`; thêm `boc_tach` jsonb (ô tin một nguồn, đọc qua `o_boc_tach()`, SRS-5.1zzzzzzz66),
`can_chu_duyet`, `chu_duyet_at`, `gap`, `legacy_code`, `toa_do_muc`, `geocode_at`, `tien_ich_gan`, `tien_ich_at`, `nhung` / `nhung_md5` / `nhung_luc`
(vector cho `tim_nha`), `cung_can_id`, `xac_nhan_con_ban_at`, `can_kiem_chung`. RPC `them_nhan_tin` không còn trong `schema.sql`.
Bản đồ ánh xạ đầy đủ 67 cột (nghĩa, khách nói ví dụ, ghi từ đâu, fact liên quan, lọc ở đâu) + fact → cột + ma trận 12 loại BĐS:
`docs/anh-xa-du-lieu-listings.xlsx` (ảnh chụp 18/09/2026 từ `information_schema` + trigger + `required_facts` + 10 tin bắn thật; đổi schema thì phải làm lại — đã lệch: `required_facts` gỡ 19/10).

- CHECK `status ∈ {cho_thong_tin, dang_ban, dang_quan_tam, da_coc, da_chot, an}` (FR-139; `da_coc` có trong `schema.sql` 28/10); `access_type ∈ {mat_tien, hem_xe_tai, hem_xe_hoi, hem_xe_may, hem}`;
  `legal_status` không còn CHECK — khoá ngoại `listings_legal_status_fkey` → `loai_phap_ly(ma)` (`20261112g`, SRS-5.1zzzzzzz435); `furnishing ∈ {full, co_ban, khong}`; `bedrooms 1..60`;
  `*_source ∈ {suy_doan, chu_xac_nhan, admin, admin_xac_minh}`; `toa_do_muc ∈ {duong, phuong, quan, du_an, tay}`; CHECK `specs_source` đã mất cùng cột (FR-164/172).
- Trigger BEFORE (theo tên, `schema.sql` 28/10): `trg_listings_chuan_hoa_cot` · `trg_listings_fill_property_type` (FR-150) · `trg_listings_price_vnd` (FR-154) ·
  `trg_y_listings_boc_thong_so` (FR-172) · `trg_z_listings_normalize_status` · `trg_zy_listings_chan_so` · `trg_zz_listings_dang_tin` (lên kệ, FR-144) ·
  `trg_listings_zz_doi_ma` · `trg_listings_zz_fill_code` · `trg_listings_zz_toa_do`.
  AFTER: `trg_listings_bao_can_da_chot` (FR-108), `trg_listings_day_ro_ccrb`, `trg_pe_listings` (FR-70).
  Đã gỡ: `listing_insert_drip` (FR-129, `20261018i`), `bao_tin_moi_khop` (FR-64, `20261025h`).
- Index lọc: `(deal, price_vnd)`, `(deal, status, access_type)`, `(deal, status, floors)`, `(district, status)`; index partial `(project_id, unit_code)` (không unique).
- Policy: `anon_read_listings` chỉ `dang_ban | dang_quan_tam | da_coc | da_chot`; `listings_own_read/insert` (NMG tin của mình); `listings_admin_read/update/delete`.
- Luật: `area_m2` là diện tích chính (chung cư = tim tường), `legal_area_m2` là công nhận — hai cột khác nhau; `description` giữ nguyên văn
  câu rao, không trigger nào sửa (FR-91/153). [LỊCH SỬ] Luật bậc nguồn cho fact (`chu_xac_nhan` > `admin` > `suy_doan`, FR-163 a,
  FR-164 a) chạy trên `listing_facts` + `bac_nguon()`, cả hai đã gỡ; nay ô tin chỉ ghi điều khách nói qua cổng bằng chứng của lõi (SRS-5.1zzzzzzz73).

### SRS-3.2 · `property_events` — FR-70, FR-73

```text
id:bigserial  listing_id:uuid!→listings cascade  event_type:text!  buyer_id:uuid→buyers set null  at:timestamptz!=now()  meta:jsonb
```
- CHECK `event_type ∈ {view, asked, interest, photos, viewing, deal, match_sent, status, doi_gia}`; index `(listing_id, at desc)`, `(at desc)`; policy `property_events_admin_read`.
- Chỉ trigger `trg_property_event()` ghi (`ghi_su_kien_bds`, không bao giờ ném): `listing_views` → `view`, `info_requests` `buyer_ask` → `asked`,
  `interests` → `interest`, `viewings` → `viewing`, `deals` → `deal`, `reminders` match sent → `match_sent`, `listings` đổi `status` → `status`, đổi `price_vnd` (đã có giá trước đó) → `doi_gia` (`20261029e`). `photos` chưa có nguồn sinh.
- `hot_score` (FR-73) = view `bds_hot` tính lúc đọc (số sự kiện 60 ngày), không có cột/job.

### SRS-3.3 · `buyers`

```text
id:uuid!  zalo_user_id:text unique  auth_user_id:uuid unique→auth.users  name:text  phone:text
preferences:jsonb='{}'  last_contact_at:timestamptz  notes:text  bao_can_moi:bool!=true  created_at:timestamptz!
```
- `preferences` = hồ sơ nhu cầu tích luỹ, nay do lõi ghi (`mua.py`, `BuyerLead`); `merge_buyer_prefs()` đã gỡ. Cờ tắt báo căn mới:
  `buyers.bao_can_moi` (SRS-5.1zzzzzzz175).
- `phone`: bot chỉ chủ động xin số MỘT lần, lúc khách chốt lịch xem (SRS-5.1zzzzzzz148, NFR-07); khách tự để lại số lúc khác (không có lịch
  chờ) thì lõi vẫn lưu `buyers.phone` và xếp tin báo admin (`mua.ghi_sdt_hen_xem`, SRS-5.1zzzzzzz388). `/admin` không SELECT cột này. Policy `buyers_self_read/insert/update`, `buyers_admin_read/update`.
- Không có `connection_status`/`fingerprint_ids`: vết giữ chân ở `reminders.kind = reengage` (FR-63); fingerprint không dựng (OPEN-14).

### SRS-3.4 · `sellers`

```text
id:uuid!  zalo_user_id:text unique  auth_user_id:uuid unique→auth.users  phone:text unique  phone_proxy:text  name:text
seller_type:seller_type!=unknown  rating_sum:int!=0  rating_count:int!=0  active_listing_id:uuid→listings set null  created_at:timestamptz!
seller_type_source:text!=suy_doan ∈ {suy_doan, tu_nhan, admin} (trigger trg_sellers_nguon_nhan → sellers_nguon_nhan)
xung_ho:text ∈ {anh, chị, chú, cô, bác, ông, bà, dì, cậu, mợ, thím, dượng}  ten_tro_ly:text  gioi_tinh:text ∈ {nam, nu}  nhom_tuoi:text ∈ {tre, lon_tuoi}
```
- `seller_type` quyết định phí (CCRB 1 %, NMG 0,5 %, FR-101). Hồ sơ mở từ chat do lõi tạo (`supabase_store._get_or_create_seller`);
  `mo_ho_so_nguoi_ban` đã gỡ. Vai chỉ nhận khi cụm trích GỌI TÊN vai (`_vai_co_bang_chung`, SRS-5.1zzzzzzz213). Khách chỉ ở vai mua
  không có dòng `sellers` (SRS-5.1zzzzzzz149).
- `active_listing_id` = căn bot đang hỏi (FR-157), trigger `info_request_set_active_listing` giữ. `ghi_danh_gia()` đã gỡ; khách chấm sao
  cho AI ghi bảng `danh_gia_ai` (SRS-5.1zzzzzzz104).
- Policy `sellers_self_read/insert`, `sellers_admin_read/update`. Không có `fee_rate`, `email`, `contract_status`.

### SRS-3.5 · `conversations`, `messages` — FR-71, FR-72, FR-131, FR-141

```text
conversations  id:uuid!  buyer_id:uuid→buyers  seller_id:uuid→sellers  channel:text!=zalo_oa  started_at:timestamptz!
               last_message_at:timestamptz  needs_human:bool!=false  needs_human_at,human_touch_at,human_escalated_at:timestamptz
messages       id:uuid!  conversation_id:uuid!→conversations  sender:msg_sender!  body:text!  zalo_msg_id:text unique  seq:bigint! unique  created_at:timestamptz!  ghi_chu_test:text
```
- CHECK `conversations_co_vai_check` (`buyer_id` HOẶC `seller_id`, được cả hai — SRS-5.1zzzzzzz149; bản cũ là XOR `conversations_mot_vai`);
  unique partial `(buyer_id)`, `(seller_id)` — **một hội thoại/khách, không bao giờ đóng** (FR-131). Lõi ghi / đọc qua
  `supabase_store._hoi_thoai_chung` / `_tim_hoi_thoai`. Thêm `human_hold` (admin giữ hội thoại, SRS-5.1zzzzzzz82).
  "Cuộc trò chuyện" 30 phút của FR-72 tính lúc đọc ở view `hoi_thoai_phien`.
- Trigger: `conversations_email_upset` (`needs_human` false→true → `[UPSET]`); `assign_ctv_round_robin` đã gỡ (`20261025a`, SRS-5.1zzzzzzz172);
  `messages_bump_last_message` giữ `last_message_at = greatest(cũ, mới)` — ứng dụng không ghi tay (FR-171 h).
- `seq` là thứ tự tất định (FR-162). Policy chỉ `*_admin_read`; lõi ghi bằng `service_role`.

### SRS-3.6 · `info_requests` — FR-40…FR-44, FR-76, FR-110, FR-140, FR-173

```text
id:uuid!  listing_id:uuid!→listings cascade  buyer_id:uuid→buyers  question:text!  answer:text  status:request_status!=pending
source:text!=seller_flow  assignee:text  sla_due_at,sla_missed_at,chu_nha_qua_han_at,reminded_at,answered_at:timestamptz  created_at:timestamptz!
```
- CHECK `assignee ∈ {seller, admin}` (`route_info_request`, SRS-5.1zzzzzzz238).
  `source ∈ {seller_flow, buyer_ask}` (theo code); index partial `(sla_due_at) where pending and sla_missed_at is null`.
- Trigger: `route_info_request` (BEFORE, giao chủ nhà hoặc admin + hạn), `notify_info_request_escalation` (bỏ qua `xac_nhan_lich`/`con_ban`),
  `info_request_bao_lai_khach` (`answered` → followup; `xac_nhan_lich` → `viewings.status='confirmed'`), `huy_nhac_khi_da_tra_loi`,
  `info_request_set_active_listing`, `trg_info_request_thong_bao_khach_hoi`, `trg_pe_info_requests`.
- `question` với `buyer_ask` là chữ tự do. [LỊCH SỬ] `seller_flow` từng mang `fact_key` của `required_facts` và câu trả lời vào cột qua
  `listing_facts_sync_cols`; cả hai đã gỡ. Policy `info_requests_admin_read`.

### SRS-3.7 · `viewings` — FR-50…FR-57, FR-65

```text
id:uuid!  listing_id:uuid→listings  listing_code:text  buyer_id:uuid→buyers  guide:text  slot:timestamptz  time_text:text  phone:text
status:text!=proposed  buyer_rating:int  note:text  source:text=bot  created_at:timestamptz!
```
- CHECK `status ∈ {proposed, pending, confirmed, done, cancelled}`; `buyer_rating 1..5`; `viewings_can_neo` (`listing_id` hoặc `listing_code`).
- INSERT → `viewings_bao_admin_va_email`: nhắc **admin** ngay (SRS-5.1zzzzzzz165 / 238),
  mở câu `xac_nhan_lich` (`buyer_ask`), `email_admin('VIEWING')` (FR-52/57/81).
- Nhắc trước giờ xem = `reminders.kind='viewing'` kèm link bản đồ khi có toạ độ (FR-54); `viewing` sent → `feedback` +4 h (FR-56), lõi gửi
  (`gui_nhac.py`). `ghi_danh_gia()` đã gỡ. Số điện thoại khách ghi `viewings.phone` khi chốt lịch (`mua.ghi_sdt_hen_xem`, SRS-5.1zzzzzzz148).
- `phone` chỉ điền khi B đồng ý ở bước này (NFR-07). Policy `viewings_admin_read`.

### SRS-3.8 · `interests`, `listing_facts`, `deals` — FR-108, FR-112, FR-140, FR-153

```text
interests      buyer_id:uuid!→buyers cascade  listing_id:uuid!→listings cascade  created_at:timestamptz!   (PK cặp)
               trang_thai:text!=quan_tam ∈ {quan_tam, khong_hop}  ly_do:text
listing_facts  [ĐÃ GỠ 19/10/2026, SRS-5.1zzzzzzz66 — ô tin một nguồn listings.boc_tach]
deals          id:uuid!  listing_id:uuid!→listings  buyer_id:uuid→buyers  price_vnd:bigint  gia_chot_vnd:bigint  fee_pct:numeric  closed_at  created_at
               (khoá duy nhất (listing_id, buyer_id) đã bỏ — 20261029e, SRS-5.1zzzzzzz285: một dòng mỗi lần chốt)
```
- `interests`: `mark_listing_interest(codes, buyer_id)` ghi cho mọi căn khách nhắc/bot gợi/xin hình/nhờ hỏi chủ; tin sang `da_chot` → mỗi khách
  trong `interests` nhận `reminders.kind='sold'` (FR-108), lõi gửi (`gui_nhac.py`). Khách chê căn → `interests.trang_thai = khong_hop`
  (SRS-5.1zzzzzzz175), kèm `ly_do`.
- [LỊCH SỬ] `listing_facts` / `ghi_fact_listing()` / `listing_facts_sync_cols`: đã gỡ. Ô chủ nhà nói riêng nằm ở `listing_noi_bo` (chỉ admin).
- `deals`: căn cứ phí (`fee_pct` null khi chốt lúc `unknown`, OPEN-28); `deals_chan_xoa_da_chot` cấm xoá deal đã chốt. `price_vnd` = giá rao lúc
  chốt; `gia_chot_vnd` = giá chốt thật chủ báo trong chat (`20261113b`, SRS-5.1zzzzzzz456).
- Bất biến ẩn danh (FR-104/105): view/policy công khai không bao giờ trả `phone`, `zalo_user_id`, số nhà; trong hội thoại bot khai mọi thứ đã lưu
  về căn trừ liên hệ người bán (OPEN-36). [LỊCH SỬ] `locLienHe()` là hàm của `chat-reply` TS đã gỡ; luật che liên hệ còn ở
  `_shared/extraction/luat-lien-he.ts` (web dùng).

### SRS-3.8a · Hai luật chữ nghĩa bắt buộc

`[nguồn: chat-reply v48 — LỊCH SỬ; luật chữ nghĩa còn áp cho dữ liệu]`
- **`deal` có hai bảng từ vựng**: cột `listings.deal` = `ban | cho_thue`; JSON `buyers.preferences` và schema model = `ban | thue`. Bản TS dùng `dealCol()` (FR-163, đã gỡ cùng `chat-reply`); lõi Python phải tự giữ đúng hai bảng này.
- **Không đặt `\b` cạnh chữ tiếng Việt có dấu** — `\w` của JS chỉ là ASCII. Tự dựng biên (`(^|[^a-zà-ỹ])…(?![a-zà-ỹ])`) hoặc khớp trên bản bỏ dấu `boDau()` (FR-161).

### SRS-3.8b · Bảng phụ trợ

```text
curated_lists        id:uuid!  token:text! unique =24 hex  buyer_id:uuid→buyers set null  listing_ids:uuid[]! (1..60)  title  created_at
                     expires_at:=now()+30 ngày                                    -- FR-100; RLS, không policy; đọc/tạo qua RPC (SRS-4.3)
listing_media        id:uuid!  listing_id:uuid!→listings cascade  bucket:text!  storage_path:text!  media_type:text!  mime_type:text!
                     sort_order:int!=0  is_cover:bool!=false  created_at         -- FR-165
                     nguon:text!=kho  mo_ta:text  ocr:jsonb  variants:jsonb!='{}'  an_khoi_web:bool!=false
                     CHECK bucket ∈ {listing-public, listing-private}; media_type ∈ {mat_tien, trong_nha, phong_ngu, bep, wc, san_thuong, view, hem, so_do, giay_to, khac};
                     so_do/giay_to ⇒ bucket riêng; is_cover ⇒ bucket công khai; storage_path bắt đầu '<listing_id>/'; unique (bucket, storage_path);
                     unique partial một bìa/tin; trigger listing_media_giu_bia, listing_media_xep_hang_don (→ media_cleanup_queue)
media_cleanup_queue  id:uuid!  bucket,storage_path:text!  trang_thai:text!=cho ∈ {cho, dang_lam, xong, loi, chet}  attempts:int!=0  last_error
                     next_retry_at  created_at  updated_at                          -- FR-165 e, FR-166 g
inbound_events       [ĐÃ GỠ 18/10/2026, 20261018i] -- FR-162
inbound_ledger       [ĐÃ GỠ 18/10/2026, 20261018i] -- FR-162, FR-166
reminders            id:uuid!  kind:text! ∈ {promise, reengage, viewing, followup, escalation, report, match, feedback, sold, rating, admin_reply, len_web, con_ban}
                     buyer_id  seller_id  listing_id  viewing_id (FK cascade)  due_at:timestamptz!  note:text
                     status:text!=pending ∈ {pending, sent, cancelled, dead}  sent_at  locked_at  locked_by  attempts:int!=0  next_retry_at  last_error  noi_dung_gui:text
                     unique partial: (buyer_id, listing_id) match; (buyer_id, listing_id) sold; (viewing_id) feedback; (viewing_id) viewing pending; (buyer_id) reengage pending
                     -- FR-32/60…64/108/110/133/166 f; policy reminders_admin_read/update
                     -- 28/10: lõi gửi followup / sold / feedback / admin_reply / len_web (gui_nhac.py, SRS-5.1zzzzzzz216); escalation / report đi escalation-feed;
                     --        match là sổ báo căn mới của lõi (bao_can_moi.py, SRS-5.1zzzzzzz150)
ratings_log          [ĐÃ GỠ] -- FR-65; khách chấm sao AI nay ở danh_gia_ai (SRS-5.1zzzzzzz104)
ctvs                 [ĐÃ GỠ, SRS-5.1zzzzzzz238] -- FR-136/173
ctv_daily_reports    [ĐÃ GỠ 18/10/2026, 20261018i] -- FR-137
required_facts       [ĐÃ GỠ 19/10/2026, 20261019g] -- FR-153/177; bộ câu hỏi theo loại nay ở src/aioi/schema.py (CORE_FIELDS, CORE_THEO_LOAI)
listing_views        auth_user_id:uuid!→auth.users  listing_id:uuid!→listings  viewed_at; policy views_own_all   -- FR-126
admins               email:text! PK  zalo_user_id  zalo_phone; policy admins_self_read
app_config           key PK  value!  ghi_chu  (admin_email, ntfy_topic, functions_base_url, storage_public_base_url, publishable_key)
bot_prompts          [ĐÃ GỠ 18/10/2026, 20261018i] -- FR-138; prompt chỉ ở src/aioi/prompts.py
cau_mau / cau_chuan  câu bot nói nguyên văn (đè `cau_mau.MAC_DINH`) / câu chuẩn người chấm sửa làm ví dụ -- SRS-5.1zzzzzzz106, SRS-5.1zzzzzzz88; sửa ở /admin/cau-chuan
wards                ten:text! PK (tên MỚI không tiền tố, khoá tra Nominatim)  loai! ∈ {phuong, xa, dac_khu}  ten_day_du!  quan_cu! ("Quận 9" — chuỗi bocQuan/mã tin)
                     don_vi_2025:text[]!  tinh_cu! ∈ {TP.HCM, Bình Dương, Bà Rịa – Vũng Tàu}  don_vi_cu  lat,lng:numeric(9,6)  ma_hanh_chinh  nguon!  ghi_chu  created_at
                     -- FR-209 / FR-174 đợt 2 (20260915a): 168 dòng, nguồn NQ 1685 + Wikipedia; RLS bật, revoke anon/authenticated, chỉ service_role; xuat_schema() KHÔNG xuất dữ liệu → dựng lại chạy thêm migration
                     nhung:halfvec(768)  nhung_md5  nhung_luc   -- 20260930a: vector nghĩa (Gemini) của van_ban_dia_danh('wards', ten); cron nhung-dia-danh-tick
duong                id:uuid PK  ten:text! (có dấu, không tiền tố "Đường")  ten_khong_dau:text (generated: bo_dau(ten), index)  tinh! ∈ {TP.HCM, Tây Ninh, Đồng Nai} (tỉnh MỚI)
                     tinh_cu ∈ {TP.HCM, Bình Dương, Bà Rịa – Vũng Tàu}  phuong:text!='' (wards.ten_day_du)  quan_cu  nguon!  created_at; unique (ten, tinh, phuong)
                     -- FR-212 (20260921b): từ điển tên đường từ OSM/Overpass theo phường mới; RPC tim_duong(ten, quan, toi_da) khớp đúng/gần (fuzzystrmatch); chỉ service_role; dữ liệu nạp bằng scripts/nap-duong.mjs
                     loai ∈ {duong, so, hem}  so_hem ('137', '137/28')  duong_me  lat,lng (tâm OSM)  nhung:halfvec(768) (không nhúng hẻm)  nhung_md5  nhung_luc   -- 20260930a: giữ đường số + hẻm có toạ độ (nap-duong.mjs out center)
phuong_cu            id PK  ten! ('Phường 12', 'Phường Thảo Điền')  loai ∈ {phuong, xa, thi_tran}  quan_cu!  phuong_moi!→wards.ten  toan_bo!  lat,lng (tâm phường mới)  nhung  nguon  -- 20260930a: 487 dòng tách từ wards.don_vi_cu; unique (ten, quan_cu, phuong_moi)
quan_cu              ten PK ('Quận Gò Vấp')  lat,lng (trung bình tâm phường mới)  so_phuong_moi  nhung  -- 20260930a: quận / huyện / TP cũ trước 07/2025
media                [ĐÃ GỠ, 20261102a] -- bảng cũ đường OneDrive
```
- Không dựng: `tags`/`property_tags` (tag là hằng `lib/tags.ts`, 100 tag từ 12/11/2026 — SRS-5.1zzzzzzz433, FR-12; OPEN-06), `saved_criteria` (FR-64 đọc `buyers.preferences`),
  `escalations` (bốn loại đi `email_admin()`; vết việc ở `reminders`/`viewings`/`info_requests`), `photos` (thay bởi `listing_media`).

### SRS-3.9 · Bảo mật dữ liệu

`[nguồn: pg_policies, pg_class.relacl, storage.policies, DB 04/09/2026]` Anon key là khoá **công khai** (trong bundle JS và bridge) nên RLS + GRANT là bức tường duy nhất:

1. Vai `anon` chỉ SELECT; `authenticated` ghi có policy gác (`buyers`, `sellers`, `listings` nháp, `listing_views`, `listing_media` tin của mình); không ai có TRUNCATE (FR-167).
2. Bảng chỉ cho bot (`conversations`, `messages`, `info_requests`, `viewings`, `deals`, `interests`, `listing_noi_bo`,
   `curated_lists`, `media_cleanup_queue`, `app_config`; riêng `interests` còn `interests_admin_insert/delete` cho CRM; bản 04/09 còn `ctv_daily_reports`, `bot_prompts`, `required_facts`, `inbound_*`,
   `ratings_log` — đã gỡ) bật RLS, chỉ policy đọc cho admin hoặc không policy — anon 0 dòng; cảnh báo `rls_enabled_no_policy` là kỳ vọng.
3. Hàm là nội bộ trừ khi chứng minh ngược lại: EXECUTE mặc định chỉ `service_role`/`postgres`; ngoại lệ cố ý là hàm thuần `immutable` (`bo_dau`, `boc_thong_so`,
   `khu_khop`, `seller_rank`, `chuan_hoa_*`…; `bac_nguon` đã gỡ), `log_loi` (web Next chạy bằng publishable key), `doc_danh_sach` (anon), `bao_cao_gia_quanh` (anon + authenticated, trang `/bao-cao-gia/[code]`, `20261113a`, SRS-5.1zzzzzzz455), và cho `authenticated`:
   `admin_dang_tin`, `tao_danh_sach`, `la_admin`, `tin_cua_toi`, `thu_muc_dau_uuid`, `parse_vnd`, `guess_property_type`. Mọi hàm ghim `search_path`.
4. View công khai phải là **SECURITY DEFINER tự chứa** (`agents_public`; `listing_photos_v` nay `security_invoker`, anon đọc qua policy `listing_media_doc_cong_khai` — `20261112f`), chỉ lộ cột không định danh, chỉ tin đã lên kệ; view không dùng cho anon
   để `security_invoker` và revoke (`public_listings`, `media_mo_coi_*`; `public_media`, `listing_missing_facts`, `job_suc_khoe` không còn trong `schema.sql`).
   View admin (`nmg_hoat_dong`, `bds_hot`, `hoi_thoai_*`, `khach_can_nguoi_that`; `bot_do_tre` không còn trong `schema.sql` 28/10) gác `auth.role() = 'service_role'` hoặc email trong `admins` (FR-167 c).
5. Vault không chạm anon: `get_secret()` chỉ `postgres`/`service_role`.
6. Storage: `listing-private` không có route public; đọc duy nhất bằng signed URL 900 s do admin ký ở `/admin` (`storage_admin_private_all`, NFR-06). Bucket công khai:
   `storage_admin_public_all`; người bán chỉ INSERT/DELETE đường dẫn có thư mục đầu = UUID tin của mình (`tin_cua_toi(thu_muc_dau_uuid(name))`, FR-96).
   `listing_media` công khai chỉ đọc được khi TIN đã lên kệ (`listing_media_doc_cong_khai`, FR-167 c).
7. Cổng edge function (`_shared/gate.ts`): 3 function còn lại (`escalation-feed`, `geocode-listings`, `media-cleanup`) chỉ qua khi header `x-bridge-secret` khớp `BRIDGE_SECRET` (vé Bearer `service_role` đã bỏ 02/11/2026); đọc hụt hoặc chưa đặt secret thì
   chặn 503 + ghi `bot_errors` nguồn `<function> CONG DONG` (fail-closed, SEC-02), chỉ mở khi bật tay env `GATE_MO_KHI_CHUA_CO_BI_MAT=1` (ghi `<function> CONG MO`); bí mật đọc qua `docBiMat()` (env trước, Vault sau). Mọi hàm SQL gọi `net.http_post` tới function
   phải mang `x-bridge-secret`, trừ `canh_bao_ngoai` (FR-151 b, FR-167 b).
8. [deprecated 28/10/2026] `zalo-webhook` đã gỡ (SRS-5.1zzzzzzz46); không còn cửa Zalo OA. Lõi `aond-core` chỉ nghe 127.0.0.1, bridge gọi
   trong cùng máy; `/send` của bridge cũng chỉ nghe 127.0.0.1.

Hồi quy: TS-SEC-01…10, TS-SEC2 (`docs/10`) sau mọi migration đụng RLS/GRANT.

### SRS-3.10 · `projects` — FR-113…FR-117

```text
id:uuid!  name:text!  slug:text unique  developer  district  ward  province  location_raw  lat,lng:numeric  legal_status  amenities:jsonb
floor_plans:jsonb  images:jsonb  specs:jsonb  unit_types:jsonb  description  price_min,price_max:bigint  priority:int!=100  is_partner:bool!=false
handover_date:date  handover:text  status_text  source  source_url  created_at  updated_at
geocode_at:timestamptz  nhung:halfvec(768)  nhung_md5  nhung_luc  thong_tin:jsonb!='{}'
```
- `listings.project_id/unit_code/floor/direction/unit_status` nối căn với dự án; index partial `(project_id, unit_code)` (không unique). Policy `anon_read_projects` (true); `match_projects(text)` tìm dự án khách nhắc.
- Luật thừa hưởng (FR-115/116): câu tầng dự án trả từ `projects`, không sinh `info_requests`; "căn X còn không" đọc `unit_status`; `last_confirmed_at` > 7 ngày hoặc null → "để em xác nhận lại chủ".
  Soát 28/10/2026: `listings.unit_status` và `listings.last_confirmed_at` không còn trong `schema.sql` (SRS-5.1zzzzzzz140). Kiến thức dự án lõi học
  được nằm ở `du_an_kien_thuc`; phía mua tra qua `supabase_store.tra_du_an` (SRS-5.1zzzzzzz184).

### SRS-3.11 · Tài khoản, admin và view quan trắc hội thoại — FR-124…FR-128, FR-71/74/76/77/78/80

- `sellers.auth_user_id`, `buyers.auth_user_id` nối Supabase Auth (Google OAuth + magic link). CCRB không cần tài khoản.
- `admins(email)`: mọi policy `*_admin_read/update` kiểm `exists (select 1 from admins where email = auth.jwt()->>'email')`. Thêm admin = insert email.
  Các bảng buyer side (`info_requests`, `viewings`, `buyers`, `conversations`, `messages`) chỉ mở SELECT cho admin (riêng `buyers` thêm `buyers_admin_update`); ghi thuộc lõi / trigger / RPC admin.
- `agents_public` (definer, tự chứa): `id, name, seller_type, rating_sum, rating_count, listing_count, closed_count, rank` — không bao giờ `phone`/`zalo_user_id` (FR-125).
- `listing_views` (own-only) là nền "tin đã xem"; `TrackView` chỉ chạy khi có phiên đăng nhập.
- View admin: `hoi_thoai_thong_ke` (30 ngày theo ngày VN, FR-71), `khach_can_nguoi_that` (FR-77), `hoi_thoai_phien` (FR-72), `bds_hot` (FR-73); `bot_do_tre` (NFR-01) không còn trong `schema.sql` 28/10, thời gian lượt nay đo ở `thoi_gian_ms` của `/chat-reply`. `/admin` đọc bằng JWT admin, có CSV.
- Kỷ luật cột: DB quyết "ai đọc", web quyết "đọc cột nào" — `app/admin/page.tsx` không SELECT `buyers.phone` (NFR-07).

### SRS-3.12 · Bảng vận hành và hàm RPC — FR-146, FR-151, FR-152, FR-159, FR-166…FR-173

```text
bot_usage   day:date! PK (giờ VN)  model_calls:int!=0  capped_at  in_tokens,out_tokens,cache_write_tokens,cache_read_tokens:bigint!=0  -- FR-151 a, FR-169
bot_usage_model  day:date! model:text! PK(day,model)  calls:int!=0  in_tokens,out_tokens,cache_write_tokens,cache_read_tokens:bigint!=0  -- SRS-5.1zv/zw: chữ-máy + lượt theo model, /admin quy ra đô đúng giá từng model
bot_errors  id:bigserial  at:timestamptz!  source:text!  status_code:int  detail:text; index (at desc), (source, at desc)      -- FR-152
bot_health  who:text! PK  at:timestamptz!  last_id:bigint!=0                                                                    -- FR-152
```
Cả bốn: RLS, policy `*_admin_read`, ghi chỉ `service_role`. `bot_errors` là sổ duy nhất còn lại khi log function (1 ngày, bậc Free) trôi — mọi `catch` phải nối `ghiLoi()`/`log_loi()` (FR-152 d).

> **Soát 28/10/2026** (đối chiếu `bot/supabase/schema.sql`): các hàm sau trong bảng dưới **không còn** — dòng nhắc chúng là LỊCH SỬ:
> `ensure_buyer_conversation`, `ensure_seller_conversation`, `mo_ho_so_nguoi_ban`, `nguoi_noi_bo`, `merge_buyer_prefs`, `ghi_fact_listing`,
> `tao_followup`, `ghi_danh_gia`, `bao_tin_moi_khop`, `info_request_timeout_tick`, `stale_listing_tick`, `seller_drip_tick`, `ask_seller_drip`,
> `trg_listing_drip`, `nudge_tick`, `ctv_report_tick`, `inbound_sweep_tick`, `bo_dem_nhac_treo`, `claim_inbound`, `bao_hong_inbound`,
> `viec_inbound_bo_roi`, `ghi_su_kien_inbound`, `nhan_viec_nhac`, `bao_hong_nhac`, `nha_viec_nhac`, `lan_thu_ke`, `ap_thong_so`,
> `listing_facts_sync_cols`, `chuan_hoa_lai_gia`, `guess_property_type_answer`, `listings_try_publish`, `listings_autopublish`,
> `seller_hoi_bu_tick`, `ghi_boc_tach`, `trg_fact_vao_boc_tach`, `trg_vi_tri_vao_cot`, `ngu_canh_tin`, `mau_cau_fewshot`, `bac_nguon`,
> `cat_truoc_phu_dinh`, `tim_phuong_theo_nghia`, `dia_danh_gan`, `duong_gan_duong`, `phuong_giao_hai_duong`, `tim_hem`, `them_nhan_tin`;
> view `listing_missing_facts`, `job_suc_khoe`; hàm / view CTV (`ctv_sla_phut`, `chon_ctv`, `ctv_dang_ganh`, `ctv_ranks`) — SRS-5.1zzzzzzz238.
> Hàm lõi Python gọi hiện nay: bảng RPC ở §4. Hàm mới đáng kể sau 08/10: `tim_nha`, `tim_dia_danh`, `tim_dieu_luat`, `tra_nominatim`,
> `tra_overpass`, `tim_moc`, `ban_do_khung`, `admin_gui_tin`, `giao_lo_cua`, `chuan_dia_ban`, `o_boc_tach`, `la_id_thu`, `reset_nguoi_test`.

`[nguồn: pg_proc + proacl, DB 04/09/2026]` Quyền: **SR** = chỉ `service_role`/`postgres`; **trig** = hàm trigger; **thuần** = ai cũng gọi được; **auth** = thêm `authenticated`; **anon** = mở cho web.

| Hàm / view | Việc | Quyền |
|---|---|---|
| `mark_listing_interest` | `interests` + `dang_quan_tam` (FR-108/139). Hồ sơ nhu cầu, ghi ô tin, nhắc, chấm sao nay do lõi ghi qua REST (`supabase_store.py`); `merge_buyer_prefs`, `ghi_fact_listing`, `tao_followup`, `ghi_danh_gia` đã gỡ | SR |
| `can_cung_khu(buyer, listing, limit)` / `khu_khop` | 2–3 căn cùng phường/quận, giá 0,7–1,15×, trừ căn đã gửi (FR-62/108/110) | SR / thuần |
| `bao_can_da_chot` + trigger `trg_listings_bao_can_da_chot` | Tin `da_chot` → `reminders.sold` (FR-108). Báo căn mới cho khách mua do lõi gửi (`bao_can_moi.py`, SRS-5.1zzzzzzz150); trigger `bao_tin_moi_khop` đã gỡ | SR / trig |
| `reminders_hen_hoi_cam_nhan` / `messages_bump_last_message` | `viewing` sent → `feedback` +4 h (FR-56) / giữ `last_message_at` (FR-171 h) | trig |
| `route_info_request` / `notify_info_request_escalation` / `info_request_bao_lai_khach` | Giao việc + SLA / nhắc người được giao / báo lại khách, lật lịch `confirmed` (FR-140, FR-173, FR-52) | trig |
| `viewings_bao_admin_va_email` / `conversations_email_upset` / `reminders_email_voice` | `[VIEWING]` + nhắc admin + câu `xac_nhan_lich` / `[UPSET]` / `[VOICE]` (FR-52/57/77/79/81) | trig |
| `email_admin(loai, uid, body, listing)` / `canh_bao_ngoai(title, text, priority, p_email)` | Ghép `[LOẠI] <uid>` → ntfy; `admin_email` rỗng → không gửi (FR-81) / `net.http_post` tới ntfy.sh, không qua bridge (FR-152 e) | SR |
| `info_request_sla_tick` | Chủ nhà quá 12 giờ → admin hạn 5 giờ; admin quá hạn → nhắc lại + email (FR-173). Hỏi chủ căn còn bán do lõi gửi (`hoi_con_ban.py`, 20 ngày, SRS-5.1zzzzzzz295); `info_request_timeout_tick`, `stale_listing_tick`, `seller_drip_tick` / `ask_seller_drip` đã gỡ | SR (cron) |
| `media_cleanup_tick` | Gọi `media-cleanup` chỉ khi có việc (FR-166 d, FR-171 c); `nudge_tick`, `ctv_report_tick`, `inbound_sweep_tick` đã gỡ | SR (cron) |
| `bot_health_tick` / `beat(who)` / ~~`bo_dem_nhac_treo(gio)`~~ [đã gỡ] | Quét `net._http_response` không 2xx → `bot_errors`, nhịp tim bridge, gộp báo 1 tin/giờ, dọn sổ 30 ngày (FR-152, NFR-18) / nhịp tim / đếm nhắc treo | SR |
| `log_loi(source, detail, code)` / `bat_het_tien_api()` | Cửa ghi lỗi, van 20 dòng/nguồn/giờ, 200/giờ (FR-171 b) / dấu hiệu hết tiền AI → `HET TIEN API`, ghi thẳng, hãm 6 h (FR-168) | anon / trig |
| `bump_model_quota(limit)` / `cong_token(..., p_model)` | Trần lượt gọi model/ngày; cộng số chữ vào `bot_usage` (theo ngày) và `bot_usage_model` (theo ngày × model, SRS-5.1zv) (FR-151 a, FR-169) | SR |
| ~~`claim_inbound` / `bao_hong_inbound` / `viec_inbound_bo_roi` / `ghi_su_kien_inbound`~~ [đã gỡ cả bốn, `20261018j`] | Sổ idempotency tin đến: giành job atomic, 8 lần → `dead`, tìm việc bỏ rơi 24 h (FR-162, FR-166) | SR |
| ~~`nhan_viec_nhac` / `bao_hong_nhac` / `nha_viec_nhac(id, worker)`~~ [đã gỡ cả ba — lõi gửi nhắc, `gui_nhac.py`] | Hàng đợi nhắc: thuê 5' `skip locked`; hỏng → lùi dần, 5 lần `dead`; chưa thử → trả lại nguyên vẹn (FR-166 f) | SR |
| `nhan_viec_don_media` / `chon_viec_don_chet` / ~~`lan_thu_ke(attempts)`~~ [đã gỡ] | Hàng đợi dọn file `attempts < 6`, đủ 6 lần → `chet`; [đã gỡ] khoảng chờ nhân đôi, trần 1 h, nhiễu ±20 % của `lan_thu_ke` (FR-165 e, FR-166) | SR |
| `boc_thong_so(text, type)` / `boc_ten_duong` / ~~`ap_thong_so(listing, j, bac, de)`~~ [đã gỡ] / `listings_boc_thong_so` | Bóc thông số (trên `bo_dau`) → cột (FR-172); luật bậc của `ap_thong_so` đã gỡ | thuần / thuần / SR / trig |
| ~~`listing_facts_sync_cols`~~ [đã gỡ] / `listings_fill_code` / `next_listing_code` | Fact → cột (SRS-3.14) / cấp mã tin chỉ trong trigger (FR-158, FR-167) | trig / trig / SR |
| `listings_set_price_vnd` / `parse_vnd` / `chuan_hoa_gia_raw` / ~~`chuan_hoa_lai_gia`~~ [đã gỡ] | Giá chữ → số (FR-154) | trig / auth / thuần / SR |
| `listings_fill_property_type` / `guess_property_type` / ~~`guess_property_type_answer`~~ [đã gỡ] | Loại BĐS từ mô tả; không đoán ra thì `chua_ro` (FR-150) | trig / auth / SR |
| `listings_quyet_dinh_dang_tin` / `listing_du_dang_tin` / ~~`listings_try_publish` / `listings_autopublish`~~ [đã gỡ] | Tự lên kệ khi đủ giá + m2 + phường (FR-144); tin từ chat (`can_chu_duyet`) còn cần `chu_duyet_at` (FR-177 d; ngưỡng `diem_tin ≥ 70` không còn trong hàm); hạng Đồng từ căn thứ 6 đang hiện gắn `can_kiem_chung` (SRS-5.1zzzzzzz466) | trig / thuần / SR |
| `diem_tin` / ~~`seller_hoi_bu_tick` / `seller_drip_tick` / `ghi_boc_tach` / `trg_fact_vao_boc_tach` / `trg_vi_tri_vao_cot`~~ [đã gỡ năm hàm sau (`20261018j`, `20261019f`) và cột `listings.chu_noi_du_at` (`20261022g`)] | FR-177 f–h (`20260909a`): điểm 8 mục (ảnh 4/7/10 theo số tấm), hỏi bù 5 phút sau khi gật rồi nhịp 30 phút tới khi hết câu hoặc `listings.chu_noi_du_at`; `listings.boc_tach` jsonb gom mọi thứ bóc được (bỏ null); `listings.gap`; fact `vi_tri` → `location_raw` | SR / cron / trig |
| ~~`mau_cau` / `ngu_canh_tin` / `mau_cau_fewshot` / `so.mau_cau`~~ [đã gỡ cả hàng, kể cả `scripts/xuat-mau-cau.mjs`, `train/`; nay `cau_mau` / `cau_chuan`] | FR-180 (`20260909c`): mẫu câu chuẩn anh/sếp sửa tay từ câu bot thật; bot dán 12 mẫu mới nhất/phía vào system prompt; xuất JSONL để fine-tune (`scripts/xuat-mau-cau.mjs`, `train/`) | bảng / SR / view |
| `diem_tin(listings)` / `diem_tin(uuid)` | Điểm đầy đủ tin 0–100, 8 tiêu chí 15/20/15/10/10/10/10/10 (vị trí · diện tích · kết cấu · pháp lý · giá · tiềm năng · gọi hành động · ảnh), tiền định từ cột + `boc_tach` → `{diem, chi_tiet, thieu[], co_anh, so_anh}` (FR-177 d) | SR |
| `admin_xoa_khach(zalo)` / `admin_xoa_het_khach_va_ro_hang('XOA HET')` / `don_du_lieu_thu()` | Xoá một khách (`/admin/tin-nhan`) / XOÁ HÀNG LOẠT khách + rổ hàng để test lại, đòi đúng chữ, dấu `bot_health(xoa_het)` (FR-210, nút tab CRM) / dọn người thử 21:00 (FR-197) | auth (`la_admin()` trong thân); `don_du_lieu_thu` SR (cron) |
| `admin_dang_tin(jsonb)` / `tao_danh_sach` / `doc_danh_sach(token)` | Cửa đăng tin admin (FR-156/174) / danh sách riêng (FR-100) | auth / auth / anon |
| `la_admin` / `tin_cua_toi(listing)` / `thu_muc_dau_uuid(name)` / `get_secret` / `cau_hinh(key)` | Gác policy storage + `listing_media` (FR-96) / Vault / `app_config` | auth / SR |
| `seller_rank` / `bo_dau` / `chuan_hoa_phuong` / `match_projects` | Hàm thuần dùng chung | thuần (`match_projects` SR) |
| `tim_duong(ten, quan, toi_da)` | FR-212 (`20260921b`): tra từ điển `duong` — khớp đúng + khớp gần (Levenshtein ≤ toi_da trên chữ bỏ dấu, `fuzzystrmatch`), mỗi tên một dòng gom phường/quận/tỉnh, ưu tiên quận trùng | SR |
| `tim_dia_danh_theo_nghia(vec, loai[], lat, lng, n)` / ~~`tim_phuong_theo_nghia(vec, n)`~~ [đã gỡ] | `20260930a`: địa danh (phường mới / cũ, quận cũ, đường, đường số, dự án) gần NGHĨA nhất với vector câu khách, trừ điểm theo khoảng cách tới điểm neo (1 km = −0,01, tối đa −0,2). Kết quả là ỨNG VIÊN (SRS-5.1a) | SR |
| ~~`dia_danh_gan(lat, lng, bán kính, loai[], n)` / `duong_gan_duong(ten, phuong, bán kính, n)` / `phuong_giao_hai_duong(d1, d2, bán kính)` / `tim_hem(cap_hem[], duong_me, phuong)`~~ [đã gỡ bốn hàm] / `khoang_cach_m(...)` | `20260930a`: VỊ TRÍ — địa danh quanh một điểm; đường nào gần đường nào; phường có cả hai con đường gần nhau; hẻm theo số (hẻm nhỏ nhất trước) + đường mẹ; haversine (không PostGIS). `tim_duong` bỏ hàng hẻm khỏi khớp tên | SR / auth (`khoang_cach_m`) |
| `nhung_dia_danh_tick()` / `van_ban_dia_danh(bang, khoa)` | `20260930a`: cron `nhung-dia-danh-tick` (nay 15 phút một lượt, `20261105a`) nhúng quận cũ → phường mới → phường cũ → tên đường (không hẻm, không đường số — `20261103c`) SAU hàng chờ tin rao + dự án, chung công tắc `tim_theo_nghia` và mốc tạm dừng Gemini | cron / SR |
| view `nmg_hoat_dong`, `seller_ranks`, `media_mo_coi_db/storage` | NMG hoạt động (I5); hạng người rao (FR-155); file mồ côi (FR-165) | admin/SR; `seller_ranks` invoker; còn lại SR |

[LỊCH SỬ] Cửa `mark_sent` của `chat-reply` TS ghi `inbound_ledger.sent_bubbles/sent_at` (FR-162). Lõi Python vẫn nhận trường `mark_sent`
nhưng chỉ trả rỗng; `inbound_ledger` đã gỡ.

### SRS-3.13 · Tầng cache của web — NFR-17, FR-171 j

`[nguồn: app/**/page.tsx]`

| Nhóm | Route | Cách |
|---|---|---|
| Tĩnh/ISR | `/` (10800 s); `/moi-gioi`, `/thong-ke`, `sitemap` (3600 s); `/ban-do` tĩnh hẳn, không truy vấn lúc dựng (SRS-5.1zzzzzzz206) | `export const revalidate` |
| Động có tham số đường dẫn | `/nha-dat/[code]`, `/[tag]`, `/du-an/[slug]` (3600 s); `/ds/[token]` (3600 s, `generateStaticParams` trả `[]` — SRS-5.1zzzzzzz332) | `revalidate` **bắt buộc kèm** `generateStaticParams()` — thiếu là route thành `ƒ`, mỗi lượt xem một lambda |
| Đọc `searchParams` | `/mua-ban`, `/cho-thue` | ISR không với tới → truy vấn bọc `unstable_cache` (10800 s, `lib/duyet-tin.ts`) khoá theo bộ lọc; không `revalidate` |
| Bí mật | `/admin`, `/quan-ly` | động (`ƒ`) có chủ ý |

- Luật: trang tin phải là `●`/`○` trong bảng route sau `bun run build`; thấy `ƒ` là hỏng (TS-CACHE).
- Trong một lần dựng: `getListing` bọc `React.cache`; thẻ tin đọc `CARD_COLS` (`lib/supabase.ts`: trang chủ, `/[tag]` qua `lib/tin-tag.ts`, `/du-an/[slug]`, tin liên quan ở `/nha-dat/[code]`, `/yeu-thich`, `/tai-khoan`); danh sách `/mua-ban`, `/cho-thue` (`lib/duyet-tin.ts`) và tin quanh mốc (`lib/moc.ts`) đọc `MAP_COLS` = `CARD_COLS` + `lat, lng` cho nút "Xem bản đồ" (SRS-5.1zzzzzzz206); `/ban-do` không đọc bảng mà gọi RPC `ban_do_khung`; không `select("*")` trên `listings`; `/admin` gom truy vấn vào một `Promise.all`.

### SRS-3.14 · Bộ câu hỏi theo loại, bậc nguồn, hạng người rao, cửa đăng tin admin — FR-153…FR-156, FR-164, FR-172

> **Soát 28/10/2026.** Phần "bộ câu hỏi theo loại" và "bậc nguồn" dưới đây là LỊCH SỬ: `required_facts` (gỡ `20261019g`), `listing_facts`
> (gỡ, SRS-5.1zzzzzzz66), view `listing_missing_facts`, trigger `listing_facts_sync_cols`, `bac_nguon()`, `chonCauKe()` (TS) đều không còn.
> Hiện nay bộ câu hỏi theo loại chỉ ở `src/aioi/schema.py`: `CORE_FIELDS` theo nhóm, `CORE_THEO_LOAI` đè cho loại riêng (SRS-5.1zzzzzzz68),
> `FACETS` / `NHOM_SOAN` cho ngưỡng soạn bài (`Property.minimal_missing`, `summary_ready`, SRS-5.1zzzzzzz200, SRS-5.1zzzzzzz202), hỏi sau
> khi tin lên web theo `CUM_SAU_DANG`, ô riêng chủ nhà `O_NOI_BO` → bảng `listing_noi_bo`. Ô tin ghi vào `listings.boc_tach`.
> Còn đúng: `boc_tach_nhom` / `jsonb_bo_rong` / view `boc_tach_v`, hạng người rao (`seller_rank`, `seller_ranks`), cửa `admin_dang_tin`.

[LỊCH SỬ — `required_facts`, `listing_facts`, `listing_missing_facts` đã gỡ] Đặc tính riêng theo loại không nằm ở cột riêng mà ở cặp `required_facts × listing_facts`:
`listing_missing_facts = required_facts ⋈ property_type − listing_facts − {fact_key mà cột tương ứng đã có}` (FR-172 d; ánh xạ `ket_cau↔floors`,
`do_rong_hem/do_rong_duong↔alley_width_m|mat_tien`, `phap_ly↔legal_status`, `huong↔direction`, `so_phong_ngu↔bedrooms`, `tang↔floor`, `dien_tich*↔area_m2`,
`nam_xay↔year_built`, `noi_that↔furnishing`, `mat_tien↔frontage_m`, `quy_hoach↔planning_status`). Đổi `property_type` = đổi bộ câu hỏi ở lượt kế, không migration.

| Loại | [LỊCH SỬ — bảng đã gỡ `20261019g`] Bộ câu hỏi (`required_facts`, theo `nhom` rồi priority — FR-177 a, `20260907h`; thứ tự TRONG nhóm cơ bản do `chonCauKe()` bám câu chủ nhà vừa nói) |
|---|---|
| `nha_pho` | cơ bản: phuong, dien_tich_dat, gia · chuyên môn: do_rong_hem, ket_cau, so_phong_ngu, phap_ly, hinh_anh · phụ (không hỏi): huong, quy_hoach, nam_xay |
| `nha_cap4` | cơ bản: phuong, dien_tich_dat, gia · chuyên môn: dien_tich_dat→do_rong_hem, phap_ly, hien_trang, so_phong_ngu, hinh_anh · phụ: quy_hoach |
| `chung_cu` | cơ bản: phuong, dien_tich_tim_tuong, gia · chuyên môn: phap_ly, so_phong_ngu, tang, phi_quan_ly, noi_that, hinh_anh · phụ: huong |
| `dat` | cơ bản: phuong, dien_tich, tho_cu, gia · chuyên môn: phap_ly, do_rong_duong, hinh_anh · phụ: quy_hoach |
| `biet_thu` | cơ bản: phuong, dien_tich_dat, gia · chuyên môn: ket_cau, phap_ly, san_vuon, do_rong_hem, so_phong_ngu, hinh_anh · phụ: huong |
| `phong_tro` | cơ bản: phuong, dien_tich, gia · chuyên môn: gia_dien_nuoc, gio_giac, noi_that, hinh_anh |
| `mat_bang` | cơ bản: phuong, dien_tich, mat_tien, gia · chuyên môn: thoi_han_thue, nganh_hang_phu_hop, hinh_anh |
| `chua_ro` | loai_bds, phuong, gia |
| `toa_nha` (20260909i) | cơ bản: vi_tri, phuong, dien_tich_dat, gia · chuyên môn: so_phong, ty_le_lap_day, doanh_thu, ket_cau, thang_may, pccc, phap_ly, do_rong_hem, hinh_anh · sau đăng: the_chap, ly_do_ban, thuong_luong |
| `dat_nong_nghiep` (20260909i) | cơ bản: vi_tri, phuong, dien_tich, gia · chuyên môn: quy_hoach, len_tho_cu, duong_vao, nguon_nuoc, ranh_gioi, phap_ly, hinh_anh · sau đăng: ly_do_ban, thuong_luong |
| `dat_kinh_doanh` (20260909i) | cơ bản: vi_tri, phuong, dien_tich, gia · chuyên môn: thoi_han_su_dung, hinh_thuc_thue_dat, muc_dich, do_rong_duong, phap_ly, hinh_anh · sau đăng: ly_do_ban, thuong_luong |
| `kho_xuong` (20260909i) | cơ bản: vi_tri, phuong, dien_tich, gia · chuyên môn: chieu_cao, tai_trong_san, tram_bien_ap, xu_ly_nuoc_thai, duong_container, phap_ly, thoi_han_su_dung, (thuê) tien_coc, thoi_han_thue, hinh_anh · sau đăng: (thuê) truot_gia, fit_out, ly_do_ban |
| *mọi loại nhà/chung cư/đất* | **sau đăng** (`sau_dang`, 30+, chỉ vòng hỏi bù): so_wc, cach_mat_tien, hem_thong, ngap_nuoc, hien_trang_su_dung, the_chap, tien_ich_gan, ly_do_ban, thuong_luong; chung cư: view, can_goc, phi_gui_xe, so_huu; đất: hinh_dang, mat_do_xd, tang_cao_toi_da; thuê: fit_out |

JSON chia nhóm của một tin (FR-187, `20260909i`): `boc_tach_nhom(listings) → jsonb` 12 nhóm (tin · nguoi_rao · vi_tri · thong_so · phap_ly · gia · cho_thue · khai_thac · anh · bo_sung · cham_soc · diem), `jsonb_bo_rong()` bỏ null; view `boc_tach_v` (RLS admin) cho `/admin/ro-hang(/json)`, `so.boc_tach` cho Table Editor. Cột `listings.boc_tach` phẳng vẫn giữ (trigger ghi, `boc_thong_so` đọc).

Fact ngoài bảng nhưng có nghĩa (FR-177 e): `bo_sung` (câu lệch không nhận ra fact nào — ghi nguyên văn, `boc_thong_so` vẫn quét), `tiem_nang` (tiềm năng sử dụng, chỉ khi chủ tự kể), `duyet_tin` (lượt gật bản nháp; câu chờ cùng tên trong `info_requests`).

- [LỊCH SỬ — đã gỡ, kể cả `guess_property_type_answer`, `ap_thong_so`] Trigger `listing_facts_sync_cols` đổ fact vào cột (fact giữ nguyên văn, chuẩn hoá chỉ trên đường vào cột): `so_phong_ngu → bedrooms` (1…20);
  `dien_tich/dien_tich_dat → area_m2` (5…5000), `dien_tich_tim_tuong → area_m2` **chỉ** `chung_cu` (FR-163); `tang → floor` (0…80); `huong → direction`;
  `gia → price_raw + price_source` (`parse_vnd` 1e8…1e12, thuê dải riêng; `price_vnd` do trigger dẫn xuất); `phuong → ward + ward_source` (`chuan_hoa_phuong`);
  `loai_bds → property_type + property_type_source` (`guess_property_type_answer`, không đọc ra thì không ghi); khoá khác → cụm cột FR-172 qua `boc_thong_so()` → `ap_thong_so()`.
- [LỊCH SỬ — đã gỡ] Luật bậc `bac_nguon()`: `chu_xac_nhan` (3) > `admin` (2) > `suy_doan`/`boc_mo_ta` (1); ghi khi bậc fact ≥ bậc cột, cùng bậc thì mới nhất thắng.
  Mô tả đổi mà `specs_source` còn `boc_mo_ta` thì bóc lại; không bao giờ đè lời chủ nhà/admin.
- Hạng người rao (FR-155): view `seller_ranks` (`id, name, seller_type, active_count, closed_count, total_count, rank`, thêm `diem_nguoi_rao, diem_hoan_chinh, diem_phan_hoi, so_luot_phan_hoi, dat_chuan_nmg, ten_tro_ly`) tính lúc đọc, không lưu cột; `rank` = `hang_theo_diem(diem_nguoi_ban())`, còn `seller_rank()` chỉ view `agents_public` dùng.
- Cửa đăng tin admin (FR-156/174): `admin_dang_tin(jsonb) → {id, code, price_vnd, seller_id}` — kiểm `admins` (42501 nếu không), tìm/tạo `sellers`,
  insert với `code` null (trigger `listings_fill_code` → `next_listing_code` cấp mã, khoá advisory — không `lock table`; trigger giá/loại tự chạy); `district` từ form, hàm không tự mặc định (ô form `/admin/dang-tin` điền sẵn "Quận 5").
  Là RPC chứ không policy INSERT để admin gọi được hàm mà không đọc được bảng `sellers` (SĐT thật).

---

## 4. Đặc tả giao diện lập trình

`[nguồn: src/aioi/server.py, bot/bridge-zca/index.mjs, src/aioi/followup.py, bot/supabase/functions/*, src/aioi/*.py, app/api/*; soát 28/10/2026]`
Giao diện thật có bốn lớp: **HTTP của lõi** (chỉ 127.0.0.1 trên máy 146; mọi route trừ `/health` đòi khoá nội bộ `x-noi-bo-key`, SRS-5.1zzzzzzz400), **HTTP của bridge** (chỉ 127.0.0.1), **3 Edge Functions**
(`POST {SUPABASE_URL}/functions/v1/<name>`, cổng SRS-3.9 (7)) và **RPC / REST Supabase** lõi gọi bằng `service_role`. Cộng ba route Next: `POST /api/search` (SRS-4.5), `GET /api/tin` (tự tải thêm tin, SRS-5.1zzzzzzz447),
`POST /api/tin-da-go` (làm mới cache khi tin đã gỡ, SRS-5.1zzzzzzz457).
Không có REST `/api/*` giữa các "side".

**Lõi `aond-core` (`src/aioi/server.py`)**

| Endpoint | Vào | Ra / việc | Ai gọi |
|---|---|---|---|
| `POST /chat-reply` | `ZaloBridgePayload`: `external_user_id`, `text`, `image_urls` / `image_url`, `file_url` / `file_name`, `sticker_url` / `sticker_text`, `quote_text` (tin khách bấm "Trả lời", SRS-5.1zzzzzzz270), `gioi_tinh`, `so_nhan`, `msg_id`, `sender_name` / `user_name`, `human_note`, `su_kien` (`reaction` = thả cảm xúc, SRS-5.1zzzzzzz364), `mark_sent`; `channel`, `sent_bubbles`, `done` có khai nhưng lõi không đọc | `ZaloBridgeResponse`: `reply`, `replies[]`, `nhip_go[]`, `photos[]`, `tha_tim`, `assistant_name`, `captured`, `next_field`, điểm, `thoi_gian_ms`. Một lượt chat (`docs/13`). `human_note` = admin gõ tay → ghi lịch sử, bot nhường sân; `mark_sent` trả rỗng | bridge (hai số) |
| `GET /health` | — | `status`, `provider`, `chat_model`, `stt`, `drive`, `dia_danh` | `trien-khai-146.sh` sau khởi động lại |
| `POST /message` | `IncomingMessage` | lượt chat không qua bridge (không gom tin, không ảnh) | script bắn thử `ban-thu-luan` (`bot/tests/ban-thu-luan.sh`, gọi một lõi thử ở cổng 8001 — chưa chạy được trên máy 146) |
| `POST /trigger-followup/{user_key}`, `POST /reset/{user_key}`, `POST /reset-all` | — | bắn nhắc 5 phút / xoá phiên một khách / xoá mọi phiên | vận hành tay trên máy 146 (kèm khoá nội bộ) |

Vòng nền trong cùng tiến trình (`server.py`; chu kỳ đổi được bằng biến `<TÊN>_CHU_KY_GIAY`, tắt bằng `<TÊN>=tat`): `_vong_gui_nhac`
(60 s, `gui_nhac.py`, `GUI_NHAC`), `_vong_nhip_loi` (60 s, nhịp `aond-core`, SRS-5.1zzzzzzz402), `_vong_bao_can_moi` (10 phút, `bao_can_moi.py`,
`BAO_CAN_MOI`), `_vong_giu_ket_noi` (30 phút, `giu_ket_noi.py`, SRS-5.1zzzzzzz238), `_vong_hoi_con_ban` (30 phút, `hoi_con_ban.py`,
SRS-5.1zzzzzzz295), `_vong_qc_anh` (30 phút, `qc_anh.py`, Image LQC, SRS-5.1zzzzzzz422), `_vong_xoa_logo` (5 phút, `xoa_logo.py`,
SRS-5.1zzzzzzz454), `_vong_hoi_sau_dang` (10 phút, `hoi_sau_dang.py`, SRS-5.1zzzzzzz432).

**Bridge (`bot/bridge-zca/index.mjs`)**

| Endpoint | Vào | Việc | Ai gọi |
|---|---|---|---|
| `POST /send` (127.0.0.1:5005 số ký gửi, :5006 số tư vấn — `SEND_PORT`) | `{threadId, message, photos?}` | gửi tin chủ động, ảnh chỉ `https://`, tối đa 4, sau chữ; trả `{ok, anh_da_gui}` | lõi: `followup.py` (`BRIDGE_SEND_URL`, `BRIDGE_SEND_URL_TU_VAN`), `gui_nhac.py`, `bao_can_moi.py` |
| cổng QR tạm (8787 / 8788 — `QR_PORT`) | — | ảnh QR đăng nhập Zalo, đường dẫn có token ngẫu nhiên | người vận hành |

**Edge Functions (còn 3)**

| Function | Vào | Việc | Ai gọi hợp lệ |
|---|---|---|---|
| `escalation-feed` | `{action: pull \| ack \| hut \| log \| qr, so_nhan}` | `pull`: trả việc `reminders(kind ∈ escalation, report)` kèm `text` soạn sẵn + đích, cờ `noi_bo`; số tư vấn nhận hàng rỗng. `ack`: đánh dấu đã gửi. `hut`: bridge gửi hụt → đếm lần, hẹn thử lại, 5 lần thì `dead` (SRS-5.1zzzzzzz276). `log`: ghi `bot_errors` hộ bridge. `qr`: trạng thái đăng nhập + ảnh QR vào `bridge_dang_nhap`. Mỗi lượt gõ cửa là nhịp tim bridge | bridge, header `x-bridge-secret` |
| `geocode-listings` | `{}` | điền `lat/lng` (từ điển `duong` trước, rồi rpc `tra_nominatim`; mức đường, bỏ số nhà); tiện ích OSM trong 3 km qua rpc `tra_overpass` vào `tien_ich` + `listings.tien_ich_gan`; geocode dần `projects` | cron `geocode-tick` 10 phút, chỉ khi `tin_can_geocode` / `du_an_can_geocode` có việc |
| `media-cleanup` | `{}` | xoá file trong `media_cleanup_queue` qua Storage API | cron `media-cleanup-tick` |

[deprecated 28/10/2026 — gỡ 18/10/2026, SRS-5.1zzzzzzz31 / SRS-5.1zzzzzzz46] `chat-reply` (Edge Function TS), `zalo-webhook`,
`nudge`, `ask-seller`, `ctv-report`, `inbound-sweep`. Mục `SRS-5.1`…`SRS-5.4` ở §5 mô tả chúng là lịch sử.

**RPC lõi gọi** (tên thấy trong `src/aioi/*.py`, gọi qua `/rest/v1/rpc/<tên>`)

| RPC | Việc | Gọi từ |
|---|---|---|
| `tim_nha` | tìm căn cho khách mua: lọc cứng bán / thuê / loại / giá, cộng điểm khu vực, diện tích, phòng ngủ, xe hơi, tiện ích, vector (SRS-5.1zzzzzzz138, SRS-5.1zzzzzzz179) | `mua.py` |
| `parse_vnd` | giá chữ → số (luật một nguồn với `luat-tien.ts`) | `mua.py` |
| `mark_listing_interest` | ghi `interests` cho căn khách quan tâm | `mua.py` |
| `match_projects` | tìm dự án theo tên | `anh_du_an.py` |
| `chuan_dia_ban`, `boc_thong_so` | chuẩn địa bàn; bóc thông số từ chữ | `supabase_store.py` |
| `la_id_thu` | tách dữ liệu thử / thật | `supabase_store.py` |
| `log_loi` | ghi `bot_errors` | `supabase_store.py` |
| `tim_duong`, `tim_dia_danh`, `tim_dia_danh_theo_nghia`, `tim_dieu_luat`, `tra_nominatim` | tra đường / phường / quận / dự án theo chữ và theo nghĩa; điều luật gần nghĩa (SRS-5.1zzzzzzz231); phường theo số nhà (SRS-5.1zzzzzzz236) | `dia_danh.py` |
| `giao_lo_cua` | phường của ngã tư | `giao_lo.py` |
| `bump_user_quota`, `bump_model_quota`, `get_secret` | trần lượt theo người / ngày, trần lượt model / ngày | `han_muc.py` |
| `cong_token`, `beat` | cộng token vào `bot_usage` / `bot_usage_model`; nhịp tim lõi | `so_token.py` |
| `phuong_tai_diem`, `diem_nguoi_ban`, `an_anh_tin`, `dat_anh_bia`, `can_dang_rao_gan`, `khach_can_giu_ket_noi`, `tin_can_hoi_con_ban` | phường tại một toạ độ; điểm người bán; ẩn ảnh / đặt ảnh bìa; căn đang rao gần; khách cần giữ kết nối; tin cần hỏi còn bán | `dia_danh.py` / `supabase_store.py`, `supabase_store.py`, `engine.py`, `qc_anh.py`, `so_sanh.py`, `giu_ket_noi.py`, `hoi_con_ban.py` |

Bảng lõi đọc / ghi thẳng qua REST (không RPC): `listings`, `listing_media`, `listing_noi_bo`, `sellers`, `buyers`, `conversations`,
`messages`, `interests`, `info_requests`, `viewings`, `deals`, `reminders`, `buyer_needs`, `projects`, `du_an_kien_thuc`, `admins`, `danh_gia_ai`, `cau_mau`, `cau_chuan`, `kien_thuc_phap_ly`,
`duong`, `xa_tinh_khac`, view `listing_photos_v`. Ghi ô tin một nguồn `listings.boc_tach` (SRS-5.1zzzzzzz66).

### SRS-4.1 · B Side → S Side: câu hỏi (FR-41)
Không dựng REST — thay bằng `info_requests(source='buyer_ask')` do lõi ghi (`mua.py`) + trigger `route_info_request` /
`notify_info_request_escalation`; giao chủ nhà hoặc admin, không CTV (SRS-2.2).

### SRS-4.2 · S Side → B Side: trả lời (FR-43, FR-44)
Không dựng REST — chủ nhà trả lời trong chat (lượt AI đọc `tra_loi_khach_hoi` → `tra_loi_cau_hoi`) hoặc admin nhắn "`#mã: trả lời`"
(`tra_loi_theo_ma`) → `answered` → trigger `info_request_bao_lai_khach` → `reminders(kind = 'followup')` → lõi gửi (`gui_nhac.py`).
[deprecated 28/10/2026] Bản cũ: `chat-reply` → `ghi_fact_listing` → `listing_facts_sync_cols` → `nudge` gửi; cả bốn đã gỡ.

### SRS-4.3 · Danh sách riêng cho khách (FR-100)
RPC thay cho HTTP: `tao_danh_sach(p_listing_codes text[], p_title, p_buyer_id) → {token, path, expires_at, n}` (admin qua `admins` hoặc `service_role`; mã lạ → lỗi) và
`doc_danh_sach(p_token) → {title, created_at, expires_at, listings[CARD_COLS]}` hoặc NULL (chỉ tin lên kệ, không trả `buyer_id`).
Trang `app/ds/[token]` đặt `<meta robots noindex, nofollow>`; `robots.txt` chặn `/ds/`; hết hạn → trang báo + hộp Zalo.

### SRS-4.4 · Nhận tin Zalo (FR-162)
Một cửa vào: bridge `bot/bridge-zca/index.mjs` (zca-js 2.2.0, tài khoản clone, chạy trên máy 146 ở `C:\aond\bridge-zca`, Task Scheduler `AOND Zalo Bridge` / `AOND Zalo Bridge Tu Van`) gọi `POST http://127.0.0.1:8000/chat-reply`
(`CHAT_REPLY_URL`), mỗi tin kèm `msg_id`, `so_nhan`. Lõi gom các tin chờ của cùng khách thành một lượt (`_xep_cho`, `_lay_cho`) và
giữ một lượt một lúc mỗi khách (`Engine.khoa_luot`). Bridge gửi `replies[]` theo `nhip_go[]`, rồi ảnh `photos[]`, rồi thả tim nếu `tha_tim`.
Lượt hỏng: lõi trả câu mẫu `giu_cho` và tự thử lại nền.
[deprecated 28/10/2026] Cửa Zalo OA `zalo-webhook`, sổ `inbound_events` / `inbound_ledger`, `claim_inbound`, `inbound-sweep`: đã gỡ (SRS-5.1zzzzzzz46).

### SRS-4.5 · `POST /api/search` (FR-09)
`app/api/search/route.ts` + `lib/parse-query.ts`: `{q}` → `{q, filters, confidence, title, url, empty}`; không đụng DB, không xác thực. `filters` dùng tên cột thật
(`deal`, `types[]`, `ward`, `district`, `priceMin/Max/Approx` — "8 tỉ" → ±15 %, `access` mt|hxh|hem, `bedrooms`, `areaMin/Max`, `street`, `landmark`).
`url` = `/{tag}` khi tổ hợp khớp đúng một tag, không thì `/mua-ban|/cho-thue?…`; `GET ?go=1` trả 302 cho form không JS. Kết quả do trang đích truy vấn (một nơi lọc);
0 kết quả → chip lọc + hộp Zalo mang câu gốc, không `relaxed`.

### SRS-4.6 · `POST /api/listing/parse` (FR-92) [deprecated]
> Gỡ 02/11/2026 (SRS-5.1zzzzzzz333): không còn nơi gọi; FR-92 do lõi Python bóc bằng AI (`src/aioi/`), DB còn `boc_thong_so()` (FR-172). Mô tả dưới giữ để tra cứu.

`app/api/listing/parse/route.ts`: `{text}` (nhận cả `raw_pitch`; `GET ?text=`) → `{text, fields, confidence, needs_review[]}` bằng luật `parseListing` (không DB, không model).
Trường: deal, property_type, ward, district, street, landmark, bedrooms, price_raw/price_vnd, access_type, alley_width_m, frontage_m/length_m/rear_width_m, area_m2, floors,
legal_status, has_completion, negotiable, direction, has_elevator, car_in_house, corner_lot, furnishing. Là bản xem trước cho `/raoban`; đường bóc thật lúc đăng là `boc_thong_so()` ở DB (FR-172).

### SRS-4.7 · Zalo deep link kèm ngữ cảnh (FR-14)
`zaloLink(context)` (`lib/format.ts`) → `{ZALO_OA_URL}?ref=<ngữ cảnh>` (ngữ cảnh phía bán `seller_cta` / `nmg-apply` / `raoban` dùng `ZALO_BAN_URL`, SRS-5.1zzzzzzz384) chữ thường (`#mã`, `search:<câu>`, `tag:<slug>`, `ds:<8 ký tự token>`, `du-an:<slug>`).
Không có bảng token/TTL, không nối fingerprint (OPEN-14); lõi chưa đọc `ref` ở tin đầu.

---

## 5. Đặc tả xử lý


> **Nhật ký sửa trước 26/10/2026 (366 mục) đã chuyển sang `docs/07-srs-luu-tru.md`** (30/10/2026, SRS-5.1zzzzzzz305) — mã giữ nguyên, mục ở đây (mới hơn) thắng mục lưu trữ. Tìm một mã: `grep -n "SRS-5.1zzzzzzz123 " docs/07*.md`.

### SRS-5.1 · Chu trình một lượt chat (lõi Python)

`[nguồn: src/aioi/server.py, src/aioi/engine.py]` Edge function `chat-reply` v48 (TypeScript) đã gỡ, lõi Python là bộ não duy nhất từ 18/10/2026 — mô tả cũ ở `docs/07-srs-luu-tru.md`.

```text
1. Bridge zca-js → POST /chat-reply (server.chat_reply): sổ msg_id, sự kiện cảm xúc không trả lời (SRS-364), khoá lượt theo người.
2. Engine.handle: AI đọc ý → ô tin qua cổng bằng chứng `_loc_o_tin` (SRS-73). Người bán (vai đã rõ): bước 1 của MỘT vòng agent
   Sonnet gọi công cụ ghi / đọc / `tra_luat_o` (`agent_gop.mo`, SRS-371); người mua (vai đã rõ) cùng vòng (`agent_gop.mo_mua`, SRS-380);
   vai chưa rõ: đọc nhanh `_doc_nhanh_chua_ro_vai` (SRS-406). Form JSON (OPERATIONS_SYSTEM_BAN / _MUA, model `AIOI_EXTRACT_MODEL` = Sonnet 5.5,
   SRS-392) chỉ dự phòng / khi đọc nhanh cần đọc đủ.
3. Tra địa danh: `_chuan_dia_danh` (tên chuẩn, SRS-366), `_phuong_tu_dia_chi` (ô hệ thống tự tra, SRS-359).
4. Chọn MỘT việc cho lượt: `viec_luot` (SRS-314 / 328) → ô cần hỏi / khối hỏi còn lại.
5. Dựng prompt: lượt hỏi ô phía bán = prompt gọn `lean_system_prompt_cho_luot` (`LEAN_SYSTEM_PROMPT`, khi `AIOI_PROMPT_GON=bat` — đang bật,
   SRS-408 / 414; tắt thì phiếu lượt `build_phieu_luot`) / bản nháp / sau bản nháp, hoặc prompt mua; khối cố định trước RANH_GIOI_CACHE.
6. Model viết lời (MODEL_CHAT; hỏng → Gemini → Groq, `llm/du_phong.py`). Người bán đi vòng gộp: bước 2 CÙNG cuộc hội thoại công cụ, kết quả
   công cụ ghi = báo cáo sau khi áp (đã ghi / bỏ vì sao / ô thiếu / việc lượt), `agent_gop.viet`. Người mua: vòng công cụ `agent_mua.chay`
   (tra `tim_can` / `xem_can` / `tra_du_an` / `du_an_trong_khu`; ghi `hen_xem` / `hoi_chu_nha` khi bóc tách sót, SRS-290 / 292).
7. Soát đầu ra `_soat_hinh_thuc` theo bảng `LUAT_SOAT` (gồm `hoi_dung_o`, SRS-367): lệch → gọi lại tối đa một lần.
8. Lưu Supabase (tin, hội thoại, messages) rồi trả lời bridge.
```

### SRS-5.2 · Xếp hạng gợi ý (phía mua)
`[nguồn: src/aioi/mua.py, RPC tim_nha]` Lọc cứng bán / thuê, loại, giá; điểm mềm khu vực, diện tích, phòng ngủ, xe hơi + vector; cùng mức khớp thì hạng người rao cao trước rồi `updated_at` (SRS-361). RPC lỗi → về lọc cứng. Bản `chat-reply` v48 ở lưu trữ.

### SRS-5.3 · Job định kỳ

`[nguồn: bot/supabase/schema.sql (cron.schedule), 01/11/2026]` Giờ cron là UTC (1–13 = 8 h–20 h VN). Việc gửi khách (nhắc, báo căn mới,
hỏi còn bán, giữ kết nối, LQC sau đăng) do LÕI chạy vòng riêng (`gui_nhac.py` 60 s, `bao_can_moi.py` 10 phút, `hoi_con_ban.py`, `giu_ket_noi.py`, `qc_anh.py`, `hoi_sau_dang.py`, `xoa_logo.py` — đủ ở §4), không qua cron.

| Job | Lịch | Gọi gì |
|---|---|---|
| `bot-health-tick` | `*/15 * * * *` | `bot_health_tick()` — SQL thuần (FR-152, NFR-18) |
| `media-cleanup-tick` | `*/5 * * * *` | `media_cleanup_tick()` → `media-cleanup` chỉ khi có việc (FR-165 e) |
| `media-chet-tick` | `0 * * * *` | `chon_viec_don_chet()` (FR-166 g) |
| `geocode-tick` | `*/10 * * * *` | `geocode_tick()` → `geocode-listings` |
| `nhung-tick` | `*/5 * * * *` | `nhung_tick()` — vector Gemini cho tin rao / dự án (FR-216 g) |
| `nhung-dia-danh-tick` / `nhung-luat-tick` | `7-59/15 * * * *` / `12-59/15 * * * *` (`20261105a`) | `nhung_dia_danh_tick()` / `nhung_luat_tick()` — vector địa danh / điều luật |
| `info-request-sla-tick` | `*/15 1-13 * * *` | `info_request_sla_tick()` (FR-173) |
| `listing-interest-decay` | `0 20 * * *` | SQL: `dang_quan_tam` quá 7 ngày → `dang_ban` (FR-139) |
| `soat-du-lieu-tick` | `5 1 * * *` (8:05 VN) | `soat_du_lieu_tick()` — soi dữ liệu tin thật, có chỗ nghi lỗi thì một tin 🔎 cho admin (FR-245) |
| `don-du-lieu-thu` | `0 14 * * *` | `don_du_lieu_thu()` — dọn dữ liệu ID thử (trừ rổ mẫu `seed_thu`) |
| `cron-don-so` | `15 18 * * *` | SQL: xoá `cron.job_run_details` quá 7 ngày (FR-171 d) |

Đã gỡ (không còn trong DB): `inbound-sweep-tick`, `nudge-tick`, `seller-drip-tick`, `info-timeout-tick`, `stale-listing-tick`, `ctv-report-tick`, `ctv-sla-tick` (đổi tên).

- Luật: không tin `cron.job_run_details.status` — `net.http_post` trả về khi xếp hàng nên luôn `succeeded`; kết quả thật ở `net._http_response` → `bot_health_tick()` → `bot_errors` (NFR-18).
- Không dựng job riêng cho `recompute_hot_score` (view `bds_hot`), `match_new_listings` (trigger `bao_tin_moi_khop` đã gỡ — báo căn mới do lõi `bao_can_moi.py`), `close_conversations` (FR-131).

### SRS-5.4 · `nudge` v25 [deprecated]
Edge function `nudge` đã gỡ; việc nhắn khách chủ động do lõi chạy (`gui_nhac.py`, `bao_can_moi.py`, `hoi_con_ban.py`, `giu_ket_noi.py` — xem SRS-5.3). Mô tả cũ ở `docs/07-srs-luu-tru.md`.

### SRS-5.5 · Email / cảnh báo ngoài — FR-81, FR-152 e

- Đường đi: sự kiện → `email_admin(loai, zalo_uid, body, listing_id)` → `canh_bao_ngoai(title, text, priority, p_email=true)` → `net.http_post` tới `https://ntfy.sh`
  body `{topic: app_config.ntfy_topic, title: "[LOẠI] <uid>", message, priority, email: app_config.admin_email}`.
- Bốn nguồn: `[VIEWING]` trigger `viewings` INSERT; `[UPSET]` `needs_human` false→true; `[QUESTION]` `info_request_sla_tick` (trừ `xac_nhan_lich`); `[VOICE]` `reminders` note "VOICE:".
- Thân: các trường sự kiện + "BĐS: #mã · địa chỉ · giá · m2" + 300 ký tự mô tả + giờ VN; không có link admin.
- `admin_email` rỗng → `email_admin` không gửi gì (topic ntfy là kênh sức khoẻ bot); ntfy.sh từ chối email ẩn danh (400) — cần tài khoản ntfy + secret Vault `NTFY_TOKEN`
  (`Authorization: Bearer`). Hiện `admin_email` rỗng, `NTFY_TOKEN` chưa có.
- Không hàng đợi/retry riêng: pg_net gửi một lần, kết quả `net._http_response` → `bot_health_tick` → `bot_errors`; việc thật vẫn ở `reminders`/`viewings`/`info_requests` nên email hụt không mất việc.

---

Nhật ký sửa: chỉ giữ 10 mục mới nhất ở đây (mới nhất ở đầu, mỗi mục ≤ ~5 dòng); mục cũ hơn ở `docs/07-srs-luu-tru.md` — mã giữ nguyên, tìm bằng `grep -n "<mã> " docs/07*.md`. Bản đầy đủ của SRS-299…308 trước khi rút gọn (30/10): `git show 5c7d5ea:docs/07-srs.md`.

### SRS-5.1zzzzzzz482 · Trả lời nhanh hơn: gom tin theo hình thức, bỏ nghỉ giữa bong bóng, công tắc `AIOI_EFFORT` (13/11/2026)
Chủ dự án 13/11: "đừng để nó chờ nó chậm nữa, rep càng nhanh càng tốt, gộp thì gộp kiểu thông minh hơn". Lớp lỗi: ba chỗ chờ cố định không phụ thuộc tin — bridge chờ 2,5 s trước MỌI tin, lõi nghỉ "đang gõ" 0,3–2 s giữa các bong bóng, model chạy mức suy nghĩ mặc định (`high`).
- **Bridge (`bot/bridge-zca/index.mjs` `choGom`):** thời gian gom theo hình thức tin vừa tới — trọn ý (kết bằng dấu câu hoặc ≥ 8 từ) 0,5 s; mảnh ngắn 1,2 s; ảnh / tệp 1,8 s; trần 4 s tính từ tin đầu. Gom hụt thì lõi vẫn gộp tin tới lúc đang soạn (SRS-91 / 279).
- **Lõi:** `server.py` nghỉ giữa bong bóng cố định 300 ms (`NHIP_GIUA_BONG_MS`); `llm/claude.py` `muc_no_luc` đọc `AIOI_EFFORT` (low / medium / high, trống = như cũ) gửi `output_config.effort` cho lượt gọi chữ, API từ chối thì tự gửi lại không kèm và nhớ model. `bot/cau-hinh-loi.env`: `AIOI_EFFORT=medium` (ban đầu đặt `low`; chủ dự án 13/11 chốt "để mức medium thôi").
- **Kiểm:** cú pháp bridge + lõi, thử hàm `choGom` 6 ca. **Đã áp 13/11 23:09:** lõi `4938f51` lên 146 (kèm SRS-480 / 481), `AIOI_EFFORT=low` vào `.env` lõi, `index.mjs` lên `C:ondridge-zca` (bản cũ trùng khớp bản trước 482; sao lưu `C:ondackupridge_index_20261113_231127.mjs`), hai task bridge đăng nhập lại bằng phiên cũ. **Đo trên 146** (cuộc rao bán giả 5 lượt, không Supabase, chỉ thời gian lõi): mặc định `high` 102,8 s (≈ 20,6 s/lượt) → `low` 52,9 s (5,1 · 5,2 · 6,6 · 11,7 · 24,3 s); lời và ô tin vẫn đúng. Lượt chậm còn lại là lượt viết lại cả bản tin (~1.700 token ra) — effort không bớt được phần viết. Chưa chấm lại giọng bằng `bun run cham`. **Sau đó chủ dự án chốt "để mức medium thôi":** `bot/cau-hinh-loi.env` đã đổi `medium`; `.env` lõi trên 146 CÒN `low` — sửa dòng đó rồi khởi động lại lõi (chưa đo `medium`).

### SRS-5.1zzzzzzz481 · Câu mẫu cố định viết lại cho khớp giọng `GIONG`; nạp lại bảng `cau_mau` đang rỗng (13/11/2026)
Chủ dự án 13/11 sau SRS-480: "sửa luôn câu mẫu cau_mau cho khớp giọng mới… vẫn quan trọng là lấy thông tin cho db". Lớp lỗi: câu mẫu gửi nguyên văn, không qua prompt nên không theo khối giọng — còn `**` (Zalo không hiện), chữ HOA nhấn, mặt cười, "ạ" chồng, câu báo cáo "Em đã cập nhật", "anh/chị" viết cứng.
- **Sửa (`cau_mau.MAC_DINH`):** 18 câu — hai câu chào số ký gửi (câu chào đầu mời khách kể luôn địa chỉ và giá để có ô cho DB), sáu câu ẩn / giữ tin, hai câu ẩn ảnh (`{goi}` thay "anh/chị"), năm câu nhận tệp, bản vẽ, căn đã chốt, hai câu đọc trang web. Câu đã chốt giữ nguyên: duyệt tin, hỏi phí, báo phí, chấm sao, xác nhận lịch, bản nháp, chào số tư vấn, các tin chủ động.
- **DB:** soát trước khi sửa thấy bảng `cau_mau` RỖNG (0 dòng; trang /admin/cau-chuan không có câu nào để sửa, lõi đang chạy câu trong code) → migration `20261113h_cau_mau_khop_giong` nạp lại đủ 60 khoá từ `MAC_DINH`, dòng đã sửa tay (nếu có) giữ nguyên.
- **Còn:** ba câu báo khách mua (`bao_tra_loi_chu_nha`, `bao_lich_da_chot`, `bao_can_da_ban`) vẫn đọc mã căn `{ma}` — đổi sang tên đường phải sửa chỗ gọi, chưa làm. **Kiểm:** điền thử 60 câu × 3 cách xưng, không lỗi chỗ giữ chữ, không gọi "mình"; chạy thử trong giao dịch huỷ. Chưa đưa lõi lên 146.

### SRS-5.1zzzzzzz480 · Bỏ "giọng vui": một khối `GIONG` tự nhiên chung bot bán và bot mua (13/11/2026)
Chủ dự án 13/11, sau khi so với bot MOSO (chat thử 35 lượt): "không cần giọng vui nữa mà sửa luôn cho bot zalo bán, bot zalo mua… nới được… bên AOND anh Luận cái nào lấy được thì lấy, không được thì bỏ". Lớp lỗi: giọng định bằng luật đếm / cấm vá chồng nhiều đợt (14 gạch, có cặp tự kéo nhau, ép cảm thán, 20 từ) và lượt hỏi ô phía bán chạy một bộ luật nhắn riêng → một cuộc chat hai giọng.
- **Sửa (`prompts.py`):** `GIONG_VUI` → `GIONG`, viết thuận kèm lý do: nhận cảm xúc khách trước khi vào việc, đáp trọn câu khách hỏi, độ dài theo ý khách (lượt hỏi ô 20–30 từ, lượt tư vấn / phí / pháp lý / đang lo thì vài câu), khen khi có điểm mạnh thật — không ép cảm thán, khách muốn dừng thì không níu, hỏi "người hay máy" thì nhận là trợ lý AI; kèm 5 lượt `<vi_du>` cảm xúc / ngoài lề (không chứa câu hỏi ô tin, SRS-196). `LEAN_SYSTEM_PROMPT` ghép chung `GIONG`. Phía mua: bỏ câu cấm hẳn nói thị trường → nhận định chung + dữ liệu của lượt / công cụ, số chỉ lấy từ đó, không giục mua, không hứa sinh lời. Thang chấm giọng `scripts/cham-kich-ban.py` đổi theo.
- **Lấy từ bản anh Luận:** độ dài "tự cân nhắc theo ý khách, không luật cứng", khen điểm mạnh thật rồi hỏi một ý, "hình như" khi đoán, xong việc chốt nhẹ không nài. **Bỏ:** "Dạ em hiểu ạ", CTV, "Top Quận 5", kênh Buyers, gọi cứng "anh/chị", chữ "TUYỆT ĐỐI". **Giữ quyết định cũ:** không "Dạ", không gọi "mình" / "bạn", tối đa một câu hỏi, câu mẫu `cau_mau` chưa đụng.
- **Kiểm:** parse cú pháp + ghép thử ba prompt (gọn bán, phiếu bán, mua) đều có đúng một khối `GIONG` trước `RANH_GIOI_CACHE`. CHƯA thử với model và CHƯA đưa lên 146 (phiên cloud không tới được máy 146, không có khoá model) — chạy `bash scripts/trien-khai-146.sh` rồi `bun run cham --giong` / chat thử.

### SRS-5.1zzzzzzz479 · Soát nốt docs so với code — đợt 2 (13/11/2026)
Chủ dự án 13/11 sau SRS-478: "kiếm hết giúp t" → kiểm nốt phần đợt 1 chưa kiểm. Lớp lỗi như SRS-478.
- **Sửa (chỉ docs):** docs/02 trạng thái FR (FR-28 ❌→🟡, FR-103 🟡→✅, FR-80 / 166 / 202 ✅→🟡) và NFR-09; docs/08 (tham chiếu job / cột / bảng đã gỡ, 13 tên `test_*.py`, AC / SRS-8 không còn định nghĩa); docs/07 §3–§4 theo `schema.sql` (cột, CHECK, index, policy, cổng `gate.ts`, `diem_tin` 8 tiêu chí, hàng hàm đã gỡ gắn `[đã gỡ]`, payload lõi); docs/06 §6.8–6.11 theo `GIONG_VUI` / `xung_ho` / `cau_mau` và chuỗi thật trên web, mục thời bot TS gắn `[LỊCH SỬ bot TS]`; docs/05 WF-06 / 07 / 12 / 13; docs/10 ca TS sống (TS-SEC3, TS-SEC-AUTO, TS-HEALTH, TS-SEC2… ca chết đánh `[deprecated 13/11/2026]`); docs/01, 03, 04, 09, 14; mô tả hai agent `.claude/agents/`.
- **Còn lệch, chờ chủ dự án:** FR-159; `public/llms.txt` và docs/14 "Zalo OA"; docs/06 mô tả danh tính "Sài Gòn và Long An"; `app/raoban` hứa "viết lại nhiều phiên bản" (FR-93 ❌); câu mẫu `bao_tra_loi_chu_nha` / `bao_lich_da_chot` / `bao_can_da_ban` đọc mã căn cho khách mua; nhắc `viewing` không còn ai tạo (FR-56 / 202); `schema.sql` cấp TRUNCATE view `nmg_hoat_dong` cho `authenticated`.
- **Chưa kiểm:** FR-176…250 phần hành vi bot (cần thử thật trên 146), máy 146, số liệu / secret trong DB thật. **Kiểm:** đối chiếu `file:dòng`; `bun run truyvet` sạch.

### SRS-5.1zzzzzzz478 · Soát toàn bộ docs so với code, sửa docs theo code (13/11/2026)
Chủ dự án 13/11: "soát lại toàn bộ docs xem chỗ nào lệch code thì sửa". Lớp lỗi: sửa code chỉ ghi mục nhật ký, phần đặc tả và tầng trên không ai dò lại.
- **Sửa (chỉ docs, không đổi code / luật):** docs/00, 02, 03, 04, 05, 06, 07 (phần đặc tả), 10, 11, 13, 14, LQC, hai README, `CLAUDE.md`, `.claude/luat-dang-ap.md` — bộ pytest đã gỡ, cổng soạn bản tin `NHOM_SOAN`, gợi 2–3 căn, lời ~20 từ, trần LQC theo người bán, khung 8–21 giờ, 6 trạng thái tin (`da_coc`), `listings` 66 cột, lịch cron và `revalidate` thật, ISR trang tag / dự án, 100 tag, tên cột / hàm / trigger / biến env đã đổi, biểu phí công chứng docs/14 theo `phap_ly.phi_cong_chung`.
- **Còn lệch, chưa sửa:** FR-159 (lượt mơ hồ nay theo số Zalo, không mặc định người mua); `public/llms.txt` ghi "Zalo OA" / "nhadat.co"; bảng RPC §3.12 / §3.14 và bảng PROPERTY docs/04 §4.5 còn hàng lịch sử; chú thích cũ trong vài script.
- **Kiểm:** từng chỗ đối chiếu `file:dòng` trong code; `bun run truyvet` sạch.

### SRS-5.1zzzzzzz477 · Dọn mã và tệp không còn dùng; nạp lại rổ hàng Ny'ah Phú Định (13/11/2026)
Chủ dự án 13/11: "trong code có mấy cái mới cũ khác nhau có cái nào ko dùng nữa ko, có cái nào docs ghi dư ko cần thiết ko" → rà cả repo, chủ dự án
duyệt "Dọn nhóm A" (nhóm chắc chắn không còn ai gọi). Cùng ngày: "nạp lại dữ liệu ny'ah phú định vào đi".
- **Xoá tệp:** `scripts/archive/` (5 script nạp nguồn mogi / rever / moso đã ngừng từ SRS-401) cùng hai bộ thử của chúng
  `bot/tests/thu-du-an-moso.mjs`, `thu-du-an-rever.mjs` (gỡ khỏi `test:bot`); `bot/bridge-zca/archive/` (4 tệp cấu hình VPS); `design-system/`
  (`MASTER.md` 17/10 ghi bo góc 8/12px — nguồn đúng là `docs/06-ui-design.md` §6.4; gỡ tên thư mục khỏi `vercel.json`). Cần thì lấy lại ở lịch sử git.
- **Xoá hàm không ai gọi** (bộ pytest gọi chúng đã gỡ ở SRS-469): `Engine.handle_media`, `start_new_listing`, `switch_listing`;
  `supabase_store._hoi_thoai_mua`; `qc_anh._goi_storage`; `projects.upsert_unit_type`; `bulk.parse_csv`; `che_do_test._giong`.
  **Hằng không ai đọc:** `SELLER_ASSISTANT`, `MO_DAU_NHAP`, `CAU_GIU_CHO`, `TAY_TU_MENH`, `DEFAULT_BATCH_BUDGET`. Không đổi hành vi, không đổi prompt.
- **Giữ nguyên (chưa quyết):** các đường dự phòng và nhánh sau công tắc (`agent_ban.chay`, `agent_mua.chay`, form JSON, `build_phieu_luot`,
  công cụ `gui_khach`, model lượt dễ) — gỡ là mất đường lùi, chờ chủ dự án.
- **Ny'ah Phú Định:** `du_an_kien_thuc` khoá `ny ah phú định` nạp lại từ `luu_tru` lần 13 (lần xoá rổ hàng + bảng giá 12/11): 50 căn, giá 9 lô còn
  trống (ô riêng `rieng.gia_can`), mục "Rổ hàng T10.2026" trong tài liệu. Các phần khác của dòng không đổi từ lần xoá nên chép nguyên bản lưu.
- **`thu-cli`:** schema ô tin dài hơn trần dòng lệnh Windows (WinError 206) → `llm/claude_cli.py` ghi schema vào tệp system, đọc JSON từ kết quả.

### SRS-5.1zzzzzzz476 · LQC nghe chủ: lời hẹn, đang bận, không có, thôi hỏi; gara → hẻm xe hơi (13/11/2026)
Chủ dự án 13/11: "khách hẹn giờ chiều chị gửi ảnh thì chiều nó hỏi lại"; thiết kế LQC đợt 1 (làm sau đợt 2 — SRS-475). Trước đây chủ đáp "chiều
chị gửi" thì câu xin ảnh coi như đã hỏi, 10 phút sau vòng nền nhảy sang câu pháp lý, ảnh chỉ được nhắc lại ở cuối hàng.
- **AI đọc (ghi_y_khach / form):** `hen_lai_luc` + `hen_lai_viec` (giờ VN, AI quy từ dòng "Bây giờ" mới thêm vào dữ liệu lượt), `hen_xong`,
  `tam_dung_den`, `khong_co` (anh / anh_so), `ngung_cham` — mỗi ô kèm cụm trích, `lqc.ghi_tu_ke_hoach` kiểm cụm rồi ghi `_hen_*`,
  `_tam_dung_den`, `_khong_co`, `_ngung_cham` vào căn.
- **LQC (`lqc.chu_dang_hen`):** bận → im tới lúc rảnh; hẹn còn treo → im tới giờ hẹn + 30 phút; thôi hỏi → không hỏi nữa (hỏi còn bán / giữ kết
  nối vẫn đi). Vòng `hoi_sau_dang` xét căn có hẹn trước (kể cả căn chưa đăng): quá giờ hẹn thì nhắc MỘT câu đúng lời hẹn (`khoi_nhac_hen`),
  hẹn lần hai mà lỡ / trễ quá 12 giờ thì bỏ; ảnh về sau lúc hẹn → huỷ hẹn. Không có ảnh → hàng câu hỏi và Image LQC thôi xin ảnh. Tin nhắc tự
  động trước khi đăng (`followup`) cũng im khi chủ bận / đang chờ giờ hẹn / đã bảo thôi.
- **Suy luận chắc chắn (đợt 2 cùng ngày, chủ dự án: "AI ko tự suy luận dc mà phải hướng dẫn à"):** bỏ câu riêng cho gara; thay luật "GIÁ TRỊ Ô
  CŨNG CHỈ LÀ ĐIỀU KHÁCH NÓI" (cấm mọi suy luận) bằng nguyên tắc chung: ghi điều khách nói HOẶC điều lời khách chắc chắn kéo theo (gara trong
  nhà ở hẻm → hẻm xe hơi; "1 trệt 2 lầu" → 3 tầng); điều chỉ có thể đúng là đoán, để trống ("ngõ 3m" chưa chắc ô tô vào). Mô tả `bang_chung`
  sửa theo.
- **Token:** schema công cụ ghi thêm 10 khoá (~1.900 ký tự) + dòng giờ (~80 ký tự) → ước +700–800 token mỗi lượt người bán (chưa đo bằng công cụ đếm).

### SRS-5.1zzzzzzz475 · LQC điều phối chung mọi tin chủ động tới người bán (13/11/2026)
Chủ dự án 13/11 duyệt thiết kế LQC 5 đợt, chọn làm "đợt 2 trước" (điều phối chung) rồi tới đợt 1 (lời hẹn, tạm dừng…); "điều phối chung vẫn
là tên LQC, đó là tên của sếp đặt". Trước đây năm vòng tự nhắn chủ nhà — tin xin ảnh 10 phút (`followup`), hàng câu hỏi sau đăng
(`hoi_sau_dang`), Image LQC (`qc_anh`), hỏi còn bán (`hoi_con_ban`), giữ kết nối (`giu_ket_noi`) — mỗi vòng giữ luật riêng; trần "3 tin / ngày"
là của từng căn và chỉ đếm hàng câu hỏi, nên một chủ có thể nhận tin xin ảnh, tin QC ảnh rồi câu pháp lý trong cùng buổi.
- **`src/aioi/lqc.py` — `ly_do_khong_nhan`:** khung 8–21 giờ, chat im 10 phút, nhường sân + nút "giữ" trên CRM, **tối đa 3 tin chủ động mỗi
  người bán mỗi ngày** (mọi loại, mọi căn — đếm thẳng từ lịch sử chat: lời bot cách lượt trước ≥ 4 phút là tin chủ động), chờ chủ đáp 24 giờ,
  bỏ qua 2 tin liền thì thôi. Hỏi còn bán / giữ kết nối có nhịp riêng nên bỏ qua luật chờ đáp, vẫn theo các luật còn lại.
- **Gắn vào:** `hoi_sau_dang` (thay luật riêng + trần căn / ngày; người bán có nhiều căn mà căn đầu không còn gì hỏi thì xét căn kế), `qc_anh`,
  tin xin ảnh sau đăng của `followup`, `hoi_con_ban`, `giu_ket_noi` (phía người bán; server truyền `_lqc_chan`). Tin nhắc khai tiếp trước
  khi đăng vẫn như cũ nhưng được đếm vào trần.
- **Chưa gồm:** tin chuyển câu khách mua hỏi cho chủ (đi đường `escalation-feed` của bridge, không qua lõi) — đợt sau đưa vào chung hàng.

### SRS-5.1zzzzzzz474 · Dataset thử lấy từ Mogi trong phạm vi AOND (13/11/2026)
Chủ dự án 13/11 xoá hết dữ liệu thử ("XÓA RỒI") rồi yêu cầu "lấy thông tin và 1000 căn từ mogi về để có dataset còn test tính năng", "trong phạm vi
của AOND cần thôi". Bảng `listings` trống thì so giá quanh, báo cáo giá, gợi ý cho người mua đều không có gì để chạy.
- **Lấy:** `scripts/lay-mogi.py` — các danh mục Mogi TP.HCM (nhà hẻm, mặt tiền, căn hộ, đất, biệt thự, thuê căn hộ /
  nhà / phòng trọ / mặt bằng), mỗi lần gọi cách ≥ 1,2 giây, chỉ trang robots.txt cho phép. Chỉ lấy ô AOND dùng (loại, giá, diện tích, phòng, tầng,
  đường vào, pháp lý, địa chỉ, toạ độ); không lấy ảnh, tên, số điện thoại người đăng.
- **Nạp:** `scripts/nap-mogi.py` gọi hàm DB `nap_tin_mogi(jsonb)` (chỉ service_role; migration `20261113g`). Phường theo toạ độ `phuong_tai_diem` —
  ngoài 168 phường thì bỏ. Toạ độ Mogi là ghim gần đúng → `toa_do_muc = 'phuong'`. Lời mô tả công khai sinh từ các ô đã bóc; lời người đăng gốc
  (đã che số điện thoại) + link nằm ở `listing_noi_bo` (nội bộ). Chạy lại không nhân đôi (`legacy_code = 'mogi:<mã>'`).
- **Kết quả:** 962 / 963 tin `source = 'mogi_thu'`, người bán thử `thu-mogi`; trigger tự đưa lên `dang_ban` nên hiện cả trên web công khai. Mẻ 20 tin (vai authenticator có `statement_timeout` 8 giây); số phòng ngoài 1–60 (toà "100 phòng") bỏ trống theo `listings_bedrooms_check`.
  Xoá cả bộ: `delete from listings where source = 'mogi_thu'` rồi xoá seller `thu-mogi`.

### SRS-5.1zzzzzzz473 · Thưởng quy mô chỉ từ hạng Bạc; bot báo hạng theo DB (13/11/2026)
Bắn thử SRS-466 trên production 13/11 lộ hai lệch: người bán 5 căn 47 điểm (Đồng), rao căn thứ 6 lên 61 (Bạc) vì hệ số quy mô 1,36 — trần 5 căn gần như không chạm; và bot báo "Hạng người rao hiện là Vàng" (số `gamification` trong cuộc chat, độ kịp thời 1,0 lúc mới chat) trong khi DB tính Đồng. Soát khuôn anh Luận (`luan8560/AOND`): `perks_for(DONG)` khai `max_listings=5`, `scale_bonus_active=False` nhưng không code nào dùng. SRD §IV.3: Bạc "kích hoạt Thưởng quy mô". Chủ dự án: "Sửa theo SRD".
- **DB (`20261113f`):** `diem_nguoi_ban` nhân hệ số quy mô chỉ khi điểm gốc ≥ 50. Lúc áp: 4 người bán thật, 0 người đổi hạng.
- **Lõi:** `gamification.user_score` cùng luật. Hạng bot nói (khối ĐIỂM TIN, `TurnResult.tier`, phiếu dự án `_ma_phieu`) đọc `SupabaseConversationStore.hang_nguoi_ban` → `rpc/diem_nguoi_ban`, nhớ 30 giây, chưa có người bán = Đồng; lỗi / kho không DB → số `gamification`. Prompt không đổi độ dài.
- Thông tin dự án do một người đưa vào vẫn nhận, vẫn dùng, kèm nhãn chưa chắc chắn — cần kiểm chứng (SRS-445, chủ dự án nhắc lại 13/11); hạng chỉ đổi trọng số phiếu.
