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
| `WEB` | Website công khai | Next.js ở root repo: `/`, `/[tag]`, `/mua-ban`, `/cho-thue`, `/nha-dat/[code]`, `/du-an`, `/du-an/[slug]`, `/ban-do`, `/moi-gioi`, `/thong-ke`, `/ds/[token]`, `/raoban`, `/tai-khoan`, `/yeu-thich`, `/tinh-lai-vay` |
| `BOT` | Bộ não hội thoại (B và S) | Lõi Python `src/aioi/` trên VPS (`aond-core.service`, cổng 8000), endpoint `POST /chat-reply`; một lõi cho cả người mua lẫn người bán, vai theo ý định từng lượt (SRS-5.1zzzzzzz153) |
| `KENH` | Kênh Zalo | Bridge `zca-js` 2.2.0 (`bot/bridge-zca/index.mjs`) trên tài khoản Zalo cá nhân (clone), HAI tiến trình: số ký gửi (`nhadat-bridge.service`) và số tư vấn người mua (`nhadat-bridge-tu-van.service`, `SO_NHAN=tu_van`) (SRS-5.1zzzzzzz210). Zalo OA không dùng |
| `SEL` | Phía người bán | Cùng lõi, nhánh bán; `/quan-ly` + `/dang-nhap` cho NMG trên web |
| `ADM` | Admin | `/admin`, `/admin/tin-nhan`, `/admin/cau-chuan`, `/admin/danh-gia`, `/admin/dang-tin`, `/admin/ro-hang`; việc nội bộ (câu khách hỏi, lịch xem, cần người thật) đi thẳng admin qua `reminders` → `escalation-feed` → bridge; cảnh báo ntfy |

**CTV không còn là phân hệ** (chủ dự án 28/10/2026: "bỏ hẳn CTV đi"). Mọi việc từng giao CTV nay giao admin, hoặc chủ nhà
khi tin có chủ nhà trên hệ thống (SRS-5.1zzzzzzz165, SRS-5.1zzzzzzz170, SRS-5.1zzzzzzz172, SRS-5.1zzzzzzz173).
Code và DB đã gỡ CTV (SRS-5.1zzzzzzz238 / 239): không còn bảng `ctvs`, view `ctv_ranks`, cột `ctv_id`, hàm `chon_ctv`; `la_nhan_vien`
chỉ tra bảng `admins`. Còn lại duy nhất giá trị enum `msg_sender = 'ctv'` (không ai ghi) `[nguồn: bot/supabase/schema.sql, 01/11/2026]`.

### 1.3 Tài liệu tham chiếu
`docs/00`…`docs/06`, `docs/09-open-issues.md`, `docs/10-ke-hoach-kiem-thu.md`, `docs/13-so-do-nhan-va-boc-tach.md` (sơ đồ một lượt chat),
`bot/bridge-zca/VPS.md` (vận hành VPS), `CLAUDE.md` §6 (luật đang áp, mỗi dòng kèm `SRS-…`).

---

## 2. Kiến trúc tổng thể

`[nguồn: src/aioi/server.py, src/aioi/engine.py, bot/bridge-zca/index.mjs, bot/bridge-zca/cai-vps.sh, bot/supabase/functions/, bot/supabase/schema.sql, 28/10/2026]`

```mermaid
flowchart TB
    ZK["Zalo app khách<br/>(người mua / người bán)"]
    ZA["Zalo app admin"]
    W["Web Next.js 15 · Vercel<br/>aioinhadat.vercel.app"]
    subgraph VPS["VPS"]
        BR1["bridge zca-js · số ký gửi<br/>nhadat-bridge · /send 5005"]
        BR2["bridge zca-js · số tư vấn<br/>nhadat-bridge-tu-van · /send 5006"]
        CORE["Lõi Python aond-core<br/>FastAPI 127.0.0.1:8000<br/>POST /chat-reply · GET /health<br/>vòng nền: gui_nhac 60 s · bao_can_moi 10 phút"]
        SQL[("SQLite aioi.db<br/>kho phụ của lõi")]
    end
    subgraph SB["Supabase rqxmmqmctpklqcmbfxuj"]
        DB[("Postgres + RLS + pgvector<br/>bảng · trigger · RPC · view")]
        EF["Edge Functions (Deno)<br/>escalation-feed · geocode-listings · media-cleanup"]
        CRON["pg_cron → pg_net"]
        ST[("Storage<br/>listing-public · listing-private")]
        VA["Vault"]
    end
    CL["Claude<br/>chat: Sonnet 5.5 · bóc tách: Haiku"]
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
- **Tin chủ động cho khách do lõi gửi**, qua `POST /send` của bridge: nhắc `followup` / `sold` / `feedback` / `admin_reply`
  (`gui_nhac.py`, SRS-5.1zzzzzzz216), báo căn mới (`bao_can_moi.py`, SRS-5.1zzzzzzz150), nhắc người bán 5 phút (`followup.py`).
  Tin gửi đúng số khách đang nhắn (`Conversation.so_nhan`).
- **Tin nội bộ cho admin / chủ nhà** đi đường khác: trigger DB đẻ `reminders(kind = 'escalation' | 'report')`, bridge số ký
  gửi kéo qua `escalation-feed`, tin cho admin mở bằng `$$$$$ ` (SRS-5.1zzzzzzz134). Số tư vấn không nhận việc này.

### SRS-2.1 — Tech stack

`[nguồn: package.json, src/aioi/config.py, src/aioi/llm/, bot/bridge-zca/cai-vps.sh, bot/supabase/schema.sql; soát 28/10/2026]`

| Lớp | Công nghệ |
|---|---|
| Lõi hội thoại | Python, FastAPI (`src/aioi/server.py`), chạy `aond-core.service` tại `/opt/aond_core`, cổng 8000 (chỉ 127.0.0.1). Cài và khởi động lại bằng workflow `apply-migration.yml` ô `dung_lai = cai-vps` (`bot/bridge-zca/cai-vps.sh`) |
| Module lõi chính | `engine.py` (phiên chat, định tuyến bán / mua) · `prompts.py` (mọi prompt, `GIONG_VUI`, `AD_FORMAT`, `muc_phi`, `VUNG_NHAN_TIN`) · `schema.py` (`CORE_FIELDS`, `CORE_THEO_LOAI`, `FACETS`, `O_NOI_BO`) · `mua.py` (phía người mua) · `supabase_store.py` (kho Supabase) · `dia_danh.py` · `phap_ly.py` · `cau_mau.py` · `xung_ho.py` · `bao_can_moi.py` · `gui_nhac.py` · `lenh_zalo.py` · `anh_can.py` · `kho_anh.py` · `web.py` · `llm/` |
| Kho trạng thái | Supabase là nguồn chính (`SupabaseConversationStore`); SQLite `aioi.db` trên VPS là kho dự phòng khi thiếu khoá Supabase (`SqliteConversationStore`) |
| Kênh chat | Zalo cá nhân qua bridge `zca-js` 2.2.0 (ghim, SRS-5.1zzzzzzz177), tài khoản clone (quyết định chủ dự án 20/10/2026). Hai số: ký gửi và tư vấn (SRS-5.1zzzzzzz210). Bridge thả tim (`addReaction`), gửi ảnh qua `guiAnhQuaUrl` |
| AI chat | Claude **Sonnet 5.5** cho lượt trả lời khách thật (`MODEL_CHAT` trong `cai-vps.sh` → `AIOI_CHAT_MODEL`, SRS-5.1zzzzzzz235); ID thử theo `AIOI_CHAT_MODEL_THU` (SRS-5.1zzzzzzz234) |
| AI bóc tách | Claude Haiku (`AIOI_EXTRACT_MODEL`, mặc định `claude-haiku-4-5`): lượt lập thao tác, đọc ảnh |
| Dự phòng | `llm/du_phong.py`: Claude hỏng thì Gemini rồi Groq; mỗi lần gọi ≤ 15 s, cả vòng ≤ 40 s (SRS-5.1zzzzzzz117, SRS-5.1zzzzzzz133) |
| Prompt caching | Cắt chuỗi system ở `RANH_GIOI_CACHE` (`llm/base.py`); chỉ phần trước dấu có điểm cache (SRS-5.1zzzzzzz166, SRS-5.1zzzzzzz213) |
| Tìm theo nghĩa | Gemini `gemini-embedding-001`, 768 chiều. Câu khách nhúng lúc chat (`dia_danh.py`); dữ liệu nhúng bằng lịch `nhung-tick`, `nhung-dia-danh-tick`, `nhung-luat-tick`. RPC: `tim_nha` (vector `listings.nhung`), `tim_dia_danh_theo_nghia`, `tim_dieu_luat` |
| Tin thoại | Groq Whisper chép ra chữ trước khi vào lõi (`server.py`, `transcribe_voice_url`) |
| DB | Supabase Postgres, RLS trên mọi bảng, trigger + RPC `security definer`, `pgvector`. Lõi đọc / ghi bằng `service_role` qua REST |
| Serverless | 3 Edge Functions (Deno): `escalation-feed`, `geocode-listings`, `media-cleanup` (`§4`); `_shared/` còn `claude.ts`, `gate.ts`, `geocode.ts`, `tin_nhac.ts`, `extraction/` (`luat-tien.ts`, `luat-lien-he.ts`, `nhan.ts`, `ds-phuong.ts`, `tien-ich.ts`) |
| Lịch / HTTP nội bộ | `pg_cron` + `pg_net` (`net.http_post`). Lịch nhắc tên trong repo: `nhung-tick`, `nhung-dia-danh-tick`, `nhung-luat-tick`, `geocode-tick`, `info-request-sla-tick` (chạy `info_request_sla_tick`), `bot-health-tick`, `media-cleanup-tick`, `don-du-lieu-thu`. Danh sách đủ ở SRS-5.3 |
| Bí mật | `.env` lõi trên VPS (khoá Claude, Gemini `GEMINI_API_KEY`…`_4` lấy từ Vault qua `cai-vps`, Groq, service_role); Vault giữ `BRIDGE_SECRET` và khoá cho hàm DB, đọc qua `get_secret()` chỉ `service_role` |
| Kho file | Supabase Storage (SRS-5.1zzzzzzz56): `listing-public/<uuid tin>/` (ảnh căn, công khai), `listing-private` (sổ đỏ, giấy tờ, PDF, tệp dự án; signed URL). SharePoint / OneDrive đã bỏ |
| Web | Next.js 15 (App Router) + TypeScript + Tailwind 4, Bun, deploy Vercel từ root repo. Link bot gửi lấy từ `src/aioi/web.py` (`AIOI_SITE_URL`, mặc định `https://aioinhadat.vercel.app`) |
| Auth | Supabase Auth: Google OAuth + magic link email (NMG, admin, tài khoản B tự nguyện); không Zalo SSO |
| Bản đồ | MapLibre `maplibre-gl` 6.13.0 + nền OpenFreeMap, nạp qua `napMapLibre()` (`lib/ban-do.ts`), gom cụm `lib/cum-ghim.ts` (SRS-5.1zzzzzzz206, SRS-5.1zzzzzzz217). Toạ độ tin: từ điển `duong` trước, rồi Nominatim qua rpc `tra_nominatim`; tiện ích quanh tin qua rpc `tra_overpass` (SRS-5.1zzzzzzz152, SRS-5.1zzzzzzz224) |
| Cảnh báo | ntfy.sh (`canh_bao_ngoai`), `bot_health_tick` đọc `net._http_response` (NFR-18) |
| Quan trắc | `bot_errors` / `bot_health` / `bot_usage` / `bot_usage_model` + `/admin`; log lõi trên VPS chỉ ra journal từ mức `warning` (SRS-5.1zzzzzzz233); đọc bằng ô `doc-log-loi` |
| Kiểm thử | `bun run test:py` (pytest `tests/`, lõi Python) + `bun run kiem` (tsc, `kieu:bot`, build, `test:bot`, `test:rohang`, `truyvet`); bắn thử production bằng ID thử qua ô `ban-thu-*` của `apply-migration.yml` (`docs/10`) |

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
   **lõi gửi** qua `gui_nhac.py` (vòng `server._vong_gui_nhac`, 60 s, khung 8–20 giờ), câu mẫu `bao_tra_loi_chu_nha` (SRS-5.1zzzzzzz216).
5. Quá hạn: `info_request_sla_tick` (lịch `info-request-sla-tick`): chủ nhà quá `chu_nha_han_gio()` (12 giờ) → giao admin hạn
   `admin_han_gio()` (5 giờ); admin quá hạn → nhắc lại + email. Lịch xem (`viewings`) đi thẳng admin (`viewings_bao_admin_va_email`, SRS-5.1zzzzzzz165); admin trả lời `#mã: ok giờ` thì chốt lịch và báo khách.

[deprecated 28/10/2026 — bỏ CTV, chủ dự án] Bản v2.0 của mục này: giao CTV ít việc nhất, SLA 120 phút `ctv_sla_phut()`,
`chat-reply` nhánh `nguoi_noi_bo`, `nudge` gửi followup, vòng nhỏ giọt `ask-seller` / `ask_seller_drip()`. `chat-reply`, `nudge`,
`ask-seller`, `ask_seller_drip()`, `nguoi_noi_bo`, `ctv_sla_phut()` đã gỡ.

---

## 3. Mô hình dữ liệu

`[nguồn: information_schema + pg_constraint + pg_policies, DB 04/09/2026; soát lại theo bot/supabase/schema.sql 28/10/2026]`

> **Soát 28/10/2026.** `schema.sql` hiện có **45 bảng** `public`. Đã gỡ, mọi chỗ nhắc dưới đây là LỊCH SỬ: `listing_facts` (SRS-5.1zzzzzzz66,
> ô tin một nguồn `listings.boc_tach`), `required_facts` (`20261019g`, bộ câu hỏi nay ở `src/aioi/schema.py`), `bot_prompts`, `mau_cau`,
> `van_kich`, `inbound_ledger`, `inbound_events`, `ai_ghi_thu`, `ctv_daily_reports`, `du_an_can`, `du_an_tai_lieu`, `project_fact_phieu`
> (`20261018i`), `boc_tach_bong`, `ratings_log`, `project_facts`; trigger `listing_insert_drip`, `bao_tin_moi_khop`,
> `trg_conversations_assign_ctv` + hàm `assign_ctv_round_robin` (`20261025a`); view `listing_missing_facts`, `job_suc_khoe`.
> Bảng mới sau 08/10: `bot_usage_model`, `cau_chuan`, `cau_mau`, `danh_gia_ai`, `du_an_kien_thuc`, `giao_lo`, `kien_thuc_phap_ly`,
> `listing_noi_bo`, `van_ban_luat`, `dieu_luat`, `nhung_viec_luat`, `xa_tinh_khac`. CTV: bỏ hẳn (chủ dự án 28/10/2026), phần CTV còn
> trong DB là tàn dư chưa dọn (§1.2).
Khối: `cột:kiểu`, `!` = NOT NULL, `=` = default, `→` = FK. PK `uuid` trừ khi ghi khác. Enum thật:
`listing_deal(ban, cho_thue)`, `property_type(nha_pho, nha_cap4, chung_cu, dat, biet_thu, phong_tro, mat_bang, toa_nha, dat_nong_nghiep, dat_kinh_doanh, kho_xuong, chua_ro)` (4 loại sau thêm `20260909i`),
`seller_type(ccrb, nmg, unknown)`, `request_status(pending, answered, expired)`, `msg_sender(buyer, seller, bot, ctv, system, human)`,
`unit_status(con_ban, giu_cho, da_coc, da_ban)`.

### SRS-3.0 · Bản đồ 45 bảng và đường ghi ô tin

`[nguồn: pg_class + pg_description, DB 06/09/2026]`

