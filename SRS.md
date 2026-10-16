# BẢN ĐẶC TẢ YÊU CẦU PHẦN MỀM (SRS)
## HỆ THỐNG TRỢ LÝ AI MÔI GIỚI BẤT ĐỘNG SẢN — AI ƠI NHÀ ĐẤT (AOND)

---

## 1. TỔNG QUAN HỆ THỐNG & MỤC TIÊU DỰ ÁN

### 1.1. Tầm nhìn sản phẩm
**AI Ơi Nhà Đất (AOND)** là trợ lý AI thông minh hoạt động trực tiếp trên nền tảng Zalo cá nhân (thông qua clone bot), tự động hóa toàn bộ quy trình:
1. Tiếp nhận nhu cầu ký gửi bán/cho thuê bất động sản từ chủ nhà, môi giới và đầu tư.
2. Trò chuyện tự nhiên, linh hoạt như chuyên viên môi giới cao cấp (không rập khuôn, linh hoạt theo xưng hô).
3. Tự động bóc tách thông tin bất động sản có cấu trúc (nhà phố, chung cư, đất nền, biệt thự, nhà cấp 4...).
4. Soạn thảo bản tin rao bán bất động sản cực kỳ tinh gọn, giật tít thu hút (Catchy), không nhồi nhét.
5. Thuyết phục khách duyệt tin, dẫn dắt báo phí hoa hồng môi giới khéo léo.
6. Tự động chăm sóc, nhắc nhở khách khi bị ngắt quãng (Follow-up thông minh theo ngữ cảnh).
7. Đồng bộ dữ liệu hai chiều thời gian thực lên Supabase CRM (`aioinhadat.vercel.app`).

### 1.2. Bộ ba trụ cột hạ tầng (Tam giác hệ thống)
Hệ thống được thiết kế độc lập, không phụ thuộc vào máy cá nhân hay OneDrive:
* **GitHub Repository (`quang507/Nhadat.cc`):** Nguồn lưu trữ toàn bộ mã nguồn (Source Code), tài liệu đặc tả, tests và lịch sử phiên bản.
* **Supabase Cloud (`rqxmmqmctpklqcmbfxuj`):** Nguồn dữ liệu chân lý duy nhất (Single Source of Truth) lưu trữ cơ sở dữ liệu Postgres: khách hàng (`sellers`), hội thoại (`conversations`), tin nhắn (`messages`), giỏ hàng tin đăng (`listings`). Xóa/sửa trên CRM web thì Bot trên Zalo lập tức cập nhật hoặc reset theo.
* **VPS Production (`103.126.162.93`):** Máy chủ Linux vận hành 24/7 hai service cốt lõi:
  * `aond-core.service` (Port 8000): Trí tuệ nhân tạo lõi xử lý hội thoại (FastAPI + Python LLM Engine).
  * `nhadat-bridge.service` (Port 5005): Cầu nối Zalo cá nhân (Node.js `zca-js`).

---

## 2. KIẾN TRÚC PHẦN MỀM & LUỒNG DỮ LIỆU

### 2.1. Sơ đồ kiến trúc tổng thể
```
[ Khách hàng Zalo ]
        │  (Tin nhắn văn bản, thoại, ảnh, sticker, reaction)
        ▼
[ Zalo Bridge (zca-js) - Port 5005 ]
        │  POST /chat-reply (HTTP JSON)
        ▼
[ AOND Core Engine (FastAPI) - Port 8000 ]
   ├── Speech-to-Text: Groq Whisper API (Xử lý tin nhắn thoại)
   ├── Vision/OCR: LLM Vision (Đọc sổ hồng, ảnh nhà)
   ├── Entity Extraction & State Machine: Gemini 2.5 Flash / Claude
   ├── Data Store: SupabaseConversationStore (Đồng bộ trực tiếp Cloud)
   └── Proactive Follow-up Engine (Chăm sóc khách im lặng sau 5-10 phút)
        │
        ├──► [ Supabase Cloud Database (PostgreSQL) ] ◄──► [ Web CRM Admin ]
        └──► Trả lời Zalo Bridge ──► Khách hàng Zalo
```

