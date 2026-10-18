# 01 — Research

> Nguồn: `biz model.docx/.pdf`, `OKRs eo2024.pptx`, `demo2Vitalify.docx`,
> `chats w B.docx`, `S's side.docx`, `dự kiến vốn 6 tháng đầu.xlsx`.
> Mọi số liệu thị trường ngoài các file này là **giả định BA** và được đánh dấu rõ.
> Ảnh theme tham chiếu (`Vedoo pages/`) đã xoá khỏi repo; phần chưng cất nằm ở
> `06-ui-design.md §6.11`.

## 1.1 Bối cảnh & định vị

Tuyên ngôn định vị: **"the permanent agent of agents"** — người môi giới thường
trực, không nghỉ, đứng phía sau mọi môi giới khác [nguồn: OKRs eo2024.pptx, slide 1].
Bốn năng lực tự tuyên bố là bốn trụ sản phẩm:

| Slide | Tuyên bố | Trụ sản phẩm |
|---|---|---|
| 2 | *I understand all your needs* | Hiểu nhu cầu qua hội thoại tự nhiên (NLU) |
| 3 | *I tell you all the best properties for you* | Gợi ý listing xếp hạng theo nhu cầu |
| 4 | *I will look for more information for you* | Vòng hỏi-đáp bổ sung thông tin từ S |
| 5 | *I will find out more about your tastes* | Học sở thích dài hạn, cá nhân hoá |

Concept gốc [nguồn: demo2Vitalify.docx]: *"The aim is to create a listing service
that works around chats. (…) Once it starts, the chat never ends!"*

### INS-01 — Chat là sản phẩm, listing chỉ là mồi
Website không phải nơi chốt; nó là phễu SEO đẩy người dùng sang Zalo OA càng sớm
càng tốt [nguồn: biz model.docx §Website và Zalo]. Hệ quả: mọi trang web đều có CTA
sang Zalo, và CTA phải **mang theo ngữ cảnh tìm kiếm**.

### INS-02 — Chu kỳ mua nhà dài 3–4 năm, không phải 3–4 tuần
> *"nhadat.CC muốn phục vụ khách hàng tìm kiếm trong suốt 3-4 năm cho tới khi họ
> mua được nhà"* [nguồn: chats w B.docx §Trước khi Zalo xóa].

Chỉ số thành công không phải conversion trong phiên mà là **giữ kết nối Zalo sống
qua nhiều năm** → kéo theo INS-03 và INS-04.

### INS-03 — Zalo xoá kết nối sau 7 ngày im lặng
Zalo cắt kết nối OA↔user nếu user không nhắn gì trong 7 ngày [nguồn: chats w B.docx
§Trước khi Zalo xóa]. Với chu kỳ 3–4 năm đây là **rủi ro tồn vong của tài sản khách
hàng**: bắt buộc có tái kích hoạt chủ động, và phải khiến B *nhắn lại* chứ không chỉ *đọc*.

### INS-04 — Riêng tư là điểm khác biệt cạnh tranh
> *"Tụi em không spam nên không hỏi số điện thoại của anh chị"*
> [nguồn: nhadat.cc website.docx §Tụi em không hỏi số ĐT].

Nỗi đau lớn nhất của người tìm nhà là bị hàng chục môi giới gọi sau khi để lại số —
*"40 cuộc gọi trong 3 ngày"* [nguồn: trao đổi chủ dự án, 22/08/2026]. nhadat.cc chọn
**không thu số điện thoại** làm lời hứa thương hiệu. Ngoại lệ duy nhất: đặt lịch xem
nhà, chat mẫu vẫn hỏi SĐT [nguồn: chats w B.docx §Hẹn xem nhà] — OPEN-05.