Ba tháng sau mở lại repo, thứ mất trước tiên là *cái nào thuộc về cái nào*. Mục
này là bản đồ đó. Nó KHÔNG đẻ nguồn sự thật thứ hai: chú thích tương ứng đã nằm
trong chính DB (`comment on table/column`, migration `20260906b`), hiện ra ngay
dưới tên bảng trong Supabase Table Editor. Đây là bản in ra giấy của thứ đó.

**Năm nhóm, 45 bảng** (đếm `create table` trong `bot/supabase/schema.sql` 28/10/2026). Tiền tố `[NHÓM]` nằm ngay đầu chú thích mỗi
bảng (`comment on table` trong migration), nên Table Editor xếp A→Z mà mắt vẫn gom được theo việc. `bot_usage_model`, `chat_quota`,
`bridge_dang_nhap` xếp theo việc [giả định BA: chưa thấy dòng `comment on table` của ba bảng này trong migration].

| Nhóm | Bảng |
|---|---|
| `[RỔ HÀNG]` (14) | `listings` `media` `listing_media` `listing_noi_bo` (SRS-5.1zzzzzzz116) `media_cleanup_queue` `projects` `listing_views` `wards` (FR-209) `tien_ich` (FR-204) `duong` (FR-212) `phuong_cu` `quan_cu` (`20260930a`) `giao_lo` (SRS-5.1zzzzzzz43) `xa_tinh_khac` (SRS-5.1zzzzzzz128) |
| `[NGƯỜI & HỘI THOẠI]` (10) | `buyers` `sellers` `conversations` `messages` `interests` `info_requests` `viewings` `deals` `reminders` `danh_gia_ai` (SRS-5.1zzzzzzz104) |
| `[BOT & HÀNG ĐỢI]` (15) | `bot_errors` `bot_health` `bot_usage` `bot_usage_model` `chat_quota` `cau_chuan` (SRS-5.1zzzzzzz88) `cau_mau` (SRS-5.1zzzzzzz106) `nhung_viec` `nhung_viec_du_an` (FR-216) `nhung_viec_dia_danh` (`20260930a`) `nhung_viec_luat` `du_an_kien_thuc` (SRS-5.1zzzzzzz56) `kien_thuc_phap_ly` (SRS-5.1zzzzzzz176) `van_ban_luat` `dieu_luat` (SRS-5.1zzzzzzz231) |
| `[CTV]` (0) | Đã gỡ: `ctvs` (SRS-5.1zzzzzzz238), `ctv_daily_reports` (`20261018i`) — không còn vai CTV (chủ dự án 28/10/2026) |
| `[HỆ THỐNG]` (5) | `admins` `app_config` `curated_lists` `property_events` `bridge_dang_nhap` (FR-201; một dòng mỗi số Zalo, SRS-5.1zzzzzzz210) |

**Quan hệ chính** — chỉ khoá ngoại thật, không vẽ luồng chạy:

```mermaid
erDiagram
  projects  ||--o{ listings      : "project_id"
  sellers   ||--o{ listings      : "seller_id"
  listings  ||--o{ listing_media : "ảnh (neo UUID)"
  listings  ||--o{ media         : "ảnh lối cũ (ngoài Supabase)"
  listings  ||--o{ interests     : ""
  listings  ||--o{ info_requests : ""
  listings  ||--o{ deals         : ""
  listings  ||--o{ viewings      : ""
  buyers    ||--o{ interests     : ""
  buyers    ||--o{ deals         : ""
  buyers    ||--o{ conversations : "buyer_id"
  sellers   ||--o{ conversations : "seller_id"
  conversations ||--o{ messages  : "sắp theo seq"
  van_ban_luat  ||--o{ dieu_luat : ""
```

Một hội thoại có thể gắn CẢ `seller_id` và `buyer_id` (một Zalo = một khách = một hội thoại, SRS-5.1zzzzzzz149). Khoá ngoại
Cột `ctv_id` đã gỡ khỏi `conversations`, `info_requests`, `reminders`, `deals` (SRS-5.1zzzzzzz238).

Ba chỗ hay hiểu nhầm, nói thẳng ở đây:

- **Không có bảng `buyer_preferences`.** Nhu cầu khách nằm ở cột
  `buyers.preferences` (jsonb).
- **Không có bảng câu hỏi theo loại BĐS.** Bộ câu hỏi theo loại chỉ ở `src/aioi/schema.py` (`CORE_FIELDS` theo nhóm,
  `CORE_THEO_LOAI` đè cho loại riêng, SRS-5.1zzzzzzz68). Bảng `required_facts` đã gỡ (`20261019g`).
- **`media` và `listing_media` là hai đời khác nhau.** `media` trỏ file NGOÀI Supabase (lối cũ). `listing_media` (FR-165) là ảnh
  trong Storage, neo `listings.id`; web đọc qua view `listing_photos_v`. Từ 09/09/2026 không còn `masterDB/` trên máy chủ dự án,
  rổ hàng đến từ tin rao thật qua chat và rổ mẫu `seed_thu` (SRS-5.1zzzzzzz167, SRS-5.1zzzzzzz168).

**Đường ghi ô tin — một nguồn `listings.boc_tach`** (SRS-5.1zzzzzzz66). Hình trạng hiện tại:

```mermaid
flowchart TB
  k["tin khách (chat Zalo)"] --> ai["lõi: lượt AI lập thao tác<br/>Engine._lap_ke_hoach (Haiku)"]
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
`bot/tests/ranh-gioi.mjs` (nằm trong `bun run test:bot`, nên chạy ở CI mỗi PR) chặn hai chiều: mã bóc tách tiền định
không được import SDK Anthropic / `claude.ts` / gọi RPC; tầng AI không được ghi
bảng nghiệp vụ, chỉ ba RPC đã khai tên (`get_secret`, `log_loi`, `cong_token`).
Bài có ca âm nên luật hỏng thì bài đỏ, không im.

**Đọc rổ hàng bằng mắt người:** view `ro_hang_ban` (20 cột thay cho 56, giá quy
ra tỷ, nhãn tiếng Việt, cột `canh_bao` chỉ đích danh trường nào là máy đoán).
`security_invoker = on`, `anon` bị revoke.

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
Soát 28/10/2026: khối trên là bản 04/09. `schema.sql` nay có 63 cột (SRS-5.1zzzzzzz140, OPEN-64): KHÔNG còn `legacy_sst`, `unit_status`,
`source_url`, `cc_link`, `specs_source`, `last_confirmed_at`; thêm `boc_tach` jsonb (ô tin một nguồn, đọc qua `o_boc_tach()`, SRS-5.1zzzzzzz66),
`can_chu_duyet`, `chu_duyet_at`, `gap`, `legacy_code`, `toa_do_muc`, `geocode_at`, `tien_ich_gan`, `tien_ich_at`, `nhung` / `nhung_md5` / `nhung_luc`
(vector cho `tim_nha`). RPC `them_nhan_tin` không còn trong `schema.sql`.
Bản đồ ánh xạ đầy đủ 67 cột (nghĩa, khách nói ví dụ, ghi từ đâu, fact liên quan, lọc ở đâu) + fact → cột + ma trận 12 loại BĐS:
`docs/anh-xa-du-lieu-listings.xlsx` (ảnh chụp 18/09/2026 từ `information_schema` + trigger + `required_facts` + 10 tin bắn thật; đổi schema thì phải làm lại — đã lệch: `required_facts` gỡ 19/10).

- CHECK `status ∈ {cho_thong_tin, dang_ban, dang_quan_tam, da_coc, da_chot, an}` (FR-139; `da_coc` có trong `schema.sql` 28/10); `access_type ∈ {mat_tien, hem_xe_tai, hem_xe_hoi, hem_xe_may, hem}`;
  `legal_status ∈ {so_hong_rieng, so_hong_chung, so_hong, hdmb, giay_tay}`; `furnishing ∈ {full, co_ban, khong}`; `bedrooms 1..20`;
  `*_source ∈ {suy_doan, chu_xac_nhan, admin}`; `specs_source ∈ {boc_mo_ta, admin, chu_xac_nhan}` (FR-164/172).
- Trigger BEFORE (theo tên, `schema.sql` 28/10): `trg_listings_chuan_hoa_cot` · `trg_listings_fill_property_type` (FR-150) · `trg_listings_price_vnd` (FR-154) ·
  `trg_y_listings_boc_thong_so` (FR-172) · `trg_z_listings_normalize_status` · `trg_zy_listings_chan_so` · `trg_zz_listings_dang_tin` (lên kệ, FR-144) ·
  `trg_listings_zz_doi_ma` · `trg_listings_zz_fill_code` · `trg_listings_zz_toa_do`.
  AFTER: `trg_listings_bao_can_da_chot` (FR-108), `trg_listings_day_ro_ccrb`, `trg_pe_listings` (FR-70).
  Đã gỡ: `listing_insert_drip` (FR-129, `20261018i`), `bao_tin_moi_khop` (FR-64, `20261025h`).
- Index lọc: `(deal, price_vnd)`, `(deal, status, access_type)`, `(deal, status, floors)`, `(district, status)`; unique partial `(project_id, unit_code)`.
- Policy: `anon_read_listings` chỉ `dang_ban | dang_quan_tam | da_chot`; `listings_own_read/insert` (NMG tin của mình); `listings_admin_read/update`.
- Luật: `area_m2` là diện tích chính (chung cư = tim tường), `legal_area_m2` là công nhận — hai cột khác nhau; `description` giữ nguyên văn
  câu rao, không trigger nào sửa (FR-91/153). [LỊCH SỬ] Luật bậc nguồn cho fact (`chu_xac_nhan` > `admin` > `suy_doan`, FR-163 a,
  FR-164 a) chạy trên `listing_facts` + `bac_nguon()`, cả hai đã gỡ; nay ô tin chỉ ghi điều khách nói qua cổng bằng chứng của lõi (SRS-5.1zzzzzzz73).

### SRS-3.2 · `property_events` — FR-70, FR-73

```text
id:bigserial  listing_id:uuid!→listings cascade  event_type:text!  buyer_id:uuid→buyers set null  at:timestamptz!=now()  meta:jsonb
```
- CHECK `event_type ∈ {view, asked, interest, photos, viewing, deal, match_sent, status}`; index `(listing_id, at desc)`, `(at desc)`; policy `property_events_admin_read`.
- Chỉ trigger `trg_property_event()` ghi (`ghi_su_kien_bds`, không bao giờ ném): `listing_views` → `view`, `info_requests` `buyer_ask` → `asked`,
  `interests` → `interest`, `viewings` → `viewing`, `deals` → `deal`, `reminders` match sent → `match_sent`, `listings` đổi `status` → `status`. `photos` chưa có nguồn sinh.
- `hot_score` (FR-73) = view `bds_hot` tính lúc đọc (số sự kiện 60 ngày), không có cột/job.

### SRS-3.3 · `buyers`

```text
id:uuid!  zalo_user_id:text unique  auth_user_id:uuid unique→auth.users  name:text  phone:text
preferences:jsonb='{}'  last_contact_at:timestamptz  notes:text  created_at:timestamptz!
```
- `preferences` = hồ sơ nhu cầu tích luỹ, nay do lõi ghi (`mua.py`, `BuyerLead`); `merge_buyer_prefs()` đã gỡ. Cờ tắt báo căn mới:
  `buyers.bao_can_moi` (SRS-5.1zzzzzzz175).
- `phone` chỉ khi B tự cung cấp ở luồng đặt lịch (NFR-07); `/admin` không SELECT cột này. Policy `buyers_self_read/insert/update`, `buyers_admin_read`.
- Không có `connection_status`/`fingerprint_ids`: vết giữ chân ở `reminders.kind = reengage` (FR-63); fingerprint không dựng (OPEN-14).

### SRS-3.4 · `sellers`

```text
id:uuid!  zalo_user_id:text unique  auth_user_id:uuid unique→auth.users  phone:text unique  phone_proxy:text  name:text
seller_type:seller_type!=unknown  rating_sum:int!=0  rating_count:int!=0  active_listing_id:uuid→listings set null  created_at:timestamptz!
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
messages       id:uuid!  conversation_id:uuid!→conversations  sender:msg_sender!  body:text!  zalo_msg_id:text unique  seq:bigint! unique  created_at:timestamptz!
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
source:text!=seller_flow  assignee:text  sla_due_at,sla_missed_at,reminded_at,answered_at:timestamptz  created_at:timestamptz!
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
listing_facts  [ĐÃ GỠ 19/10/2026, SRS-5.1zzzzzzz66 — ô tin một nguồn listings.boc_tach]
deals          id:uuid!  listing_id:uuid!→listings  buyer_id:uuid→buyers  price_vnd:bigint  fee_pct:numeric  closed_at  created_at
               unique nulls not distinct (listing_id, buyer_id)
```
- `interests`: `mark_listing_interest(codes, buyer_id)` ghi cho mọi căn khách nhắc/bot gợi/xin hình/nhờ hỏi chủ; tin sang `da_chot` → mỗi khách
  trong `interests` nhận `reminders.kind='sold'` (FR-108), lõi gửi (`gui_nhac.py`). Khách chê căn → `interests.trang_thai = khong_hop`
  (SRS-5.1zzzzzzz175), kèm `ly_do`.
- [LỊCH SỬ] `listing_facts` / `ghi_fact_listing()` / `listing_facts_sync_cols`: đã gỡ. Ô chủ nhà nói riêng nằm ở `listing_noi_bo` (chỉ admin).
- `deals`: căn cứ phí (`fee_pct` null khi chốt lúc `unknown`, OPEN-28); `deals_chan_xoa_da_chot` cấm xoá deal đã chốt.
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
                     CHECK bucket ∈ {listing-public, listing-private}; media_type ∈ {mat_tien, trong_nha, hem, so_do, giay_to, khac};
                     so_do/giay_to ⇒ bucket riêng; is_cover ⇒ bucket công khai; storage_path bắt đầu '<listing_id>/'; unique (bucket, storage_path);
                     unique partial một bìa/tin; trigger listing_media_giu_bia, listing_media_xep_hang_don (→ media_cleanup_queue)
media_cleanup_queue  id:uuid!  bucket,storage_path:text!  trang_thai:text!=cho ∈ {cho, dang_lam, xong, loi, chet}  attempts:int!=0  last_error
                     next_retry_at  created_at  updated_at                          -- FR-165 e, FR-166 g
inbound_events       [ĐÃ GỠ 18/10/2026, 20261018i] -- FR-162
inbound_ledger       [ĐÃ GỠ 18/10/2026, 20261018i] -- FR-162, FR-166
reminders            id:uuid!  kind:text! ∈ {promise, reengage, viewing, followup, escalation, report, match, feedback, sold, rating, admin_reply}
                     buyer_id  seller_id  listing_id  viewing_id (FK cascade)  due_at:timestamptz!  note:text
                     status:text!=pending ∈ {pending, sent, cancelled, dead}  sent_at  locked_at  locked_by  attempts:int!=0  next_retry_at  last_error
                     unique partial: (buyer_id, listing_id) match; (buyer_id, listing_id) sold; (viewing_id) feedback; (buyer_id) reengage pending
                     -- FR-32/60…64/108/110/133/166 f; policy reminders_admin_read/update
                     -- 28/10: lõi gửi followup / sold / feedback / admin_reply (gui_nhac.py, SRS-5.1zzzzzzz216); escalation / report đi escalation-feed;
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
                     nhung:vector(768)  nhung_md5  nhung_luc   -- 20260930a: vector nghĩa (Gemini) của van_ban_dia_danh('wards', ten); cron nhung-dia-danh-tick
duong                id:uuid PK  ten:text! (có dấu, không tiền tố "Đường")  ten_khong_dau:text (generated: bo_dau(ten), index)  tinh! ∈ {TP.HCM, Tây Ninh, Đồng Nai} (tỉnh MỚI)
                     tinh_cu ∈ {TP.HCM, Bình Dương, Bà Rịa – Vũng Tàu}  phuong:text!='' (wards.ten_day_du)  quan_cu  nguon!  created_at; unique (ten, tinh, phuong)
                     -- FR-212 (20260921b): từ điển tên đường từ OSM/Overpass theo phường mới; RPC tim_duong(ten, quan, toi_da) khớp đúng/gần (fuzzystrmatch); chỉ service_role; dữ liệu nạp bằng scripts/nap-duong.mjs
                     loai ∈ {duong, so, hem}  so_hem ('137', '137/28')  duong_me  lat,lng (tâm OSM)  nhung:vector(768) (không nhúng hẻm)  nhung_md5  nhung_luc   -- 20260930a: giữ đường số + hẻm có toạ độ (nap-duong.mjs out center)
phuong_cu            id PK  ten! ('Phường 12', 'Phường Thảo Điền')  loai ∈ {phuong, xa, thi_tran}  quan_cu!  phuong_moi!→wards.ten  toan_bo!  lat,lng (tâm phường mới)  nhung  -- 20260930a: 487 dòng tách từ wards.don_vi_cu; unique (ten, quan_cu, phuong_moi)
quan_cu              ten PK ('Quận Gò Vấp')  lat,lng (trung bình tâm phường mới)  so_phuong_moi  nhung  -- 20260930a: quận / huyện / TP cũ trước 07/2025
media                bảng cũ đường OneDrive, còn policy anon đọc ảnh approved, không còn nguồn ghi — dọn cùng OPEN-18
```
- Không dựng: `tags`/`property_tags` (tag là hằng `lib/tags.ts`, 64 tag, FR-12; OPEN-06), `saved_criteria` (FR-64 đọc `buyers.preferences`),
  `escalations` (bốn loại đi `email_admin()`; vết việc ở `reminders`/`viewings`/`info_requests`), `photos` (thay bởi `listing_media`).

