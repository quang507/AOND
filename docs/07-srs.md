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

### SRS-5.1 · Chu trình `chat-reply` v48

`[nguồn: bot/supabase/functions/chat-reply/index.ts]`

```text
1. Cổng 1: bí mật (service key | x-bridge-secret); nạp bot_prompts + trần lượt, nhớ tạm 60 s (FR-171 h).
   mark_sent? → ghi inbound_ledger, return.  human_note? → nhường sân 30' (FR-141), return
2. Sổ inbound: claim_inbound(msg_id) → in_flight/completed thì trả lại reply đã lưu (FR-162)
3. Chuẩn hoá: tKD = boDau(text); mọi cổng regex khớp CẢ có dấu lẫn không dấu (FR-161)
4. Cổng 2: bump_model_quota(cap) — vượt trần → nhánh dự phòng regex, admin được báo một lần/ngày (FR-151 a)
5. Người nội bộ (nguoi_noi_bo) nhắn "#mã: trả lời" → ghi_fact_listing + đóng info_requests, return (FR-173 d)
6. Phân vai (FR-159): đã có hồ sơ bán → BÁN; tự nhận có BĐS → mo_ho_so_nguoi_ban (nhãn ccrb/nmg) → BÁN;
   câu mập mờ ở tin đầu → hỏi vai một lần, không gọi model; mặc định → MUA
7. Nhánh BÁN: câu rao mới → listings nháp (bocQuan, dealCol); trả lời drip → ghi_fact_listing (FR-164);
   lời hứa (PROMISE_RE) → reminders.promise (FR-133); tin đủ đăng thì ngừng drip (FR-144)
8. Nhánh MUA: ensure_buyer_conversation; trần 100 tin/24 h (FR-146); merge_buyer_prefs từ model (fallback regex);
   prompt 2 khối (chung: luật + few-shot + dự án nhà mình, cache 1 h; riêng: KHO ≤ 6 tin theo hồ sơ + giá TB phường FR-99,
   căn khách nhắc, CĂN TRONG DỰ ÁN ≤ 5 + unit_status FR-116, CĂN TƯƠNG TỰ FR-31); structured output → ≤ 2 bong bóng, ≤ 3 listing
9. Cổng regex trên tKD: xin hình → ≤ 4 ảnh/lượt + photo_offset (FR-27); "N sao" trong 48 h sau feedback → ghi_danh_gia (FR-65);
   muốn gọi/voice → needs_human + reminders.escalation "VOICE:" (FR-79); tiêu cực/cần người → needs_human (FR-77/141);
   đặt lịch → viewings (xin SĐT đúng kịch bản, từ chối vẫn đặt được, NFR-07); đồng ý chốt → deals + da_chot (FR-142)
10. Câu cần xác minh (còn bán/sổ/quy hoạch/hoàn công…) → info_requests buyer_ask + câu giữ nhịp FR-45; không tự khẳng định (RSK-03)
11. Lọc liên hệ: mọi fact/địa chỉ vào prompt và mọi bong bóng gửi người MUA qua locLienHe() — SĐT/Zalo → "[liên hệ qua Zalo]", bỏ số nhà (FR-105)
12. Hậu kỳ song song: messages, mark_listing_interest, tao_followup, cong_token (FR-169), ledger completed; mọi catch → ghiLoi
```

Bất biến kiểm thử được: I1 ≤ 3 listing/tin (FR-24); I2 tin chủ động kết thúc bằng câu hỏi (FR-63, `06 §6.8`); I3 câu thuộc {còn bán, sổ, quy hoạch, hoàn công}
luôn sinh `info_requests`; I4 không hỏi SĐT ngoài đặt lịch (NFR-07).

### SRS-5.2 · Xếp hạng gợi ý

`[nguồn: chat-reply v48]` Không có công thức trọng số; hai luật đang chạy:

- **KHO theo hồ sơ** (FR-130): lọc `deal` (qua `dealCol`), đúng số phường (`ward ilike 'Phường N'`), `bedrooms ≥`, `price_vnd` trong dải `budgetRangeVnd()`
  ("tầm 5 tỷ" → ≤ 5,75 tỷ; "5–6 tỷ" → 4,75–6,6 tỷ; đọc "5 tỷ 8", "5 tới 6"), chỉ `dang_ban | dang_quan_tam` có giá số; `created_at` giảm dần, lấy 6, model chọn ≤ 3.
- **CĂN TƯƠNG TỰ** (FR-31): khi căn khách hỏi đã `da_chot`/`an` hoặc câu có "giống vầy/tương tự/na ná": gốc = căn khách nhắc (không có → mã cuối bot nói trong 12 tin);
  ứng viên cùng `deal`, lên kệ, giá 0,7–1,3× gốc, bước 1 cùng `ward` (≤ 6), < 3 thì thêm cùng `district`; điểm = 4·[cùng ward] + 2·[cùng access_type] + 1·[cùng property_type]; lấy 3.
- Phía DB, `can_cung_khu()` dùng cho nhắc (reengage/sold/followup): cùng phường ưu tiên rồi cùng quận, giá 0,7–1,15×, trừ căn đã gửi.
- **Loại hẻm + theo nghĩa** (FR-216, 23/09/2026): `prefs.alley` lọc cứng `access_type` (`locLoaiHem`). Công tắc `app_config.tim_theo_nghia = bat` thì KHO lấy 30 căn đã lọc cứng, nhúng câu khách (Gemini `gemini-embedding-001`, 768 chiều, RETRIEVAL_QUERY) rồi `tim_tin_theo_nghia(p_vec, p_codes)` xếp theo cosine với `listings.nhung` (cron `nhung-tick` nhúng tin, RETRIEVAL_DOCUMENT), cắt 6. Hỏng → thứ tự `gap`, `created_at` như cũ.
- Chưa có: loại listing B đã từ chối sau khi xem (UF-07); `bds_hot` chưa tham gia xếp hạng.

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
- Không dựng job riêng cho `recompute_hot_score` (view `bds_hot`), `match_new_listings` (trigger `bao_tin_moi_khop`), `close_conversations` (FR-131).

### SRS-5.4 · `nudge` v25 và cờ cần người thật — FR-60…FR-64, FR-77, FR-133, FR-147

`[nguồn: bot/supabase/functions/nudge/index.ts]`

```text
1. Cổng bí mật (congBiMat); tự chặn ngoài 8 h–21 h VN; dry_run không giành việc
2. nhan_viec_nhac(kinds, limit, worker) — hợp đồng thuê 5', hai lượt chồng nhau không gửi đúp (FR-166 f)
3. Theo kind:
   promise   → nhắc khéo một tin đúng giờ hẹn (FR-133)
   viewing   → nhắc trước ~45', kèm "Bản đồ: maps.google.com/?q=lat,lng" khi có toạ độ (FR-54); sent → trigger hẹn feedback +4 h
   reengage  → khách im ĐỦ 5 ngày: một lần/lượt im (FR-60), góc xoay vòng tất định theo số lần đã hỏi
               (can_cuoi · tien_do · xem_anh · tieu_chi · dat_lich · thi_truong, FR-61) + kho can_cung_khu (FR-62);
               im ≥ 6 ngày → BUỘC mẫu KEEPALIVE cố định "nhắn lại một chữ kẻo Zalo ngắt" (FR-63)
   followup  → "chủ nhà chưa phản hồi #mã…" (FR-110) / "lịch xem #mã đã được xác nhận…" (FR-52) mẫu cố định; còn lại qua model (FR-32)
   match     → "vừa có căn mới khớp tiêu chí: <note>" mẫu cố định (FR-64)
   feedback  → hỏi cảm nhận + xin chấm sao 1–5 (FR-56/65)
   sold      → "#mã đã chốt · thay thế: …" mẫu cố định (FR-108)
   escalation/report → gửi qua OA nếu có token, không thì để bridge kéo qua escalation-feed; CTV không chạm sau 30' → admin (FR-147)
4. Gửi (sendZalo) → sent; hụt có thử → bao_hong_nhac (lùi dần, 5 lần dead); chưa thử được → nha_viec_nhac
5. Mọi tin chủ động kết thúc bằng câu hỏi; ≤ 1 emoji, ≤ 2 bong bóng (06 §6.8)
```

Phát hiện phản ứng tiêu cực (FR-77): cờ `conversations.needs_human` là proxy — `chat-reply` bật khi model/regex thấy khách bực, đòi người thật, muốn gọi, hoặc câu hỏi
lặp không có trả lời; trigger `conversations_email_upset` gửi `[UPSET]` kèm 3 tin khách gần nhất; `/admin` thẻ "Khách cần người thật" đọc `khach_can_nguoi_that`.
Chưa có: nhánh từ đánh giá ≤ 3 sao, `unfollow`.

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

### SRS-5.1zzzzzzz367 · Bot vẫn hỏi phường khi hỏi địa chỉ (3/201 lượt sau SRS-359) — soát lời bot theo ô hệ thống chọn, một bất biến một chỗ chặn (02/11/2026)
Ca gốc (chấm trên main 48f9912): `cao_lo` l1 "Căn nằm ở đường nào, phường nào…", `xa_phuoc_ly` l1 "…thuộc phường hay xã nào…", `aeon_tan_phu` l5 "…thuộc phường nào của Tân Phú…". Chủ dự án 02/11 (nguyên văn): "mày lại vá kiểu lỗi thì vá à, phải sửa từ gốc chứ" — bỏ bản đầu (thêm dòng cấm vào mọi lượt + lưới từ khoá).
(1) Lớp lỗi: đầu ra model không bị soát theo ô hệ thống chọn — `viec_luot` chọn ô, `O_HE_THONG_TRA` chỉ lọc vòng chọn câu hỏi, `bot_vua_hoi` chỉ được đọc ở lượt SAU để đếm lờ; nên mọi ô "không được hỏi" lọt khi model tự ghép vào câu, và mỗi lần lại thêm một dòng cấm. Sửa: bất biến "lời bot chỉ hỏi ô hệ thống chọn cho lượt (hoặc điều khách vừa hỏi lại); không bao giờ hỏi ô trong `O_HE_THONG_TRA` hay ô đã có giá trị" — MỘT chỗ chặn `_soat_hoi_dung_o` trong `LUAT_SOAT`: AI (model bóc tách, `SOAT_O_HOI_SYSTEM`) khai các ô lời bot sắp gửi hỏi + cụm nguyên văn, code kiểm cụm có trong lời rồi so tập được phép (`cum_vua_hoi` + ô của việc + ô của khối hỏi còn lại); lệch → gọi lại một lần sẵn có kèm lý do; vẫn lệch → code gọt vế hỏi sai (không viết chữ mới). `O_HE_THONG_TRA = {phuong, duong}` là nguồn duy nhất (bước áp tên kho SRS-366 cũng đọc nó). Lời dặn hỏi `dia_chi` bỏ "phường / xã" (lời dặn cũ bảo model hỏi phường). Gỡ các dòng cấm rải rác: cổng web (2 chỗ), `khoi_dia_danh` (2 chỗ), khối phường vừa tra.
(2) Cùng lớp: mọi ô "không được hỏi" (phường, xác nhận tên đường, ô đã có, ô hệ thống không chọn) giờ chặn ở cùng một chỗ; phía mua không xét (hỏi nhu cầu). Lệch so với giao việc: khai báo không đi trong lượt viết lời (chủ dự án 28/10 chốt lời trả khách là chữ thường, không công cụ — SRS-246) mà là một lượt AI đọc ngay sau, cùng khuôn SRS-353; "vẫn sai" không thay bằng câu mẫu (thêm câu mẫu cần migration bảng `cau_mau` + nhãn ô viết cho khách) mà gọt vế hỏi sai. Còn: gọt hết chữ thì giữ lời (log); AI đọc lỗi / Gemini dự phòng không khai → lượt đi không chặn. Chi phí: +1 lượt model bóc tách mỗi lời phía bán (+1 nữa khi gọi lại); số gọi lại tăng chưa đo — phiên kiểm đo bằng `cham`.
(3) Kiểm: `test_khong_hoi_phuong_moi_luot_367.py` (ba câu thật → gọi lại; xác nhận tên đường; ô chưa từng bị bắt: tự hỏi "nhà mấy tầng" khi hệ thống chọn hỏi giá; hỏi lại ô đã có; viết lại vẫn sai → gọt vế ("đường nào, phường nào, tỉnh nào vậy?" → "đường nào, tỉnh nào vậy?"); không bắt oan: ô được chọn, khối xác nhận mặt tiền, khách vừa hỏi lại, cụm trích không có trong lời, phía mua, AI lỗi). Gỡ dòng `hoi_dung_o` khỏi `LUAT_SOAT` → 10/12 đỏ. Viết lại 10 bài cũ khoá các dòng cấm đã gỡ.

