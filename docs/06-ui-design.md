# 06 — UI Design

Hệ thống thiết kế cho web Aioinhadat (aond.vercel.app) và cho **giọng nói** của bot Zalo — tone giọng
chat là một phần của UI, không phải phụ lục.

## 6.1 Nguyên tắc thị giác

| ID | Nguyên tắc | Hệ quả |
|---|---|---|
| UI-P1 | **Nút Zalo luôn là điểm nhấn mạnh nhất trang** | Không CTA nào cạnh tranh về độ tương phản |
| UI-P2 | **Thông tin trước, trang trí sau** | Card ưu tiên Vị trí/DT/Giá; không hiệu ứng che nội dung |
| UI-P3 | **Mobile-first** | Bố cục thiết kế ở 375px trước |
| UI-P4 | **Giọng người, không giọng máy** | Micro-copy "tụi em / anh chị", không "Hệ thống", "Vui lòng" |
| UI-P5 | **Trung thực về độ chắc chắn** | Pháp lý luôn kèm nhãn nguồn; không hiển thị số chưa xác minh như sự thật |
| UI-P6 | **Nhẹ** | LCP < 2.5s trên 4G (NFR-02); ảnh lazy, WebP, không carousel tự chạy |

## 6.2 Bảng màu

> **Nguồn sự thật hiện là `app/globals.css`** (`--color-brand`, `--color-brand-dark`,
> `--color-navy`, `--color-navy-soft`, `--color-cream`, `--color-line`, `--color-mute`,
> `--color-zalo`, `--radius-king`, `--radius-shot`). Bảng dưới chép từ code; `design/tokens.json` đã xoá 08/09/2026 — OPEN-45 đóng 10/09: code làm gốc.

Skin theo theme tham chiếu **King** (đỏ King + đen King, chủ dự án 12/11/2026, SRS-5.1zzzzzzz430; lịch sử: King tới 26/08 →
Veedoo cam + navy 26/08–12/11 → King lại từ 12/11). Token riêng, không dùng asset theme (NFR-15, OPEN-07).

| Token (`app/globals.css`) | Hex | Dùng cho |
|---|---|---|
| `--color-brand` | `#e60023` | CTA chính, giá tiền, tab đang chọn |
| `--color-brand-dark` | `#b8001c` | Hover CTA |
| `--color-brand-light` | `#ffe5ea` | Nền khối nhấn nhẹ |
| `--color-brand-soft` | `#ff5470` | Chữ đỏ trên nền tối |
| `--color-navy` | `#13151d` | Chữ chính, nền tối (hero, khối người bán) |
| `--color-navy-soft` | `#232830` | Nền tối phụ |
| `--color-mute` | `#5d6a7a` | Chữ phụ, nhãn (đạt AA trên `#f6f7f9`, SRS-5.1zzzzzzz439) |
| `--color-line` / `--color-line-strong` | `#e8ebed` / `#c8d1d8` | Viền, đường chia |
| `--color-surface` | `#ffffff` | Nền card |
| `--color-cream` / `--color-surface-subtle` | `#f6f7f9` | Nền trang |
| `--color-zalo` | `#0068ff` | **Chỉ** dùng cho nút/biểu tượng Zalo (không theo đỏ King) |
| `--color-teal` | `#0f766e` | Còn rao, đã xác minh |

**Quy tắc màu**: `--color-zalo` chỉ thuộc về Zalo (UI-P1); giá tiền luôn `--color-brand`
đậm; tương phản ≥ 4.5:1; trên nền tối dùng `--color-brand-soft` (`#e60023` trên `#13151d` không đủ tương phản).
Màu trạng thái `--warn` (chờ xác minh, quá SLA) và `--danger` (đã bán, lỗi) nhắc ở §6.5 chưa có token riêng trong code — dùng
thang Tailwind tại chỗ (`amber-*`, `red-*`).

## 6.3 Kiểu chữ

| Vai trò | Font | Cỡ (mobile → desktop) | Weight |
|---|---|---|---|
| H1 | Nunito | 28 → 40px | 700 |
| H2 | Nunito | 22 → 30px | 700 |
| H3 / tiêu đề card | Nunito | 17 → 19px | 600 |
| Thân bài | Nunito | 16px / 1.6 | 400 |
| Nhãn, chú thích | Nunito | 13px | 500 |
| **Giá** | Nunito | 20 → 24px | 700 |
| Mã BĐS `#35148` (chỉ admin) | `font-mono` mặc định Tailwind | 14px | 500 |