### SRS-3.9 · Bảo mật dữ liệu

`[nguồn: pg_policies, pg_class.relacl, storage.policies, DB 04/09/2026]` Anon key là khoá **công khai** (trong bundle JS và bridge) nên RLS + GRANT là bức tường duy nhất:

1. Vai `anon` chỉ SELECT; `authenticated` ghi có policy gác (`buyers`, `sellers`, `listings` nháp, `listing_views`, `listing_media` tin của mình); không ai có TRUNCATE (FR-167).
2. Bảng chỉ cho bot (`conversations`, `messages`, `info_requests`, `viewings`, `deals`, `interests`, `listing_noi_bo`,
   `curated_lists`, `media_cleanup_queue`, `app_config`; bản 04/09 còn `ctv_daily_reports`, `bot_prompts`, `required_facts`, `inbound_*`,
   `ratings_log` — đã gỡ) bật RLS, chỉ policy đọc cho admin hoặc không policy — anon 0 dòng; cảnh báo `rls_enabled_no_policy` là kỳ vọng.
3. Hàm là nội bộ trừ khi chứng minh ngược lại: EXECUTE mặc định chỉ `service_role`/`postgres`; ngoại lệ cố ý là hàm thuần `immutable` (`bo_dau`, `boc_thong_so`,
   `khu_khop`, `seller_rank`, `chuan_hoa_*`…; `bac_nguon` đã gỡ), `log_loi` (web Next chạy bằng publishable key), `doc_danh_sach` (anon), và cho `authenticated`:
   `admin_dang_tin`, `tao_danh_sach`, `la_admin`, `tin_cua_toi`, `thu_muc_dau_uuid`, `parse_vnd`, `guess_property_type`. Mọi hàm ghim `search_path`.
4. View công khai phải là **SECURITY DEFINER tự chứa** (`agents_public`, `listing_photos_v`), chỉ lộ cột không định danh, chỉ tin đã lên kệ; view không dùng cho anon
   để `security_invoker` và revoke (`public_listings`, `public_media`, `media_mo_coi_*`; `listing_missing_facts`, `job_suc_khoe` không còn trong `schema.sql` 28/10).
   View admin (`nmg_hoat_dong`, `bds_hot`, `hoi_thoai_*`, `khach_can_nguoi_that`; `bot_do_tre` không còn trong `schema.sql` 28/10) gác `auth.role() = 'service_role'` hoặc email trong `admins` (FR-167 c).
5. Vault không chạm anon: `get_secret()` chỉ `postgres`/`service_role`.
6. Storage: `listing-private` không có route public; đọc duy nhất bằng signed URL 900 s do admin ký ở `/admin` (`storage_admin_private_all`, NFR-06). Bucket công khai:
   `storage_admin_public_all`; người bán chỉ INSERT/DELETE đường dẫn có thư mục đầu = UUID tin của mình (`tin_cua_toi(thu_muc_dau_uuid(name))`, FR-96).
   `listing_media` công khai chỉ đọc được khi TIN đã lên kệ (`listing_media_doc_cong_khai`, FR-167 c).
7. Cổng edge function (`_shared/gate.ts`): 3 function còn lại (`escalation-feed`, `geocode-listings`, `media-cleanup`) qua nếu `Authorization` là service key hoặc header `x-bridge-secret` khớp `BRIDGE_SECRET`; chưa đặt secret thì
   fail-open nhưng ghi `bot_errors` nguồn `<function> CONG MO`; bí mật đọc qua `secretOf()` (env trước, Vault sau). Mọi hàm SQL gọi `net.http_post` tới function
   phải mang `x-bridge-secret`, trừ `canh_bao_ngoai` (FR-151 b, FR-167 b).
8. [deprecated 28/10/2026] `zalo-webhook` đã gỡ (SRS-5.1zzzzzzz46); không còn cửa Zalo OA. Lõi `aond-core` chỉ nghe 127.0.0.1, bridge gọi
   trong cùng máy; `/send` của bridge cũng chỉ nghe 127.0.0.1.

Hồi quy: TS-SEC-01…10, TS-SEC2 (`docs/10`) sau mọi migration đụng RLS/GRANT.

### SRS-3.10 · `projects` — FR-113…FR-117

```text
id:uuid!  name:text!  slug:text unique  developer  district  ward  province  location_raw  lat,lng:numeric  legal_status  amenities:jsonb
floor_plans:jsonb  images:jsonb  specs:jsonb  unit_types:jsonb  description  price_min,price_max:bigint  priority:int!=100  is_partner:bool!=false
handover_date:date  handover:text  status_text  source  source_url  created_at  updated_at
```
- `listings.project_id/unit_code/floor/direction/unit_status` nối căn với dự án; unique partial `(project_id, unit_code)`. Policy `anon_read_projects` (true); `match_projects(text)` tìm dự án khách nhắc.
- Luật thừa hưởng (FR-115/116): câu tầng dự án trả từ `projects`, không sinh `info_requests`; "căn X còn không" đọc `unit_status`; `last_confirmed_at` > 7 ngày hoặc null → "để em xác nhận lại chủ".
  Soát 28/10/2026: `listings.unit_status` và `listings.last_confirmed_at` không còn trong `schema.sql` (SRS-5.1zzzzzzz140). Kiến thức dự án lõi học
  được nằm ở `du_an_kien_thuc`; phía mua tra qua `supabase_store.tra_du_an` (SRS-5.1zzzzzzz184).

### SRS-3.11 · Tài khoản, admin và view quan trắc hội thoại — FR-124…FR-128, FR-71/74/76/77/78/80

- `sellers.auth_user_id`, `buyers.auth_user_id` nối Supabase Auth (Google OAuth + magic link). CCRB không cần tài khoản.
- `admins(email)`: mọi policy `*_admin_read/update` kiểm `exists (select 1 from admins where email = auth.jwt()->>'email')`. Thêm admin = insert email.
  Các bảng buyer side (`info_requests`, `viewings`, `buyers`, `conversations`, `messages`) chỉ mở SELECT cho admin; ghi thuộc lõi / trigger / RPC admin.
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
Cả ba: RLS, policy `*_admin_read`, ghi chỉ `service_role`. `bot_errors` là sổ duy nhất còn lại khi log function (1 ngày, bậc Free) trôi — mọi `catch` phải nối `ghiLoi()`/`log_loi()` (FR-152 d).

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
| `bot_health_tick` / `beat(who)` / `bo_dem_nhac_treo(gio)` | Quét `net._http_response` không 2xx → `bot_errors`, nhịp tim bridge, gộp báo 1 tin/giờ, dọn sổ 30 ngày (FR-152, NFR-18) / nhịp tim / đếm nhắc treo | SR |
| `log_loi(source, detail, code)` / `bat_het_tien_api()` | Cửa ghi lỗi, van 20 dòng/nguồn/giờ, 200/giờ (FR-171 b) / dấu hiệu hết tiền AI → `HET TIEN API`, ghi thẳng, hãm 6 h (FR-168) | anon / trig |
| `bump_model_quota(limit)` / `cong_token(..., p_model)` | Trần lượt gọi model/ngày; cộng số chữ vào `bot_usage` (theo ngày) và `bot_usage_model` (theo ngày × model, SRS-5.1zv) (FR-151 a, FR-169) | SR |
| `claim_inbound` / `bao_hong_inbound` / `viec_inbound_bo_roi` / `ghi_su_kien_inbound` | Sổ idempotency tin đến: giành job atomic, 8 lần → `dead`, tìm việc bỏ rơi 24 h (FR-162, FR-166) | SR |
| `nhan_viec_nhac` / `bao_hong_nhac` / `nha_viec_nhac(id, worker)` | Hàng đợi nhắc: thuê 5' `skip locked`; hỏng → lùi dần, 5 lần `dead`; chưa thử → trả lại nguyên vẹn (FR-166 f) | SR |
| `nhan_viec_don_media` / `chon_viec_don_chet` / `lan_thu_ke(attempts)` | Hàng đợi dọn file `attempts < 6`; khoảng chờ nhân đôi, trần 1 h, nhiễu ±20 % (FR-165 e, FR-166) | SR |
| `boc_thong_so(text, type)` / `boc_ten_duong` / `ap_thong_so(listing, j, bac, de)` / `listings_boc_thong_so` | Bóc thông số (trên `bo_dau`) → cột theo luật bậc (FR-172) | thuần / thuần / SR / trig |
| `listing_facts_sync_cols` / `listings_fill_code` / `next_listing_code` | Fact → cột (SRS-3.14) / cấp mã tin chỉ trong trigger (FR-158, FR-167) | trig / trig / SR |
| `listings_set_price_vnd` / `parse_vnd` / `chuan_hoa_gia_raw` / `chuan_hoa_lai_gia` | Giá chữ → số (FR-154) | trig / auth / thuần / SR |
| `listings_fill_property_type` / `guess_property_type` / `guess_property_type_answer` | Loại BĐS từ mô tả; không đoán ra thì `chua_ro` (FR-150) | trig / auth / SR |
| `listings_quyet_dinh_dang_tin` / `listing_du_dang_tin` / `listings_try_publish` / `listings_autopublish` | Tự lên kệ khi đủ giá + m2 + phường (FR-144); tin từ chat (`can_chu_duyet`) còn cần `diem_tin ≥ 70` + `chu_duyet_at` (FR-177 d) | trig / thuần / SR |
| `diem_tin` / `seller_hoi_bu_tick` / `seller_drip_tick` / `ghi_boc_tach` / `trg_fact_vao_boc_tach` / `trg_vi_tri_vao_cot` | FR-177 f–h (`20260909a`): điểm 8 mục (ảnh 4/7/10 theo số tấm), hỏi bù 5 phút sau khi gật rồi nhịp 30 phút tới khi hết câu hoặc `listings.chu_noi_du_at`; `listings.boc_tach` jsonb gom mọi thứ bóc được (bỏ null); `listings.gap`; fact `vi_tri` → `location_raw` | SR / cron / trig |
| `mau_cau` / `ngu_canh_tin` / `mau_cau_fewshot` / `so.mau_cau` | FR-180 (`20260909c`): mẫu câu chuẩn anh/sếp sửa tay từ câu bot thật; bot dán 12 mẫu mới nhất/phía vào system prompt; xuất JSONL để fine-tune (`scripts/xuat-mau-cau.mjs`, `train/`) | bảng / SR / view |
| `diem_tin(listings)` / `diem_tin(uuid)` | Điểm đầy đủ tin 0–100, 7 tiêu chí 15/20/15/10/10/20/10, tiền định từ cột + fact → `{diem, chi_tiet, thieu[], co_anh}` (FR-177 d) | SR |
| `admin_xoa_khach(zalo)` / `admin_xoa_het_khach_va_ro_hang('XOA HET')` / `don_du_lieu_thu()` | Xoá một khách (`/admin/tin-nhan`) / XOÁ HÀNG LOẠT khách + rổ hàng để test lại, đòi đúng chữ, dấu `bot_health(xoa_het)` (FR-210, nút tab CRM) / dọn người thử 21:00 (FR-197) | auth (`la_admin()` trong thân) |
| `admin_dang_tin(jsonb)` / `tao_danh_sach` / `doc_danh_sach(token)` | Cửa đăng tin admin (FR-156/174) / danh sách riêng (FR-100) | auth / auth / anon |
| `la_admin` / `tin_cua_toi(listing)` / `thu_muc_dau_uuid(name)` / `get_secret` / `cau_hinh(key)` | Gác policy storage + `listing_media` (FR-96) / Vault / `app_config` | auth / SR |
| `seller_rank` / `bo_dau` / `chuan_hoa_phuong` / `match_projects` | Hàm thuần dùng chung | thuần (`match_projects` SR) |
| `tim_duong(ten, quan, toi_da)` | FR-212 (`20260921b`): tra từ điển `duong` — khớp đúng + khớp gần (Levenshtein ≤ toi_da trên chữ bỏ dấu, `fuzzystrmatch`), mỗi tên một dòng gom phường/quận/tỉnh, ưu tiên quận trùng | SR |
| `tim_dia_danh_theo_nghia(vec, loai[], lat, lng, n)` / `tim_phuong_theo_nghia(vec, n)` | `20260930a`: địa danh (phường mới / cũ, quận cũ, đường, đường số, dự án) gần NGHĨA nhất với vector câu khách, trừ điểm theo khoảng cách tới điểm neo (1 km = −0,01, tối đa −0,2). Kết quả là ỨNG VIÊN (SRS-5.1a) | SR |
| `dia_danh_gan(lat, lng, bán kính, loai[], n)` / `duong_gan_duong(ten, phuong, bán kính, n)` / `phuong_giao_hai_duong(d1, d2, bán kính)` / `tim_hem(cap_hem[], duong_me, phuong)` / `khoang_cach_m(...)` | `20260930a`: VỊ TRÍ — địa danh quanh một điểm; đường nào gần đường nào; phường có cả hai con đường gần nhau; hẻm theo số (hẻm nhỏ nhất trước) + đường mẹ; haversine (không PostGIS). `tim_duong` bỏ hàng hẻm khỏi khớp tên | SR / thuần |
| `nhung_dia_danh_tick()` / `van_ban_dia_danh(bang, khoa)` | `20260930a`: cron `nhung-dia-danh-tick` 2 phút nhúng quận cũ → phường mới → phường cũ → đường (không hẻm) SAU hàng chờ tin rao + dự án, chung công tắc `tim_theo_nghia` và mốc tạm dừng Gemini | cron / SR |
| view `nmg_hoat_dong`, `seller_ranks`, `media_mo_coi_db/storage` | NMG hoạt động (I5); hạng người rao (FR-155); file mồ côi (FR-165) | admin/SR; `seller_ranks` invoker; còn lại SR |