### SRS-5.1zzzzzzz366 · Bot hỏi lại tên đường ("ý anh là đường X đúng không?", "Mã Lò hay Mã Lộ?") thay vì tự áp tên chuẩn (02/11/2026)
Quyết định chủ dự án 02/11 (nguyên văn): "không hỏi lại tên đường nữa, tự áp tên vào". Thay luật hỏi xác nhận của SRS-61 và SRS-271 (chủ dự án 29/10).
(1) Lớp lỗi: dữ kiện hệ thống tra được lại thành câu hỏi khách — `_chuan_dia_danh` chỉ áp tên kho khi khác dấu, còn khớp gần thì `khoi_dia_danh` / `goi_y_duong` dặn model hỏi xác nhận, khớp nhiều tên thì kể cho khách chọn (việc `hoi_dia_danh` của Đợt 4). Sửa: kho ra MỘT tên trong khu khách nói (`TraDiaDanh.duong`: lệch dấu, sai 1–2 chữ, theo nghĩa; nhiều tên ngang nhau thì chọn theo quận đã biết, SRS-273; đường quận khác / tên địa bàn bị loại, SRS-362) → ghi luôn tên kho vào `duong` và `dia_chi`; khách nói quận ở lượt sau thì tra lại; không ra → giữ chữ khách. Bỏ hẳn (không thêm câu cấm) hai dòng hỏi trong `khoi_dia_danh`, `goi_y_duong`, việc `hoi_dia_danh` (`viec_luot`, `_VIEC_KHOI`), điều kiện chờ hỏi đường ở `_khoi_hoi_du_an`.
(2) Cùng lớp: phường (SRS-359, cùng đợt); mô tả ô `duong` của bóc tách còn câu "tên khớp nhiều đường thì hỏi lại khách" — đã sửa. Vẫn HỎI khi khách chưa nói đường (`missing_fields` → `dia_chi`, hỏi ô thiếu). Còn: biết phường mà chưa biết quận thì chưa lọc theo khu (lọc chỉ theo quận cũ); RPC `tim_duong` không lọc quận (lọc ở lõi, SRS-362).
(3) Kiểm: `test_ap_ten_duong_366.py` (cách nói mới thiếu dấu + sai một chữ "25 huynh tan phap" Quận 7 → "25 Huỳnh Tấn Phát"; "ma lo" chưa biết khu giữ chữ khách, lượt sau nói Bình Tân → Mã Lò; không ra / đường quận khác giữ chữ khách; khối địa danh không còn dòng hỏi; chưa nói đường vẫn hỏi `dia_chi`). Đỏ khi `_chuan_dia_danh` về luật cũ chỉ áp tên khác dấu, khi bỏ tra lại lúc khách mới nói quận, hay khi gỡ cả bản sửa (3 bài). Viết lại 4 bài cũ khoá hành vi hỏi (`test_dia_danh` ×3, `test_viec_luot_314`) và một dòng ở `test_goi_y_duong_trong_khu_362`.

### SRS-5.1zzzzzzz365 · Sổ lỗi "ghi tin vào messages hỏng: 409 Conflict" 34 lần: lời bot của lượt trùng tin mất khỏi CRM (02/11/2026)
Ca gốc: `bot_errors` 21/10–01/11 23:12 — "supabase sync: ghi tin vào messages hỏng: HTTPError 409" 34 lần; "TypeError: argument of type 'NoneType' is not iterable" 15 lần 28/10 16:22 – 29/10 04:52.
(1) Lớp lỗi: `messages.zalo_msg_id` là khoá duy nhất; cùng một tin Zalo tới hai lần (bridge thử lại khi mạng nghẽn; khách thả cảm xúc nhiều lần lên CÙNG một tin — msg_id `react-<luồng>-<tin>`) → 409 → `ghi_luot_chat` coi mọi 409 là "hội thoại đã xoá", ghi lại vẫn 409 rồi ném → dòng LỜI BOT của lượt đó không vào CRM (mất tin thật, không phải chỉ ồn sổ). Sửa: dòng khách ghi `on_conflict=zalo_msg_id` + `resolution=ignore-duplicates` (trùng khoá là đúng thiết kế: một tin Zalo một dòng); đường 409 do hội thoại bị xoá (khoá ngoại) giữ nguyên. TypeError: đã hết từ SRS-276 (`f0dda59`, 29/10 05:35 UTC — `.get("name", "")` trả None khi cột NULL), không sửa thêm.
(2) Cùng lớp: dòng lời bot / tin admin không có `zalo_msg_id` nên không trùng khoá; `supabase save` 409 (2 lần, 20–22/10) là đường lưu tin rao, chưa thấy lại sau 22/10.
(3) Kiểm: `test_tin_trung_msg_id_365.py` (thả cảm xúc hai lần cùng tin; bridge thử lại) — gỡ bản sửa: đỏ đúng "HTTP Error 409: Conflict".

### SRS-5.1zzzzzzz364 · Bot trả lời từng lượt khách chỉ thả cảm xúc (02/11/2026)
Ca gốc (chat thật 01–02/11): khách mua chỉ thả /-heart 6 lần trong 3 giờ, bot nhắn lại 4 lần ("Em vẫn ở đây…", "Tim đủ đầy rồi ạ ❤️…").
(1) Lớp lỗi: lượt CẢM XÚC (bridge `reaction`) đi chung đường lượt tin nhắn → model luôn viết lời. Sửa: bridge gửi `su_kien: "reaction"`; lõi theo LOẠI SỰ KIỆN (hoặc msg_id `react-` của bridge cũ) — không đọc chữ — không trả lời, chỉ ghi CRM; ngoại lệ: bản nháp đang chờ duyệt (thả tim = đồng ý, FR-142; `engine.cho_duyet_ban_nhap`) hoặc bot chưa từng nhắn khách (trả lời một lần).
(2) Cùng lớp: sticker đã có đường riêng (đọc nghĩa sticker, SRS-122); khách GÕ chữ kèm tim vẫn là tin nhắn. Bridge đổi → tự cài VPS khởi động lại cả bridge.
(3) Kiểm: `test_cam_xuc_khong_tra_loi_364.py` (bridge mới / cũ; bản nháp chờ duyệt vẫn xử lý; chưa từng chào trả lời một lần; cách nói mới "tim đủ đầy rồi em ❤️" gõ chữ vẫn trả lời) — tắt nhánh: đỏ.

### SRS-5.1zzzzzzz363 · Bản tin tự nhân ngang × dài ra m² khi đất nở hậu: "đất 90m²" khách không nói (02/11/2026)
Ca gốc (chat thật 01–02/11): khách "mặt tiền 6m dài 15 nở hậu 3" → bản tin "đất 90m² ngang 6m nở hậu… càng vô sâu càng rộng nhờ nở hậu 3m". 6 × 15 chỉ đúng khi không nở hậu.
(1) Lớp lỗi: dữ kiện bản tin (`khoi_su_that_can`) không nói căn CHƯA có số m² nào, còn `AD_FORMAT` dặn "LUÔN kèm đơn vị (35m²)" → model tự nhân; lưới số SRS-218 bắt được "90m²" nhưng lượt gọi lại chưa được soát lại (đã sửa ở SRS-352). Sửa: dòng "Diện tích" do code quyết theo ô tin — có ô diện tích khách nói thì in đúng số đó, chưa có thì "CHƯA có số m² — KHÔNG tự nhân, in nguyên kích thước (kèm nở hậu)".
(2) Cùng lớp: "72m²" (SRS-352, lượt viết lại); phía mua `dong_can` lấy `area_m2` thật của kho. Còn: bản cuối vẫn lệch số sau lượt gọi lại thì chưa gọt chữ (chỉ giữ bản ít lệch hơn).
(3) Kiểm: `test_dien_tich_no_hau_363.py` (ca thật + cách nói mới "ngang 4 dài 20 hậu 5m"; có ô diện tích thì in đúng; lưới vẫn bắt 90m²) — gỡ dòng dữ kiện: 3 đỏ.

### SRS-5.1zzzzzzz362 · Gợi ý tên đường lấy từ tên huyện, đường quận khác: "Ngô Bệ (Quận Tân Bình), Nhà Đồ" cho khách ở Nhà Bè (02/11/2026)
Ca gốc (chat thật 01–02/11): "anh cần bán căn nhà cấp 4 ở nhà bè", "3 tỉ em" → "Nhà mình nằm đường nào vậy: Ngô Bệ (Quận Tân Bình), Nhà Đồ, hay một đường khác ở Nhà Bè?".
(1) Lớp lỗi: khớp gần tên đường (`TraDiaDanh._duong`, RPC `tim_duong` sai 1–2 ký tự) không biết chữ khách gõ là tên ĐỊA BÀN, cũng không lọc theo khu khách đã nói. Sửa: chữ trùng đúng tên quận / huyện / phường / xã trong kho (`_la_ten_dia_ban`) mà kho không có đường trùng đúng → không khớp gần, không gợi ý; đã biết quận → bỏ ứng viên khớp gần thuộc quận khác (đường kho không ghi quận thì giữ).
(2) Cùng lớp: soát mọi đường khớp gần tên đường — `ung_vien_duong` / `goi_y_duong` / khối địa danh đều đọc `_duong` (cùng sửa); nhánh theo nghĩa đã lọc `LOAI_KHONG_PHAI_DUONG` + quận; hai tên ngang nhau đã chọn theo quận (SRS-273). Còn: RPC `tim_duong` (SQL) không lọc quận — lọc ở lõi.
(3) Kiểm: `test_goi_y_duong_trong_khu_362.py` (ca thật; cách nói mới "Bình Chánh, đường quach dieu" chỉ có tên gần ở Tân Phú) — tắt từng bước lọc: đỏ đúng bài.

