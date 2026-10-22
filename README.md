# AI Ơi Nhà Đất (AOND) — Unified Monorepo

> Hệ thống Trợ lý Bất động sản AI chat-first phục vụ ký gửi, bóc tách thông tin, soạn tin rao tự động qua Zalo cá nhân, đồng bộ thời gian thực lên Web CRM và Supabase.

---

## 🏛️ Cấu trúc dự án hợp nhất (Monorepo)

Dự án này là kho lưu trữ **DUY NHẤT VÀ CHÍNH THỨC** của toàn bộ hệ sinh thái AI Ơi Nhà Đất (hợp nhất từ `Nhadat.cc` và `AOND`):

| Thư mục / File | Thành phần | Công nghệ | Nhiệm vụ |
|---|---|---|---|
| `src/aioi/` | **AOND Core Engine** | Python 3.12+, FastAPI, Uvicorn | Bộ não AI xử lý hội thoại, bóc tách thực thể BĐS, soạn tin catchy, follow-up, xưng hô linh hoạt. Chạy trên VPS Port 8000 (`aond-core.service`). |
| `bot/bridge-zca/` | **Zalo Personal Bridge** | Node.js, `zca-js` | Cầu nối tài khoản Zalo cá nhân với Core Engine. Nhận tin nhắn, ảnh, giọng nói, sticker và phản hồi theo nhịp gõ tự nhiên. Chạy trên VPS Port 5005 (`nhadat-bridge.service`). |
| `bot/supabase/` | **Database & Migrations** | PostgreSQL, Supabase, Deno | 9 edge functions, bộ di trú schema (`migrations/`), và schema chuẩn (`schema.sql`). |
| `app/`, `components/`, `lib/` | **Web CRM Admin** | Next.js 15, Tailwind 4, React | Bảng điều khiển CRM (`aioinhadat.vercel.app/admin`) quản lý tin nhắn khách, rổ hàng BĐS theo thời gian thực. Deploy tự động qua Vercel. |
| `docs/` | **Bộ tài liệu BA** | Markdown | Nguồn sự thật: yêu cầu, luồng, đặc tả `docs/07-srs.md`, truy vết `docs/08`. |
| `tests/` | **Bộ kiểm thử tự động** | Pytest | Bài test lõi Python (`bun run test:py`). |
| `scripts/` | **Công cụ quản trị DB** | Node.js / Python | Script nạp đường sá, rà soát di trú, xuất rổ hàng, đồng bộ prompt. |

---

## ⚡ Ba trụ cột hạ tầng (Tam giác vận hành)

1. **GitHub (`quang507/AOND`):**
   * Kho lưu trữ mã nguồn duy nhất của toàn bộ hệ thống.
2. **Supabase Cloud (`rqxmmqmctpklqcmbfxuj`):**
   * **Single Source of Truth:** Nguồn dữ liệu chân lý duy nhất. Toàn bộ `sellers`, `conversations`, `messages`, `listings` (thông số kỹ thuật và `boc_tach` JSONB) được lưu trữ tại đây.
   * **Cơ chế tự động reset:** Khi quản trị viên bấm **XÓA** trên Web CRM, Bot Zalo lập tức nhận biết và reset phiên làm việc về trạng thái mới tinh.
3. **VPS Production (`103.126.162.93`):**
   * `aond-core.service` (Port 8000): Thực thi AI Engine.
   * `nhadat-bridge.service` (Port 5005): Thực thi Zalo Bridge nối acc clone.

---

## 🚀 Khởi chạy nhanh (Quick Start)

### 1. Chạy AI Core (Python):
```bash
python -m venv .venv
source .venv/bin/activate  # Hoặc .venv\Scripts\activate trên Windows
pip install -e .
uvicorn aioi.server:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Chạy Web CRM (Next.js):
```bash
bun install
bun run dev
```

### 3. Chạy Kiểm thử (Tests):
```bash
python -m pytest tests/test_schema.py tests/test_engine.py -v
```

---

## 📜 Tài liệu kỹ thuật chi tiết
* Đặc tả phần mềm: [`docs/07-srs.md`](docs/07-srs.md) (bản `SRS.md` ở gốc repo đã gỡ 19/10/2026 — hai nguồn sự thật)
* Quy chuẩn làm việc cho AI Agent: [`CLAUDE.md`](CLAUDE.md)
* Mô hình dữ liệu BĐS: [`docs/data-model.md`](docs/data-model.md)

---

## 📚 Bộ tài liệu BA (truy vết)

Nguồn sự thật của yêu cầu hệ thống nằm trong [`docs/`](docs/README.md); cổng CI `truyvet` (`scripts/soat-truy-vet.sh`) đối chiếu số đếm dưới đây với các file docs.

| # | Tài liệu | Quy mô |
|---|---|---|
| 2 | [Requirements](docs/02-requirements.md) | 9 BR · 225 FR · 18 NFR |
| 3 | [User Flows](docs/03-user-flows.md) | 13 luồng end-to-end |
| 5 | [Wireframes](docs/05-wireframes.md) | 14 màn hình low-fi |
| 9 | [Open Issues](docs/09-open-issues.md) | 63 vấn đề |