[LỊCH SỬ] Cửa `mark_sent` của `chat-reply` TS ghi `inbound_ledger.sent_bubbles/sent_at` (FR-162). Lõi Python vẫn nhận trường `mark_sent`
nhưng chỉ trả rỗng; `inbound_ledger` đã gỡ.

### SRS-3.13 · Tầng cache của web — NFR-17, FR-171 j

`[nguồn: app/**/page.tsx]`

| Nhóm | Route | Cách |
|---|---|---|
| Tĩnh/ISR | `/`, `/ban-do` (300 s); `/moi-gioi`, `/thong-ke`, `sitemap` (3600 s) | `export const revalidate` |
| Động có tham số đường dẫn | `/nha-dat/[code]` (300 s), `/[tag]`, `/du-an/[slug]` (3600 s) | `revalidate` **bắt buộc kèm** `generateStaticParams()` — thiếu là route thành `ƒ`, mỗi lượt xem một lambda |
| Đọc `searchParams` | `/mua-ban`, `/cho-thue` | ISR không với tới → truy vấn bọc `unstable_cache` (300 s) khoá theo bộ lọc; không `revalidate` |
| Bí mật | `/ds/[token]`, `/admin`, `/quan-ly` | động (`ƒ`) có chủ ý |

- Luật: trang tin phải là `●`/`○` trong bảng route sau `bun run build`; thấy `ƒ` là hỏng (TS-CACHE).
- Trong một lần dựng: `getListing` bọc `React.cache`; danh sách đọc `CARD_COLS`, bản đồ `MAP_COLS`, không `select("*")`; `/admin` gom truy vấn vào một `Promise.all`.

### SRS-3.14 · Bộ câu hỏi theo loại, bậc nguồn, hạng người rao, cửa đăng tin admin — FR-153…FR-156, FR-164, FR-172

> **Soát 28/10/2026.** Phần "bộ câu hỏi theo loại" và "bậc nguồn" dưới đây là LỊCH SỬ: `required_facts` (gỡ `20261019g`), `listing_facts`
> (gỡ, SRS-5.1zzzzzzz66), view `listing_missing_facts`, trigger `listing_facts_sync_cols`, `bac_nguon()`, `chonCauKe()` (TS) đều không còn.
> Hiện nay bộ câu hỏi theo loại chỉ ở `src/aioi/schema.py`: `CORE_FIELDS` theo nhóm, `CORE_THEO_LOAI` đè cho loại riêng (SRS-5.1zzzzzzz68),
> `FACETS` / `FACET_CHINH` cho ngưỡng soạn bài (`Property.minimal_missing`, `summary_ready`, SRS-5.1zzzzzzz200, SRS-5.1zzzzzzz202), hỏi sau
> khi tin lên web theo `CUM_SAU_DANG`, ô riêng chủ nhà `O_NOI_BO` → bảng `listing_noi_bo`. Ô tin ghi vào `listings.boc_tach`.
> Còn đúng: `boc_tach_nhom` / `jsonb_bo_rong` / view `boc_tach_v`, hạng người rao (`seller_rank`, `seller_ranks`), cửa `admin_dang_tin`.

Đặc tính riêng theo loại không nằm ở cột riêng mà ở cặp `required_facts × listing_facts`:
`listing_missing_facts = required_facts ⋈ property_type − listing_facts − {fact_key mà cột tương ứng đã có}` (FR-172 d; ánh xạ `ket_cau↔floors`,
`do_rong_hem/do_rong_duong↔alley_width_m|mat_tien`, `phap_ly↔legal_status`, `huong↔direction`, `so_phong_ngu↔bedrooms`, `tang↔floor`, `dien_tich*↔area_m2`,
`nam_xay↔year_built`, `noi_that↔furnishing`, `mat_tien↔frontage_m`, `quy_hoach↔planning_status`). Đổi `property_type` = đổi bộ câu hỏi ở lượt kế, không migration.

| Loại | Bộ câu hỏi (`required_facts`, theo `nhom` rồi priority — FR-177 a, `20260907h`; thứ tự TRONG nhóm cơ bản do `chonCauKe()` bám câu chủ nhà vừa nói) |
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

- Trigger `listing_facts_sync_cols` đổ fact vào cột (fact giữ nguyên văn, chuẩn hoá chỉ trên đường vào cột): `so_phong_ngu → bedrooms` (1…20);
  `dien_tich/dien_tich_dat → area_m2` (5…5000), `dien_tich_tim_tuong → area_m2` **chỉ** `chung_cu` (FR-163); `tang → floor` (0…80); `huong → direction`;
  `gia → price_raw + price_source` (`parse_vnd` 1e8…1e12, thuê dải riêng; `price_vnd` do trigger dẫn xuất); `phuong → ward + ward_source` (`chuan_hoa_phuong`);
  `loai_bds → property_type + property_type_source` (`guess_property_type_answer`, không đọc ra thì không ghi); khoá khác → cụm cột FR-172 qua `boc_thong_so()` → `ap_thong_so()`.
- Luật bậc `bac_nguon()`: `chu_xac_nhan` (3) > `admin` (2) > `suy_doan`/`boc_mo_ta` (1); ghi khi bậc fact ≥ bậc cột, cùng bậc thì mới nhất thắng.
  Mô tả đổi mà `specs_source` còn `boc_mo_ta` thì bóc lại; không bao giờ đè lời chủ nhà/admin.
- Hạng người rao (FR-155): `seller_rank()` + view `seller_ranks` (`id, name, seller_type, active_count, closed_count, total_count, rank`) tính lúc đọc, không lưu cột.
- Cửa đăng tin admin (FR-156/174): `admin_dang_tin(jsonb) → {id, code, price_vnd, seller_id}` — kiểm `admins` (42501 nếu không), tìm/tạo `sellers`,
  `lock table listings in share row exclusive mode`, mã kế tiếp, insert (trigger giá/loại tự chạy); `district` từ form, mặc định "Quận 5".
  Là RPC chứ không policy INSERT để admin gọi được hàm mà không đọc được bảng `sellers` (SĐT thật).

---

## 4. Đặc tả giao diện lập trình

`[nguồn: src/aioi/server.py, bot/bridge-zca/index.mjs, src/aioi/followup.py, bot/supabase/functions/*, src/aioi/*.py, app/api/*; soát 28/10/2026]`
Giao diện thật có bốn lớp: **HTTP của lõi** (chỉ 127.0.0.1 trên VPS), **HTTP của bridge** (chỉ 127.0.0.1), **3 Edge Functions**
(`POST {SUPABASE_URL}/functions/v1/<name>`, cổng SRS-3.9 (7)) và **RPC / REST Supabase** lõi gọi bằng `service_role`. Cộng hai route Next.
Không có REST `/api/*` giữa các "side".

**Lõi `aond-core` (`src/aioi/server.py`)**

| Endpoint | Vào | Ra / việc | Ai gọi |
|---|---|---|---|
| `POST /chat-reply` | `ZaloBridgePayload`: `external_user_id`, `text`, `image_urls` / `image_url`, `file_url` / `file_name`, `sticker_url` / `sticker_text`, `gioi_tinh`, `so_nhan`, `msg_id`, `sender_name`, `human_note`, `mark_sent` | `ZaloBridgeResponse`: `replies[]`, `nhip_go[]`, `photos[]`, `tha_tim`, `assistant_name`, `captured`, `next_field`, điểm, `thoi_gian_ms`. Một lượt chat (`docs/13`). `human_note` = admin gõ tay → ghi lịch sử, bot nhường sân; `mark_sent` trả rỗng | bridge (hai số) |
| `GET /health` | — | `status`, `provider`, `chat_model`, `stt`, `drive`, `dia_danh` | `cai-vps.sh` sau khởi động lại |
| `POST /message` | `IncomingMessage` | lượt chat không qua bridge (không gom tin, không ảnh) | ô bắn thử `ban-thu-luan` (`bot/tests/ban-thu-luan.sh`, gọi một lõi thử ở cổng 8001), `tests/test_server.py` |
| `POST /trigger-followup/{user_key}`, `POST /reset/{user_key}`, `POST /reset-all` | — | bắn nhắc 5 phút / xoá phiên một khách / xoá mọi phiên | vận hành tay trên VPS |

Vòng nền trong cùng tiến trình: `_vong_gui_nhac` (60 s, `gui_nhac.py`, tắt `GUI_NHAC=tat`) và `_vong_bao_can_moi` (10 phút,
`bao_can_moi.py`, tắt `BAO_CAN_MOI=tat`).

**Bridge (`bot/bridge-zca/index.mjs`)**

| Endpoint | Vào | Việc | Ai gọi |
|---|---|---|---|
| `POST /send` (127.0.0.1:5005 số ký gửi, :5006 số tư vấn — `SEND_PORT`) | `{threadId, message, photos?}` | gửi tin chủ động, ảnh chỉ `https://`, tối đa 4, sau chữ; trả `{ok, anh_da_gui}` | lõi: `followup.py` (`BRIDGE_SEND_URL`, `BRIDGE_SEND_URL_TU_VAN`), `gui_nhac.py`, `bao_can_moi.py` |
| cổng QR tạm (8787 / 8788 — `QR_PORT`) | — | ảnh QR đăng nhập Zalo, đường dẫn có token ngẫu nhiên | người vận hành |

**Edge Functions (còn 3)**

| Function | Vào | Việc | Ai gọi hợp lệ |
|---|---|---|---|
| `escalation-feed` | `{action: pull \| ack \| log \| qr, so_nhan}` | `pull`: trả việc `reminders(kind ∈ escalation, report)` kèm `text` soạn sẵn + đích, cờ `noi_bo`; số tư vấn nhận hàng rỗng. `ack`: đánh dấu đã gửi. `log`: ghi `bot_errors` hộ bridge. `qr`: trạng thái đăng nhập + ảnh QR vào `bridge_dang_nhap`. Mỗi lượt gõ cửa là nhịp tim bridge | bridge, header `x-bridge-secret` |
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
| `match_projects` | tìm dự án theo tên | `supabase_store.py` |
| `chuan_dia_ban`, `boc_thong_so` | chuẩn địa bàn; bóc thông số từ chữ | `supabase_store.py` |
| `la_id_thu` | tách dữ liệu thử / thật | `supabase_store.py` |
| `log_loi` | ghi `bot_errors` | `supabase_store.py` |
| `tim_duong`, `tim_dia_danh`, `tim_dia_danh_theo_nghia`, `tim_dieu_luat`, `tra_nominatim` | tra đường / phường / quận / dự án theo chữ và theo nghĩa; điều luật gần nghĩa (SRS-5.1zzzzzzz231); phường theo số nhà (SRS-5.1zzzzzzz236) | `dia_danh.py` |
| `giao_lo_cua` | phường của ngã tư | `giao_lo.py` |
| `bump_user_quota`, `bump_model_quota`, `get_secret` | trần lượt theo người / ngày, trần lượt model / ngày | `han_muc.py` |
| `cong_token` | cộng token vào `bot_usage` / `bot_usage_model` | `so_token.py` |

Bảng lõi đọc / ghi thẳng qua REST (không RPC): `listings`, `listing_media`, `listing_noi_bo`, `sellers`, `buyers`, `conversations`,
`messages`, `interests`, `info_requests`, `viewings`, `deals`, `reminders`, `danh_gia_ai`, `cau_mau`, `cau_chuan`, `kien_thuc_phap_ly`,
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
Một cửa vào: bridge `bot/bridge-zca/index.mjs` (zca-js 2.2.0, tài khoản clone, chạy trên VPS) gọi `POST http://127.0.0.1:8000/chat-reply`
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
`zaloLink(context)` (`lib/format.ts`) → `{ZALO_OA_URL}?ref=<ngữ cảnh>` chữ thường (`#mã`, `search:<câu>`, `tag:<slug>`, `ds:<8 ký tự token>`, `du-an:<slug>`).
Không có bảng token/TTL, không nối fingerprint (OPEN-14); lõi chưa đọc `ref` ở tin đầu.

---

## 5. Đặc tả xử lý


> **Nhật ký sửa trước 26/10/2026 (366 mục) đã chuyển sang `docs/07-srs-luu-tru.md`** (30/10/2026, SRS-5.1zzzzzzz305) — mã giữ nguyên, mục ở đây (mới hơn) thắng mục lưu trữ. Tìm một mã: `grep -n "SRS-5.1zzzzzzz123 " docs/07*.md`.

### SRS-5.1 · Chu trình một lượt chat (lõi Python)

`[nguồn: src/aioi/server.py, src/aioi/engine.py]` Edge function `chat-reply` v48 (TypeScript) đã gỡ, lõi Python là bộ não duy nhất từ 18/10/2026 — mô tả cũ ở `docs/07-srs-luu-tru.md`.