### SRS-5.1zzzzzzz361 · `tim_nha` ưu tiên uy tín người rao: cùng mức khớp thì hạng cao xếp trước (02/11/2026)
Quyết định chủ dự án 02/11: "quyền lợi theo hạng hạng cao thì cung cấp thông tin uy tín hơn" (khuôn anh Luận `luan8560/AOND` gamification.py: Đồng "xếp cuối luồng ưu tiên", điểm người rao = "Điểm Uy tín"). Trước đây cùng mức khớp thì xếp theo `updated_at` — hạng (OPEN-26) không đi vào gợi ý căn.
(1) Lớp lỗi: hạng người rao chỉ dùng cho lời / quyền lợi phía bán, đường gợi ý căn phía mua không đọc. (2) Cùng lớp: `bao_can_moi` (báo căn mới khớp) và web không xếp theo hạng — web cố ý (hạng ẩn khỏi web); `bao_can_moi` gửi từng căn khớp, không chọn giữa các căn nên không cần. Sửa: migration `20261103a_tim_nha_uu_tien_uy_tin` — `hang_so_nguoi_ban()` (vàng 3 · bạc 2 · đồng 1 từ `hang_theo_diem(diem_nguoi_ban)`), `tim_nha` xếp `mức khớp ↓, hạng ↓, updated_at ↓`, chỉ tính hạng cho người rao của các căn còn tranh suất cuối; hạng không ra kết quả. CTE `materialized` — không có thì planner gọi hạng theo từng dòng: 9,7 s / lượt "Quận 5" (bản cũ 9 ms) → 79 ms.
(3) Kiểm: `bot/tests/tim-nha-uy-tin.sql` (tự cuộn lại, thay tạm hạng): bản cũ 3/5 HONG (căn người Đồng cập nhật sau đứng trước), kèm migration 5/5 OK (gồm "căn khớp hơn của người Đồng vẫn đứng đầu"); hàm thật với `service_role`: điểm 85 → 3, 76–78 → 2. Migration CHƯA áp — chờ chủ dự án duyệt.
### SRS-5.1zzzzzzz359 · Bot không hỏi khách phường: hệ thống tự xác định (cũ → mới, toạ độ bản đồ, kho đường / hẻm), không ra thì báo người phụ trách (02/11/2026)
Quyết định chủ dự án 02/11 (nguyên văn): "tên phường mới, tên phường cũ được tự động chuyển thành phường mới bằng cách gắn lên bản đồ để biết chứ không hỏi khách". Ca thật 01–02/11: (a) khách duyệt "Ok" → "Chỉ cần thêm phường là em đưa tin lên web ngay. Phường 6 cũ giờ chia về … nhà anh thuộc phường nào ạ?"; (b) "ừ đăng đi em" → "em tra ra khu này là Xã Nhà Bè, nhà anh thuộc xã này đúng không?".
(1) Lớp lỗi: một ô hệ thống TỰ TRA ĐƯỢC vẫn nằm trong luồng hỏi khách — phường là ô bắt buộc (`blocking_fields`) và đứng ngay sau địa chỉ trong thứ tự hỏi; khối địa danh / cổng web dặn "kể phường cho khách chọn", "hỏi xác nhận"; tra số nhà không ra thì "bot hỏi như cũ". Sửa: `schema.O_HE_THONG_TRA` (phường không bao giờ là câu hỏi; bỏ khỏi ô bắt buộc, cụm hỏi, hỏi sau ra tin); `Engine._phuong_tu_dia_chi` tra theo thứ tự (1) bản đồ đúng số nhà, (2) toạ độ điểm hẻm / Nominatim → RPC `phuong_tai_diem(lat, lng)` (SRS-360 phía web·DB; chưa có thì bỏ qua), (3) kho hẻm / kho đường chỉ một phường — cả khi khách nói phường cũ đã chia (kết quả phải thuộc các phường mới của nó); cổng web: một ứng viên → ghi luôn, không ra → báo người phụ trách MỘT lần ngay lượt đầu, không hỏi khách; bỏ các khối "hỏi phường" (SRS-115 / 191 / 212 / 214 mục 8 / 215 / 228 / 240), không chỉ thêm câu cấm. Phường cũ → MỘT phường mới giữ đường cũ (SRS-220).
(2) Cùng lớp (mọi chỗ bot hỏi ô hệ thống tự tra được): quận / tỉnh / xã không có trong thứ tự hỏi (đã kiểm `missing_fields` 6 loại); xã → tỉnh đã có (SRS-128). Còn: căn hộ có tên dự án trong kho vẫn hỏi `dia_chi` (địa chỉ dự án có trong `projects`) — chưa sửa. DB còn chặn tin lên web khi thiếu `ward` (`_COT_DANG_TIN`, trigger) — việc phiên web·DB, cần cùng đợt để ca (a) lên web khi phường trống.
(3) Kiểm: `test_phuong_he_thong_tu_tra_359.py` (không loại nào hỏi phường; toạ độ qua RPC, RPC chưa có thì bỏ qua; cách nói mới "mặt tiền đường Lê Văn Lương" chỉ tên đường → kho một xã ghi luôn; cổng web ca (a) / (b)) — trả `phuong` vào ô bắt buộc: đỏ; tắt ghi ứng viên duy nhất ở cổng web: đỏ. 15 bài cũ khoá hành vi hỏi phường viết lại theo luật mới.
(Bổ sung 02/11, cùng PR SRS-366/367): RPC thật của SRS-360 (#281) là `phuong_tai_diem(p_lat, p_lng)` — lõi gọi `{"lat","lng"}` nên mọi lượt tra toạ độ lỗi và bị bỏ qua; sửa tên tham số, bài `test_phuong_he_thong_tu_tra_359` khoá chữ ký (đỏ khi về tên cũ).

### SRS-5.1zzzzzzz358 · Dữ kiện "nhắn khách khi có căn mới (trong 8–20 giờ)" đọc thành "8–20 tiếng nữa" (02/11/2026)
Ca gốc: khách ảo #274 — hai persona đều nhận "hệ thống sẽ nhắn anh trong khoảng 8–20 giờ tới" và ghi là không hiểu; ý thật là khung giờ 8h–20h.
(1) Lớp lỗi: dữ kiện đưa model mơ hồ ĐƠN VỊ (thời điểm hay thời lượng) — `mua.khoi_can_cho_khach` ghi "(trong 8–20 giờ)". Sửa: "(chỉ gửi trong khung giờ 8h–20h hằng ngày)".
(2) Cùng lớp: soát chuỗi đưa model có số + giờ / ngày / phút ở `mua`, `prompts`, `engine`, `agent_*`, `phap_ly`: dòng "báo căn mới ĐÃ BẬT" ở `engine` ("trong giờ 8–20h") có mốc đồng hồ — giữ (phiên test cùng kết luận, ca 357 khoá nguyên văn); khoảng ngày ở `phap_ly` là thời lượng thật. Hai mô tả "8–20 giờ" trong `cau_mau.py` (dòng 115, 172) để phiên web·DB (file giao cho phiên đó vòng này).
(3) Kiểm: gỡ `xfail` `test_khung_gio_8_20_357.py` (không sửa assert); `test_khung_gio_ro_don_vi_358.py` thêm cách nói "8 đến 20 tiếng" — trả câu cũ: đỏ.

### SRS-5.1zzzzzzz355 · Khách hỏi phí lần hai: bot đọc lại nguyên bài chính sách lượt trước (02/11/2026)
Ca gốc: `srd_phi` lượt 9 ("Anh là chính chủ, vậy phí bao nhiêu em?") gần như dán lại lượt 8 — đủ bốn ý chính sách lần nữa, cùng câu mở.
(1) Lớp lỗi: khối ưu tiên phí lượt nào cũng dặn "nói cho ĐỦ các ý chính sách" (SRS-318) mà không biết lượt trước đã nói, dù code có cờ `_phi_da_bao`; luật "không mở / lặp như lượt trước" (`lap`) ở nhóm `mem` (SRS-298) nên chỉ ghi log. Sửa: cờ đã bật từ lượt trước thì khối đổi sang "đáp đúng điều vừa hỏi, câu mở khác, không nhắc lại chính sách"; con số phí vẫn từ dòng VAI NGƯỜI RAO.
(2) Cùng lớp: khối dặn "đủ" khác — báo phí lúc duyệt dùng `phi_da_bao` sẵn (SRS-212). `lap` vẫn ở `mem` (quyết định SRS-298, không đổi ở đây).
(3) Kiểm: `test_phi_hoi_lan_hai_355.py` (lần đầu đủ chính sách, lần hai không; cách nói mới "thế em lấy anh mấy phần trăm") — bỏ nhánh mới: đỏ.

### SRS-5.1zzzzzzz354 · Tin kể căn bị đọc nhầm là xin bản vẽ: lượt cắt sớm, mất giá và loại nhà (02/11/2026)
Ca gốc: `lakeview` lượt 1 (lúc có lúc không) "Em gửi căn nhà phố LakeView City, 5x20, 1 trệt 3 lầu, 4 phòng ngủ, giá 27 tỷ" → câu mẫu `chua_co_ban_ve`, mất giá 27 tỷ, mất loại nhà phố.
(1) Lớp lỗi / điều kiện bật: AI bóc tách điền `xin_xem_ban_ve` (mô tả ô có "xin gửi bản vẽ", khách nói "em GỬI căn"; ô nhận theo ý AI từ Q5, không cụm trích) → nhánh xin bản vẽ trả lời và `return` TRƯỚC bước ghi ô, nên dữ liệu cùng lượt bị bỏ. Sửa: chỉ cắt sớm khi cùng lượt AI KHÔNG có thao tác ghi ô (`update` / `add` có `fields`) — kiểm cấu trúc đầu ra AI, không đọc chữ khách; mô tả ô dặn khách tự gửi / kể căn thì bỏ trống.
(2) Cùng lớp: nhánh câu hỏi dự án (`cau_hoi_du_an`) cũng `return` trước bước ghi ô — GIỮ, vì cố ý (SRS cũ: câu hỏi "lô 42 và 50?" từng bị đọc thành thêm căn).
(3) Kiểm: `test_ke_can_khong_phai_xin_ban_ve_354.py` (ca lakeview + cách nói mới "Gửi em căn shophouse … 18 tỷ"; xin bản vẽ thật vẫn trả lời bản vẽ) — bỏ điều kiện: đỏ.
### SRS-5.1zzzzzzz356 · Câu mẫu nói chữ "rổ" / "rổ hàng" với khách — lưới `tu_noi_bo` không với tới câu mẫu (02/11/2026)
Ca gốc (phiên test, #270): `da_an_het`, `da_cap_nhat_ro`, `giu_nguyen_ro`, `nhap_bang_tinh`, `chua_co_ban_ve` ("Em không đụng gì tới rổ hàng") nói "rổ" với khách; câu mẫu không qua `_soat_hinh_thuc` nên lưới SRS-343 không bắt. Sửa: chữ trong `cau_mau.py` ("các tin của {goi}", "các tin", "danh sách tin"; không thêm chỗ trống mới); migration `20261102d_cau_mau_bo_chu_ro` (cách 20261027e: chỉ đổi dòng `cau = mac_dinh` — soát DB 02/11: cả 5 dòng chưa ai sửa tay) — CHƯA áp, chờ chủ dự án duyệt.
(1) Lớp lỗi: lưới soát chữ chỉ đặt trên lời model; chữ code / câu mẫu đi đường riêng tới khách. (2) Cùng lớp — soát mọi chuỗi có "rổ" trong `src/aioi`: còn 4 chuỗi code tự ghép gửi khách KHÔNG qua lưới, cùng ở `engine.py` (làn bot, chưa sửa ở PR này): bảng giá 0 căn "cho căn nào vào rổ rao" (~3885), nhập bảng giá "vào rổ hàng" / "rổ hàng đã có đủ" (~3898, ~3900), `{viec}` mặc định "đổi trạng thái rao của rổ hàng" của `xac_nhan_an` (~5489). `gui_nhac` / `bao_can_moi` / `hoi_con_ban` / `giu_ket_noi`: không có. `lenh_zalo` có nhưng là tin debug `$$$$$` (người thử gõ lệnh), không phải lời khách.
(3) Kiểm: `tests/test_cau_mau_khong_tu_noi_bo_356.py` dùng chính `engine._TU_NOI_BO_RE` (một nguồn): mọi câu mẫu, câu đã điền, và câu trong migration — trả `cau_mau.py` về cũ → 3/3 đỏ.



### SRS-5.1zzzzzzz353 · Lời chat nhận xét giá / thị trường: AI đọc nghĩa, code kiểm cụm trích; từ khoá chỉ đỡ khi AI không chạy (02/11/2026)
Ca gốc: việc để sau đóng gói của SRS-336 — lời CHAT vẫn soát bằng lưới từ khoá `_BINH_LUAN_GIA`, đổi chữ là lọt ("tầm 9 tỷ là dễ chịu lắm rồi", "nhà cỡ đó đi nhanh lắm").
(1) Lớp lỗi: quyết định "có phải nhận xét giá" nằm ở danh sách từ khoá (§4.8). Sửa: lọc thô trên LỜI BOT (câu khẳng định có số tiền / giá / thị trường, hay lưới cũ trúng) → AI bóc tách đọc nghĩa (`SOAT_BINH_GIA_CHAT_SYSTEM`, có cả khẳng định thị trường như SRS-132) → code nhận cụm có nguyên văn; AI lỗi / trả thiếu `cum` thì lưới cũ đỡ. Không có lượt AI sau lời bot nào để gộp, nên lọc thô giữ số lần gọi thấp: ước lượng trên bản ghi chấm 02/11 là +38 lần gọi model bóc tách / 201 lượt (38 / 165 lượt chat trúng lọc thô); lượt chấm độc lập của #273 đo thật +58.
(2) Cùng lớp: bản tin đã đi đường AI (SRS-336); `_binh_gia_trong_tin` dùng chung, trả `None` khi AI không chạy.
(3) Kiểm: `test_binh_gia_chat_353.py` (2 cách nói mới lưới cũ bỏ lọt; AI nói không thì không gọi lại dù lưới cũ trúng; AI hỏng thì lưới cũ đỡ; câu hỏi giá / không nhắc giá không gọi AI) — bỏ đường AI: 2 đỏ.

### SRS-5.1zzzzzzz352 · Lượt gọi lại duy nhất nhận bản viết lại mà không soát lại: "4 tầng", "72m²" ra tới khách (02/11/2026)
Ca gốc: SRS-350 — `cao_lo` lượt 8 (lưới `goi_minh` tiêu lượt gọi lại, bản viết lại thêm "4 tầng"); `ka_lo_trinh_tu` (bản viết lại tự nhân 4×18 = "72m²").
(1) Lớp lỗi: `_soat_hinh_thuc` soát → gọi lại MỘT lần → nhận bản mới không soát, nên mọi luật `ly_do` chỉ giữ được bản đầu. Sửa: soát lại bản viết lại bằng chính `LUAT_SOAT` (code, KHÔNG gọi model viết lời lần hai); còn lệch thì giữ bản ít lệch SỰ THẬT hơn (`LUAT_SU_THAT`: riêng tư, khẳng định, phí, tin đang hiện, bình giá, số bịa), rồi tới ít lệch hình thức; hoà thì giữ bản viết lại. Lượt viết lại là bản tin / lời có giá thì lưới bình giá gọi AI bóc tách thêm một lần.
(2) Cùng lớp: mọi dòng `ly_do` đều được soát trên bản viết lại; `test_sua_ban_tin_theo_y_27_10` thêm `_duong_vao` vào dữ kiện vì bản viết lại của bài đó khẳng định "mặt tiền" khi dữ liệu chưa có — lưới mới bắt đúng.
(3) Kiểm: `test_goi_lai_mot_lan_350.py` gỡ `xfail`; thêm ca "72m²" (cách nói mới) và ca bản viết lại sạch thì nhận — nhận luôn bản viết lại như cũ: 2 đỏ.

### SRS-5.1zzzzzzz351 · Cổng web đỏ oan vì `next/font/google`: ghim font Plus Jakarta Sans trong repo, dựng không cần mạng (02/11/2026)
Ca gốc: cổng "Web — kiểu dữ liệu + dựng" đỏ oan 3 lần 02/11 (#250, #254, #265): `next/font` → `TypeError: Cannot read properties of null (reading '1')` ở `@next/font/dist/google/loader.js` — mỗi lượt dựng tải metadata font từ Google, runner lúc lấy được lúc không.
(1) Lớp lỗi: bước dựng phụ thuộc dịch vụ ngoài. (2) Cùng lớp: dựng trong namespace không mạng (`unshare -n bun run build`) chỉ hỏng ở font — không chỗ nào khác gọi ra ngoài lúc dựng. Sửa: `app/fonts/` ba woff2 variable 200–800 (latin / vietnamese / latin-ext, fontsource 5.3.0, OFL kèm theo), `next/font/local` mỗi subset một lần gọi kèm `unicode-range`; `--font-jakarta` (globals.css) ghép ba họ, chỉ họ cuối giữ font dự phòng chỉnh cỡ.
(3) Kiểm: `unshare -n bun run build` — bản cũ đỏ ("Failed to fetch Plus Jakarta Sans from Google Fonts"), bản mới xanh; CSS dựng có 3 `@font-face` đủ `unicode-range`; Playwright trên `next start`: tiêu đề "Tìm nhà Sài Gòn…" ra `jakartaLatin, jakartaViet, …`, `document.fonts.check` đúng cho chữ có dấu, 0 lượt gọi fonts.googleapis/gstatic; `giam-egress.mjs` G-08 cấm import `next/font/google` (đỏ khi trả bản cũ).

### SRS-5.1zzzzzzz357 · Khách ảo vòng sau đóng gói: dữ kiện "(trong 8–20 giờ)" thành mốc hẹn bịa; phép `ka_hua_suong` neo chữ nên 4/5 câu lọt (02/11/2026)
Ca gốc: khách ảo trên main `5e934ae` (lõi y `8591638`), 5 persona, khách tự chấm 4 · 2 · 2 · 2 · 3 sao. HAI persona khác nhau (khách 4 nhà đầu tư, khách 5 thuê) nhận cùng câu "hệ thống sẽ nhắn em/anh **trong khoảng 8–20 giờ tới**", và CẢ HAI tự ghi đó là chỗ không hiểu; giám khảo xếp mức nặng.
(1) Lớp lỗi: không phải model nói sai — `mua.khoi_can_cho_khach` đưa dữ kiện "(trong 8–20 giờ)", tiếng Việt đọc là THỜI LƯỢNG (8–20 tiếng nữa) trong khi ý thật là KHUNG GIỜ ĐỒNG HỒ 8h–20h. Model chuyển đúng điều prompt nói nên thành cam kết thời hạn hệ thống không hứa. Lớp lỗi thật: dữ kiện đưa model mơ hồ về ĐƠN VỊ (thời điểm / thời lượng). (2) Cùng lớp: soát mọi chỗ "8–20" trong lõi — `engine.py` ("trong giờ 8–20h") và `bao_can_moi` / `giu_ket_noi` / `gui_nhac` / `hoi_con_ban` / `server` / `cau_mau` đều có mốc hoặc chữ "khung"; CHỈ dòng `mua.py` vào prompt mà thiếu. Sửa ở lõi là việc phiên lõi.
Phép chấm tự sai: `ka_hua_suong` (SRS-342) neo vào chữ — "chủ nhà trả lời **thì** em báo" — nên 4 trong 5 câu production lọt ("trả lời **là** em báo", "xác nhận thì em báo", "đã ghi lịch xem … chiều tối cuối tuần này", câu 8–20 giờ). Cùng lớp §4.8 như SRS-350, lần này ở phép của phiên kiểm → chuyển sang giám khảo đọc nghĩa (việc thứ tám `hua_suong`, bật riêng nên mẫu số bộ `ban.json` giữ 760).
Hai phát hiện của giám khảo tôi KHÔNG nhận: (a) "trích nhầm `phong_tro`" — khách 5 nói nguyên văn "em đang tìm **phòng thuê** ở Q7", ghi `phong_tro` là đúng §6.2 (ô chỉ ghi điều khách nói); giám khảo so với vai ẩn, không so lời khách. (b) dòng "$$$$$ Đã trích xuất" lọt khung chat là công tắc `DONG_TRICH_XUAT = bat` của giai đoạn test, không phải lỗi.
(3) Kiểm: `tests/test_khung_gio_8_20_357.py` — xfail(strict); chiều ngược đã kiểm: đổi dòng thành "(trong khung giờ 8h–20h)" thì ca XPASS. Hai bài chốt tiền đề xanh (khối này thật sự hứa báo lại; cách viết rõ đã có sẵn trong lõi nên đây là lệch một chỗ).

### SRS-5.1zzzzzzz350 · Ba phép chấm bắt oan (gọi khách "mình", số bịa, hỏi lại căn nào); lượt gọi lại duy nhất bị tiêu vào phép bắt oan (02/11/2026)
Ca gốc: soát lại từng dòng đỏ của lượt chấm đóng gói main `2d68576` thấy 7 trong 12 phép tất định đỏ là BẮT OAN — `cao_lo` l8/l9, `nct_q5` l3, `ma_lo_7m` l7, `ban_gap_lo_ly_do` l3, `so_lech_so` l4 ("theo ý mình" / "đứng tên mình" / "mình" nghĩa CHÚNG TA, đều đúng luật: CLAUDE.md chỉ cấm "mình" ĐẠI TỪ NGÔI HAI), `cao_lo` l9 số bịa "4 tầng" nằm ở LỜI CHAT (suy đúng từ "1 trệt 3 lầu", §6.3 cho phép), và `hai_can_da_ban` l2 hỏi lại đúng nghĩa bằng chữ khác ("hay nhà mặt tiền Phạm Hùng") mà regex `/căn nào|hay căn/` không nhận.
(1) Lớp lỗi: cả ba đều là §4.8 ở phía BỘ CHẤM — regex đoán nghĩa trên lời bot: không đọc được phản thân / sở hữu, không phân biệt lời chat với bản tin, không nhận cách nói mới. Hậu quả nặng hơn đo sai: phép bắt oan làm phiên kiểm đi sửa lõi chỗ không hỏng, và trên LÕI thì cùng một lưới `_soat_goi_minh` tiêu LƯỢT GỌI LẠI DUY NHẤT (`_soat_hinh_thuc` chỉ gọi lại một lần, SRS-298) — `cao_lo` l8 gọi lại vì "mình", bản viết lại thêm "4 tầng" và KHÔNG được soát vòng hai, nên số bịa ra tới khách. (2) Cùng lớp: soát hết phép tất định trong `cham.py` — `da`, `binh_gia`, `nhieu_hoi`, `ghi_nhan`, `lap_mo_dau` đều dùng chung một nguồn với lõi và không đoán nghĩa, giữ; phép `luot` / `cam` của từng kịch bản còn là regex, nhưng ở đó kiểm ĐÚNG CHỮ là chủ ý.
Sửa (chỉ `scripts/` + `tests/`, không chạm lõi): `goi_khach_la_minh` → việc thứ sáu của giám khảo (`goi_minh`, MỌI kịch bản, trừ hẳn đoạn sau 📋 vì bản tin nói với người MUA); số bịa chỉ soát phần sau 📋; `hai_can_da_ban` đổi regex lượt 2 sang việc thứ bảy `tu_chon_can` (bật riêng). Mẫu số tổng GIỮ NGUYÊN 760: tất định 582 → 522, giám khảo +60.
(3) Kiểm — chấm lại `final-1.json` (bản ghi cũ đã biết số, đúng bài học SRS-348): tất định 570/582 → 516/522; 6 phép đỏ biến mất, đúng 6 ca bắt oan ở trên, không ca nào mới. Số bịa: trên đúng lượt `cao_lo` l9, "4 tầng" có ở cả lời nhưng KHÔNG có ở phần sau 📋 → phép mới thôi gắn. Ca đỏ lượt gọi lại: `tests/test_goi_lai_mot_lan_350.py` — xfail(strict); chiều ngược đã kiểm: thêm một vòng soát bản viết lại vào `_soat_hinh_thuc` thì ca XPASS. Năm phép còn đỏ (`lakeview` ×3, `srd_phi`, `aeon_tan_phu`) là lỗi lõi thật, để nguyên.

### SRS-5.1zzzzzzz349 · Khối ĐIỂM TIN tự gắn số /100 vào HẠNG của người rao: bot nói "anh đang hạng Vàng (94/100)" trên production (02/11/2026)
Ca gốc: lượt chấm đóng gói main `2d68576` ra lộ luật 11/59, 10 trong đó là lượt ra bản nháp nói "Tin này đang được 89/100 điểm, anh đang hạng Vàng (94/100)". Cùng câu đó có trên PRODUCTION: `ban-thu-ban` run 41429007819 in hai lần, mà bộ đó vẫn 54/54 vì không có phép nào soi.
(1) Lớp lỗi: `prompts.khoi_diem_tin` in dòng dữ liệu `"Người rao: hạng {hang} ({diem_nguoi}/100)"` — tự gộp HẠNG với một số /100 — rồi dòng sau mới dặn "không gọi hạng là điểm". Lời dặn mâu thuẫn với dữ liệu đưa kèm, nên bot lặp lại đúng điều khối đưa; không phải bot không nghe lời. Khối này trước SRS-336 chỉ có ở lượt hỏi ô, nay có ở MỌI lượt ra bản nháp nên lộ ra 10 lượt. (2) Cùng lớp: soát các khối dữ kiện khác phía bán — chỉ khối này gộp hai thang đo khác loại vào một dòng.
Sửa (phiên lõi; chủ dự án 02/11 qua điều phối: hạng Đồng / Bạc / Vàng là của NGƯỜI RAO, chỉ nói bằng TÊN, không số): `khoi_diem_tin` bỏ tham số `diem_nguoi`, khối ghi hai nhãn riêng "ĐIỂM TIN (của căn): x/100" và "HẠNG NGƯỜI RAO: Vàng", dặn không đặt hạng chung câu với điểm tin. Cùng lớp đã soát: `TurnResult.user_score` / `tier` chỉ trả bridge, `index.mjs` không đưa cho khách; câu mẫu, `che_do_test` (tin phụ $$$$$), `gui_nhac` không có điểm người rao.
(3) Kiểm: `test_noi_loi_hua_27_10::test_hang_nguoi_rao_khong_kem_so_349` (khối chỉ một số /100, không số nào liền tên hạng; cách nói mới "anh là hạng gì rồi, mấy sao vậy em") — trả dòng `hạng {hang} (…/100)` cũ: 2 đỏ. Phép thử tách biến — cùng bộ chấm, bản ghi #266 (`6adfbb0`, khối chỉ ở lượt hỏi ô) → lộ luật 0; bản ghi main → 11. Lượt chấm "ĐẠT" báo ở #266 chạy trên head CŨ: nhánh được đẩy thêm commit sau khi dựng worktree (`git diff 6adfbb0 eebd948 -- src/aioi/` = 3 tệp).

### SRS-5.1zzzzzzz348 · Thang chấm thiếu dòng "Không có → []" của lo_luat (nhất quán rubric, KHÔNG phải nguyên nhân số lộ luật) (02/11/2026)
Ca gốc: khi viết lại đoạn `lo_luat` ở SRS-346 (#265, đã gộp), phiên kiểm làm mất dòng `"Không có → []."`; ba việc còn lại (`hoi_lai`, `da_doi`, `diem_sai_luc`) vẫn có.
(1) Lớp lỗi: sửa thang chấm mà không chấm lại ngay trên một bản ghi cũ đã biết số — `--cham-lai --giong` dựng ở SRS-341 đúng để làm việc đó. (2) Cùng lớp: soát cả bốn việc, nay đủ 4 dòng.
Sửa: khôi phục dòng đó.
(3) Kiểm: chấm lại CÙNG bản ghi `final-1.json` → lộ luật 12 → 11, tức tác dụng nhỏ, cùng cỡ nhiễu giám khảo. **ĐÍNH CHÍNH bản đầu của mục này**: tôi đã viết dòng thiếu là nguyên nhân lộ luật nhảy 0 → 12 — SAI. Phép thử tách biến (cùng bộ chấm, hai bản ghi) cho: bản ghi #266 → 0, bản ghi main → 11. Nguyên nhân ở LÕI, ghi ở SRS-349. Bài học: đoán nguyên nhân thì chạy phép thử tách biến trước khi viết.

### SRS-5.1zzzzzzz347 · Bịa tiện ích bằng "nằm sát / đối diện / kề" lọt cả hai phép chấm (02/11/2026)
Ca gốc: khách ảo 02/11 SAU #260 — bot nói "Căn trên đường Quang Trung, 69 m², 2,7 tỷ, **nằm sát Co-opmart**", rồi khi khách hỏi lấy đâu ra thì tự nhận "Trong thông tin em đang có về ba căn này thì không ghi những chỗ đó".
(1) Lớp lỗi của phép ĐO: phép `ka_bia_tien_ich` cả bản đầu (phiên kiểm, SRS-342) lẫn bản thu hẹp (#266, SRS-336) đều neo vào chữ "gần", nên mọi cách nói khoảng cách khác đều lọt — y lớp lỗi từ khoá §4.8, lần này ở phía bộ chấm. (2) Cùng lớp: soát các phép `cam` còn lại trong `khach_ao_342.json` — chỉ phép này neo vào một giới từ; các phép khác neo vào con số hay tên riêng.
Sửa (KHÔNG đụng `src/aioi/`): thêm nhánh `(?:nằm sát|sát bên|ngay sát|kề|đối diện|cạnh) + tên riêng` vào phép của `ka_bia_tien_ich`; ghi vào mô tả kịch bản rằng phép chỉ đúng khi `ro_hang` của nó KHÔNG có tiện ích nào.
(3) Kiểm hai chiều: bắt 6/6 câu bịa đã gặp (gồm "nằm sát Co-opmart" mà hai phép trước bỏ lọt) và tha 4/4 câu hợp luật ("Tin chưa ghi căn này gần trường mầm non nào", "Nhà nằm sát mặt tiền đường lớn nên thường ồn hơn").

### SRS-5.1zzzzzzz346 · Điểm tin chỉ được nhắc LÚC RA TIN hoặc khi khách tự hỏi; "nhắc điểm sai lúc" là loại lỗi riêng (02/11/2026)
Chủ dự án 02/11, chính xác hơn SRS-345: bot chỉ được nhắc điểm tin x/100, hạng người rao và cách tăng điểm (a) ở lượt RA TIN — có bản nháp 📋 hay báo tin đã lên, hoặc (b) khi KHÁCH TỰ HỎI về điểm / hạng / lên Top. Ở lượt đang hỏi ô thì không được nhắc: "có sổ hồng thì tin lên điểm nhiều luôn" là SAI LUẬT.
(1) Lớp lỗi của phép ĐO: SRS-345 miễn trừ quá rộng (mọi lúc), nên bỏ lọt chuyện nhắc sai lúc; trước đó lại trừ quá rộng (mọi lúc đều là lộ luật). Cả hai đều do phép đo không biết NGỮ CẢNH LƯỢT — thứ regex không đọc được. (2) Cùng lớp: `da_doi` (SRS-342) cũng là phán xét theo ngữ cảnh và đã để giám khảo đọc nghĩa; làm y vậy ở đây.
Sửa: `TIEU_CHI_LO_LUAT` nói rõ nhắc điểm KHÔNG BAO GIỜ là lộ luật (kể cả sai lúc), chỉ lẫn điểm / hạng mới là lộ; thêm việc thứ năm `diem_sai_luc` cho giám khảo, bật riêng từng kịch bản bằng `kiem.khong_diem_sai_luc` nên mẫu số giữ nguyên. `ka_diem_tin_dung_chu` thành HAI VẾ: lượt 1 và 3 bot hỏi ô → nhắc điểm là đỏ (`luot_khong`); lượt 2 khách tự hỏi Top → không có phép cấm nào.
(3) Kiểm: `test:py` 1353 passed, 6 xfailed; lưới đỡ tất định của vế 1 bắt 3/3 câu sai lúc và tha 2/2 câu hỏi ô bình thường.

### SRS-5.1zzzzzzz345 · Điểm của TIN khác hạng của NGƯỜI RAO: thang chấm thôi tính "78/100" là lộ luật; kịch bản đảo sang kiểm đúng chữ (02/11/2026)
Chủ dự án 02/11: Đồng / Bạc / Vàng là HẠNG của người rao, x/100 là ĐIỂM của tin BĐS, và SRS-216 giữ nguyên — bot ĐƯỢC nói điểm tin với người bán. Nên "căn này đang 78/100" và "Có thông tin này, tin của mình lên điểm nhiều luôn" KHÔNG phải lộ luật.
(1) Lớp lỗi (của phép ĐO, không của bot): `TIEU_CHI_LO_LUAT` gộp "hạng, điểm hiển thị" thành một nên trừ oan hành vi chủ dự án cho phép — cùng lớp với giọng rao chợ ở SRS-341, và cùng lớp với hai phép chấm tự sai ở SRS-342. Chính tôi đưa kịch bản `ka_lo_diem_tin` vào #263 nên đây là sửa lỗi của mình. (2) Cùng lớp: soát lại mọi phép `cam` tự thêm trong `khach_ao_342.json` theo các quyết định §6.3 — còn lại đều cấm điều chưa được chủ dự án cho phép.
Sửa: `TIEU_CHI_LO_LUAT` bỏ "hạng, điểm hiển thị" khỏi danh sách lộ và thêm đoạn miễn trừ, CHỈ tính khi lẫn hai thứ; `ka_lo_diem_tin` → `ka_diem_tin_dung_chu`, phép cấm đảo sang bắt chuyện lẫn (gọi điểm là hạng, gọi hạng là điểm, gán điểm của tin cho người).
(3) Kiểm: phép mới bắt 4/4 câu lẫn ("Tin của anh đang hạng 78/100", "Anh đang 78/100", "Tin này đang hạng Vàng", "Điểm Bạc của anh") và tha 4/4 câu đúng luật. Hệ quả cho nền: lộ luật của #250 từ 3 còn 1.

### SRS-5.1zzzzzzz344 · `cat_truoc_mo_dau` sửa lời xưng hô ĐÚNG thành sai (02/11/2026)
Ca gốc: soát chỗ gọi `mo_dau_nhap` còn sót đã nêu ở SRS-342.
(1) Lớp lỗi: `prompts.cat_truoc_mo_dau` cũng ép `xung_ho if xung_ho in _TRE else "em"`, và nặng hơn ca 1: model viết ĐÚNG "📋 Cháu sẽ rao như vầy nhé cô:" mà hàm SỬA thành "nhé em:" — lõi tự làm hỏng một lời đã đúng.
Sửa (KHÔNG đụng `src/aioi/`): ca tất định cho `cat_truoc_mo_dau` kèm cách gọi "chú" chưa bắn. Phần "lộ điểm tin" của bản đầu đã bỏ theo quyết định chủ dự án (SRS-345).
(3) Kiểm: ca này dựng là ca chờ, và bản sửa SRS-336 (#266) chữa chung gốc `_TRE` nên NAY XANH — đúng như ca dự đoán lúc dựng ("sửa một chỗ thì hai ca cùng xanh"); đã gỡ `xfail`, giữ làm ca hồi quy. `test:py` 1375 passed, 0 xfailed.

### SRS-5.1zzzzzzz343 · Người bán nhiều căn báo "căn đó bán rồi": AI bóc tách bỏ sót thao tác thì bot không tự chọn căn / chúc mừng; khối hỏi lại không lộ chữ "rổ" (02/11/2026)
Ca gốc (phiên test độc lập, cham `hai_can_da_ban` 2/2 trượt sau #260; cũng gặp trên nền): "à căn đó anh bán được rồi em nhé" với 2 căn → bot "chốt được căn mặt tiền Phạm Hùng rồi!" mà dữ liệu vẫn "đang bán"; lượt khác "Em chưa đổi gì trong rổ hết".
(1) Lớp lỗi: lời đúng chỉ khi AI bóc tách TẠO thao tác `set_status` (cổng `_chua_ro_can` mới bật khối hỏi lại); lượt Haiku bỏ sót thao tác thì model viết lời không có dữ kiện, tự chọn căn. Không phải do #260 (phía mua). Sửa: rổ ≥ 2 căn mà lượt này không có `set_status` → dữ kiện hệ thống "lượt này KHÔNG đổi trạng thái căn nào", model đọc nghĩa lời khách và hỏi lại (không từ khoá trên lời khách); bỏ chữ "rổ" khỏi khối hỏi lại, nhãn việc `hoi_can_nao` và mô tả công cụ `agent_ban`.
(2) Cùng lớp: mọi khối / công cụ prompt phía bán có chữ "rổ" (đã sửa 4 chỗ; còn ở prompt bóc tách — model đó không viết lời khách); thêm lưới `tu_noi_bo` trên LỜI BOT (không đọc lời khách) bắt "rổ" / "rổ hàng" → gọi lại một lần (ca 3 của SRS-342, gỡ `xfail`).
(3) Kiểm: `test_hai_can_da_ban_343.py` (3 cách nói, 2 mới: "chốt khách rồi em ơi, có người cọc rồi", "xong một căn rồi nha"; gỡ bản sửa → 2/3 đỏ).

### SRS-5.1zzzzzzz342 · Ca đỏ từ khách ảo và lượt chấm 02/11; sửa hai phép chấm tự sai; bộ chấm nhận rổ hàng (02/11/2026)
Ca gốc: ba lượt khách ảo + bốn lượt chấm 02/11. Bịa tiện ích ("gần trường Hồng Hà", rồi sau #260 là "gần Vincom Plaza Quang Trung khoảng 100 m" — bot tự nhận tin không ghi); dòng mở bản nháp gọi khách 62 tuổi xưng "cô" là "em"; lộ "căn này đang 78/100", "trong rổ", "phần giá để lát nữa em hỏi sau", "chỉ thiếu loại hình là em lên bản nháp liền"; bản tin bình luận giá "giá còn mềm mỏng thế này", "có cửa bớt lộc"; hứa suông "đã chuyển câu hỏi cho chủ nhà" (cả 5 persona).
(1) Lớp lỗi phép chấm: `hai_can_da_ban` dùng regex `(đổi).{0,40}đã bán` nên câu PHỦ ĐỊNH đúng ("em chưa đổi gì trong rổ hết") bị tính là phạm — đúng lỗi "máy đoán ý bằng từ khoá" (§4.8); `ngan_binh_long` để phép cấm `sổ (hồng|đỏ)` ở `cam` (mọi lượt) nên câu bot HỎI để thu ô pháp lý cũng phạm, dù lỗi gốc là bản tin tự thêm. (2) Cùng lớp: soát hết `cam` của ban.json — chỉ hai chỗ này lẫn giữa "lời chat" và "bản tin"; `_BINH_LUAN_GIA` cũng là lưới từ khoá và bỏ lọt "tầm giá này dễ chịu lắm rồi" / "có cửa bớt lộc" (ca chờ riêng).
Sửa (KHÔNG đụng `src/aioi/`): `hai_can_da_ban` chuyển sang phép đọc nghĩa `khong_da_doi` do giám khảo chấm (việc thứ tư `da_doi`, bật riêng từng kịch bản để mẫu số giữ 760); `ngan_binh_long` chuyển sang `ban_tin_khong`; `cham-kich-ban.py` nhận khoá `ro_hang` (căn kho trả khách mua) — trước đó mọi kịch bản phía mua chạy rổ TRỐNG nên không chấm được lời bot kể căn.
(3) Kiểm: `test:py` 1350 passed, 5 xfailed; chấm lại bản ghi cũ sau khi sửa hai phép → 579/582 thay vì 578/583, hai phép trượt oan hết, mẫu số tổng vẫn 760. `ka_bia_tien_ich` và `ka_lo_diem_tin` ĐỎ khi chạy thử.

### SRS-5.1zzzzzzz341 · Thang chấm giọng không trừ điểm giọng rao chợ chủ dự án đã chốt; chấm lại giám khảo trên cùng bản ghi (02/11/2026)
Ca gốc: hai lượt chấm 02/11 có 6/10 cuộc bị giọng 2 với lý do "giọng quảng cáo khuôn, giục ép" — trích `mat_bang_thue` "Chần chừ một chút là có người ký trước, anh chị tiếc hùi hụi đó nghen!", `dat_nen_long_an` "chần chừ là người khác nhanh chân chốt mất". Theo CLAUDE.md §6.3 giọng rao chợ là quyết định chủ dự án, nên giám khảo đang trừ chính điều đã chốt.
(1) Lớp lỗi: thang chấm giám khảo không biết các quyết định của chủ dự án, nên trần điểm giọng bị rubric kẹp chứ không phải bot kém — cùng lớp với SRS-318 (xưng hô, 4 ý phí) đã miễn trước đó. (2) Cùng lớp: đã soát các quyết định §6.3 còn lại — hạng Đồng/Bạc/Vàng và "Em xin phép đăng tin ạ!" chưa bị trừ ở hai lượt chấm, chưa cần miễn; `DONG_TRICH_XUAT` làm méo điểm khách ảo nhưng là công tắc production, đã báo điều phối, không sửa ở đây.
Sửa (chỉ bộ chấm, KHÔNG đụng lõi): `TIEU_CHI_GIONG` thêm đoạn "GIỌNG TIN RAO" — không trừ vì bản tin rao chợ / có một câu chốt giục; VẪN trừ khi câu giục dựng ra sự thật không có ("đã có người đặt cọc"), bản tin lặp một ý ≥ 3 lần, hay lời chat ngoài bản tin cũng giục. `--cham-lai --giong` nay chấm lại giám khảo trên cùng bản ghi.
(3) Kiểm: A/B trên CÙNG hai bản ghi hội thoại của main (chỉ khác rubric) — đổi rubric rồi chạy lại lõi thì dao động model trộn vào, không đọc được rubric đổi bao nhiêu; nền mới ghi trong PR.

### SRS-5.1zzzzzzz340 · Ca hồi quy hai lỗi production 02/11 (vai theo số Zalo, hỏi hẻm xe hơi khi đã đủ tiêu chí) — kiểm độc lập (02/11/2026)
Ca gốc (chat thật 02/11): (a) khách hỏi mua ở số tư vấn rồi nhắn "chào em" ở số ký gửi → bot vẫn chạy prompt tư vấn người mua, hỏi tiếp chuyện tìm mua; (b) "anh đang cần tìm mua nhà quận 8 dưới 7 tỉ yên tĩnh" (rổ có 3 căn nhà phố Q8 dưới 7 tỷ) → bot hỏi "hẻm rộng cỡ nào để xe hơi vào".
(1) Lớp lỗi: (a) `conv.role` nhớ theo NGƯỜI, `so_nhan` chỉ được đọc ở lượt ĐẦU (nhánh `khoi_chao_tu_van` kiểm `not any(t.role == "assistant")`) nên lượt sau không soát lại số; (b) cây hỏi nhu cầu chạy TRƯỚC rổ hàng — `BuyerLead.next_question_field()` trả `yeu_cau_xe_hoi` dù đã đủ khu vực + ngân sách + loại và rổ có căn (`_so_cau_hoi` mới 1 < `MAX_CAU_HOI_MUA`). (2) Cùng lớp: đã soát — mọi ô `O_TU_VAN_MUA` (môi trường sống, thành viên, nơi làm việc…) đi cùng cây đó nên cùng chặn một chỗ; chưa sửa (việc của phiên lõi).
Sửa: KHÔNG sửa lõi — phiên này chỉ dựng ca kiểm. Ca 1 đã kiểm trên nhánh PR #257 (SRS-331): chuyển XANH, nên bản sửa đó đúng chỗ; #257 gộp rồi nên hai ca của lỗi 1 đã bỏ `xfail`, thành ca hồi quy thường. Ca 2 còn đỏ cả trên #257, giữ `xfail(strict=True)`; thêm ca chờ "rổ ≥ 2 căn hợp thì đưa 2–3 căn" theo quyết định điều phối 02/11 (chủ dự án chê bản một căn "chat chán quá") — chấm ở mức prompt vì bộ này chạy model giả. `tests/test_hoi_quy_02_11_340.py` (2 ca lưới đỡ xanh + 4 ca chờ `xfail(strict=True)`, mỗi lỗi kèm một cách nói mới), `tests/kich_ban/hoi_quy_340.json` (2 kịch bản chấm mức câu chữ), `scripts/cham-kich-ban.py` nhận khoá `so` = số Zalo khách nhắn từng lượt.
(3) Kiểm: `bun run test:py` (1333 ca, 4 xfailed) — bỏ `xfail` thì 4 ca đỏ đúng chỗ trên main, và 2 ca của lỗi 1 chuyển xanh trên nhánh #257; bài đầu để `user_intent = "buy"` cho cả lượt chào nên đỏ vì chính nó, đã sửa thành lượt mơ hồ (ghi chú giữ trong tệp); ca "đưa 2–3 căn" CHƯA kiểm được offline vì bộ chấm không có rổ hàng, và điều chủ dự án mong ("đưa 2–3 căn") LỆCH prompt đang chạy (`khoi_can_cho_khach`: "mỗi lượt giới thiệu MỘT căn tốt nhất") — cần chủ dự án chốt, đã nêu ở báo cáo GitHub.

### SRS-5.1zzzzzzz338 · Audit Đợt 7: docs khớp code — soát lại, sửa phần còn lệch, `truyvet` soát tên ở §2 (02/11/2026)
Soát theo dòng "7 · Docs khớp code" của `.claude/audit/2026-10-30-audit-lam-sach.md`: đã khớp từ trước (soát 01/11) — docs/07 §1.2, §2, bảng cron (12/12 lịch = `cron.schedule` trong `schema.sql`), FR-140 / FR-173 (bỏ CTV), `.clinerules`, bảng công tắc CLAUDE.md (`DONG_TRICH_XUAT`, `MODEL_GEMINI`, ngoại lệ `CONG_CU_GUI_KHACH`).
Sửa: docs/13 tả sáu công tắc đã gỡ (SRS-319) như đang bật + nhánh "tắt" → vẽ đường duy nhất; docs/10 TS-SEC3-04 còn `ctv_ranks` (vai-tro.sql nay 4 view). Không sửa: BR-01 / FR-174 "địa bàn mở Sài Gòn + Long An" là trọng tâm bán theo DH-01 (khác vùng nhận tin 6 tỉnh, FR-174 đã ghi cả hai) — đổi là đảo quyết định chủ dự án.
(1) Lớp lỗi: docs tả tên hàm / lịch không ai soát với code. Kiểm: `scripts/soat-truy-vet.sh` mục 8 — tên `x()` / `*-tick` ở docs/07 §2 phải có trong `schema.sql` / `src/` / edge function (bỏ qua đoạn ghi đã gỡ); đỏ khi thêm tên giả vào §2.

### SRS-5.1zzzzzzz336 · Audit Đợt 5: ca đỏ khách ảo 02/11 — bản nháp gọi đúng khách lớn tuổi, bản tin không bình luận giá (AI đọc nghĩa), Q8 bỏ câu mẫu khỏi `AD_FORMAT` (02/11/2026)
Ca gốc: SRS-342 ca 1 ("📋 Cháu sẽ rao như vầy nhé em:" với khách xưng "cô"), ca 2 / 2b (bản tin "giá còn mềm mỏng thế này", "có cửa bớt lộc"); Q8 chủ dự án 02/11: bỏ câu minh hoạ hoàn chỉnh khỏi `AD_FORMAT`, tả cách viết, mỗi tin một vẻ (thay SRS-205).
(1) Lớp lỗi: ca 1 — `xung_ho in _TRE else "em"` rơi mọi cách xưng `elder:*` về "em"; ca 2 — `_soat_binh_luan_gia` miễn MỌI lượt có bản tin, và lưới `_BINH_LUAN_GIA` là từ khoá nên đổi chữ là lọt (§4.8); Q8 — câu mẫu trong prompt bị chép dù có luật cấm chép.
Sửa: `prompts._xh_tre` giữ "elder:cô" cho dòng mở + câu hỏi duyệt; lượt bản tin: AI (model bóc tách, `SOAT_BINH_GIA_SYSTEM`) đọc nghĩa, code chỉ nhận cụm có NGUYÊN VĂN trong tin (`engine._binh_gia_trong_tin`), phạm vi chỉ nhận xét MỨC GIÁ (ý chung / thị trường giữ §6.3); lời chat giữ lưới cũ; `AD_FORMAT` bỏ "Bà con ơi," / "anh chị cô bác" / câu mời chốt mẫu. Phép chấm `ka_bia_tien_ich` (re.I) bắt nhầm câu HỎI "gần chợ / trường" và "chưa có thông tin trường mầm non quanh căn" → chỉ bắt khẳng định nơi có tên / cách N m.
(2) Cùng lớp còn: lời chat vẫn lưới từ khoá giá (gọi AI mỗi lượt tốn một lần gọi); bản viết lại sau soát không được soát lại (`ka_lo_trinh_tu` lần 1: bản viết lại thêm "72m²" tự nhân); `ka_lo_diem_tin` ("căn này đang 67/100"): **quyết định chủ dự án 02/11** — giữ SRS-216, bot ĐƯỢC nói điểm tin với người bán; chỉ giữ đúng chữ: điểm x/100 là của căn / tin, hạng Đồng / Bạc / Vàng là của người rao (không gọi lẫn; khối ĐIỂM TIN thêm câu dặn này, bài `test_kich_ban_srd_aond` đỏ khi gỡ) — không đảo SRS-216, phép cấm "\d+/100" của kịch bản trái quyết định này. Việc sau đóng gói (điều phối 02/11, không chặn PR): soát lại bản viết lại sau lượt soát; đưa lời chat sang AI đọc nghĩa cho bình luận giá.
(3) Kiểm: `test_khach_ao_02_11_342.py` gỡ 4 `xfail`; ca 2 / 2b viết lại theo đường AI (bản cũ chỉ đạt bằng thêm từ vào regex) — trả miễn trừ cũ: 2 đỏ, bỏ kiểm cụm nguyên văn: 1 đỏ; `test_giong_rao_cho` đỏ khi trả câu mẫu; `cham` ×2 (số ở mô tả PR).

Bổ sung (chủ dự án 02/11, nguyên văn: "lượt nào cũng nói thì bị ngu à, chỉ nói lúc ra tin thôi"): điểm tin / hạng người rao / cách tăng điểm chỉ nói lúc RA TIN (lượt bản nháp 📋, lượt báo tin đã lên) hoặc khi khách tự hỏi. (1) Lớp lỗi: khối ĐIỂM TIN nối vào MỌI lượt hỏi ô (phiếu lượt) kèm lời dặn "một câu ngắn khi khích lệ" → model chèn "có sổ hồng thì tin lên điểm nhiều luôn" giữa lúc hỏi. Sửa bằng code, không dặn thêm: khối chỉ nối ở nhánh bản nháp, lượt duyệt có tin lên web, và khối ưu tiên `hoi_ve = diem_tin` (AI đọc nghĩa; giá trị mới của enum); lượt khác không có số để nói. (2) Cùng lớp: dòng Gamification ở `BUSINESS_CONTEXT` và câu dặn trong `khoi_diem_tin` sửa theo; `cau_mau` / `agent_ban` / `gui_nhac` không có chỗ nào nói điểm. Lượt báo đăng chưa có bài riêng. (3) Kiểm: `test_noi_loi_hua_27_10::test_prompt_ban_co_khoi_diem_tin_so_that` (hỏi ô không khối; khách hỏi điểm có số — cách nói mới "tin của anh giờ được mấy chấm rồi em") và `test_kich_ban_srd_aond::test_nhom4_diem_tin_chi_o_luot_ra_tin` — trả khối về lượt hỏi ô: 2 đỏ; bỏ `diem_tin` khỏi danh sách nhận: 1 đỏ.

### SRS-5.1zzzzzzz335 · Phía mua: câu hỏi mở tuỳ chọn thay cây hỏi cố định; 2–3 căn mỗi lượt mở bằng tầm giá; dòng căn có đường vào + tiện ích thật (02/11/2026)
Ca thật chủ dự án 02/11 (số tư vấn): "anh đang cần tìm mua nhà quận 8 dưới 7 tỉ yên tĩnh" — rổ có 3 nhà phố hợp mà bot đưa 1 căn theo khuôn bốn đoạn ("Căn nằm đúng khu vực anh chọn.", "Tin chưa ghi thông tin về độ yên tĩnh.") rồi hỏi "hẻm rộng cỡ nào để xe hơi ra vào"; chủ dự án: "chat chán quá". Khách ảo phía mua 2,4 / 5: bịa "gần trường Hồng Hà", hứa suông "đã chuyển câu hỏi cho chủ".
(1) Lớp lỗi: lời phía mua do khuôn cố định quyết — cây `BuyerLead.next_question_field` (xe hơi bắt buộc ngay sau ba ô cốt lõi), "mỗi lượt MỘT căn, BỐN ĐOẠN, kể ĐÚNG vì sao hợp"; dòng căn thiếu đường vào / tiện ích nên model hoặc nói máy móc hoặc bịa. Sửa: đủ ba ô cốt lõi → MỘT câu mở, tuỳ chọn, ý do AI chọn trong `y_con_thieu` (đã bỏ ý khách nói / đã hỏi; "chỗ đậu xe" chỉ khi khách nhắc xe; loại BĐS không còn là ô chặn — còn trống thì là một ý của câu mở, điều phối 02/11: hỏi "loại hình nào" ngay sau khi đưa 3 nhà phố là vô lý), engine ghi `_da_hoi` ý thật sự có trong câu hỏi của bot; 2–3 căn mở bằng tầm giá, suy luận có chữ "thường" từ thông số thật ("trong hẻm nên thường yên tĩnh hơn mặt tiền"); `dong_can` thêm đường vào, độ rộng hẻm, tiện ích ≤ 1 km có tên.
(2) Cùng lớp: lời "giới thiệu MỘT căn" ở nhánh hết câu hỏi (đã sửa); `loai_tru` không loại căn nào ở ca Q8 (3 căn đều tới model) — 1 căn là do khuôn prompt. Còn: số căn / tầm giá model thật nói chỉ kiểm bằng chat thật (đoạn trước / sau ở PR).
(3) Kiểm: `test_mua_cau_mo_335.py` (Q8 + 2 cách nói mới, chung cư "vợ chồng có con nhỏ" không gợi lại thành viên, khách nhắc xe thì có "chỗ đậu xe", dòng căn có đường vào / tiện ích — trả `mua.py` cũ: 2/4 đỏ); `test_tu_van_mua` ghi `_da_hoi` theo câu hỏi của bot.

### SRS-5.1zzzzzzz334 · /du-an thiếu tab Bà Rịa – Vũng Tàu; vùng nhận tin một nguồn phía web (02/11/2026)
Ca gốc: tab tỉnh ở `app/du-an/page.tsx` gõ tay 5 tỉnh, thiếu Bà Rịa – Vũng Tàu (DB `projects.province` có 7 dự án "Bà Rịa - Vũng Tàu" — chỉ thấy ở "Tất cả"); tiêu đề / mô tả trang cũng bỏ tỉnh này. Dữ liệu đúng (bộ nạp `thu-du-an-rever.mjs` ghi đúng chữ), lỗi ở web.
(1) Lớp lỗi: danh sách vùng chép tay ở web, lệch `prompts.VUNG_NHAN_TIN`. (2) Cùng lớp: soát `app/`, `lib/`, `components/` — chỉ trang này liệt kê tỉnh. Sửa: `lib/vung.ts` (bản sao `VUNG_NHAN_TIN`: `tinh` = chữ trong DB, `nhan` = chữ hiện ra), trang dựng tab + metadata từ đó.
(3) Kiểm: `tests/test_vung_mot_nguon_334.py` (web ↔ lõi, `tinh` ↔ chữ bộ nạp ghi, trang không gõ tay tên tỉnh) — đỏ khi trả trang về bản cũ, đỏ khi bỏ một tỉnh khỏi `lib/vung.ts`; `kieu`, `build`.

### SRS-5.1zzzzzzz333 · Gỡ `/api/listing/parse` + `parseListing` (bóc câu rao bằng luật ở web, không còn nơi gọi) (02/11/2026)
Ca gốc: soát code chết — route `POST /api/listing/parse` (SRS-4.6) và `parseListing` (~90 dòng luật bóc câu rao trong `lib/parse-query.ts`) không còn ai gọi: web, bot, script, workflow (grep 0 chỗ ngoài định nghĩa). Bóc câu rao thật do lõi Python làm bằng AI; DB còn `boc_thong_so()` (FR-172).
(1) Lớp lỗi: chuyển bóc tách sang lõi AI mà để lại bản luật phía web — một bộ đoán ý bằng từ khoá nằm chờ người nối lại. (2) Cùng lớp: `parseQuery` (ô tìm kiếm web) còn dùng luật — giữ (không có AI ở ô tìm, chi phí mỗi lượt gõ); đề xuất xử lý câu phủ định ở mô tả PR, không thêm từ khoá.
Sửa: xoá route + khối `parseListing` / `ParsedListing`; SRS-4.6, TS-WEB2-S09 đánh `[deprecated]`; IA-14, UF-09, WF-08/09, docs/08 bỏ đường dẫn. (3) Kiểm: `kieu`, `build` (route `/api/listing/parse` hết khỏi bảng), `test:bot`, `test:py`, `truyvet`.

---

## 6. Yêu cầu phi chức năng — tiêu chí nghiệm thu

`[nguồn: docs/10 §10.7–10.8, DB 04/09/2026]` ✅ đạt · 🟡 một phần/chưa đo đủ · ❌ chưa.

| NFR | Cách nghiệm thu | Trạng thái |
|---|---|---|
| NFR-01 | view `bot_do_tre` p95 < 3 s trên 7 ngày; load test 50 tin đồng thời | 🟡 view có, chưa load test |
| NFR-02 | Lighthouse mobile ≥ 90, LCP < 2,5 s/4G | ❌ chưa đo |
| NFR-03 | `bot_health_tick` + ntfy báo bridge im; uptime OA 30 ngày ≥ 99,5 % | 🟡 OA chưa duyệt, bridge dừng từ 27/08 |
| NFR-04 | TS-JOB: dựng cảnh sập tay → 0 tin mất, `inbound_ledger` không `dead` oan | ✅ |
| NFR-05 | Seed 5.000 listing + 300 hội thoại, p95 không suy giảm | ❌ chưa seed |
| NFR-06 | Bucket riêng không có route public; signed URL 900 s chỉ admin ký (TS-WEB2 S) | ✅ |
| NFR-07 | Rà 100 hội thoại: 0 lần hỏi SĐT ngoài đặt lịch; `/admin` không đọc `phone` | 🟡 e2e đạt, chưa có 100 hội thoại thật |
| NFR-08 | Fingerprint có thông báo/từ chối | — không dựng fingerprint (OPEN-14) |
| NFR-09 | 100 URL tag index Search Console, 0 lỗi structured data (TS-SEO) | 🟡 64 tag SSG + sitemap + JSON-LD; chưa index (OPEN-44) |
| NFR-10 | Toàn bộ UI + chat tiếng Việt, xưng anh/chị/em | ✅ |
| NFR-11 | Thống kê kết nối được từ Excel | 🟡 CSV từ `/admin` + Table Editor; chưa nối trực tiếp |
| NFR-12 | Thêm kênh không sửa `chat-reply` | ✅ OA + bridge cùng gọi một bộ não |
| NFR-13 | Mọi sự kiện có timestamp truy vết | ✅ `property_events`, `messages.seq/created_at` |
| NFR-14 | Tổng chi phí build ≤ 418 tr | ❌ chưa có số đo |
| NFR-15 | Theme thương mại ngoài git, đúng license | ✅ |
| NFR-16 | Mọi dịch vụ ở bậc Free, đối chiếu usage hằng tuần | ✅ (Supabase/Vercel/ntfy Free) |
| NFR-17 | Bảng route sau build: trang tin `●`/`○`; `x-vercel-cache` HIT (TS-CACHE) | ✅ 01…03; 04/05 cần Vercel |
| NFR-18 | Request tới function không tồn tại → `bot_errors` có dòng dù cron `succeeded` (TS-HEALTH) | ✅ |

---

## 7. Tiêu chí nghiệm thu MVP

`[nguồn: docs/10 §10.8 + TS-GIUCHAN/TS-V48/TS-WEB2/TS-ADM2/TS-MATCH]` ✅ chạy end-to-end (test rollback/e2e) · 🟡 một phần · ❌ chưa.

| # | Kịch bản | FR/UF | Trạng thái | TS phủ |
|---|---|---|---|---|
| AC-01 | Google → trang tag → chi tiết → click Zalo → bot nhắc đúng nhu cầu ở tin đầu | UF-01→03, FR-14 | 🟡 link mang `ref`, bot chưa đọc (OPEN-14) | TS-SEO, TS-WEB |
| AC-02 | Chat từ đầu, bot thu đủ khu vực + giá, trả ≤ 3 listing, "xem thêm" trả tiếp | UF-04, FR-24 | 🟡 hồ sơ + ≤ 3 tin đạt; "xem thêm" mới có cho ảnh | TS-CHATREPLY, TS-E2E, TS-V48 |
| AC-03 | B hỏi "cho xem sổ đỏ" → info_request → CTV/chủ trả lời → B nhận **và** listing cập nhật | UF-05, FR-44, FR-173 | ✅ (ảnh Zalo tạm chưa vào kho, OPEN-32) | TS-HOICHU, TS-CTV, TS-OUNG |
| AC-04 | Đặt lịch xem đúng căn, B từ chối cho SĐT vẫn đặt được, nhận link Maps, email `[VIEWING]` | UF-06, FR-53, NFR-07 | 🟡 lịch + Maps + push đạt; email cần tài khoản ntfy | TS-VIEW, TS-MATCH-08, TS-GIUCHAN |
| AC-05 | Sau buổi xem B nói "chỉ mua MT trên 4m" → gợi ý sau loại nhà hẻm | UF-07 | 🟡 hồ sơ cập nhật; chưa loại căn đã từ chối | TS-MATCH-06/07 |
| AC-06 | B im 5 ngày → hỏi thăm; ≥ 6 ngày → giữ kết nối mẫu cố định, kết thúc bằng câu hỏi | UF-08, FR-60, FR-63 | ✅ | TS-GIUCHAN-02/03, TS-RET |
| AC-07 | S gõ một câu rao → bóc ≥ 4 trường → sửa → đăng → có mã `#ID` | UF-09, FR-92 | ✅ | TS-MA, TS-VAI, TS-THONGSO |
| AC-08 | Nhắn Zalo "cần bán nhà" → được hỏi ngay trong Zalo, mở hồ sơ bán kèm nhãn (FR-159 thay link `/raoban`) | UF-10, FR-97, FR-159 | ✅ theo FR-159 | TS-VAI-01…06, TS-E2E |
| AC-09 | Admin thấy đủ bảng buyer side, phân trang, click B ID sang Zalo | FR-70…80 | 🟡 bảng + view có (TS-ADM2); phân trang/click UI ⏭ | TS-ADM2-01…10 |
| AC-10 | 4 loại cảnh báo `[QUESTION] [VOICE] [VIEWING] [UPSET]` đúng subject/body tới `admin_email` | FR-81 | 🟡 push đạt; email 400 chờ tài khoản ntfy | TS-GIUCHAN-05 |
| AC-11 | Tạo danh sách riêng → URL token → `noindex`, không lộ danh tính B | UF-12, FR-100 | ✅ | TS-WEB2-P06…P10 |
| AC-12 | Tìm "gần ngã tư Trần Bình Trọng và An Dương Vương" trả kết quả hợp lý | FR-22, INS-07 | 🟡 `landmark` bóc được, lọc theo mốc chưa có | TS-WEB2-P01…P05 |
| AC-13 | Căn 50 của dự án còn không → theo `unit_status`; tiện ích dự án không sinh info_request; đã bán → khách trong interests được báo kèm căn thay thế | FR-113…116, INS-10 | 🟡 hai vế đầu ✅ (v48); vế báo đi theo `listings.status='da_chot'`, chưa theo `unit_status` | TS-V48-114/116, TS-GIUCHAN-01, TS-PROJECT |

---

## 8. Trạng thái phát hành

- **Đang chạy** (04/09/2026): web trên Vercel; DB + 9 edge function + 12 cron trên Supabase Free; toàn bộ FR-129…174 có test rollback/e2e xanh.
- **Chưa có giao dịch thật**: `listing_facts`, `info_requests`, `viewings`, `deals`, `interests` đều 0 dòng; 158 tin `dang_ban` là import Excel.
- **Kênh Zalo**: OA chờ duyệt (`ZALO_OA_ACCESS_TOKEN` chưa có); bridge zca-js là đường duy nhất và đang dừng từ 27/08 — bật lại là điều kiện cho DH-06 đợt 2.
- **Cảnh báo**: push ntfy chạy; email cần tài khoản ntfy + `NTFY_TOKEN` + `admin_email`.
- **Treo**: OPEN-14 (fingerprint/ref), OPEN-32 (ảnh Zalo vào kho), OPEN-33 (`ZALO_APP_SECRET`), OPEN-43/44/45.