### INS-05 — Người bán không muốn điền form
S chỉ gõ **một câu rao thông thường**: *"Bán nhà HXH xe tải quay đầu, gần ngã tư
Trần Bình Trọng và An Dương Vương, giá 9 tỉ có thể bớt lộc, Phường 4 Quận 5 nhà
trệt dễ xây lại"*. AI bóc tách trường (Vị trí / Đường / Quy mô / Giá) và viết lại
nhiều biến thể [nguồn: S's side.docx §Rao bằng câu rao thông thường]. Form nhiều
trường là phản mô hình.

### INS-06 — Thông tin listing luôn thiếu, và đó là tính năng
Vòng lặp trung tâm: B hỏi → hệ thống không biết → hỏi ngược S → S trả lời →
**listing giàu thêm** → phục vụ cả B sau. Câu hỏi lặp nhiều nhất [nguồn: chats w
B.docx §Các thông tin cần hỏi S]: "Bán chưa em?", "Chỗ này mở quán ăn được không?",
"Cho chị xem sổ đỏ", "Có hình cái hẻm không?", "Có vướng quy hoạch không?". Mỗi
vòng hỏi-đáp là **cơ chế làm giàu dữ liệu miễn phí**.

### INS-07 — Ngôn ngữ tìm kiếm là ngôn ngữ nói, không phải bộ lọc
*"Có nhà gần ngã tư Nguyễn Trãi với Trần Bình Trọng không em?"*, *"Có nhà gần hồ
bơi Lam Sơn không?"*, *"Giá cỡ căn này quanh đây còn căn nào không?"* [nguồn: chats
w B.docx §Hỏi nhà quanh 1 vị trí]. Không dropdown nào diễn đạt được "gần ngã tư X
và Y" → ô search trên web là **ô chat** [nguồn: nhadat.cc website.docx §Search].

### INS-09 — Lời hứa phía bán: "rao một lần là xong"
> *"Bên em sẽ rao bán cho đến khi gặp người mua mà bên em thấy là phù hợp nhất, để
> anh chỉ cần nhắn cho bọn em là xong, không có spam"* [nguồn: trao đổi chủ dự án, 22/08/2026].

Không-spam áp cho **cả hai phía**: S rao một câu, hệ thống tự viết lại, tự trả lời B,
chỉ liên hệ lại S khi thật sự cần. Mặt đối xứng của INS-04.