```text
1. Bridge zca-js → POST /chat-reply (server.chat_reply): sổ msg_id, sự kiện cảm xúc không trả lời (SRS-364), khoá lượt theo người.
2. Engine.handle: AI đọc ý → ô tin qua cổng bằng chứng `_loc_o_tin` (SRS-73). Người bán (vai đã rõ): bước 1 của MỘT vòng agent
   Sonnet gọi công cụ ghi / đọc / `tra_luat_o` (`agent_gop.mo`, SRS-371); form JSON (OPERATIONS_SYSTEM_BAN, Haiku) chỉ dự phòng. Còn lại: form.
3. Tra địa danh: `_chuan_dia_danh` (tên chuẩn, SRS-366), `_phuong_tu_dia_chi` (ô hệ thống tự tra, SRS-359).
4. Chọn MỘT việc cho lượt: `viec_luot` (SRS-314 / 328) → ô cần hỏi / khối hỏi còn lại.
5. Dựng prompt: phiếu lượt thu thập / bản nháp / sau bản nháp (phía bán) hoặc prompt mua; khối cố định trước RANH_GIOI_CACHE.
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
hỏi còn bán, giữ kết nối) do LÕI chạy vòng riêng (`gui_nhac.py` 60 s, `bao_can_moi.py` 10 phút, `hoi_con_ban.py`, `giu_ket_noi.py`), không qua cron.

| Job | Lịch | Gọi gì |
|---|---|---|
| `bot-health-tick` | `*/15 * * * *` | `bot_health_tick()` — SQL thuần (FR-152, NFR-18) |
| `media-cleanup-tick` | `*/5 * * * *` | `media_cleanup_tick()` → `media-cleanup` chỉ khi có việc (FR-165 e) |
| `media-chet-tick` | `0 * * * *` | `chon_viec_don_chet()` (FR-166 g) |
| `geocode-tick` | `*/10 * * * *` | `geocode_tick()` → `geocode-listings` |
| `nhung-tick` | `*/2 * * * *` | `nhung_tick()` — vector Gemini cho tin rao / dự án (FR-216 g) |
| `nhung-dia-danh-tick` / `nhung-luat-tick` | `1-59/2 * * * *` | `nhung_dia_danh_tick()` / `nhung_luat_tick()` — vector địa danh / điều luật |
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

### SRS-5.1zzzzzzz416 · Bảng tài chính phía mua ra công cụ (11/11/2026)
Chủ dự án 11/11 (dán lại nguyên tắc SRS-391): "Prompt chỉ giữ nhiệm vụ tư duy và hành văn. Mọi dữ liệu tra cứu, tính toán phức tạp phải tách
ra thành các Công cụ nguyên tử". Soát lại: phí (`tinh_phi_moi_gioi`), dải giá (`dinh_gia_tham_khao`), pháp lý sổ, phong thuỷ, quy hoạch, thuế
phí, vay đã là công cụ; lượt chào chưa có dữ kiện đã đi đường đọc nhanh (SRS-406, log 146 xác nhận). Bảng còn nằm cứng là `khoi_tai_chinh`
trong phần cố định prompt mua.
- `mua_co_dinh` bỏ `khoi_tai_chinh()` (7.155 → 5.898 ký tự); dòng luật đổi thành "gọi `tinh_vay_tra_gop`, chỉ nói số trong kết quả".
- `tinh_vay_tra_gop` không có giá vẫn trả số tham khảo (lãi suất, sinh lời, tỷ lệ vay, vốn tự có); có giá / mã căn thì kèm bảng trả góp.
- Lưới soát số phía mua (`_soat_so_can_mua`) coi kết quả công cụ đã tra lượt này (`y_luot["_ket_qua_tra"]`) là nguồn hợp lệ.

### SRS-5.1zzzzzzz415 · Prompt gọn: hiểu nỗi lo chủ nhà, hỏi như trò chuyện (11/11/2026)
Chủ dự án 11/11: "chỉ thêm insight, làm sao để đủ thông tin mà không hỏi nhiều cảm giác hỏi cung khiến người ta khó chịu là dc"; "không phải
báo khách cần gì để ra bản nháp chỉ tự bot ngầm hiểu thôi".
- `LEAN_SYSTEM_PROMPT` thêm HIỂU CHỦ NHÀ (lo ép giá / bán hớ, nhà trống lâu, ngại thủ tục) — nỗi lo nào lộ ra trong lời khách thì đáp bằng
  việc bên em làm thật (rao theo giá chủ, đưa tin tới khách đang tìm, có khách hỏi báo ngay, phí chỉ thu khi thành công); không gán nỗi lo.
- Thêm HỎI NHƯ TRÒ CHUYỆN: câu hỏi là sự tò mò về căn, nối từ điều khách vừa kể; hỏi mở cho khách kể nhiều ý một lúc; còn thiếu gì để soạn
  tin là việc bot tự nắm, khách không hỏi thì không kể. 2.925 → 3.8xx ký tự, không chữ "CẤM / TUYỆT ĐỐI".
- Không đổi: cổng bản nháp (SRS-260), một câu hỏi mỗi lượt. Phía mua đã có insight ở `khoi_nhan_vat`.

### SRS-5.1zzzzzzz414 · Prompt lượt hỏi phía bán viết lại theo nguyên tắc, bỏ luật vá (11/11/2026)
Chủ dự án 11/11: "phiếu cũ có mấy cái ko sửa từ gốc mà có mấy cái sửa vá như tuyệt đối không các thứ", "còn mấy cái luật linh tinh nữa".
- `LEAN_SYSTEM_PROMPT` (công tắc `AIOI_PROMPT_GON=bat`) viết lại thành năm phần nói thuận: NHÂN VẬT · CÁCH EM NHẮN · SỰ THẬT · tin hệ thống ·
  HIỂU TIẾNG NGHỀ. 7.243 → 2.925 ký tự. Bỏ các luật đếm / danh sách chữ cấm sinh từ từng ca; gốc chung ("nói như người thật, không lặp khuôn
  của chính mình", "điều hệ thống chưa làm thì chưa nói là đã làm", "chỉ hứa điều hệ thống thật sự làm") ghi MỘT lần ở phần cố định.
- Các khối tình huống engine nối thêm (xin đăng, mặt tiền, chào lượt đầu, hỏi sau đăng, hỏi cọc, tình hình bán, định giá, cần người, ngoài
  việc, phí, link, nhiều căn, chưa rõ căn, tách bán / thuê, dự án gợi ý, trùng tên, địa danh, trạng thái web, sắp xin sao, tin hiện ngoài
  chat, `viec_phieu`) chỉ còn SỰ KIỆN hệ thống + VIỆC lượt này; bỏ "KHÔNG / TUYỆT ĐỐI / DUY NHẤT / MỘT câu / không nài / không hứa giờ…"
  lặp lại phần cố định. Khối thay việc hỏi ô thì nói rõ "thay VIỆC LƯỢT NÀY".
- Bước ghi của vòng agent gộp (`agent_gop._he_ghi`) dùng cùng phần cố định với bước viết (`prompts.co_dinh_ban`) — trước đó bước ghi luôn
  dùng phiếu cũ dù đã bật prompt gọn, hai bước một lượt chạy hai bộ luật. Công tắc đọc ở một chỗ (`prompts.prompt_gon_bat`).
- Tắt công tắc thì về phiếu cũ (`phieu_co_dinh`); khối tình huống dùng chung cả hai đường.

### SRS-5.1zzzzzzz413 · Rổ hàng Ny'ah Phú Định 50 căn có giá + khôi phục 243 tin thử (11/11/2026)
- **Ca gốc**: danh mục Ny'ah (đọc ảnh 20/10) thiếu lô 25, 26, sai mẫu nhà, không giá; 243 tin rao mẫu mất sau nút "Xoá hết khách + rổ hàng" lúc 13:33. `[nguồn: chủ dự án 11/11/2026: "căn 25 26 nữa, thêm vào đi … 2 trăm mấy … đâu hết rồi"]`
- **Sửa** (`20261111b_nyah_ro_hang_va_khoi_phuc_tin.sql`): 50 căn dựng lại từ bảng chuẩn 50 lô (9 lô còn trống 01, 02, 03, 23, 24, 25, 26, 42, 50 có giá, đất thực, bán cặp); khôi phục sellers / listings / listing_noi_bo của lần xoá 12 (không khôi phục hội thoại cũ).

### SRS-5.1zzzzzzz412 · Gộp dự án trùng tên trong kho `projects` (11/11/2026)
- **Ca gốc**: bot hỏi khách chọn giữa "HaDo Centrosa Garden" và "Hà Đô Centrosa Garden" — cùng một dự án, hai dòng. `[nguồn: chủ dự án 11/11/2026: "còn dự án nào gần trùng ko, làm chuẩn luôn, gộp hết đi"]`
- **Sửa** (`20261111a_gop_du_an_trung.sql`): gộp cùng khoá tên (bỏ dấu, tiền tố loại, ký tự lạ) + cùng quận + cùng nhóm (căn hộ / khu dân cư), thêm cặp soát tay theo vector nhúng; dòng giữ = nhiều tin → nhiều kiến thức → dữ liệu dày; tên đẹp nhất, sửa mã HTML. 2.924 → 2.839. Vòng 3 (`20261111c`, chủ dự án: "gộp hết"): gộp nốt giai đoạn 1/2/3, chung cư + KDC cùng tên, cùng dự án khác quận → 2.819.

### SRS-5.1zzzzzzz411 · Thiếu phường mà chưa có số nhà: hỏi số nhà MỘT lần rồi mới báo admin (11/11/2026)
- **Ca gốc** (test 11/11): "Trần Bình Trọng, quận 5" không số nhà → đường qua nhiều phường → báo admin ngay. `[nguồn: chủ dự án 11/11/2026: "sửa hết đi để t test lại"]`
- **Sửa**: `Engine._trang_thai_web` — `DiaDanh.co_so_nha` (cùng khuôn `phuong_theo_so_nha`) chưa có số → `web.hoi_so_nha`, `_da_hoi_so_nha`; `khoi_trang_thai_web` hỏi đúng 1 câu số nhà, không nói chữ phường. Có số nhà → `_phuong_tu_dia_chi` tra lại; vẫn không ra → báo admin như SRS-359.

### SRS-5.1zzzzzzz410 · Prompt ngắn có lại giọng nhân vật, từ điển tiếng lóng đầy đủ, luật cố định, tin hệ thống (11/11/2026)
- **Ca gốc**: SRS-408 dùng `LEAN_SYSTEM_PROMPT` → mất GIONG_VUI, SLANG_NOTES đầy đủ (nở hậu, HXH, MTKD, SHC, vi bằng…), luật "không hỏi lại điều khách đã nói", TIN_HE_THONG (thoại / sticker / cảm xúc). `[nguồn: chủ dự án 11/11/2026: "từ điển tiếng lóng đầy đủ, giọng nhân vật"; "sửa hết đi"]`
- **Sửa**: `LEAN_SYSTEM_PROMPT` = phần thấu hiểu khách + GIONG_VUI + LUẬT CỐ ĐỊNH + TIN_HE_THONG + SLANG_NOTES. Bỏ danh sách công cụ (công cụ tự mang schema), quy trình ký gửi (thứ tự do code quyết ở VIỆC LƯỢT NÀY), bố cục tin rao (lượt hỏi ô không soạn tin). Cỡ phiếu lượt: 7.134 ký tự (phiếu cũ 6.414; bản 408 4.515).

### SRS-5.1zzzzzzz409 · AI bóc SỐ kích thước, code chỉ tính diện tích — bỏ regex dò chuỗi (11/11/2026)
- **Ca gốc** (test 11/11): "ngang 6 sâu 15 nở hậu 3" → ô `kich_thuoc` chữ tự do, regex `_calc_area_from_dimension` không biết "sâu", không biết nở hậu → không ra m² → tin không lên web, bot hỏi lại diện tích. `[nguồn: chủ dự án 11/11/2026: "tao tưởng là AI bóc tách chứ sâu là chữ dài chứ đâu phải regex"]`
- **Sửa**: ô bóc tách mới `dai_m`, `hau_m` (bề hậu thật, AI tự tính nở / tóp hậu) + `mat_tien` làm bề ngang. `schema.dien_tich_tu_kich_thuoc`: ngang × dài, có hậu thì (ngang + hậu)/2 × dài, luôn "khoảng"; ô do code tính đánh dấu `_dt_tu_kich_thuoc`, tính lại khi khách bổ sung. `listings.frontage_m / length_m / rear_width_m` ghi thẳng số AI bóc. Xoá `_calc_area_from_dimension`. Thay luật "KHÔNG tự nhân" của SRS-363.

### SRS-5.1zzzzzzz408 · Lượt hỏi ô người bán dùng LEAN_SYSTEM_PROMPT (11/11/2026)
- **Ca gốc**: `LEAN_SYSTEM_PROMPT` (SRS-391, đã sửa "MỘT ý" ở SRS-407) chỉ test dùng; SRS-403 nối nó vào lượt viết lời nhưng #311 (SRS-404) hoàn tác cả gói. `[nguồn: chủ dự án 11/11/2026: "dùng prompt ngắn kia"]`
- **Sửa**: khôi phục `prompts.lean_system_prompt_cho_luot` và nhánh chọn trong `Engine` (lượt hỏi ô, `not is_listing_post`): `AIOI_PROMPT_GON=bat` → prompt gọn, khác → `build_phieu_luot`. Bật ở `bot/cau-hinh-loi.env` và `.env` lõi trên 146. KHÔNG khôi phục lối tắt tin chào (`la_tin_chao_hoi_thuan_tuy`) của SRS-403.
- **Đánh đổi đã biết**: lượt hỏi ô mất khối TIN_HE_THONG / SLANG_NOTES đầy đủ / giọng nhân vật của phiếu lượt — các bài canh luật cũ (SRS-404) có thể đỏ; theo quyết định chủ dự án, không hoàn tác vì lý do đó. Tắt: đổi `AIOI_PROMPT_GON=tat` trên 146 rồi khởi động lại "AOND Core".
- **Kiểm**: không chờ CI (chủ dự án 11/11). Đưa lên 146 bằng `trien-khai-146.sh`.

### SRS-5.1zzzzzzz407 · Mỗi lượt bot chỉ hỏi MỘT ý (CUM_TOI_DA 2 → 1) (11/11/2026)
- **Ca gốc**: SRS-391 nâng `schema.CUM_TOI_DA` lên 2 (gộp hai ô cùng cụm vào một câu hỏi), trái luật đang áp "tối đa MỘT câu hỏi mỗi lượt" (CLAUDE.md §6.2). `[nguồn: chủ dự án 11/11/2026: "sửa mỗi lượt chỉ hỏi 1 ý thôi"; "giờ tôi bảo bạn sửa gì là bạn sửa luôn không có cl hay test xanh đỏ gì hết"]`
- **Sửa**: `CUM_TOI_DA = 1`; câu "tối đa 1–2 ý" trong `LEAN_SYSTEM_PROMPT` đổi thành MỘT ý; `test_toi_uu_ky_gui_391` theo giá trị mới.
- **Kiểm**: theo quyết định chủ dự án — không chạy test, không chờ CI; gộp thẳng. Cần đưa lõi lên 146 (`trien-khai-146.sh`).

### SRS-5.1zzzzzzz406 · Tin đầu chưa rõ vai: một lượt AI ngắn đọc tin, chưa có gì để ghi thì bỏ form lập thao tác đầy đủ (~56 nghìn chữ) (11/11/2026)
- **Ca gốc**: tin đầu "em ơi" tốn $0.1103 (Sonnet 5.5): ~$0.10 là ghi cache lượt lập thao tác chạy form đầy đủ (`OPERATIONS_SYSTEM` 28,6 nghìn chữ + `operations_schema()` 27,3 nghìn chữ) dù tin chưa có gì để ghi; sổ `bot_usage_model` 11/11: ghi cache ≈ 76 % tiền. `[nguồn: chủ dự án 11/11/2026: "tin đầu chưa rõ khách bán hay mua thì không chạy bản bóc tách 56 nghìn chữ, nhưng vẫn để AI xác định vai và giữ nguyên phiếu lượt cùng giọng … KHÔNG CẦN chạy bộ chấm kịch bản (chỉ cần bun run kiem và pytest xanh 100%)"]`
- **Lớp lỗi**: lượt lập thao tác chạy vô điều kiện, cỡ prompt không theo việc của tin. SRS-403 (hoàn tác, SRS-404) vá bằng regex chào hỏi + bỏ luôn lượt định vai. Cùng lớp CÒN: cache 5 phút hết hạn giữa hai tin khách chậm (ghi lại mỗi lượt); token suy nghĩ mặc định của Sonnet 5.5 ở lượt viết lời; lượt soát ô hỏi phụ (`_khai_o_hoi`).
- **Sửa** (đường thật duy nhất, không công tắc): vai CHƯA rõ (không qua vòng agent bán / mua) → `Engine._doc_nhanh_chua_ro_vai` gọi `DOC_NHANH_SYSTEM` + `doc_nhanh_schema()` (cờ `can_doc_day_du` + 5 ô `user_intent` / xã giao / xưng hô lấy NGUYÊN mô tả của form đầy đủ, kèm tin bot vừa nhắn). AI trả RÕ `false` → kế hoạch rỗng mang vai AI đọc; thiếu cờ / lỗi / có ảnh / đã có ô tin, bản nháp, thao tác chờ, tin "Trả lời", tin rao thật → form đầy đủ như cũ. Lượt viết lời không đổi. Không thêm regex.
- **Kiểm**: `tests/test_doc_nhanh_406.py` (7 bài; system lượt viết lời GIỐNG HỆT đường form đầy đủ trả cùng kế hoạch; đỏ 4/7 khi gỡ lời gọi — đã thử); `test_form_mua_gon_293` đồ giả trả "cần đọc đầy đủ"; `bun run test:py` 1525 đạt. Không chạy bộ chấm (chủ dự án). Sau gộp: `scripts/sau-gop.sh` đưa lên 146.

### SRS-5.1zzzzzzz405 · 14 script bắn thử production chạy từ máy cá nhân qua ssh vào máy 146 (thay VPS); gỡ các ô bắn thử khỏi Actions (11/11/2026)
- **Ca gốc**: bỏ VPS 06–08/11 mà `bot/tests/ban-thu-*.sh` + `doc-log-loi.sh` vẫn đọc Vault `VPS_HOST` rồi `sshpass root@VPS` → mọi ô bắn thử chết; GitHub Actions không với tới 146 (lõi chỉ nghe 127.0.0.1, máy sau Tailscale), và mọi đường gọi lõi phải kèm `x-noi-bo-key` (SRS-400). `[nguồn: chủ dự án 11/11/2026: chọn "chạy ssh máy 146 từ máy tôi" thay vì cho Actions vào Tailscale; Host `nuc` → 192.168.1.146, tài khoản admin `nguye`]`
- **Lớp lỗi**: đổi hạ tầng mà công cụ kiểm vẫn trỏ máy cũ, không bài nào canh. Chỗ khác cùng lớp: lệnh dọn `/reset` của `ban-thu-khach-ao` thiếu khoá nội bộ từ SRS-400 (sửa); `ban-thu-luan` dựng dịch vụ systemd (Linux) cho bản anh Luận — CÒN, script thoát 2 "chưa kiểm được" tới khi có dịch vụ Windows riêng.
- **Sửa**: `bot/tests/lib/may146.sh` dùng chung: đọc khoá nội bộ qua `ssh "$MAY_146"` (mặc định `nguye@192.168.1.146` như `trien-khai-146.sh` — máy `nuc` cũ đã bỏ, chủ dự án 11/11; ngoài mạng `MAY_146=nguye@100.85.245.112`), mở đường hầm `127.0.0.1:$CONG_146 → 8000`, giữ giao diện `vps "…"` cũ (`curl …:8000` chạy tại máy cá nhân, tự kèm khoá; `journalctl …|` → nhật ký 146 trong `C:\aond\logs` từ lúc bắt đầu; lệnh Linux khác → mã 2). 14 script thay khối VPS bằng một dòng nạp; `doc-log-loi` đọc N dòng cuối (log 146 không có giờ nên không lọc theo khoảng giờ). Gỡ 16 ô `ban-thu-*` / `doc-log-loi` khỏi `apply-migration.yml`. Cần `TOKEN` (Management API) ở máy chạy.
- **Kiểm**: `bot/tests/may146.tu-kiem.sh` (trong `test:bot`, ssh / curl giả) 9/9 — đỏ khi bỏ phần kèm khoá (M146-04/05 hỏng, đã thử); `bash -n` 16 script. CHƯA chạy trên 146 thật từ phiên cloud (không ssh được) — lần chạy đầu ở máy chủ dự án.

### SRS-5.1zzzzzzz404 · Hoàn tác SRS-403 (lối tắt tin chào + prompt gọn chạy thật): 7 bài canh luật đỏ trên bản đã lên máy 146 (11/11/2026)
- **Ca gốc**: `99026e5` (SRS-403) đẩy thẳng lên `main` không qua PR / CI rồi triển khai lên 146; chạy `pytest` trên `main` → 7 đỏ / 1515 đạt: lượt người bán mất `TIN_HE_THONG` + `SLANG_NOTES` (`test_go_cong_tac_319`), khối giọng + đầu bước 2 vòng gộp (`test_agent_gop_371`), "ĐIỂM TIN" (`test_kich_ban_srd_aond`), câu chặn hứa gửi bản tin (`test_khong_hoi_lai_302`); "chào em" ở số ký gửi không còn câu chào ký gửi (`test_vai_theo_so_331`, `test_hoi_quy_02_11_340` — lối tắt bỏ qua lượt AI định vai); thêm 4 regex đoán ý trong `chu.py` (`test_kiem_ke_regex_382`, CLAUDE.md §4.8); prompt gọn ghi "tối đa 1–2 ý" trái luật một câu hỏi. `[nguồn: chủ dự án 11/11/2026: "Đồng ý" hoàn tác]`
- **Lớp lỗi**: đổi hành vi bot đẩy thẳng `main` → không CI, không bộ chấm; prompt gọn THAY phiếu lượt thay vì rút gọn nó nên mọi luật chỉ sống trong phiếu rơi theo. Cùng lớp: `AIOI_PROMPT_GON=bat` còn trong `.env` lõi trên 146 (code không còn đọc — gỡ tay cho khớp `bot/cau-hinh-loi.env`).
- **Sửa**: `git revert 99026e5` (code, test, cấu hình, docs); nguyên văn SRS-403 giữ ở `07-srs-luu-tru.md` nhãn `[deprecated]`. Phần tiết kiệm (lượt chào không chạy bóc tách lớn) làm lại sau trong PR có test, giữ vai / giọng / luật phiếu lượt.
- **Kiểm**: `bun run test:py` trên bản hoàn tác hết đỏ (1518 đạt); sau khi gộp phải chạy lại `scripts/trien-khai-146.sh`.

### SRS-5.1zzzzzzz402 · Còi máy 146: lõi chết, bridge số tư vấn chết, Zalo văng phiên chờ quét QR đều không ai báo (11/11/2026)
- **Ca gốc**: soát đề xuất "watchdog" 11/11 trên DB thật: `bot_health_tick` (cron 15 phút) chỉ canh nhịp `bridge-zca`; nhịp `bridge-zca-tu-van` có ghi mà không ai đọc; lõi chết thì bridge vẫn gõ nhịp đều (`model_chinh` chỉ có khi có lượt gọi Claude); bridge chờ quét QR cũng vẫn gõ nhịp; lời báo còn ghi "VPS / nhadat-bridge". Thêm: `app_config.ntfy_topic` trống → `canh_bao_ngoai` không gửi đâu cả, kênh báo duy nhất là tin 🚨 đi qua chính bridge số ký gửi. `[nguồn: chủ dự án 11/11/2026, "cải thiện mấy cái này" — mục 4 Watchdog]`
- **Lớp lỗi**: nhịp tim đo "tiến trình gõ cửa" chứ không đo "dịch vụ phục vụ được"; thêm thành phần (số tư vấn, lõi tách khỏi bridge) mà không thêm vào còi. Cùng lớp CÒN: bridge số ký gửi chết thì tin 🚨 nằm chờ và không có kênh ngoài cho tới khi chủ dự án đặt `ntfy_topic`; còi chỉ chạy 7–22 giờ (giữ như cũ).
- **Sửa**: lõi đóng nhịp `aond-core` mỗi 60 s (`server._vong_nhip_loi`, `SoToken.beat`); migration `20261111a`: `bot_health_tick` gom vào MỘT tin 🚨 (tiết chế 1 giờ như cũ): số ký gửi (giữ hành vi cũ), số tư vấn / lõi im > 15 phút (chỉ khi đã từng có nhịp — chưa triển khai thì không báo nhầm), `bridge_dang_nhap` ở `cho_quet` / `het_han` / `tu_choi` > 10 phút; bỏ chữ "VPS".
- **Kiểm**: `tests/test_coi_may_146_402.py` (đỏ khi lõi thôi đóng nhịp, migration bỏ một ca, lời báo còn "VPS"); chạy thử trên DB thật trong giao dịch huỷ — giả lập lõi im 20 phút + số tư vấn chờ QR 12 phút → `su_co` đủ 2 dòng, tin 🚨 đúng chữ; sau đó DB không đổi. Đã áp lên DB 11/11/2026 (apply-migration run 688, chủ dự án: "áp đi"); hàm trên DB có `su_co`, không còn chữ "VPS".

### SRS-5.1zzzzzzz401 · Dọn mã: xoá dump MOSO + script sinh migration một lần, lưu trữ script nạp nguồn ngoài và tàn dư VPS; công tắc lõi sang `bot/cau-hinh-loi.env` (11/11/2026)
- **Ca gốc**: repo còn `scripts/moso_projects_hcm.json` (794 KB, đã nạp + hợp nhất, SRS-396), `sinh-xa-dong-nai.py` / `sinh-xa-tay-ninh.py` (sinh xong `20261022a/b`), 5 script nạp mogi / rever / MOSO chạy được qua ô `nap-du-an*` (chạy lại là ghi đè nguồn ngoài lên chuẩn `aond`), và `cai-vps.sh` / ô `cai-vps` / `go-trang-thu` SSH vào VPS đã bỏ — nhưng test vẫn đọc công tắc production từ `cai-vps.sh`. `[nguồn: chủ dự án 11/11/2026, yêu cầu dọn mã ba giai đoạn]`
- **Lớp lỗi**: đổi hạ tầng / đổi nguồn dữ liệu mà công cụ cũ vẫn gọi được và vẫn là "một nguồn" của test. Cùng lớp đã sửa: hai unit systemd `nhadat-bridge*.service` (cùng vào `bot/bridge-zca/archive/`), ô `nap-du-an` / `nap-du-an-rever` / `nap-du-an-moso`, 2 bài kiểm "cai-vps đưa khoá Vault vào .env" + 8 ca AMN canh cai-vps (gỡ cùng chức năng), README còn IP VPS. Cùng lớp CÒN: 14 script `bot/tests/ban-thu-*.sh` / `doc-log-loi.sh` vẫn SSH bằng `VPS_HOST` (ô bắn thử production chết tới khi chuyển sang 146). Giai đoạn 3: soát tĩnh (AST, đóng bao từ mọi chỗ import trong `src/` `tests/` `scripts/`) — `prompts.py` không có tên nào chết, không xoá gì; riêng `LEAN_SYSTEM_PROMPT` (SRS-391) chỉ test dùng, không đường production nào ghép vào prompt — giữ theo yêu cầu, ghi để biết.
- **Sửa** (Quyết định BA, uỷ quyền): xoá 3 tệp; `git mv` 5 script vào `scripts/archive/` (+ README; script đọc `.env` cạnh mình nên lỡ chạy cũng không có khoá), bài kiểm hàm thuần rever / moso trỏ đường mới; `cai-vps.sh`, `VPS.md`, 2 unit → `bot/bridge-zca/archive/`; công tắc + model một nguồn ở `bot/cau-hinh-loi.env` (`KHOA=giatri`, cùng tên biến `.env` lõi), `tests/cau_hinh_vps.py` đọc tệp này; chú thích trong `src/aioi/` chỉ đổi chữ, không đổi hành vi.
- **Kiểm**: `cong_tac_vps(nhu="thu")` trước / sau giống hệt 7 biến; `test_cham_nhu_khach.py` dựng tệp `.env` mẫu (đỏ khi bộ đọc còn đòi dòng `printf` của cai-vps); `bun bot/tests/aond-mot-nguon.mjs`, `bun run kiem`, `soat-truy-vet.sh`, `soat-migration.mjs` (405 / 405, 144 hàm).

### SRS-5.1zzzzzzz400 · Lõi và bridge không xác thực — tiến trình nào trên máy 146 cũng đọc rổ hàng, xoá khách, nhắn Zalo từ số clone (08/11/2026)
- **Ca gốc**: audit bảo mật 08/11 (N3 + C5). Lõi `127.0.0.1:8000` nhận `/chat-reply` (Zalo ID bất kỳ + `/state` lộ nhu cầu; ID admin + `#MÃ` giả lệnh), `/reset/{id}` xoá khách trên Supabase thật, `/docs` mở; bridge `/send` nhắn tuỳ ý tới mọi uid, body vô hạn. Bridge còn gửi `BRIDGE_SECRET` tới lõi (ai chiếm cổng 8000 lúc khởi động lại là có khoá escalation-feed). `[nguồn: chủ dự án 08/11/2026: "Vá N3 tiếp"]`
- **Lớp lỗi**: coi "chỉ nghe 127.0.0.1" là ranh giới tin cậy trên máy dùng chung. Chỗ khác cùng lớp: mọi đường của lõi (`/message`, `/reset-all`, `/trigger-followup`) và cả hai cổng `/send` (5005, 5006) — sửa hết.
- **Sửa**: khoá chung `AIOI_NOI_BO_KEY` (header `x-noi-bo-key`, so hằng thời gian) ở `.env` lõi + `.env` bridge. Lõi (`khoa_noi_bo.py`, middleware): mọi đường trừ `/health` đòi khoá, thiếu khoá trên máy → 503 (không mở trần); tắt `/docs` `/openapi.json`; lõi gửi `/send` kèm khoá. Bridge: `/send` đòi khoá + chỉ `application/json` + trần 64 KB; gọi lõi chỉ kèm khoá nội bộ, `BRIDGE_SECRET` chỉ đi escalation-feed. Script `bot/tests/ban-thu-*.sh` thời VPS (curl thẳng lõi) phải thêm header khi chuyển sang 146.
- **Kiểm**: `tests/test_khoa_noi_bo.py` — 5 đường không khoá → 401, sai khoá → 401, thiếu khoá trên máy → 503, `/health` mở, `/docs` 404, `_gui_bridge` kèm khoá, mã bridge có kiểm khoá / 413 / 415. Trên 146: request không khoá → 401, chat qua bridge vẫn chạy.