### 2.2. Chi tiết các thành phần chính
1. **Module Xử lý hội thoại & Bóc tách (`engine.py`, `prompts.py`, `schema.py`):**
   * Phân loại vai trò khách: `seller` (người bán), `buyer` (người mua), `unknown`.
   * Nhận diện loại hình BĐS: `nha_pho`, `chung_cu`, `dat`, `biet_thu`, `nha_cap_4`...
   * Nhận diện loại giao dịch: Bán vs. Cho thuê (nhận diện tiền cọc, giá thuê, hoa hồng 0.75 tháng).
   * Ghép nối địa chỉ đa lượt (Multi-turn Address Merger): Giữ nguyên số nhà, tên đường, phường, quận qua nhiều lượt chat; tự động sửa nhầm lẫn địa danh (Tân Bình vs. Bình Tân).
   * Nhận diện thuật ngữ giá: Hiểu `TL` / `thương lượng` / `bớt lộc`, `giá net`, `giá ngợp`.

2. **Quy tắc Tiêu đề giật tít & Soạn thảo tin rao:**
   * **Độ dài bắt buộc:** Dưới 10–12 từ, đúng 1 dòng duy nhất.
   * **4 Công thức Catchy chuẩn:**
     * *Mẫu 1 (Đòn bẩy tài chính):* `Chỉ [Giá] có ngay [Loại hình/Kết cấu] [Vị trí MT/Hẻm] [Điểm nhấn nếu có]`
     * *Mẫu 2 (Bán nhanh/Thanh khoản):* `Bán gấp nhà [Số tầng/Kết cấu] [Vị trí MT/Hẻm] [Điểm nhấn nếu có] giá chỉ [Giá]`
     * *Mẫu 3 (Khan hiếm/Hàng hot):* `Cực hiếm nhà [Kết cấu] [Vị trí MT/Hẻm] [Điểm nhấn] giá chỉ [Giá]`
     * *Mẫu 4 (Trực diện tinh gọn):* `[Bán/Cho thuê] [Số tầng/Kết cấu] [Vị trí MT/Hẻm] [Điểm nhấn nếu có] giá [Giá]`
   * **Cấm nhồi nhét:** Tuyệt đối không đưa số phòng ngủ/WC (4PN 5WC), hướng nhà, hiện trạng trống vào dòng tiêu đề. Toàn bộ thông số kỹ thuật nằm ở các dòng emoji bên dưới.
   * **Nguyên tắc dòng thông số:** Thông số nào CHƯA CÓ thì BỎ QUA HOÀN TOÀN, cấm tuyệt đối viết chữ "đang cập nhật".

3. **Cơ chế Xưng hô & Giọng văn linh hoạt:**
   * Nếu khách xưng "em" / "nhà em": Bot tự động xưng hô "mình - em", loại bỏ 100% các từ "Dạ", "anh/chị".
   * Nếu khách lớn tuổi / xưng "chị" / "anh": Bot xưng hô "em - anh/chị", dạ vâng lịch sự nhưng không lặp "Dạ" liên tiếp 2 câu.

4. **Cơ chế Follow-up thông minh (`followup.py`):**
   * Sau khi khách ngưng tương tác (5 phút), bot tự động rà soát trường còn thiếu để hỏi đúng trọng tâm:
     * Đã có tin nháp: Nhắc khách duyệt hoặc chỉnh sửa tin.
     * Thiếu giá: Hỏi giá kỳ vọng thu về.
     * Thiếu địa chỉ: Hỏi vị trí đường, phường, quận.
     * Thiếu kết cấu: Hỏi số tầng, số phòng ngủ.
     * Thiếu diện tích: Hỏi ngang x dài.
     * Thiếu lộ giới: Hỏi mặt tiền hay hẻm xe hơi.
   * Tuyệt đối không lặp lại kịch bản "chờ hình sổ hồng" nếu ngữ cảnh không phù hợp.

5. **Cơ chế Reset phiên làm việc (Làm mới cuộc trò chuyện):**
   * **Lời chào / Sticker Reset tự nhiên:** Bất kỳ lúc nào khách hoặc người kiểm thử nhắn `hello`, `hi`, `alo`, `hello em`, `chào em`, hoặc gửi **sticker chào / sticker cảm xúc (`[sticker cảm xúc]`, `👋`)**, Bot sẽ tự động xóa sạch toàn bộ nháp cũ và làm mới cuộc trò chuyện ngay lập tức.
   * **Lệnh Reset tường minh:** Nhắn `/reset`, `/clear`, `/xoa`, `reset session`, hoặc `xóa hết`.
   * **API endpoints:**
     * `POST /reset/{user_key}`: Reset riêng từng khách hàng.
     * `POST /reset-all`: Reset toàn bộ hệ thống.