Một họ chữ duy nhất: **Nunito** (font của theme King, SRS-5.1zzzzzzz430) — ghim trong repo `app/fonts/` (OFL, ba subset latin /
vietnamese / latin-ext, khai ở `app/layout.tsx`, ghép thành `--font-king` → `--font-sans` trong `globals.css`), phủ đủ dấu tiếng
Việt. Font thật đang dùng: `--font-sans` trong `globals.css` (OPEN-45 đóng 10/09: code làm gốc).

## 6.4 Spacing, bo góc, đổ bóng

- Thang 4px: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`.
- Bo góc theo cỡ (SRS-5.1zzzzzzz452, thang `--radius-*` trong `app/globals.css`): khối lớn — thẻ, khung, ảnh (`rounded-lg` trở lên, `rounded-king`, `rounded-shot`) `14px`; nút, ô nhập, chip lọc (`rounded-md`) `8px`; nhãn nhỏ, mã tin (`rounded` / `-sm`) `6px`; `rounded-xs` `4px`. `rounded-full` chỉ cho hình tròn thật.
- Bóng: thang `--shadow-zen-1` … `--shadow-zen-4` trong `app/globals.css` (`shadow-1` / `shadow-2` của bản thiết kế cũ không có trong code).
- Nội dung tối đa `1152px` (`max-w-6xl`); lưới desktop 12 cột, gutter 24px.

## 6.5 Thư viện component

### UI-C01 · PropertyCard
```
▢ ảnh 4:3 (lazy)   [badge "Hot" nếu hot_score cao]  [#35148 góc phải]
Mô tả rút gọn — 2 dòng, ellipsis
📍 Vị trí   ↔ DT   💰 Giá (brand, đậm)
```
Đúng 4 dòng theo đặc tả gốc. "Đã bán" phủ overlay `--danger` 60% thay vì gỡ card.
Code: `components/ListingCard.tsx`.

### UI-C02 · ChatSearchBar
Ô đơn cao 56px, icon 🔍 trái, nút `[→]` phải `--color-brand`. Placeholder xoay vòng 3
ví dụ thật (FR-02). Sticky sau khi cuộn 200px trên trang danh sách/tag.

### UI-C03 · ZaloConnectBox
Nền `--color-navy`, chữ trắng, nút `--color-zalo`, icon Zalo. Luôn chứa lời hứa:
> *"Mời anh/chị kết nối ngay với tụi em để tụi em cùng tìm kiếm, và khi có sẽ thông báo tức thì."*

Ba biến thể: `inline` · `sticky-mobile` · `detail` (kèm mã BĐS). ❌ Hộp và câu hứa trên chưa dựng: code hiện chỉ có nút
"Chat Zalo" nổi góc trái dưới (`components/ZaloWidget.tsx`, ẩn ở `/nha-dat/…`, `/admin`, `/raoban`), nút "Chat Zalo" trên Header
và "Nhắn Zalo" ở Footer.

### UI-C04 · CueBadge
> `💬 Khi Zalo nhớ hỏi #35148`

Nền `--color-brand-light`, chữ `--color-navy`, mã font mono, chạm = copy mã. Cầu nối web↔chat
(IA-P3), hiện ở **mọi** nơi có mã BĐS.

### UI-C05 · SpecTable
Hai cột nhãn/giá trị. Trường chưa xác minh: nhãn `Chờ xác minh` màu `--warn` + nút
`[Hỏi giúp em]` → tạo InfoRequest (UI-P5, FR-40). Thông số đọc từ cột FR-172
(`lib/format.ts` ở web; `_shared/thong_so.ts` phía bot không còn trong repo).

### UI-C06 · QuickQuestionChips
Chip từ bộ câu hỏi chuẩn hoá (FR-46): *Còn bán không? · Xem sổ đỏ · Ảnh hẻm · Mở
quán được không? · Có vướng quy hoạch? · Hoàn công chưa?* Chạm → mở Zalo với câu
soạn sẵn. ❌ chưa dựng trên web.

### UI-C07 · ChatBubble (Zalo)
- Bot: nền `--color-cream`, căn trái; người dùng: nền `--color-zalo`, chữ trắng, căn phải.
- Card listing trong chat: `#mã · vị trí · giá · diện tích`, mỗi căn một dòng.
- **Tối đa 3 căn/tin** (FR-24) — ràng buộc, không phải khuyến nghị.
- Trạng thái chờ S: *"Trong khi chờ, anh/chị có câu hỏi gì khác về căn này không ạ?"* (FR-45).

### UI-C08 · PitchInput (mini-site S)
Textarea 4 dòng, chữ 17px, placeholder là **một câu rao thật**, một nút `[Đăng tin
ngay]`. Không đếm ký tự, không validate độ dài (INS-05). Code: `/quan-ly`.

### UI-C09 · ParsedFieldRow
Trường bóc tách "đã điền sẵn, sửa được"; trường AI không chắc có viền `--warn` gạch
đứt + nhãn `Em đoán vậy, anh/chị kiểm giúp em`. ❌ chưa dựng (bot hỏi nhỏ giọt thay).

### UI-C10 · AdminTable
20 dòng/trang (FR-80), phân trang số, dòng quá SLA nền `--warn` 8%, cột ID là link.
Nút `Xuất Excel` (NFR-11) ❌ chưa dựng. Code: `app/admin/page.tsx`.

## 6.6 Trạng thái tương tác

| Trạng thái | Xử lý |
|---|---|
| Hover nút | Nút chính `bg-brand-dark` (+ bóng đỏ nhẹ chỉ khi rê); không dịch chuyển layout |
| Focus | `outline: 2px solid var(--color-brand)`, offset 2px (`:focus-visible` trong `globals.css`); nút dùng `ring-brand/45` có offset — không `outline:none` trơn |
| Disabled | Opacity 55%, `cursor: not-allowed`, tooltip lý do |
| Loading | Skeleton theo hình dạng card, không spinner toàn trang |
| Rỗng | Luôn kèm hành động kế tiếp + ZaloConnectBox (IA-P1) |

## 6.7 Ảnh

- Tỉ lệ: card 4:3, hero chi tiết 16:9, thumbnail vuông.
- Ảnh thật chụp điện thoại, sáng không đều (`hình samples/`): luôn `object-fit: cover`,
  nền `--color-cream` khi chưa tải, bố cục không dựa vào ảnh đẹp.
- Thứ tự ưu tiên: mặt tiền → phòng khách → hẻm → sân thượng → sổ (che thông tin cá nhân).
- **Ảnh sổ đỏ không bao giờ công khai trên web** — bucket `listing-private`, chỉ gửi
  trong chat qua signed URL (NFR-06).

## 6.8 Tone giọng — Zalo bot

**Mục tiêu: khách đọc lời bot thấy như một người thật đang nhắn Zalo**, kiểu người môi giới có nghề nhắn với người quen: ấm, thật lòng,
ngắn, đúng việc, không gây áp lực. Đây là thước đo duy nhất khi soát giọng. Câu luật nào làm lời bot cứng lại, ra khuôn hay nghe như máy
thì câu luật đó sai, kể cả khi nó đúng trên giấy [nguồn: chủ dự án 19/11/2026 "phần trả lời của bot bị không được tự nhiên", "cái nào ko
merg dc mới phải cấm càng ít càng tốt"; 23/11/2026 "mục tiêu là giọng tự nhiên rep giống người"].

- **Nguồn duy nhất của giọng: `src/aioi/giong.py`** (SRS-5.1zzzzzzz546, chủ dự án 26/11/2026: "các luật lệ để chỗ khác còn tông giọng để
  riêng 1 chỗ"): `GIONG` vào mọi prompt nói với khách qua `prompts.khoi_nhan_vat` (vai + hiểu khách + GIONG, SRS-5.1zzzzzzz531); khối xưng hô
  của lượt, dòng xưng hô tin bot tự nhắn và các hàm làm sạch lời gửi khách cũng ở đó. Khối luật nghiệp vụ chỉ nói việc, không tả giọng.
  Tài liệu không chép lại câu chữ của `GIONG`; muốn biết bot được dặn gì thì đọc code.
- Cách dựng, lưới soát còn lại và **cách sửa khi lời bot lạ**: `07` SRS-5.6.
- Các tiểu mục cũ (Bảy quy tắc, Cấm, Thư viện câu mẫu, Nhịp nhắn giống người, Kịch bản người bán, các bảng bỏ / giữ 09–10/2026…)
  đã XOÁ ngày 23/11/2026 (chủ dự án: "chạy trên 1 bản thôi"); cần tra vết thì `git show 111a002:docs/06-ui-design.md`. **Không chép lại chúng thành luật prompt.**

### Soát giọng bằng chat thật

Đọc một đoạn chat thật trong DB, mỗi lời bot hỏi năm câu:

1. Một người môi giới thật có nhắn đúng câu này không, hay nghe như kịch bản, như hệ thống ("ghi nhận", "vui lòng", đọc lại lời khách,
   báo "em ghi rồi")?
2. Có nghe khách trước không: khách hỏi thì đáp trọn câu đó; khách lộ cảm xúc thì nhận bằng lời của riêng lượt đó; khách muốn dừng thì
   chào nhẹ, không níu.
3. Dài vừa ý khách không: lượt hỏi thông tin một hai câu; khách cần tư vấn hay đang lo thì đủ ý.
4. Có khác các tin vừa nhắn không: cách mở, cách gọi, cách kết.
5. Có nói thật không: chỉ điều khách kể và dữ liệu của lượt; chưa có thì nói chưa có (RSK-03).

Lệch ở câu nào thì tìm gốc rồi sửa theo SRS-5.6. Năm câu này là thước của người đọc chat, không phải năm dòng để dán vào prompt.

### Quyết định chủ dự án — giữ cứng, chỉ chừng này

| Quyết định | Nguồn | Chỗ giữ |
|---|---|---|
| Không mở đầu bằng "Dạ" | chủ dự án, CLAUDE.md §6.2 | khối xưng hô (`giong.LUAT_XUNG_HO_CHUNG`); model viết lại hai lần vẫn mở "Dạ" thì code bỏ chữ đó (`giong.bo_da_dau`, SRS-5.1zzzzzzz230); tin bot tự nhắn: `giong.lam_sach_tin_chu_dong` (SRS-5.1zzzzzzz546) |
| Không gọi khách "bạn"; gọi "mình" được (chủ dự án 26/11/2026: "cho nói gọi khách là mình cũng được", bỏ cấm của SRS-171 / 230) | SRS-5.1zzzzzzz546 | khối xưng hô (`giong.LUAT_XUNG_HO_CHUNG`) |
| Xưng hô theo bảng dưới | SRS-5.1zzzzzzz214 / 234 | `xung_ho.goi_toi` |
| Mỗi lượt hỏi nhiều nhất một câu (lời chào đầu được gộp — chủ dự án 26/11/2026) | SRS-5.1zzzzzzz252 / 546 | `GIONG`, lưới `mot_cau_hoi` |
| Khách hỏi người hay máy: nói thật là trợ lý AI, không bao giờ nhận là người | chủ dự án 13/09/2026 | `GIONG` |
| Trong chat không nhận xét mức giá chủ nhà đưa (cao / thấp / hợp lý) khi không có khối NHẬN XÉT GIÁ; không hứa bán được, không hứa thời hạn | SRS-5.1zzzzzzz353 | `LEAN_SYSTEM_PROMPT`, `GIONG`, lưới `binh_luan_gia` |
| Chỉ xin số điện thoại một lần, lúc khách chốt lịch xem | NFR-07, SRS-5.1zzzzzzz148 | luồng hẹn xem |
| Chat là văn nói: không in đậm, gạch đầu dòng, đánh số (Zalo không hiện); không gạch dài "—", không viết "anh/chị" gạch chéo | OPEN-62 | `GIONG`; "anh/chị" gạch chéo: code thay ở đường ra (`giong.bo_gach_cheo` — lời model, câu mẫu, câu giữ chỗ; SRS-5.1zzzzzzz536). Gạch dài chưa giữ |
| Chỉ cảm ơn khi khách duyệt tin hoặc gửi ảnh / giấy tờ, không cảm ơn từng câu | chủ dự án 26/11/2026, SRS-5.1zzzzzzz546 | `GIONG` |
| Không giải thích hỏi / xin để làm gì (kể cả lúc xin ảnh), khách hỏi vì sao thì nói rõ; câu hỏi khoảng 20–30 từ, khách kể điểm tốt của căn thì thêm trước đó một câu khen đúng điểm ấy | chủ dự án 23/11 và 26/11/2026, SRS-5.1zzzzzzz536 / 546 | `GIONG` |
| Emoji tối đa một, chỉ ở lời chào hoặc lúc báo tin đã đăng; không chồng "ạ" với "nha" / "nhé" | chủ dự án 26/11/2026, SRS-5.1zzzzzzz546 | `GIONG`, câu mẫu |
| Mức phí chỉ lấy từ `prompts.muc_phi`; phí thuê viết "0.75 tháng tiền thuê"; khách duyệt tin thì "Em xin phép đăng tin ạ!" | BR-05, CLAUDE.md §6.3 | `muc_phi`, lưới `phi_vai`, câu mẫu |

Thêm một dòng vào bảng này phải có lời chủ dự án. Ngoài bảng, mọi điều về giọng là mô tả trong `GIONG`, sửa được khi chat thật cho thấy
nó làm lời bot kém tự nhiên.

### Bảng nhân xưng

Một nguồn: `src/aioi/xung_ho.py` (`goi_toi`, SRS-5.1zzzzzzz214 / 234).

| Khách tự xưng | Bot tự xưng | Gọi khách |
|---|---|---|
| Chưa rõ | em | anh / chị theo giới tính Zalo, nhưng đó chỉ là đoán (SRS-5.1zzzzzzz245); hoặc bỏ đại từ ("Nhà ở đường nào vậy ạ?") |
| anh / chị | em | anh / chị (biết tên thì kèm tên: "anh Hưng") |
| em | anh / chị theo tên trợ lý | em |
| cháu / con | cô / chú theo tên trợ lý | cháu |
| chú / cô / bác | cháu | đúng chữ khách xưng (SRS-5.1zzzzzzz233) |

### Danh tính

Mỗi khách một trợ lý tên riêng trong kho 13 tên có chấm giữa (`assistants.ASSISTANT_NAMES`, SRS-5.1zzzzzzz183, FR-181), chia theo băm
Zalo ID, của **AI Ơi Nhà Đất** (web `aond.vercel.app`, `src/aioi/web.py`). Khách hỏi "em là ai" thì một câu giới thiệu rồi quay lại việc
của khách; không đổi tên giữa chừng (OPEN-39 / OPEN-08).

### Câu nói nguyên văn và câu chuẩn

- Câu code gửi nguyên văn (chào lần đầu `chao_lan_dau`, xác nhận lịch `xac_nhan_lich`, giữ kết nối `giu_ket_noi_*`…) chỉ ở
  `cau_mau.MAC_DINH`; chủ dự án sửa ở `/admin/cau-chuan` (bảng `cau_mau` đè, SRS-5.1zzzzzzz106). Gọi khách bằng `{goi}`.
- Câu chuẩn (`cau_chuan`, SRS-5.1zzzzzzz88) là ví dụ cho model, lọc qua `prompts.mau_cau_chuan_hop_le` trước khi vào prompt.

### Bố cục bài rao (`AD_FORMAT`, `src/aioi/prompts.py`)

Bốn khối: tiêu đề 15–25 từ viết thường như câu nói, có giá (SRS-5.1zzzzzzz241) · một đoạn mô tả 50–150 từ giọng rao chợ, nói với người
mua ("anh chị", "cô bác") · 4–5 gạch đầu dòng ghi thẳng giá trị, không nhãn · câu mời nhắn Zalo ở đoạn cuối. Mọi ý chỉ từ dữ liệu căn
và lời chủ nhà (SRS-5.1zzzzzzz73); icon 2–3, chủ nhà xin thì theo, tối đa 6 (SRS-5.1zzzzzzz218). Khuôn không có câu mẫu cho model chép,
mỗi tin tự diễn đạt mới (SRS-5.1zzzzzzz528). Đọc nguyên văn ở `AD_FORMAT`.

### Luật phí (`muc_phi`, `src/aioi/prompts.py`)

Chỉ nói khi được hỏi, không thuyết giảng: người MUA miễn phí hoàn toàn; bên BÁN chỉ trả khi giao dịch thành công — chính chủ 1% giá
chốt, môi giới 0.5%, cho thuê "0.75 tháng tiền thuê" (BR-05); vai chưa rõ thì nêu cả hai mức hoặc hỏi vai, code soát con số (lưới
`phi_vai`, SRS-5.1zzzzzzz227); CHỦ ĐẦU TƯ dự án phí thoả thuận riêng — không tự báo số, "để em kết nối bộ phận hợp tác dự án"; không bịa
mức phí, ưu đãi, cam kết nào khác.

## 6.9 Micro-copy web

| Vị trí | Copy |
|---|---|
| Placeholder search | *"tìm mua nhà phố HXH Quận 8, căn hộ Nhà Bè, biệt thự Bình Chánh, đất Bến Lức..."* (`app/page.tsx`; bản thiết kế cũ *"tìm mua nhà phố HXH 8 tỉ ở Q8"*) |
| Nút CTA Zalo | *"Chat Zalo"* (widget, Header) / *"Nhắn Zalo"* (Footer) — không "Đăng ký", "Liên hệ"; bản thiết kế cũ *"Bắt đầu kết nối"* chưa dựng |
| Nhãn cue | Nút *"Chat Zalo về căn này"* chép sẵn *"Hỏi căn #<mã>"* rồi báo *"Đã chép "Hỏi căn #<mã>", dán vào Zalo là tụi em biết căn nào"* (`components/NutHoiCan.tsx`); bản thiết kế cũ *"Khi Zalo nhớ hỏi #35148"* chưa dựng |
| 0 kết quả | *"Chưa có căn nào khớp đủ các điều kiện này"* + *"Thử bỏ bớt một điều kiện. Hoặc nhắn Zalo câu anh chị cần, có căn mới khớp là tụi em báo, không cần để lại số điện thoại."* (`components/ListingBrowse.tsx`); bản thiết kế cũ tự nới giá *"Em nới giá lên 9.6 tỉ thì có 41 căn"* chưa dựng |
| Chờ xác minh | *"Thông số đọc từ tin rao, chưa xác minh với chủ nhà - hỏi qua Zalo là tụi em đi hỏi giùm."* (`app/nha-dat/[code]/page.tsx`) |
| CTA người bán | *"Miễn phí đăng tin. Chỉ thu phí khi bán được: chính chủ 1% · môi giới 0.5%"* |
| Khối riêng tư | *"Để lại số trên trang nhà đất là ăn 40 cuộc gọi trong 3 ngày. Ở đây chỉ nhắn Zalo, khi hẹn xem nhà mới cần liên hệ. Nhắn “dừng” là tụi em im, không hỏi lý do."* (`app/page.tsx`) |
| Lời hứa với người bán | *"Rao tới khi gặp đúng người mua"* — *"Khách hỏi gì tụi em trả lời; chỉ nhắn anh chị khi thật sự cần xác minh hoặc chốt lịch xem. Không spam."* (`app/raoban/page.tsx`, bước 3) |

## 6.10 Accessibility

- Tương phản chữ ≥ 4.5:1, chữ lớn ≥ 3:1; vùng chạm ≥ 44×44px (persona P3, 61 tuổi).
- Mọi ảnh listing có `alt` sinh từ mô tả rút gọn; điều hướng bàn phím đầy đủ.
- Không dùng riêng màu để truyền trạng thái: "Đã bán" phải có chữ.

## 6.11 Khu quản trị theo chuẩn NN/g — cấm dấu hiệu AI trên web (09/09/2026)

[nguồn: chủ dự án 09/09/2026 — "thiết kế giao diện lại cho chuẩn tiêu chuẩn của NN Group, các yếu tố làm web giống AI bỏ hết"]. Áp cho mọi trang `/admin/*`; trang công khai vốn đã sạch.

**Mười heuristic của Nielsen Norman Group → luật cụ thể của mình:**

| # | Heuristic | Luật trong CRM |
|---|---|---|
| 1 | Trạng thái hệ thống nhìn thấy | Mọi lượt lưu/xoá có thông báo kết quả (số dòng đã xoá); nút đang chạy đổi chữ ("Đang lưu…"); chuông trên thanh đếm việc chờ + lỗi bot |
| 2 | Khớp thế giới thật | Chữ người dùng Việt, không đọc tên cột (`boc_tach` → "JSON bóc tách") |
| 3 | Người dùng kiểm soát | Mọi form có Huỷ; xoá có hộp xác nhận nêu hậu quả và "không hoàn tác" |
| 4 | Nhất quán | Một bộ nút (`components/ui.tsx`: primary/secondary/danger/ghost), một bộ icon SVG (`icons.tsx`), tab = URL |
| 5 | Ngăn lỗi | Xoá khách/tin phải confirm; câu mẫu sửa hỏng thì bot dùng câu mặc định trong code, không câm (`cau_mau.cau`; bản cũ: JSON prompt `bot_prompts` hỏng thì dùng bản mã) |
| 6 | Nhận ra hơn nhớ | Icon luôn kèm chữ trên màn rộng; breadcrumb; đường dẫn hiện tại sáng |
| 7 | Linh hoạt | Ô tìm chung trên thanh; lọc bằng chip; phím tab đi được |
| 8 | Tối giản | Không emoji, không pill tròn cho nút/ô nhập, không đổ bóng, không gradient, không nhấp nháy |
| 9 | Lỗi có cách sửa | Hộp lỗi nói "Lỗi: …" kèm nút đóng; không toast biến mất tự động |
| 10 | Trợ giúp | Tooltip (`title`) trên nút đặc biệt; trang Câu chuẩn (`/admin/cau-chuan`, thay trang mẫu câu đã gỡ) có câu dẫn cách dùng |

**Cấm dấu hiệu AI trên web** (song song với bảng quyết định giọng chat §6.8): dấu gạch dài "—" (dùng "-" hoặc dấu chấm, chủ dự án 09/09); mũi tên "→ ↗ ←" trong nút và nhãn (dùng chữ: "Quay lại", "Xem bảng", "thành"); emoji làm icon; nút/ô nhập bo tròn hoàn toàn (`rounded-full`) trừ avatar và chấm trạng thái; `shadow-*` trên thẻ và nút (chỉ modal/menu nổi được `shadow-lg`); gradient; `animate-pulse`; chữ `font-extrabold` khắp nơi; nhãn kiểu "Admin Console", "✨"; mô tả sáo. Kiểm bằng `bun run truyvet`? — chưa; soát tay bằng lệnh đếm emoji trong `app/` + `components/` (0 là đạt, trừ `✓`/`✗` dạng chữ).

**Nút bắt buộc có ở đúng chỗ (soát 09/09, khung đổi 19/10):** thanh trên: Đăng tin, chuông, tìm; cột trái: đăng xuất có chữ · Tin nhắn: Làm mới, Đã xử lý (khi cần người thật), Giữ khách / Trả bot, Xoá khách, "Chấm / sửa câu này" ở mỗi câu bot (đưa sang `/admin/cau-chuan`, SRS-5.1zzzzzzz88; nút cũ "Sửa thành câu chuẩn" gỡ 18/10/2026, SRS-5.1zzzzzzz46) · Rổ hàng: Sửa (xoá tin là "Xoá vĩnh viễn…" trong màn Sửa), Tải CSV, JSON, Đăng tin mới · Mẫu câu (trang `/admin/mau-cau` đã gỡ 18/10/2026, SRS-5.1zzzzzzz46): Sửa, Xoá, Mở chat, Tải JSONL · Bàn làm việc: bốn ô số liệu (ba ô là link tới Khách hàng / Rổ hàng / Vận hành, "Cần xử lý" là số).

**Khung CRM (19/10/2026, SRS-5.1zzzzzzz72)** [nguồn: chủ dự án 19/10/2026 — "sửa lại nguyên cái layout crm đi chứ thấy hơi rối"]:
điều hướng có MỘT chỗ — cột trái chia nhóm theo việc (Hằng ngày · Rổ hàng · Hệ thống), dưới 1024px thành một hàng cuộn ngang.
Mỗi trang / tab có tiêu đề riêng (`PageHeader`), không lặp tiêu đề hay ô số liệu giữa các tab, không link "Quay lại" (cột trái lo).
Thao tác huỷ hoại hàng loạt không đặt cạnh việc hằng ngày (khối "Dữ liệu thử" cuối Vận hành). Chân trang công khai không hiện trong
CRM. Thẻ `rounded-lg`. Danh sách cần duyệt là DÒNG (một dòng thông tin, nút bên phải), không phải thẻ cao. Không trang nào được
tràn ngang ở 390px.

**Tránh dấu hiệu "AI slop" (12/11/2026, SRS-5.1zzzzzzz437)** [nguồn: chủ dự án 12/11/2026 — danh sách 20 dấu hiệu, "Sửa luôn"]: không đặt nhãn chữ in hoa nhỏ trên tiêu đề khối, không chấm câu cuối tiêu đề, không đánh số "1. 2. 3." cho các bước, không vẽ khung chat giả làm minh hoạ, không lồng thẻ có viền trong thẻ, không quầng sáng / gradient trang trí, không chữ nghiêng, không chip viên thuốc cho link thường. Chữ phụ trên nền tối dùng `text-line-strong`, không dùng trắng mờ.

**Góc bo (12/11/2026)** [nguồn: chủ dự án 12/11/2026 — "Đổi góc bo sang 14px như King" (SRS-5.1zzzzzzz434), rồi cùng ngày "14px ko phải cố định" (SRS-5.1zzzzzzz452); thay quyết định 2px ngày 19/10]: góc bo **theo cỡ** như theme King — khối lớn (thẻ, khung, ảnh: `rounded-lg` trở lên, `rounded-king`, `rounded-shot`) **14px**; nút, ô nhập, chip lọc (`rounded-md`) **8px**; nhãn nhỏ trên ảnh, mã tin (`rounded` / `rounded-sm`) **6px**; `rounded-xs` 4px. Đặt ở MỘT chỗ — thang `--radius-*` trong `app/globals.css`. Không viết `rounded-[Npx]` hay `border-radius` tay. `rounded-full` chỉ cho hình tròn thật (avatar, chấm trạng thái, thanh tiến độ), không cho nút.

## 6.12 Bộ NÚT dùng chung (10/09/2026)

[nguồn: chủ dự án 10/09/2026 — "bàn làm việc và web cảm giác vẫn quá AI, để các nút hiển thị tốt hơn đi"]

Ba dấu hiệu làm một cái nút trông như máy sinh ra, và cách sửa từng cái:

| Dấu hiệu | Sửa |
|---|---|
| Mỗi nút một cỡ — chữ, padding, chiều cao đều lệch nhau | Chiều cao CHUNG: web `min-height: 44px` (chạm được bằng ngón tay, WCAG 2.5.5), khu quản trị `min-h-9` cho vùng dữ liệu dày |
| Bấm không thấy gì xảy ra | `active:translate-y-px` trên mọi nút; nút chính thêm bóng đỏ rất nhẹ CHỈ khi rê, bỏ bóng khi nhấn |
| Nút phụ trông như cái thẻ | Viền đậm hơn viền khung một nấc (`border-mute/35`), nền trắng đục, rê thì viền và chữ chuyển sang đỏ brand |

Web dùng bốn lớp trong `app/globals.css`: `.nut` (nền chung), `.nut-chinh`, `.nut-phu`, `.nut-nhe`, thêm `.nut-nho` khi cần cỡ nhỏ. Khu `/admin` giữ `components/ui.tsx` với góc bo nhỏ hơn nhưng CÙNG ngôn ngữ trạng thái. Vòng focus dùng `ring-brand/45` có offset, không dùng outline mặc định của trình duyệt.

Nút chính **không bao giờ** có bóng ở trạng thái nghỉ — bóng thường trực là thứ khiến trang trông như bản mẫu dựng sẵn.

## 6.13 Quan hệ với theme tham chiếu

| Kế thừa từ Veedoo | Loại bỏ |
|---|---|
| Lưới card 2 cột với ảnh lớn | Ảnh nhà kiểu Âu Mỹ, biệt thự có hồ bơi |
| Thanh search dính đầu trang | Bộ lọc dropdown Keyword/Type/Location (trái INS-07) |
| Khối thông số nổi trên hero chi tiết | Khối "Floor Plans", "Signature Features" |
| Cấu trúc footer 4 cột | Form đăng ký email (trái NFR-07 — kênh là Zalo) |
| Cặp màu cam nhấn / navy đậm (LỊCH SỬ 26/08–12/11; từ 12/11 skin King đỏ `#e60023` / đen `#13151d` / nền `#f6f7f9`, font Nunito — SRS-5.1zzzzzzz430) | Toàn bộ asset, icon, font của theme (NFR-15) |
| — | Khối bình luận/review công khai trên trang BĐS |