### SRS-5.1zzzzzzz399 · Máy 146: user Windows thường sửa được mã chạy dưới SYSTEM và đọc được `.env` (08/11/2026)
- **Ca gốc**: audit bảo mật 08/11 (N2). `C:\aond` (cả `.env`, `zalo-session*.json`, `src`, `svc_*.cmd`, `venv`) thừa hưởng ACL gốc `C:\`: `Authenticated Users: Modify`, `Users: Read`; ba task AOND chạy dưới SYSTEM, máy có tài khoản thường đang bật. `[nguồn: chủ dự án 08/11/2026: "Vá N2 tiếp"]`
- **Lớp lỗi**: thư mục dịch vụ tạo thẳng dưới `C:\` không ai siết quyền. Các bot khác trên 146 (`C:\gatemonitor`, `C:\goi-bot`…) cùng lớp nhưng không thuộc repo này: bản đầu siết cả 9 thư mục, chủ dự án chốt chỉ sửa AOND ("bot khác kệ nó bạn cần sửa ở bot AOND thôi") → trả nguyên ACL cũ cho 8 thư mục kia cùng ngày từ bản sao lưu.
- **Sửa**: `scripts/siet-acl-146.ps1` (sao lưu ACL vào `C:\ProgramData\acl-backup-20261108`, tắt thừa kế): `C:\aond` chỉ SYSTEM + Administrators. `trien-khai-146.sh` chép bằng `robocopy` không `/SEC` nên file mới thừa hưởng quyền đã siết. Lõi chạy `C:\aond\venv`.
- **Kiểm**: `icacls` Authenticated Users = 0 ở `C:\aond` (cả `.env`, cookie Zalo, `svc_aond_core.cmd`); 8 thư mục bot khác trở lại `Authenticated Users:(I)(M)` như trước; dịch vụ Running, `/health` OK.

### SRS-5.1zzzzzzz398 · Cổng quyền hàm admin dùng `current_user` — mọi tài khoản đăng nhập web gọi được hàm xoá hết (08/11/2026)
- **Ca gốc**: audit bảo mật 08/11 (N1). Tài khoản `authenticated` không phải admin gọi `admin_cap_nhat_khach` trên DB thật → `{"ok": true}`; cùng lỗi ở `admin_xoa_het_khach_va_ro_hang`, `admin_khoi_phuc_lan_xoa`, `don_du_lieu_thu`, `admin_gan_bds_quan_tam`, `admin_xoa_bds_quan_tam`, `log_loi` (trần 200 dòng/giờ của anon vô hiệu). `[nguồn: chủ dự án 08/11/2026: "Vá N1 ngay"]`
- **Lớp lỗi**: trong hàm SECURITY DEFINER, `current_user` là chủ hàm (`postgres`) nên vế `current_user in ('postgres', …)` luôn đúng. TS-SEC3 kiểm bằng `set role` (vẫn phiên `postgres`) nên không bắt được. Chỗ khác cùng lớp: soát mọi hàm SECURITY DEFINER trong `public` — 8 hàm, sửa cả 8 (`xuat_schema` không cấp cho `authenticated` nên chưa hở).
- **Sửa** (migration `20261108b`): 5 hàm `admin_*` chỉ còn `la_admin()` hoặc `service_role`; `don_du_lieu_thu`, `log_loi`, `xuat_schema` đổi sang `session_user` (vai đăng nhập: PostgREST = `authenticator`, pg_cron / mgmt-api = `postgres` / `supabase_admin`, đo `pg_stat_activity`); thu EXECUTE `don_du_lieu_thu` của `authenticated` (web không gọi).
- **Kiểm**: chạy thử trên DB thật trong giao dịch huỷ: người thường bị chặn cả 6 hàm, admin thật và `service_role` qua, `xuat_schema` từ mgmt-api qua. `tests/test_cong_admin_khong_dung_current_user.py` đỏ khi `schema.sql` còn hàm SECURITY DEFINER dùng `current_user`.

### SRS-5.1zzzzzzz397 · Soát và sửa đợt MOSO 06/11 (SRS-388…396): số sai, cam kết không có thật, luật bản nháp bị bỏ (08/11/2026)
- **Ca gốc**: Đợt 06/11 đẩy thẳng main 14 commit. Hậu quả: 10 test đỏ, CI đỏ. Nhiều công cụ mới trả số sai hoặc bịa dữ kiện. `[nguồn: chủ dự án 08/11/2026: "có định giá, đọc kĩ code đi", "không đi qua PR, sửa lỗi của nó xem, dùng bản prompt gọn để bắn thử 1 đoạn"]`
- **Giữ**: định giá tham khảo, `CUM_TOI_DA = 2` (chủ dự án duyệt 06/11), prompt gọn + Customer Insight, bộ công cụ nguyên tử.
- **Sửa — luồng hỏi & prompt**:
  - Gỡ Fast-Draft. Luật bản nháp SRS-260 (giá · vị trí · quy mô · pháp lý · hiện trạng) vẫn đứng, vì trích dẫn 06/11 không duyệt việc bỏ nó. Fast-Draft còn làm mất lượt hỏi lại diện tích mơ hồ và mặt tiền.
  - Trả lại câu "hỏi chủ nhà NGAY, KHÔNG hỏi lại khách" mà bản 06/11 lỡ xoá.
  - `luu_so_dien_thoai` kiểm `tim_sdt`, và số phải có trong lời khách.
  - `tim_can` không có kết quả thì không dặn model "nêu mặt bằng giá" (không có dữ liệu thì model bịa).
  - Câu xin ảnh không hứa "che số nhà" trên ảnh.
  - Prompt gọn chỉ nhắc công cụ có thật. Bỏ "Fast-Draft ~50 điểm".
  - `du_an_theo_khu` mã hoá tham số `province`.
- **Sửa — công cụ tính toán**:
  - Quái số lấy hai số cuối năm sinh. Bản 06/11 ra 1988 nam = Khôn; đúng là Chấn.
  - Phí công chứng một nguồn `phap_ly.phi_cong_chung`. Bản 06/11 sai bậc > 10 tỷ.
  - `tai_chinh` kẹp tỷ lệ vay (70 → 0,7) và bỏ chữ "cao nhất". Công cụ trả số liệu, không trả câu "Dạ…" viết sẵn.
- **Sửa — định giá & đàm phán**:
  - Phân vùng khớp nguyên từ (Q1 ≠ Q12), thêm Q4/5/6/11. Vùng lạ hoặc loại hình không có trong bảng → "không có số", không đoán nội thành.
  - Loại hình đọc `prop.loai_hinh`. Bỏ hệ số mặt bằng nhân hai lần.
  - Phí môi giới lấy theo `SALE_FEE_RATE`. Bỏ "3 Thật / lên Top / che SĐT / công chứng trọn gói".
  - Đàm phán có nhánh người bán, nhận đúng slug; bỏ "đòn bẩy ép giá" chủ nhà.
- **Sửa — dự án**:
  - So sánh dự án dùng `du_an_mua.dong_du_an`. Bản cũ đọc giá tổng thành triệu/m² và tự điền "CĐT uy tín", "Đã bàn giao".
  - Quy hoạch nói rõ CHƯA tra bản đồ.
  - Script nạp dự án chỉ ghi dòng vay khi nguồn có tỷ lệ.
  - Tỷ lệ vay 70% là bịa: `crawl_moso_projects.py` gắn cứng `bank_support = true, max_loan_ratio = 70` cho mọi dự án (API moso không có trường vay). Đã bỏ ở crawler, bỏ dòng "vay tối đa ~70%" và lọc "hỗ trợ vay" trong khối dự án phía mua. Migration `20261108a_bo_vay_70_mac_dinh.sql` gỡ cặp "Tối đa 70%" / "30%" khỏi `thuoc_tinh` của 1.111 dự án.
- **Không khôi phục**: xoá nguồn (`source`, `source_url`, `specs.moso`) và gộp dự án của SRS-396 là quyết định của chủ dự án. `[nguồn: chủ dự án 08/11/2026: "tôi báo xóa nguồn và gộp chung đó"]`
- **Bỏ VPS khỏi quy trình**: gỡ `tu-cai-vps.yml` (mọi push main từ 06/11 đỏ vì gọi `cai-vps` vào VPS đã gỡ). Thêm `scripts/trien-khai-146.sh`; `sau-gop.sh` gọi nó khi đổi lõi.
- **Đã áp** migration `20261108a` (08/11): 1.111 dự án được gỡ, còn 0 dự án mang dòng vay, 2.924 dự án giữ nguyên `thuoc_tinh`.
- **Kiểm**: pytest 1503/1503; `test:bot` đạt trừ `giam-egress` (hỏng đường dẫn Windows, cả bản gốc); thêm ca cho từng lỗi trên.

### SRS-5.1zzzzzzz417 · Lượt đọc ý biết số Zalo khách đang nhắn; lưu SĐT nói đúng lịch (11/11/2026)
Kịch bản production 11/11 (12 kịch bản, máy 146). Chủ dự án: "sửa vào prompt cho AI nó biết chứ không phải regex, sửa từ gốc".
- **hq_hai_so**: tìm mua ở số tư vấn rồi "chào em" ở số ký gửi → bot vẫn tiếp chuyện tìm mua. Gốc: lượt đọc ý không có dữ kiện số đang
  nhắn, lịch sử toàn chuyện mua nên AI đọc lời chào thành "buy"; nhánh đổi vai theo số (SRS-331) chỉ chạy khi ý định "unknown" nên không
  chạy. Nay `khoi_so_dang_nhan` đưa vào dữ liệu lượt đọc ý (agent gộp mua / bán, form đầy đủ): số đang nhắn; đổi số thì thêm việc các tin
  trước thuộc số kia và ý định là ý của tin này (chào / xã giao → "unknown").
  Chạy lại production: vẫn trượt — lượt đó giao cho agent gộp MUA đọc, prompt của nó dựng sẵn vai tư vấn tìm mua nên dòng dữ kiện số không
  thắng. Gốc thật: người đọc lượt chọn theo vai cũ. Nay `_vai_tren_so_nay`: vai đặt ở số KHÁC số đang nhắn thì form gọn / agent của vai đó
  không đọc lượt này (`_form_mua_gon`, `_form_ban_gon`) — người đọc trung lập đọc, vai quyết theo ý tin + số.
  Lần chạy thứ hai: vai đúng (chào ký gửi) nhưng bot tự nói "phần tìm mua em không tư vấn sâu được" — lời viết không biết việc ở số kia còn
  nguyên. Nay `khoi_doi_so` (lượt đầu sau đổi số) nói việc ở số kia giữ nguyên, bên em vẫn theo tiếp ở số đó.
- **m_hen_xem_cho_so**: khách chưa chọn căn, để số → bot nói "người phụ trách sẽ gọi xác nhận lịch xem cuối tuần". Gốc: kết quả
  `luu_so_dien_thoai` không nói gì về lịch, và đường bóc tách (`_viec_mua`) ghi cứng "gọi xác nhận lịch / tư vấn" — hai nơi tả cùng một việc.
  Nay một nguồn `agent_mua.ket_qua_luu_sdt(lich)` cho cả hai: có lịch đang chờ (trong kho hoặc vừa hẹn lượt này) thì nêu căn + giờ, không có
  thì nói chưa có lịch nào.
- Không phải lỗi: hai căn một tin (DB 146 có 2 tin riêng đúng), "hồ bơi tràn" (dữ liệu dự án The Sun Avenue), hỏi "biết phí chưa" sau đăng
  (SRS-81), hq_hem_xe_hoi (bộ chấm bắt chữ "xe hơi" khi bot tả căn có thật).

### SRS-5.1zzzzzzz418 · Cổng bản nháp theo bản anh Luận (11/11/2026)
Chủ dự án 11/11 (hỏi vì sao bot hỏi hiện trạng, so với anh Luận): "theo anh Luận đi". Bản anh Luận (`schema.summary_ready`): đủ sàn (loại
hình + vị trí + giá) và trong bốn nhóm vị thế · kích thước đất · quy mô xây dựng · pháp lý trống tối đa một nhóm; ô bàn giao nằm nhóm giá &
thương mại nên không bao giờ chặn. Thay SRS-5.1zzzzzzz260 (quy mô · pháp lý · hiện trạng bắt buộc đủ).
- `NHOM_SOAN` = bốn nhóm chính; `summary_ready` = `can_publish` và `len(facet_trong()) <= SOAN_THIEU_TOI_DA` (1).
- Giữ của bên mình: nhóm chỉ tính khi loại BĐS có ô mong đợi trong nhóm, tin cho thuê bỏ pháp lý, ô khách lờ 2 lần thì để sau.
- Ca kịch bản production "hẻm Dương Bá Trạc 4x12, 2 tầng, sổ hồng riêng, 5 tỷ": trước hỏi hiện trạng, nay ra bản nháp ngay.

### SRS-5.1zzzzzzz419 · Tin debug "$$$$$" theo khuôn anh Luận (11/11/2026)
Chủ dự án 11/11 (dán tin `nhà "Nhà đang để trống" → "khong"`): "đoạn tin nhắn debug làm cho giống bên anh Luận hơn". Bản anh Luận (cli.py) in
`[đã trích xuất: …]` rồi `[điểm BĐS | uy tín | hạng | hoàn chỉnh]`. Bản cũ bên mình in nhãn cắt ở "(" nên ra nhãn cụt ("nhà") và cặp cụm khách →
giá trị khó đọc.
- `che_do_test.chu_thich`: mỗi dòng một ngoặc vuông — `[đã trích xuất: khoá=giá trị đã lưu, …]` · `[bỏ: …]` (nếu có) · `[điểm BĐS | uy tín |
  hạng | hoàn chỉnh | soạn nháp: đủ ✓ / chưa — trống <nhóm> | hỏi tiếp: <ô>]` · `[tốn $…]`. Điểm lấy cùng số TurnResult (engine truyền `diem`).

### SRS-5.1zzzzzzz420 · Xin thêm ảnh sau khi đăng tin (11/11/2026)
Chủ dự án 11/11 (tin #56F988C9 lên web chỉ 2 ảnh, bot còn nói "ảnh gắn vào đủ"): "cố xin thêm hình ảnh thêm 1 tí nữa sau khi đăng tin".
- `schema.ANH_TIN_DEP` = 6; `Property.cum_sau_dang(da_hoi, so_anh, anh_du)`: số ảnh thật đã lưu dưới mức này thì cụm `anh` đi ĐẦU chuỗi hỏi
  sau đăng; hết các cụm mà vẫn thiếu thì `anh_lan_2` nhắc nhẹ một lần ở CUỐI. Ghi `sau:anh` / `sau:anh_lan_2` trong `_sau_da_hoi`.
- Đếm ảnh một nguồn `engine._image_count(conv.active.media)` (cả khối ĐIỂM TIN), mức trần theo `min(ANH_TIN_DEP, max_photos)`; không đọc ô
  chữ `hinh_anh`.
- `prompts.khoi_xin_them_anh` (rút gọn cùng ngày, chủ dự án "hỏi ngắn hơn"): xin MỘT góc quan trọng nhất còn thiếu bằng MỘT câu ngắn, căn đang cho thuê / kinh doanh thì ảnh mặt bằng đang kinh
  doanh cũng là ảnh của căn; lần hai chỉ một câu, không thúc ép.

### SRS-5.1zzzzzzz421 · Xin ảnh theo nhánh, hỏi khéo; chủ im 10 phút sau đăng thì nhắc xin ảnh (11/11/2026)
Chủ dự án 11/11: "quy định 10 phút hỏi thêm, ưu tiên ảnh để thêm điểm cho tin" và "không phải cái nào cũng hỏi mặt tiền, hỏi xin thêm ảnh
tùy nhánh, và hỏi khéo vào".
- `prompts.GOC_ANH_THEO_NHOM` + `goc_anh_goi_y(prop)`: góc ảnh theo nhánh (nhà mặt tiền / nhà hẻm / nhà chung / phòng trọ–CHDV / căn hộ / đất
  / dự án / kho xưởng / mặt bằng), đọc ô phân loại `_duong_vao`, loại hình; căn đang cho thuê thì ảnh mặt bằng đang hoạt động cũng tính.
- `LUAT_XIN_ANH_KHEO`: nối chuyện vừa nói hoặc khen thật một điểm, xin MỘT góc hợp căn, nửa câu lợi ích, một câu ngắn. Dùng ở khối xin ảnh
  trong lượt (`khoi_xin_them_anh(..., prop)`) và tin nhắc (`build_xin_anh_nhac_system`).
- `followup`: tin đã báo đăng mà dưới mức ảnh tin đẹp → nhắc sau `SAU_DANG_NHAC_GIAY` (600 giây) thay vì 5 phút; model viết tin theo góc hợp
  căn và 6 lượt gần nhất, hụt thì câu mẫu `xin_anh_sau_dang`. Tối đa hai lần, chung mốc `sau:anh` / `sau:anh_lan_2` với lượt hỏi sau đăng.
- Đủ ảnh (tới mức tin đẹp) thì thôi xin. Tin nhắc tự động chỉ đi 8–20 giờ (`bao_can_moi.trong_khung_gio`); gọi tay `/trigger-followup` không chặn.

### SRS-5.1zzzzzzz422 · Image LQC (Listing Quality Controller) — QC ảnh tin rao, vòng nền trên máy 146 (11/11/2026)
Chủ dự án 11/11: "một con loop như quality controller về hình ảnh của các tin rao, xem các hình đang có có giống nội dung rao đăng không, và
có phù hợp với điểm mạnh của BĐS đang rao không". Chọn: vòng nền trên 146; ghi kết quả + tự nhắn chủ xin góc thiếu.
- `qc_anh.py` + vòng `_vong_qc_anh` (server, `QC_ANH_CHU_KY_GIAY` 1800 giây, tắt `QC_ANH=tat`): quét `listing-public/<id tin>/`, bộ ảnh ĐỔI
  (băm tên tệp, sổ `QC_ANH_SO` = `qc_anh.json`) thì model vision chấm một lần theo `SCHEMA`: khớp nội dung, ảnh không khớp (ảnh quán bên
  trong căn đang cho thuê không tính), thế mạnh đã / chưa có ảnh, `goc_can_xin`, điểm 0–100, nhận xét. Tối đa 10 tin / lượt, 8 ảnh / tin.
- Kết quả vào ô riêng `_qc_anh` (thêm vào `schema.O_NOI_BO` → `listing_noi_bo`, chỉ admin); `prompts.goc_anh_goi_y` đặt góc QC thấy thiếu
  lên trước, nên khối xin ảnh trong lượt và tin nhắc 10 phút xin đúng góc đó.
- Nhắn chủ: còn `goc_can_xin`, 8–20 giờ, chat im từ 10 phút, không đang nhường sân, mỗi căn tối đa 2 tin QC (`_qc_da_nhan`), mỗi bộ ảnh một
  lần; model viết một câu khéo (`LUAT_XIN_ANH_KHEO`). Ghi mốc `sau:anh`.

### SRS-5.1zzzzzzz423 · Điểm tin tính cả ảnh, đọc ảnh theo cuộc chat, khung giờ 8–21 (12/11/2026)
Chủ dự án 12/11: "tin mấy điểm, đã được mấy điểm, còn mấy điểm nữa sao bot không nhắn khi ra tin"; "ảnh như nào thì chấm điểm như nào,
ảnh không liên quan thì chấm sao"; "tới 9h tối lun cũng dc".
- **Điểm tin có phần ảnh.** Trước: điểm = 50% độ đủ ô + 50% độ kịp thời, ảnh không tính — chat anh Luận 11/11 lúc ra tin bot báo "100/100" khi
  tin có 2 ảnh. Nay độ đủ của tin = 70% ô + 30% ảnh (`do_du_tin`, `TRONG_SO_ANH`), đủ `ANH_TIN_DEP` (6) tấm là trọn phần ảnh. Một nguồn cho
  khối ĐIỂM TIN, `TurnResult.property_score` (bridge, dòng debug) và phiếu hạng. Trường `completeness` của bridge giữ nghĩa cũ (độ đủ ô).
- **Ảnh nào được tính:** ảnh đã lưu vào tin, trừ ảnh Image LQC chấm `chac_chan` không phải căn (`so_anh_tinh_diem`). Ảnh lúc gửi bị AI chấm
  không phải ảnh thật của căn (ảnh mạng, phối cảnh, có logo bên khác — OPEN-53) vốn không được lưu nên không có điểm. Mặt bằng đang kinh
  doanh chụp thật (quán, cửa hàng) là ảnh thật (căn có thể đang cho thuê).
- **Khối ĐIỂM TIN** mang sẵn "gửi thêm N ảnh thật thì tin lên M/100" (code tính); lượt ra tin PHẢI nói tin được bao nhiêu điểm, thiếu gì để
  lên bao nhiêu; chưa đủ điểm thì không nói ảnh đã đủ.
- **Đọc ảnh lúc chủ gửi** (`build_media_read_instruction` + `khoi_doc_anh_theo_chat`): lần đọc nay thấy tin em vừa nhắn (đúng góc vừa xin
  thì khen, cảm ơn) và việc căn đang cho thuê (`dang_cho_thue`: ảnh quán bên trong là mặt bằng của căn); ảnh đường phố có căn phía trước là
  ảnh mặt tiền; không nói góc còn thiếu. Chat anh Luận 11/11: gửi mặt tiền, bot đáp "chưa thấy bên trong nhà"; gửi ảnh quán, bot đáp "chưa
  giống căn".
- **Khung giờ tin tự động 8–21 giờ** (`GIO_KET_THUC = 21`, trước là 20) — chung cho tin nhắc, xin ảnh, Image LQC, báo căn mới, giữ kết nối.

### SRS-5.1zzzzzzz424 · Phần ảnh của điểm tin dùng điểm Image LQC — nhẹ tay, hỏi lại thay vì trừ điểm (12/11/2026)
Chủ dự án 12/11: "Có, dùng điểm QC" + "nhưng đừng khó quá, lỡ người thật người ta khó chịu, hỏi thêm thông tin ảnh chứ ko phải 0 điểm".
- Phần ảnh (30% độ đủ của tin) = số lượng (đủ 6 tấm là trọn) × hệ số chất lượng 0,75–1 theo điểm Image LQC (`SAN_CHAT_LUONG`). Bộ ảnh QC
  chấm thấp nhất cũng chỉ mất một phần tư phần ảnh (khoảng 4/100 điểm tin), không bao giờ về 0. Tin chưa được QC chấm thì chỉ theo số lượng.
- Bỏ luật SRS-423 trừ ảnh QC chấm "chắc chắn không phải căn" khỏi số ảnh tính điểm: mọi ảnh đã lưu đều được tính. Thay vào đó Image LQC
  hỏi khéo chủ MỘT câu tấm đó có phải ảnh căn mình không (tả bằng nội dung, không nói ảnh sai / bị trừ điểm), ưu tiên trước xin góc.
- Khối ĐIỂM TIN không đưa con số chất lượng ảnh cho model; chỉ gợi "ảnh <góc QC thấy thiếu> sẽ làm tin đẹp hơn, điểm cao hơn".

### SRS-5.1zzzzzzz429 · Bot phía bán nhận xét NHẸ giá chủ so với căn đang rao gần (12/11/2026)
Chủ dự án 12/11 quyết câu 4.5 của đặc tả LQC: "Được, nói nhẹ".
- RPC `can_dang_rao_gan` (migration `20261112c`) trả thêm `cua_chu` (giá, đơn giá, lối vào của chính tin) và trung vị đơn giá các căn CÙNG lối
  vào (mặt tiền / hẻm).
- **Code chấm, model nói** (`so_sanh.muc_lech`): cần ≥ 3 căn cùng lối vào đang rao gần; lệch dưới 10 % → "sát mặt bằng rao quanh khu", trên →
  "nhỉnh hơn / mềm hơn khoảng N %". Chưa đủ căn cùng kiểu → không nhận xét (vd tin 56F988C9 mặt tiền, quanh đó toàn hẻm).
- Lời: MỘT câu, luôn nói là so với giá RAO, chỉ để tham khảo, chủ quyết giá; không đưa giá mới, không khuyên tăng / giảm, không đoán dễ / khó bán.
- Dùng ở: lượt gửi so sánh sau đăng (`so_sanh`), lượt chủ hỏi "giá tôi cao hay thấp" (`hoi_ve` = dinh_gia, có căn gần thì trả lời bằng kho thay
  câu "chưa có số liệu"), công cụ định giá (`dinh_gia_tham_khao` — có mức lệch theo kho thì bỏ đối chiếu bảng cứng).
- **Lưới `_BINH_LUAN_GIA`** nới cho lượt có `conv.y_luot["_nhan_xet_gia"]`: chỉ chặn đoán thị trường (thanh khoản, đắt khách, dễ / khó bán…).
  Bản tin vẫn cấm mọi nhận xét giá. Phía mua giữ nguyên luật cấm.

### SRS-5.1zzzzzzz428 · LQC mảng So sánh cạnh tranh: căn cùng loại đang rao gần, đơn giá từ kho, không bịa giao dịch (12/11/2026)
Chủ dự án 12/11 "Làm mảng So sánh" (đặc tả `docs/lqc-listing-quality-controller.md` mục 4).
- **RPC `can_dang_rao_gan(listing, bán kính 3 km, 3 căn, gom_thu)`** (migration `20261112b`, chỉ service_role): căn cùng loại + cùng giao dịch
  đang rao trong bán kính (cùng lối vào mặt tiền / hẻm xếp trước, rồi gần nhất), dải đơn giá (số căn, min, max, trung vị), căn đã cọc / chốt gần
  đó trong 180 ngày. Không trả số nhà, người bán, mô tả. Loại tin của chính người bán.
- **Tin thử loại trừ:** 12/11 kho đang hiển thị 244 tin thì 242 là `seed_thu` — gửi chủ nhà thật như "căn đang bán gần" là bịa. Chỉ ID thử
  (`_la_id_thu`) mới thấy tin thử. Hiện với khách thật công cụ trả rỗng cho tới khi có tin thật quanh căn.
- **4.1 · 4.2 — cụm sau đăng `so_sanh`** (`module so_sanh`, sau cụm lợi thế, trước cụm giá): đủ ≥ 2 căn → bot gửi chủ 2–3 dòng "#mã · đường,
  phường · lối vào · tầng · m² · giá rao (≈ đơn giá) · cách khoảng … — link", một lần. Chưa đủ căn → sang cụm kế, mỗi ngày tra lại một lần
  (`_ss_tra`), không ghi "đã hỏi".
- **Luật lời** (chờ chủ dự án quyết 4.5): chỉ đưa dữ kiện — không nói giá chủ cao / thấp / hợp lý, không khuyên tăng / giảm, căn khác lối vào
  hay diện tích không so thẳng đơn giá.
- **4.3 · 4.4:** chỉ có dòng giao dịch khi kho có tin `da_coc` / `da_chot` gần đó (hiện 0); không có thì khối cấm nói "đã bán / đã cọc" căn nào.
  Giá nêu là "giá rao lúc đó" — kho chưa có cột giá chốt.
- **4.5 — công cụ định giá phía bán:** đủ ≥ 3 căn đang rao gần → thêm dòng dải đơn giá thật từ kho, ưu tiên hơn bảng ước lượng theo vùng.
- 4.6 (báo cáo giá khu vực) chưa làm.

### SRS-5.1zzzzzzz427 · LQC mảng Khai thác lợi thế: hỏi buôn bán gì hợp, chỗ đậu xe, nêu tiện ích thật (12/11/2026)
Chủ dự án 12/11 "làm tiếp mảng Khai thác lợi thế" (đặc tả `docs/lqc-listing-quality-controller.md` mục 3.1–3.7).
- **Cụm hỏi sau đăng `loi_the`** (`schema.CUM_SAU_DANG`, sau pháp lý / hợp đồng thuê, trước giá): ô `phu_hop_kinh_doanh` (chủ nói đoạn đường hợp
  buôn bán gì; căn đang cho thuê thì khách thuê làm gì) rồi `cho_dau_xe`. Mỗi ô một lần, mỗi lượt một câu như các cụm khác. Ô công khai (lên tin),
  xếp facet "Vị thế".
- Chỉ hỏi căn **buôn bán được** (`Property.kinh_doanh_duoc`): mặt bằng / shophouse, hoặc nhà mặt tiền đường (`_duong_vao` = mat_tien, AI đọc theo
  nghĩa). Tin cho thuê cũng được hỏi cụm này (trước đây tin cho thuê chỉ hỏi dẫn khách xem).
- **Tiện ích thật (3.6 · 3.7):** lượt hỏi `phu_hop_kinh_doanh` đọc `listings.tien_ich_gan` (tên + mét từ Overpass) → khối hỏi kèm tối đa 4 tiện
  ích gần nhất ("Co.opmart Phan Văn Trị khoảng 150 m"); bot được mở câu bằng MỘT tiện ích, luôn nói "khoảng", cấm nêu tiện ích ngoài danh sách.
- **3.2:** góc ảnh gợi ý cho nhà mặt tiền / mặt bằng thêm "dãy phố hai bên (thấy buôn bán xung quanh)" — Image LQC và tin xin ảnh dùng chung.
- Chưa làm: hỏi đào sâu theo câu trả lời (3.4 "văn phòng kèm showroom hay chỉ office?", 3.5 "spa cao cấp?") — mỗi ô hỏi một lần, model tự nối ý
  nếu chủ trả lời chung chung trong cùng lượt.

### SRS-5.1zzzzzzz426 · LQC mảng Pháp lý: hỏi rõ câu mơ hồ, đối chiếu sổ với tin, hỏi tiến độ giấy tờ (12/11/2026)
Chủ dự án 12/11 "Làm theo lịch này" (đặc tả `docs/lqc-listing-quality-controller.md` mục 2.1–2.5, lịch hỏi đã duyệt).
- **Trạng thái giấy tờ** (AI đọc theo nghĩa, `prompts.SU_THAT_CAN`): `phap_ly_trang_thai` thêm `hdmb` (căn hộ / đất dự án chờ chủ đầu tư ra sổ)
  và `mo_ho` (chỉ nói chung chung "pháp lý chuẩn", "không phải lo", cả cuộc trò chuyện chưa nói loại giấy); khoá mới `hoan_cong`
  (`da_hoan_cong` / `chua_hoan_cong`). Đã `co_so` thì câu chung chung sau không hạ xuống `mo_ho`.
- **2.1 — lúc nhận tin:** `mo_ho` → xoá câu mơ hồ khỏi ô pháp lý và không cho ghi lại (`Property.update`), ô pháp lý coi như chưa có
  (`Property._has`) → lượt sau hỏi lại loại giấy theo luồng hỏi ô. Lọt qua bản nháp thì hỏi sau đăng (mã câu `loai_giay`).
- **2.2 — sau đăng, sau cụm xin ảnh:** khách đã nói có sổ mà chưa gửi ảnh sổ → mã câu `anh_so` (`Property.hoi_phap_ly_sau_dang`, đi qua
  `cum_sau_dang`, mỗi câu một lần). Lời hứa: "ảnh sổ chỉ để em kiểm, không đăng" — chưa có bước che thông tin trên ảnh.
- **Lượt đọc ảnh sổ:** sổ hồng / sổ đỏ → `_phap_ly_trang_thai = co_so`, cờ `_da_doc_so`; HĐMB → `hdmb`. Schema đọc sổ thêm `nha_tren_so`.
- **2.3 — lúc đọc sổ:** sổ không ghi nhà mà tin là nhà (nhà phố / biệt thự / cấp 4 / toà nhà / CHDV / khách sạn) → câu hỏi của lượt là "nhà
  mình đã hoàn công chưa", và **không đổi loại hình theo sổ** (trước đây sổ chỉ có đất biến nhà phố thành đất).
- **2.4 / 2.5 — ngay lượt chủ nói:** `chua_hoan_cong` → hỏi dự kiến hoàn công; căn hộ / đất dự án `hdmb` / chưa có / đang làm → hỏi chủ đầu tư
  hẹn ra sổ. Khối `hoi_phap_ly` (`viec_luot`: sau hỏi tên dự án, trước hỏi ô / hỏi sau đăng; không ở lượt trình nháp), mỗi ô một lần
  (`_pl_da_hoi`). Ô `du_kien_hoan_cong`, `du_kien_ra_so` là ô RIÊNG (`O_NOI_BO`), không lên web.
- Bản tin: `hdmb` không được ghi sổ hồng / sổ đỏ; `chua_hoan_cong` không được ghi hoàn công.

### SRS-5.1zzzzzzz425 · LQC mảng Ảnh: nhãn từng ảnh, ảnh đẹp nhất làm bìa, xin ẩn ảnh xấu (12/11/2026)
Chủ dự án 12/11 "Làm mảng Ảnh" (đặc tả `docs/lqc-listing-quality-controller.md` mục 1.1 · 1.3 · 1.4).
- Image LQC đọc bộ ảnh từ `listing_media` (bucket công khai, chưa ẩn) thay vì liệt kê thư mục storage; ảnh gửi model theo thứ tự, model gọi ảnh
  bằng số thứ tự → code ánh xạ về đường dẫn.
- Schema QC thêm: `nhan_anh` (mỗi ảnh: góc theo `GOC_ANH`, tả ngắn, `xau` chỉ khi rõ ràng kém), `goc_da_co`, `goc_con_thieu` (theo loại căn),
  `anh_dep_nhat`.
- **Ảnh bìa:** tấm đẹp nhất (không phải giấy tờ / ảnh nghi / ảnh xấu) → RPC `dat_anh_bia`. Tin anh Luận trước đó lấy tấm cầu thang có biển quán.
- **Tin nhắn chủ — một việc mỗi tin** (`chon_viec`): ảnh nghi không phải căn → hỏi lại; ảnh xấu (tin còn ảnh khác) → xin ẩn; thiếu góc → nói đã
  có góc nào, xin góc thiếu, mở đầu bằng lời khen tấm đẹp; đủ góc mà chưa đủ 6 ảnh → khen tấm đẹp, xin thêm cùng kiểu.
- **Ẩn ảnh:** tin xin ẩn đặt `pending_destructive` op `an_anh`; chủ đồng ý (lượt lập thao tác `xac_nhan_xoa`, luật nay gồm "xin ẩn một tấm ảnh")
  → RPC `an_anh_tin` (cột mới `listing_media.an_khoi_web`, view `listing_photos_v` lọc ra, không xoá file, bìa bị ẩn thì chọn lại), ảnh trong căn
  đánh dấu `an` → không tính điểm; câu mẫu `da_an_anh` / `giu_anh` / `an_anh_hut`. Migration `20261112a_lqc_an_anh_doi_bia`.
- Trần tin QC vẫn 2 tin / căn (chờ chủ dự án quyết trần chung cho 4 mảng).