---

## 3. CƠ SỞ DỮ LIỆU & SCHEMA SUPABASE

### 3.1. Bảng `sellers` (Chủ nhà / Môi giới gửi tin)
* `id`: UUID (Primary Key)
* `zalo_user_id`: TEXT (Khóa định danh Zalo của khách)
* `name`: TEXT (Tên hiển thị Zalo)
* `seller_type`: TEXT (`ccrb` - chính chủ rao bán, `moi_gioi`, `dau_tu`)
* `created_at`: TIMESTAMPTZ

### 3.2. Bảng `conversations` (Phiên hội thoại)
* `id`: UUID (Primary Key)
* `seller_id`: UUID (Khóa ngoại trỏ đến `sellers.id`)
* `channel`: TEXT (`zalo_personal_test`, `zalo_oa`...)
* `started_at`: TIMESTAMPTZ
* `last_message_at`: TIMESTAMPTZ
* `needs_human`: BOOLEAN (Đánh dấu cần môi giới can thiệp)

### 3.3. Bảng `messages` (Lịch sử tin nhắn chi tiết)
* `id`: UUID (Primary Key)
* `conversation_id`: UUID (Khóa ngoại trỏ đến `conversations.id`)
* `sender`: TEXT (`seller`, `bot`, `human_agent`)
* `body`: TEXT (Nội dung tin nhắn)
* `zalo_msg_id`: TEXT (Chống trùng tin)
* `created_at`: TIMESTAMPTZ

### 3.4. Bảng `listings` (Giỏ hàng tin đăng BĐS)
* `id`: UUID (Primary Key)
* `code`: TEXT (Mã căn BĐS)
* `seller_id`: UUID (Khóa ngoại trỏ đến `sellers.id`)
* `deal`: TEXT (`ban` hoặc `thue`)
* `property_type`: TEXT (`nha_pho`, `chung_cu`, `dat`, `biet_thu`...)
* `street`, `ward`, `district`: TEXT (Địa chỉ chuẩn hóa)
* `area_m2`: NUMERIC (Diện tích)
* `frontage_m`, `length_m`, `rear_width_m`: NUMERIC (Ngang, dài, nở hậu)
* `floors`, `bedrooms`, `bathrooms`: INTEGER (Kết cấu)
* `price_vnd`: BIGINT (Giá tiền VND)
* `negotiable`: BOOLEAN (Thương lượng/bớt lộc)
* `legal_status`: TEXT (Sổ hồng riêng, HĐMB...)
* `boc_tach`: JSONB (Toàn bộ trường trích xuất chi tiết)
* `status`: TEXT (`cho_thong_tin`, `da_duyet`, `dang_rao`)

---

## 4. HƯỚNG DẪN VẬN HÀNH & TRIỂN KHAI VPS

### 4.1. Thông tin kết nối VPS
* **IP Server:** `103.126.162.93`
* **SSH User:** `root`
* **Đường dẫn Core:** `/opt/aond_core`
* **Đường dẫn Bridge:** `/opt/nhadat/bot/bridge-zca`

### 4.2. Các lệnh quản lý dịch vụ Systemd
```bash
# Kiểm tra trạng thái service
systemctl status aond-core.service --no-pager
systemctl status nhadat-bridge.service --no-pager

# Khởi động lại service khi cập nhật code
systemctl restart aond-core.service
systemctl restart nhadat-bridge.service

# Xem log trực tiếp thời gian thực
journalctl -u aond-core.service -f
journalctl -u nhadat-bridge.service -f
```

### 4.3. Biến môi trường chuẩn (`/opt/aond_core/.env`)
```ini
AIOI_LLM_PROVIDER=gemini
GEMINI_API_KEY=<API_KEY>
GROQ_API_KEY=<GROQ_API_KEY>
GROQ_WHISPER_MODEL=whisper-large-v3-turbo

# Supabase Storage Configuration (Single Source of Truth)
SUPABASE_URL=https://rqxmmqmctpklqcmbfxuj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>

AIOI_DB_PATH=/opt/aond_core/aioi.db
AIOI_MAX_PHOTOS_PER_LISTING=20
```