### INS-08 — Mật độ dữ liệu quan trọng hơn độ phủ địa lý
OKR 1 là phủ **90% thị trường Quận 5** rồi mới lan sang quận khác [nguồn: biz
model.docx §OKRs]. "Một quận thật sâu" cho phép trả lời câu hỏi vi mô ("gần hồ bơi
Lam Sơn", "hẻm 174 Trần Bình Trọng") — thứ site toàn quốc không làm được.

### INS-10 — Hàng dự án là một loại hàng khác hẳn hàng lẻ
Tình huống *"bán căn 50 của Ny'ah"* [nguồn: trao đổi chủ dự án, 22/08/2026]. Hàng dự
án khác hàng lẻ ở ba điểm:
1. **Dữ liệu hai tầng** — phần lớn thuộc *dự án* (vị trí, CĐT, pháp lý, tiện ích, mặt
   bằng, tiến độ), phần nhỏ thuộc *căn* (mã, tầng, hướng, DT, giá, trạng thái). Câu
   tầng dự án trả lời ngay, không hỏi ngược S (INS-06 chỉ áp cho tầng căn).
2. **Tồn kho thay đổi liên tục** — "căn 50 còn không?" phải đúng theo từng căn; sai
   tồn kho mất uy tín nhanh vì người mua so được với bảng hàng môi giới khác.
3. **Một tin rao ↔ nhiều căn** — gợi ý phải xuống tới mức căn ("còn căn 2PN tầng
   trung, hướng Đông").

Phạm vi MVP: OPEN-15. Nhu cầu CRM "đã bán những căn nào": OPEN-16.

### INS-11 — Bot là trung gian toàn phần: lưu hết, khai khi khách hỏi, liên hệ mở lúc chốt lịch xem
Spec "Cầu Nối BĐS" v2 đẩy INS-04 xa hơn: hai bên **không nhắn trực tiếp cho nhau**,
mọi trao đổi qua bot; danh tính chỉ mở tại **một khoảnh khắc: lịch xem nhà đã chốt**
[nguồn: artifact "Cầu Nối BĐS" v2, phiên nhadat-bot, 08/2026]. Chủ dự án chỉnh
(OPEN-36): *không* ẩn danh tuyệt đối — mọi thông tin người bán đã chia sẻ được lưu và
**khai khi khách hỏi** (địa chỉ, thông số, fact); chỉ SĐT/Zalo chờ tới bước chốt lịch.

Hệ quả: (1) vị thế trung gian là tài sản — hai bên không "đi đêm" bỏ phí; (2) cần
**lọc liên hệ chủ động** mọi tin/ảnh relay (SĐT, Zalo ID); (3) trạng thái listing,
matching, hàng đợi nằm trong DB — LLM chỉ hiểu ý định và trích xuất.

### INS-12 — Sau sáp nhập 2025, địa giới CŨ vẫn là ngôn ngữ của thị trường
Từ 1/7/2025 TP.HCM bỏ cấp quận, sáp nhập phường (NQ 202/2025/QH15), nhưng thị trường
vẫn tìm và định giá theo địa giới cũ: radanhadat.vn giữa 2026 vẫn chạy toàn bộ URL
SEO theo quận/phường cũ và xử lý địa giới mới bằng bài tra cứu cũ↔mới [nguồn:
WebSearch 24/08/2026]. Địa bàn chốt: Sài Gòn theo phường mới + Long An (FR-174,
OPEN-27 nửa đầu); trục tên cũ/mới cho hiển thị là OPEN-27 nửa sau. Insight vẫn
đứng: dân gọi tên cũ, hệ thống phải hiểu cả hai.

Hệ quả: taxonomy `04` giữ Quận 5 + phường cũ; cần bảng ánh xạ `ward_mapping`
(FR-118) cho pháp lý/sổ đỏ và content SEO "tra cứu sau sáp nhập"; bot hiểu cả hai
cách gọi và quy về cùng khu vực.

### INS-13 — Bộ trường tin rao "chuẩn sàn" là mẫu số chung của thị trường
Đối chiếu mogi.vn (qua HTML fixture crawler + mã crawler mở) và radanhadat.vn (quy
chế đăng tin + snippet Google) [nguồn: WebSearch + GitHub 02/09/2026 — chưa đọc DOM
trực tiếp, cần xác minh khi có trình duyệt thật]:

| Trường | mogi.vn | radanhadat.vn | nhadat.cc (FR-172) |
|---|---|---|---|
| Giá · diện tích · giá/m² | có · có · không | có · có · có (tự tính) | có · có · `price_per_m2_vnd` |
| Ngang × dài | gộp trong ngoặc "145 m² (8x18,12)" | trường riêng | `frontage_m`, `length_m`, `rear_width_m` |
| Số tầng · PN · WC | không · có · "nhà tắm" | **bắt buộc** cả ba | `floors`(+`floors_text`) · `bedrooms` · `bathrooms` |
| Đường vào | ở cấp danh mục (`mua-nha-mat-tien-pho` / `mua-nha-hem-ngo`) | bắt buộc, text | `access_type` + `alley_width_m` + `distance_to_street_m` |
| Pháp lý · hoàn công | enum · không | bắt buộc · không | `legal_status` · `has_completion` |
| Hướng | tuỳ chọn | bắt buộc; chung cư tách cửa/ban công | `direction` |
| Nội thất · năm xây · quy hoạch | không | có · không · lớp bản đồ | `furnishing` · `year_built` · `planning_status` |
| Dự án · đường phố | `-prj####`, `-sid####` | dự án là chiều địa lý thứ 5 | `project_id`, `street` |
| Chính chủ / môi giới | không có (mọi tài khoản = môi giới) | không thấy nhãn | `seller_type` gán từ chat (FR-159) |
| Lịch sử giá · giá đã giao dịch | không | không | `deals` (FR-142) — **khe hở cả hai sàn** |

Rút ra: (1) bộ tối thiểu thị trường = diện tích, giá, ngang×dài, tầng, PN, WC, hướng,
đường vào, pháp lý (+ giá/m², dự án) — đưa vào cột thật (FR-172); (2) khe hở: giá
đã giao dịch, lịch sử tin, so sánh cùng hẻm; mogi lộ SĐT + toạ độ trong HTML nên ẩn
danh hai chiều (INS-11) là khác biệt thật; (3) không bắt điền form (INS-05): lấy
cùng 10 trường bằng bóc câu rao + hỏi nhỏ giọt, cột đã bóc thì không hỏi lại.

## 1.2 Người dùng

### Bên mua (B)
Chân dung từ 24 hội thoại mẫu `chats w B.docx`:
- Xưng anh/chị/em, giọng miền Nam, kỳ vọng lễ phép và **nhanh**.
- Ngân sách chủ đạo **6–13 tỉ**, cá biệt 21–30 tỉ.
- Tiêu chí lặp: quận/phường → giá → HXH/MT → diện tích → pháp lý.
- Mục đích chia hai nhánh: **để ở** vs **đầu tư / kinh doanh** — câu hỏi tiếp theo
  khác hẳn ("mở quán ăn được không" vs "hoàn công chưa").
- Hành vi: xem 3 căn → xin thêm → xin ảnh → hỏi 1 căn cụ thể → im lặng.

### Bên bán (S)
- **CCRB**: rao 1–2 căn, ngại form, phản hồi chậm, cần CTV dẫn khách.
- **NMG**: rao nhiều căn, chịu tiêu chuẩn [nguồn: biz model.docx §NMG]: tối thiểu
  **10 BĐS** đang rao; tỉ lệ thành công **≥ 5%** (MA 6 tháng); chấm dứt khi bị
  chấm **≤ 3/5 sao** ở bất kỳ tương tác nào.

### Nội bộ
- **CTV** (1.5 FTE 6 tháng đầu): dẫn xem nhà, quản lý NMG, hưởng 0.5%.
- **Admin buyer side**: xử lý escalation (`admin.buyerside@nhadat.cc` theo tài liệu
  gốc; nay qua `/admin` + Zalo/ntfy).

## 1.3 Mô hình kinh doanh

| Bên | Phí | Ghi chú |
|---|---|---|
| B (mua/thuê) | **0đ** | Lời hứa thương hiệu |
| CCRB | **1%** giá trị BĐS | 0.5% trả CTV, 0.5% giữ lại |
| NMG | **0.5%** giá trị BĐS | NMG tự dẫn khách |
| Cho thuê | **3/4 tháng tiền thuê** | Quy đổi từ mức 1% |

[nguồn: biz model.docx §Doanh thu]

### OKRs 6 tháng sau launch
1. Phủ **90%** thị trường mua/bán/thuê Quận 5.
2. **20 NMG** chuyên Quận 5.
3. **10 cuộc chat mới/ngày**, mỗi cuộc **≥ 30 tin nhắn**.
4. **1 giao dịch / 2 ngày**, giá trị trung bình **10 tỉ**.

> **Cảnh báo BA.** OKR 4 hàm ý ~90 giao dịch × 10 tỉ × ~0.75% ≈ **6.7 tỉ doanh thu**,
> trong khi OKR 3 chỉ tạo ~1.800 cuộc chat → chuyển đổi ~5%, bằng ngưỡng tối thiểu
> áp cho NMG. Xem OPEN-01.

## 1.4 Ràng buộc nguồn lực

Ngân sách 6 tháng đầu **800.000.000 VND** [nguồn: dự kiến vốn 6 tháng đầu.xlsx]:

| # | Khoản | Số tiền | Ghi chú |
|---|---|---|---|
| 1 | Xây dựng hệ thống | 390.000.000 | Vitalify (vendor) |
| 2 | Tạo trang web | 28.000.000 | nhadat.cc |
| 3 | Duy trì hệ thống 6 tháng | 120.000.000 | 20tr/tháng |
| 4 | CTV | 63.000.000 | 1.5 CTV × 7tr × 6 tháng |
| 5 | Quảng cáo dẫn link | 120.000.000 | 20tr/tháng (batdongsan.com.vn…) |
| 6 | Tư vấn khác | 29.000.000 | quản lý CTV |
| 7 | Roadshow, event | 50.000.000 | gọi vốn |
| | **Tổng** | **800.000.000** | |

Hệ quả: **418tr cho toàn bộ build** → MVP cắt gọn (web + Zalo OA + admin tối thiểu);
**1.5 CTV** → ~2–3 lịch xem/ngày, phải xếp hàng và ưu tiên; **20tr/tháng mua traffic**
từ batdongsan → chưa cạnh tranh SEO trực diện 6 tháng đầu.

## 1.5 Đối thủ & tham chiếu

| Nhóm | Đại diện | Điểm mạnh | Khe hở nhadat.cc khai thác |
|---|---|---|---|
| Portal listing VN | batdongsan.com.vn, chotot Nhà | Traffic, độ phủ toàn quốc | Bán lead → user bị spam gọi; tin trùng, tin ảo |
| Sàn/môi giới truyền thống | Đại lý khu vực | Quan hệ, biết hàng thật | Không trực 24/7, phủ hẹp, không lưu nhu cầu khách |
| Chat-first quốc tế | (concept `demo2Vitalify.docx`) | — | Chưa có bản địa hoá Zalo |
| Portal thế hệ mới | **radanhadat.vn** (MCDX, 10/2024) | Đăng tin 0đ, công cụ cho môi giới, SEO facet mạnh | Listing-first bán hiển thị; không có tầng hội thoại giữ khách — §1.5b |
| Portal tối giản | **mogi.vn** | Danh mục 2 cấp phân biệt MT/hẻm; SEO tới cấp đường; trang giá theo quận | ~7 trường cấu trúc; lộ SĐT + toạ độ trong HTML (ngược FR-104); không có khái niệm chính chủ — INS-13 |

### 1.5b Phân tích sâu đối thủ trực tiếp: radanhadat.vn

Hình mẫu tham chiếu gần nhất theo chủ dự án ("làm cũng tương tự web này") [nguồn:
trao đổi chủ dự án, 24/08/2026]. Tái dựng từ nguồn thứ cấp — index Google, bài PR
(VnExpress, CafeF, Dân trí, baodautu, Vietnamnet 12/2024–2025), mô tả app
[nguồn: WebSearch 24/08/2026]; cần xác minh bằng crawl trực tiếp trước khi trích số.

- **Mô hình**: doanh thu từ phía đăng tin (tin thường/VIP/premium + combo), đang chạy
  **đăng tin 0 đồng** để gom cung — cùng bài toán "nguồn hàng trước" (RSK-04).
- **B-side**: tìm theo thời gian di chuyển; kiểm tra quy hoạch trong luồng xem tin;
  công cụ tài chính; tìm theo tiện ích xung quanh.
- **Môi giới** (app 2025): kho hàng chuẩn hoá; **matching nhu cầu khách ↔ kho** đặt
  trong tay môi giới (ta đặt ở bot — `interests`/FR-108); chia sẻ kho giữa môi giới;
  lộ trình đánh giá hiệu suất môi giới (≈ FR-137).
- **Đăng tin (S)**: đăng nhập Google/Microsoft → SĐT + OTP → CCCD/MST → form nhiều
  trường → duyệt tin. Chính là form nhiều bước INS-05 gọi là phản mô hình.
- **IA/SEO**: URL facet `/mua-ban-nha-dat-{tinh}[-{quan}]/gia-tu-{X}-den-{Y}[-dt-…]`,
  title gắn "mới nhất T{tháng}/{năm}"; content hub `/edutech/`; **URL vẫn theo
  quận/phường cũ** → củng cố INS-12.

| | radanhadat.vn | nhadat.cc học / khác |
|---|---|---|
| Học | URL facet + title theo tháng; content hub quy hoạch/sáp nhập; địa giới cũ làm trục | Áp vào `04`; thêm content ánh xạ cũ↔mới (INS-12) |
| Học | Checklist trường chuẩn hoá theo loại BĐS | `required_facts`/`listing_missing_facts` (INS-06) |
| Khác | Listing-first; liên hệ = lộ SĐT trên tin | Chat-first, hội thoại 3–4 năm (INS-01/02), ẩn danh hai chiều (INS-11) |
| Khác | Môi giới là khách trả tiền, phủ toàn quốc | Phí theo giao dịch, sâu một quận (INS-08) |
| Né | Đăng tin nhiều bước + duyệt tay | Rao một câu qua Zalo, AI viết lại (INS-05, FR-109) |

Ba công cụ B-side của họ là ứng viên giai đoạn sau dạng **trả lời trong chat** thay vì
widget — OPEN-19. Tham chiếu giao diện: theme **Veedoo** (`06 §6.11`); theme thương
mại `ThemeForest/` đã loại khỏi repo, chỉ tham chiếu bố cục (OPEN-07).

### 1.5c Đối chiếu MÔ HÌNH DỮ LIỆU với ba sàn: họ lưu gì, mình còn thiếu gì (02/09/2026)

Yêu cầu chủ dự án: *"xem mấy web kia nó lưu cái gì vào db, còn thiếu gì so với
project mình"*. Ba sàn đọc qua fixture HTML, crawler mở, quy chế và snippet index
(cả ba chặn truy cập trực tiếp) [nguồn: WebSearch + GitHub 02/09/2026].

| Thực thể | mogi | radanhadat | batdongsan | nhadat.cc | Còn thiếu / đánh giá |
|---|---|---|---|---|---|
| **Tin rao** | ~7 trường | 10 bắt buộc + kích thước | 8 trường + giá/m² + tags | 24 cột + giá/m² (FR-172) | Đủ; thêm được `rental_yield_pct` |
| **Vòng đời tin** | hạn 30 ngày, làm mới | không bao giờ xoá, lịch sử đẩy | đăng/hết hạn/hẹn giờ/đăng lại | 5 trạng thái + `property_events` (FR-70, `20260904f`) | ✅ đã dựng |
| **Người đăng** | hồ sơ công khai `/moi-gioi/…-uid`, KYC | xếp hạng top 10/tháng | KYC đầy đủ, ≥5 tin/30 ngày | `sellers`, `agents_public`, `/moi-gioi` | Cố ý không lộ danh tính (INS-11); KYC NMG — OPEN-36 |
| **Ví · gói tin** | 3 gói, TOP/VIP, ví | điểm theo khung giờ, ví hai túi | túi tiền có HSD, tin tài trợ | không có — phí thành công (`deals.fee_pct`) | Không phải khoảng trống (ASM-05) |
| **Lưu tin · tìm kiếm đã lưu** | có, `searchkey` | lưu tin, tin đã xem | lưu tìm kiếm → thông báo | tim = localStorage (FR-121); `buyers.preferences`; `match` nudge (FR-64, `20260904d`) | ✅ đã dựng, kênh là Zalo |
| **Lượt xem · thống kê** | lượt xem + sự kiện có nghĩa | lượt xem, lịch sử đẩy | theo ngày: hiển thị/xem/xem SĐT | `listing_views` chỉ người đăng nhập | **Thiếu `listing_stats_daily`** (đếm ẩn danh từ `TrackView`) → bot báo chủ nhà "tuần này 12 khách xem" |
| **Lead / khách** | hộp thư, bấm hiện số | CRM app, matching, chia sẻ giỏ | lead = xem SĐT/gọi/form | `conversations`/`messages`/`preferences`/`interests`/`viewings`/`deals` | Giàu hơn cả ba vì chat-first; không cần SĐT khách (INS-04) |
| **Kiểm duyệt · báo xấu** | duyệt trước, khoá leo thang | SLA 4h, khiếu nại 7/15 ngày | duyệt ≤8h, báo xấu + hotline | `cho_thong_tin` → admin duyệt (FR-127) | **Thiếu `listing_reports`** ("bán rồi", "giá sai") + lý do gỡ (RSK-06) |
| **Xác thực tin** | — | — | hồ sơ xác thực, nhãn 45 ngày | `last_confirmed_at`, `specs_source`, bucket `listing-private` | Thiếu nhãn + hạn "xác minh với chủ ngày X" trên web/bot |
| **Taxonomy · đường · sáp nhập** | bảng phẳng, polygon, tra sáp nhập | quận cũ trên URL | id tới cấp đường, mỗi cấp một trang | `ward` text, `street` (FR-172), `ward_mapping` (FR-118) chưa | **Thiếu `streets`** (`/duong/…`, INS-08) + `ward_mapping` |
| **POI · di chuyển · quy hoạch** | địa điểm `pid` → landing "gần X" | lớp FIMO quy hoạch/ngập, isochrone | POI quanh dự án | `landmarks` chưa dựng; `lat/lng` 164/173 | `tien_ich` (OSM, 3 km quanh mỗi tin) + tìm tin gần mốc `tin_gan_moc` — FR-204, 11/09/2026; quy hoạch/ngập — OPEN-37 |
| **Dự án · CĐT** | id riêng, review | schema CĐT/block/tầng/căn | dự án + doanh nghiệp, timeline | `projects` jsonb, 1 dự án | Đủ; tách `developers` khi > 3 dự án |
| **Giá khu vực · lịch sử** | đường × loại × tháng, 10 năm | bài biên tập | phường × loại × quý, API lịch sử | `/thong-ke` tính tại chỗ (FR-120), `deals.price_vnd` | **Thiếu snapshot `gia_khu_vuc` hằng tháng** (kèm giá đã chốt — không sàn nào có) |
| **Ảnh** | CDN crop nhiều cỡ | ảnh + video | crop + watermark, 3–24 ảnh, 360° | `listing_media` file gốc | Thiếu thumbnail/watermark — OPEN-38 |
| **Công cụ tài chính** | tính vay | tỉ suất trên từng tin | lãi suất trang dự án | `/tinh-lai-vay` (FR-119) | Thêm `rental_yield_pct` |

**Kết luận.** Về *tin rao* đã ngang hoặc hơn; về *khách* hơn hẳn vì chat-first.
Khoảng trống thật là **lớp "chuyện gì đã xảy ra với tin theo thời gian"** — lượt xem,
giá theo tháng, báo tin sai. Thứ tự đề xuất, mỗi việc một migration nhỏ:
1. ✅ `property_events` + `hot_score` (FR-70/73 — `20260904f`).
2. ✅ `match` tin mới ↔ `buyers.preferences` → bot nhắn (FR-64 — `20260904d`).
3. `gia_khu_vuc` snapshot tháng từ `listings` + `deals` (FR-99, FR-120).
4. `listing_reports` + lý do gỡ tin (RSK-06, FR-127).
5. `streets` + `ward_mapping` (FR-118, INS-08).
6. `pois` Quận 5 + khoảng cách mỗi tin (INS-07).
7. Nhãn "đã xác minh với chủ nhà ngày X" + `rental_yield_pct`.

Chờ chủ dự án: OPEN-36 (KYC người bán), OPEN-37 (quy hoạch/ngập), OPEN-38
(thumbnail/watermark). Không đề xuất: ví/gói tin, SĐT khách trong lead (INS-04), CRM
chia sẻ giữa môi giới (OPEN-16).

## 1.6 Rủi ro đã nhận diện

| ID | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| RSK-01 | Zalo cắt kết nối sau 7 ngày (INS-03) | Cao | Tái kích hoạt ngày 5–6, nội dung buộc B trả lời |
| RSK-02 | Phụ thuộc một nền tảng đóng (Zalo) | Cao | Trừu tượng hoá tầng messaging; roadmap Messenger, Telegram [nguồn: biz model.docx §Tài khoản chat cá nhân] |
| RSK-03 | AI trả lời sai về pháp lý / quy hoạch | Cao | Không bao giờ khẳng định; chuyển thành câu hỏi cho S (INS-06) |
| RSK-04 | Không đủ nguồn hàng → chat rỗng | Cao | OKR 2 (20 NMG) là điều kiện tiên quyết của OKR 3 |
| RSK-05 | 1.5 CTV không tải nổi lịch xem | Trung bình | Hàng đợi + ưu tiên theo giá trị BĐS và độ nóng |
| RSK-06 | Tin ảo / đã bán còn hiển thị | Trung bình | Hỏi "còn bán không" định kỳ (FR-103); hiển thị "cập nhật lần cuối" |
| RSK-07 | Lộ dữ liệu cá nhân (sổ đỏ, CCCD) qua chat | Cao | Ảnh sổ lưu bucket riêng, URL ký hạn ngắn |

## 1.7 Khoảng trống dữ liệu

Không có trong tài liệu gốc, cần bổ sung trước khi chốt scope:
1. Số liệu thị trường sơ cấp Quận 5 (số BĐS đang rao, giá trung bình, thanh khoản).
2. Phỏng vấn người dùng thật — chân dung B hiện dựa trên hội thoại *giả định*.
3. Danh sách TOP-100 keyword BĐS (file `.xlsm`, chưa có trong repo — OPEN-06).
4. Hạn mức API và chính sách nội dung Zalo OA cho ngành BĐS.
