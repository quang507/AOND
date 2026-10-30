# 02 — Requirements

Quy ước ưu tiên: **M** = Must (MVP), **S** = Should (sau MVP), **C** = Could (backlog).
Ký hiệu trạng thái: `✅` đã dựng · `🟡` một phần · `❌` chưa dựng · `⛔` deprecated.
Tài liệu này nói **yêu cầu là gì và trạng thái hôm nay**. Con trỏ hiện thực đầy đủ ở
`08-traceability.md` §8.3, kịch bản nghiệm thu ở `10-ke-hoach-kiem-thu.md`, lịch sử ở git log.

## 2.1 Mục tiêu kinh doanh

| ID | Mục tiêu | Đo bằng |
|---|---|---|
| BR-01 | Phủ 90% nguồn hàng mua/bán/thuê trên từng cụm địa bàn đang mở (Quận 5 cũ là cụm khởi điểm; địa bàn mở rộng Sài Gòn + Long An — FR-174) | Số listing active / ước lượng tổng thị trường |
| BR-02 | Xây mạng lưới 20 NMG, mỗi người chuyên một khu trong địa bàn | Số NMG active đạt chuẩn |
| BR-03 | 10 cuộc chat mới/ngày, ≥30 tin/cuộc, không rác | Bảng thống kê hội thoại (FR-71) |
| BR-04 | 1 giao dịch / 2 ngày, TB 10 tỉ | Sổ giao dịch |
| BR-05 | Thu phí bên bán: CCRB 1%, NMG 0.5% | Doanh thu ghi nhận |
| BR-06 | Miễn phí và **không thu số ĐT** của B | Chính sách sản phẩm, kiểm tra được trong log |
| BR-07 | Giữ kết nối Zalo sống suốt chu kỳ mua 3–4 năm | Tỉ lệ kết nối còn sống sau 30/90/365 ngày |
| BR-08 | SEO cho 100 keyword BĐS hot nhất | Thứ hạng Google, organic traffic |
| BR-09 | Website đẩy được B sang Zalo kèm ngữ cảnh (kênh hiện tại: Zalo cá nhân qua bridge, hai số — SRS-5.1zzzzzzz210) | Tỉ lệ click "Bắt đầu kết nối" |

## 2.2 Persona

### P1 — Chị Dương, 42, người mua để ở
Tìm nhà Quận 5 dưới 12 tỉ, HXH. Đã bị 4 sàn gọi làm phiền nên **không để lại số ĐT**.
Hỏi rất cụ thể: sổ đỏ, hoàn công, quy hoạch, ảnh cái hẻm. Quyết định theo tháng, không theo phiên.
> Nhu cầu #1: được trả lời thật, nhanh, và không bị gọi điện.

### P2 — Anh Hưng, 35, nhà đầu tư
Quan tâm dòng tiền và khả năng kinh doanh: mở quán được không, cho thuê bao nhiêu,
xây lại được không. Xem nhiều căn, so sánh nhanh, phản hồi cụt.
> Nhu cầu #1: danh sách so sánh được, cập nhật liên tục căn mới.

### P3 — Cô Bảy, 61, CCRB
Có một căn ở Phường 4 Quận 5 cần bán. Không dùng app BĐS, chỉ dùng Zalo.
Gõ một câu là hết vốn liếng công nghệ. Sợ bị lộ thông tin, sợ mất phí oan.
> Nhu cầu #1: rao được trong 2 phút, và có người thật dẫn khách tới.

### P4 — Anh Tuấn, 29, NMG
Có 10–30 căn. Muốn thêm nguồn khách mà không tốn phí đăng tin.
Chấp nhận trả 0.5% khi thành công, nhưng phải nhận được câu hỏi của khách **ngay**.
> Nhu cầu #1: dòng lead ổn định, phản hồi câu hỏi nhanh để không mất khách.

### P5 — Ngân, 26, CTV nhadat.cc
[deprecated 28/10/2026 — bỏ CTV, chủ dự án 28/10; việc từng giao CTV nay là admin] 1.5 FTE cho toàn hệ thống. Nhận lịch xem nhà, gọi CCRB, dẫn khách, chấm điểm NMG.
> Nhu cầu #1: một hàng đợi công việc rõ ràng, có ưu tiên.

## 2.3 Phạm vi

### Trong phạm vi MVP
Website nhadat.cc (giới thiệu, listing, search, SEO, CTA Zalo) · chatbot Zalo cho B (nay: Zalo cá nhân qua bridge, lõi Python) ·
Mini-site rao tin cho S · Vòng hỏi-đáp bổ sung thông tin S↔B · Đặt lịch xem nhà ·
Admin backend buyer side · Email notification · Bảng thống kê xuất Excel.

### Ngoài phạm vi MVP
App native · Thanh toán online · Ký hợp đồng điện tử · Định giá tự động đầy đủ ·
Facebook Messenger / Telegram · Đa ngôn ngữ · Cổng NMG tự phục vụ đầy đủ
(MVP do admin vận hành thủ công; CTV bỏ 28/10/2026).

---

## 2.4 Yêu cầu chức năng

> Mỗi dòng FR chỉ còn tiêu đề (đã có sẵn trong bản cũ) + trạng thái + ưu tiên + nguồn. Nội dung đầy đủ, chi tiết hiện thực và lịch sử từng FR ở `docs/02-requirements-luu-tru.md` (cùng mã, chỉ tra cứu — 30/10/2026, chủ dự án: "ba file BA lớn dọn đi"). Hành vi hiện tại của bot: code `src/aioi/` + 10 mục SRS mới nhất ở `docs/07`.

**Hiện trạng 28/10/2026** [nguồn: chủ dự án 28/10/2026, chat]: bộ não duy nhất là lõi Python `src/aioi/` (SRS-5.1zzzzzzz31 / 46); edge function `chat-reply`, `zalo-webhook`, `nudge`, `ask-seller`, `ctv-report`, `inbound-sweep`, bảng `bot_prompts`, `listing_facts`, `required_facts`, `inbound_ledger` đã gỡ 18–19/10. Kênh là Zalo cá nhân qua bridge `zca-js` (hai số: ký gửi và tư vấn người mua, SRS-5.1zzzzzzz210), không phải Zalo OA. CTV bỏ hẳn: việc từng giao CTV nay là admin. Dòng nào còn nhắc thứ đã gỡ thì có ghi "Hiện trạng 28/10/2026" hoặc `[deprecated 28/10/2026 …]`; phần còn lại của ô đó là lịch sử.

### A. Website công khai (WEB)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-01 | ✅ **Landing giới thiệu dịch vụ.** | M | website.docx §Giới thiệu dịch vụ |
| FR-02 | ✅ **Ô search dạng chat ở trang chủ.** | M | website.docx §Search |
| FR-03 | ✅ **Khối "Hỏi bất kỳ, có tức thì".** | M | website.docx |
| FR-04 | ✅ **Khối cam kết riêng tư.** | M | website.docx §Tụi em không hỏi số ĐT |
| FR-05 | 🟡 **Cam kết theo dõi dài hạn.** | M | website.docx |
| FR-06 | ✅ **CTA sang mini-site người bán.** | M | website.docx |
| FR-07 | ✅ **Trang listing dạng lưới card.** | M | website.docx §Listing |
| FR-08 | ✅ **Trang kết quả nói lại truy vấn.** | M | website.docx §Search |
| FR-09 | 🟡 **Search hiểu ngôn ngữ tự nhiên.** | M | website.docx §Search; INS-07 |
| FR-10 | ✅ **Trang chi tiết BĐS.** | M | website.docx §Chi tiết 1 BĐS |
| FR-11 | ✅ **Cue nhắc mã tin.** | M | website.docx §Cue |
| FR-12 | 🟡 **Trang tag SEO.** | M | website.docx §Tag |
| FR-13 | ✅ **Hộp mời kết nối Zalo.** | M | website.docx §Hộp mời kết nối |
| FR-14 | ✅ **Chuyển sang Zalo mang theo ngữ cảnh.** | M | website.docx §Hộp mời kết nối |
| FR-15 | 🟡 **Điều hướng nội bộ trước khi sang Zalo.** | S | website.docx §Tăng cường SEO |
| FR-16 | ❌ **Fingerprint khách vãng lai.** | S | PDF hệ thống §1 |
| FR-17 | ✅ **Nền SEO kỹ thuật.** | M | BR-08 [giả định BA] |

### B. Zalo — phía mua (BOT)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-20 | ✅ **Chào lần đầu.** | M | chats w B.docx §Chào hỏi |
| FR-21 | 🟡 **Chào khi gặp lại.** | M | chats w B.docx §Nếu gặp lại |
| FR-22 | 🟡 **Truy vấn theo vị trí ở mọi mức.** | M | chats w B.docx §Hỏi nhà quanh 1 vị trí |
| FR-23 | 🟡 **Truy vấn giá.** | M | chats w B.docx §Hỏi giá |
| FR-24 | 🟡 **Tối đa 3 listing mỗi tin nhắn** | M | chats w B.docx; S's side.docx §Show a list |
| FR-25 | ⛔ [deprecated 28/10/2026 — bot không đọc mã tin cho khách, đưa link web `web.link_tin` (SRS-5.1zzzzzzz145 / 220)] **Định dạng listing trong chat** | M | chats w B.docx |
| FR-26 | ✅ **Khai thác nhu cầu sâu.** | M | chats w B.docx §Lấy thêm nhu cầu |
| FR-27 | ✅ **Gửi ảnh theo yêu cầu.** | M | chats w B.docx §Khi chỉ gửi 1 số hình |
| FR-28 | ❌ **Tiện ích quanh BĐS.** | S | chats w B.docx §Khi trả lời về tiện ích |
| FR-29 | ✅ **Vào từ quảng cáo với một mã BĐS.** | M | chats w B.docx §Hỏi đáp từ quảng cáo |
| FR-30 | 🟡 **Nhận ngữ cảnh tìm kiếm từ website.** | M | website.docx; FR-14 |
| FR-31 | 🟡 **Gợi ý căn tương tự.** | S | chats w B.docx |
| FR-32 | ❌ **Chủ động khi B im sau một BĐS.** | S | chats w B.docx §Khi khách không hỏi gì thêm |

### C. Vòng hỏi-đáp bổ sung thông tin (ASK)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-40 | ✅ **Không chắc thì không đoán.** | M | chats w B.docx; RSK-03 |
| FR-41 | ✅ **Yêu cầu mang đủ ngữ cảnh** | M | chats w B.docx §Gọi API về S side |
| FR-42 | ✅ **Định tuyến câu hỏi.** | M | chats w B.docx |
| FR-43 | ✅ **Câu trả lời quay về kèm nguyên văn và file/ảnh.** | M | chats w B.docx |
| FR-44 | ✅ **Trả lời của S cập nhật luôn listing** | M | S's side.docx §Hỏi thêm thông tin từ S |
| FR-45 | 🟡 **Giữ nhịp trong lúc chờ S.** | M | S's side.docx |
| FR-46 | ✅ **Nhóm câu hỏi chuẩn hoá** | M | chats w B.docx |
| FR-47 | ✅ **SLA cho yêu cầu thông tin.** | S | [giả định BA] |

### D. Đặt lịch xem nhà (VIEW)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-50 | ✅ **Khởi động đặt lịch.** | M | chats w B.docx §Hẹn xem nhà |
| FR-51 | ✅ **Xác nhận đúng căn trước khi chốt giờ** | M | chats w B.docx |
| FR-52 | ✅ [deprecated 28/10/2026 phần CTV — bỏ CTV, chủ dự án 28/10; lịch đi thẳng admin, SRS-5.1zzzzzzz165 / 173] **Chốt lịch qua CTV.** | M | chats w B.docx |
| FR-53 | ✅ **Xin số điện thoại chỉ tại bước này** | M | chats w B.docx; xung đột INS-04 → OPEN-05 |
| FR-54 | ❌ **Gửi link Google Maps ghim vị trí.** | M | chats w B.docx |
| FR-55 | ❌ **Nhắc trước giờ hẹn.** | M | chats w B.docx §Nhắc trước khi xem |
| FR-56 | 🟡 **Hỏi cảm nhận sau khi xem.** | M | chats w B.docx §Không chịu xem nhà |
| FR-57 | 🟡 **Yêu cầu xem nhà sinh sự kiện + email `[VIEWING]` cho admin.** | M | chats w B.docx §Hẹn xem nhà (backend) |

### E. Giữ chân & tái kích hoạt (RET)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-60 | ❌ **Follow-up sau 5 ngày im lặng.** | M | chats w B.docx §Follow-up; quyết định chủ dự án 04/09/2026 |
| FR-61 | ❌ **Nội dung hỏi thăm đa dạng.** | M | chats w B.docx §Hỏi về căn nhà cuối cùng |
| FR-62 | ❌ **Chào căn khác cùng khu / cùng tầm giá** | M | chats w B.docx §Chào những căn khác |
| FR-63 | ✅ **Chống Zalo xoá kết nối.** | M | chats w B.docx §Trước khi Zalo xóa; RSK-01 |
| FR-64 | ✅ **Báo tin mới khớp tiêu chí đã lưu.** | M | website.docx §Mất vài năm mới tìm được căn nhà |
| FR-65 | 🟡 **Xin đánh giá chất lượng ở 3 thời điểm** | S | chats w B.docx §Đánh giá chất lượng |

### F. Admin — buyer side (ADM)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-70 | 🟡 **Bảng sự kiện BĐS** | M | chats w B.docx §Backend của B Side |
| FR-71 | 🟡 **Bảng thống kê hội thoại** | M | chats w B.docx §Thống kê cuộc trò chuyện |
| FR-72 | ✅ **Định nghĩa cuộc trò chuyện** | M | chats w B.docx |
| FR-73 | ✅ **BĐS hot nhất** | M | chats w B.docx §BĐS 'hot' nhất |
| FR-74 | 🟡 **Tìm kiếm B.** | M | chats w B.docx §Tìm kiếm B |
| FR-75 | 🟡 **Nhảy từ kết quả sang Zalo xem lịch sử hội thoại.** | M | chats w B.docx |
| FR-76 | 🟡 **Danh sách câu hỏi của B chờ S trả lời** | M | chats w B.docx §Các câu hỏi của B cần S trả lời |
| FR-77 | 🟡 **Danh sách phản ứng tiêu cực** | M | chats w B.docx §Phản ứng tiêu cực |
| FR-78 | ✅ **Danh sách hẹn xem nhà** | M | chats w B.docx §Hẹn xem nhà |
| FR-79 | 🟡 **Danh sách yêu cầu voice chat.** | M | chats w B.docx §Khách hàng muốn voice chat |
| FR-80 | ✅ **Mọi danh sách admin phân trang 20 mục/trang.** | M | chats w B.docx |
| FR-81 | 🟡 **Email cho admin ở mọi mục FR-76…79.** | M | chats w B.docx §Email notification |

### G. Mini-site & luồng người bán (SEL)

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-90 | ⛔ [deprecated → FR-158] **Mini-site rao bán/cho thuê 2024.** | — | S's side.docx; chốt 08/09/2026 OPEN-48 |
| FR-91 | ✅ **Rao bằng một câu thông thường** | M | S's side.docx; INS-05 |
| FR-92 | ✅ **AI bóc tách trường từ câu rao** | M | S's side.docx §Bóc tách trường |
| FR-93 | ❌ **Sinh nhiều biến thể câu rao** | M | S's side.docx |
| FR-94 | ⛔ [deprecated → FR-177] **Màn xác nhận bóc tách trên web 2024.** | — | PDF hệ thống §2; chốt 08/09/2026 OPEN-48 |
| FR-95 | ⛔ [deprecated → Bridge Zalo] **Đăng nhập Zalo SSO 2024.** | — | chốt 08/09/2026 OPEN-48 |
| FR-96 | ✅ **Upload nhiều ảnh cho listing.** | M | PDF hệ thống §3 |
| FR-97 | ⛔ [deprecated → FR-109] **Link mini-site cho người muốn bán.** | — | S's side.docx §List new |
| FR-98 | 🟡 **S trả lời câu hỏi bổ sung ngay trong chat** | M | S's side.docx §Hỏi thêm thông tin từ S |
| FR-99 | 🟡 **Định giá bằng so sánh nhanh.** | S | S's side.docx §Dịch vụ của nhadatCC cho S |
| FR-100 | ⛔ [deprecated → CRM /admin] **Danh sách riêng cho một khách.** | — | chốt 08/09/2026 OPEN-48 |
| FR-101 | ✅ **Phân loại S là CCRB hay NMG để áp đúng mức phí.** | M | biz model.docx |
| FR-102 | ⛔ [deprecated → FR-137] **Theo dõi chuẩn NMG.** | S | biz model.docx §NMG; chủ dự án chốt 27/08/2026 |
| FR-103 | 🟡 **Lời hứa "rao một lần là xong".** | M | trao đổi chủ dự án 22/08/2026; INS-09 |

### H. Trung gian ẩn danh & vòng đời listing (BROKER)

Nguồn cả nhóm: artifact "Cầu Nối BĐS" v2 (08/2026) — spec này thắng khi mâu thuẫn với mục cũ.

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-104 | ✅ **Không chủ động phơi thông tin, khai khi được hỏi.** | M | INS-11; quyết định chủ dự án 02/09/2026 |
| FR-105 | 🟡 **Lọc liên hệ trước khi chuyển tiếp.** | M | INS-11 |
| FR-106 | ⛔ [deprecated → FR-139] **Vòng đời listing bản cũ.** | M | Cầu Nối §Vòng đời |
| FR-107 | ⛔ [deprecated → FR-129/FR-144] **TTL xác nhận 7 ngày.** | M → S | Cầu Nối §F2; DH-03 |
| FR-108 | 🟡 **Sổ quan tâm và báo khi căn đã chốt.** | M | Cầu Nối §F2 |
| FR-109 | ✅ **Rao tin từng bước ngay trong Zalo** | M | Cầu Nối §F1; thay FR-97 |
| FR-110 | 🟡 **Timeout hỏi S.** | M | Cầu Nối §F3 |
| FR-111 | 🟡 **Ảnh từ Zalo là URL tạm.** | M | Cầu Nối §Kiến trúc |
| FR-112 | ✅ **Sổ giao dịch làm căn cứ tính phí.** | M | Cầu Nối §F4; OPEN-16 (b) |

### I. Hàng dự án (PROJECT)

Nguồn cả nhóm: OPEN-15 phương án (b), chủ dự án 24/08/2026; phân tích INS-10.
Phạm vi MVP: **đặt nền dữ liệu**, chưa làm UI giỏ hàng riêng.

| ID | Yêu cầu | Ưu tiên | Nguồn |
|---|---|---|---|
| FR-113 | ✅ **Data model dự án.** | M | OPEN-15 (b); INS-10 |
| FR-114 | 🟡 **Gắn tin vào dự án lúc rao.** | M | OPEN-15 (b); chủ dự án 09/09/2026 |
| FR-115 | ✅ **Trả lời câu hỏi tầng dự án từ dữ liệu chung** | M | INS-10 |
| FR-116 | 🟡 **"Căn X của dự án Y còn không?"** | M | INS-10; Cầu Nối §F2 |
| FR-117 | 🟡 **Trang dự án `/du-an/{slug}` + màn quản lý giỏ hàng** | S | OPEN-15 (b) |
| FR-118 | 🟡 **Địa giới hành chính hai tên.** | M | INS-12; quyết định chủ dự án 24/08/2026 |
| FR-119 | ⛔ [deprecated → Aioinhadat 2026] **Máy tính lãi vay `/tinh-lai-vay`.** | — | chốt 08/09/2026 OPEN-48 |
| FR-120 | ⛔ [deprecated → Aioinhadat 2026] **Trang `/thong-ke`.** | — | chốt 08/09/2026 OPEN-48 |
| FR-121 | ⛔ [deprecated → interests Zalo] **Lưu tin yêu thích trên web.** | — | chốt 08/09/2026 OPEN-48 |
| FR-122 | ⛔ [deprecated → Aioinhadat 2026] **Bản đồ `/ban-do`.** | — | chốt 08/09/2026 OPEN-48 |
| FR-123 | ✅ **Bộ lọc danh sách.** | M | port từ NhaDat-Radar |
| FR-124 | ⛔ [deprecated → Zalo UID] **Tài khoản NMG magic-link 2024.** | — | chốt 08/09/2026 OPEN-48 |
| FR-125 | ⛔ [deprecated → Aioinhadat 2026] **Trang `/moi-gioi`.** | — | chốt 08/09/2026 OPEN-48 |
| FR-126 | ⛔ [deprecated → Zalo UID] **Tài khoản người mua trên web 2024.** | — | chốt 08/09/2026 OPEN-48 |
| FR-127 | ✅ **Trang `/admin` duyệt tin.** | S | quyết định chủ dự án 25/08/2026 |
| FR-128 | ✅ **Cột `listings.bedrooms` + lọc "N+ phòng ngủ".** | S | hoàn thiện FR-123 |
| FR-129 | 🟡 **Hỏi nhỏ giọt người bán.** | M | quyết định chủ dự án 25/08/2026; INS-06, INS-09 |
| FR-130 | ✅ **Khai thác nhu cầu người mua nhỏ giọt, giống người.** | M | quyết định chủ dự án 25/08/2026; UF-04 |
| FR-131 | ✅ **Gộp tin nhắn gõ vụn, không delay nhân tạo.** | M | quyết định chủ dự án 25/08/2026 |
| FR-132 | ✅ **Kho dự án, ưu tiên dự án đang phân phối.** | M | quyết định chủ dự án 25/08/2026; INS-10 |
| FR-133 | 🟡 **Nhắc hẹn + hỏi thăm khi im lặng.** | M | quyết định chủ dự án 25/08/2026; INS-03 |
| FR-134 | ✅ **Bot đọc ảnh khách gửi (vision).** | S | quyết định chủ dự án 25/08/2026 |
| FR-135 | ✅ **Cờ cần người thật.** | M | quyết định chủ dự án 25/08/2026 |
| FR-136 | ⛔ [deprecated 28/10/2026 — bỏ CTV, chủ dự án 28/10; trigger `trg_conversations_assign_ctv` + hàm `assign_ctv_round_robin` gỡ (`20261025a`, SRS-5.1zzzzzzz172)] **CRM CTV — chia đơn xoay vòng.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-137 | ⛔ [deprecated 28/10/2026 — bỏ CTV, chủ dự án 28/10; `ctv-report` và bảng `ctv_daily_reports` gỡ 18/10/2026, SRS-5.1zzzzzzz31 / 46] **Báo cáo CTV 17h mỗi ngày.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-138 | ⛔ [deprecated 28/10/2026 — SRS-5.1zzzzzzz46: `bot_prompts` và `_shared/prompts.ts` gỡ; prompt chỉ ở `src/aioi/prompts.py`, câu nói nguyên văn sửa ở `/admin/cau-chuan` (bảng `cau_mau`, SRS-5.1zzzzzzz106)] **Cấu hình "não" bot không cần deploy.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-139 | ✅ **Vòng đời tin theo trạng thái tiếng Việt.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-140 | ✅ **Fallback hỏi-chủ-nhà → CTV → admin.** | M | yêu cầu chủ dự án 25/08/2026; cập nhật 02–03/09/2026 |
| FR-141 | ✅ **Người thật chăm thì bot nhường sân.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-142 | ✅ **Chốt giao dịch theo tín hiệu đồng ý.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-143 | ✅ **Bot gửi hình thật cho khách.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-144 | ✅ **Vòng thu thập thông tin chính chủ trọn đời tin.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-145 | ✅ **Widget Zalo trên web.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-146 | ✅ **Trần 100 tin/24h mỗi khách.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-151 | ✅ **Hai cổng chặn đốt tiền model.** | M | soát rate limit 27/08/2026 |
| FR-147 | ⛔ [deprecated 28/10/2026 — bỏ CTV, chủ dự án 28/10; `nudge` gỡ 18/10/2026, SRS-5.1zzzzzzz31 / 46; khách cần người thật nay báo thẳng admin bằng tin 🙋 (`supabase_store.bao_can_nguoi`, FR-135)] **Leo thang cần-người-thật: CTV → admin.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-148 | ✅ **Kho ảnh thật cho tin rao.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-149 | ✅ **Mọi báo cáo cuối đường về Zalo cá nhân admin.** | M | yêu cầu chủ dự án 25/08/2026 |
| FR-150 | ✅ **Thiếu dữ liệu thì suy giảm êm, không chết lặng.** | M | soát cấu trúc dữ liệu + yêu cầu chủ dự án 26/08/2026 |
| FR-152 | ✅ **Sổ lỗi bền + nhịp tim bot.** | M | soát cloud/compute 27/08/2026; soát 04/09/2026 |
| FR-153 | ✅ **Câu trả lời nhỏ giọt chảy ngược vào cột có cấu trúc.** | S | yêu cầu chủ dự án 27/08/2026 |
| FR-154 | ✅ **Bóc giá tiếng lóng ra số VND.** | M | yêu cầu chủ dự án 27/08/2026 |
| FR-155 | ✅ **Hạng người rao Đồng / Bạc / Vàng.** | S | yêu cầu chủ dự án 27/08/2026 |
| FR-156 | ✅ **Admin tự đăng tin theo nguồn** | M | yêu cầu chủ dự án 27/08/2026 |
| FR-157 | ✅ **Neo hội thoại người bán theo CĂN, tách vai từng lượt.** | M | soát cấu trúc 27/08/2026; OPEN-22 |
| FR-158 | ✅ **Câu rao sinh mã tin ngay, cả hệ chỉ còn MỘT dãy mã.** | M | yêu cầu chủ dự án 27/08/2026 |
| FR-159 | ✅ **Phân vai bằng câu hỏi mở đầu, mặc định là người mua.** | M | quyết định chủ dự án 27/08, 02/09 và 07/09/2026 |
| FR-160 | 🟡 **Từ 3 tin rao BÁN trở lên thì tính phí như môi giới.** | M | quyết định chủ dự án 27/08/2026; chủ dự án 28/10/2026, chat |
| FR-161 | ✅ **Bot nghe được tiếng Việt KHÔNG DẤU ở mọi tầng cổng.** | M | quyết định chủ dự án 27/08/2026 (OPEN-29) |
| FR-162 | 🟡 **Sổ idempotency cho tin đến.** | M | yêu cầu chủ dự án 27/08/2026 |
| FR-163 | ✅ **Toàn vẹn dữ liệu ở tầng DB.** | M | yêu cầu chủ dự án 28/08/2026 |
| FR-164 | ✅ **Đường ống dữ liệu tin rao — một nhà chức trách cho mỗi chặng.** | M | yêu cầu chủ dự án 28/08/2026 |
| FR-165 | ✅ **Kho ảnh neo vào ID bất biến, có bảng media thật.** | M | yêu cầu chủ dự án 29/08/2026 |
| FR-166 | ✅ **Việc chạy nền tin cậy.** | M | yêu cầu chủ dự án 29/08/2026 |
| FR-167 | ✅ **Soát bảo mật theo VAI THẬT.** | M | yêu cầu chủ dự án 29/08/2026 |
| FR-168 | ✅ **Chuông báo hết tiền tài khoản AI.** | M | yêu cầu chủ dự án 01/09/2026 |
| FR-169 | ✅ **Đo tiền bộ não theo CHỮ.** | M | yêu cầu chủ dự án 01/09/2026 |
| FR-170 | ✅ **Soát bóc dữ liệu theo bốn vai người nhắn.** | M | yêu cầu chủ dự án 01/09/2026 |
| FR-171 | ✅ **Tối ưu chi phí vận hành, không đổi hành vi với khách.** | S | yêu cầu chủ dự án 02/09/2026; số đo `[giả định BA — đo trên DB thật + e2e]` |
| FR-172 | ✅ **Tin rao CÓ CẤU TRÚC chuẩn sàn.** | M | yêu cầu chủ dự án 02/09/2026; số đo `[giả định BA — đo trên DB thật]` |
| FR-173 | ✅ **Câu khách hỏi đi về chủ nhà trước, 12 giờ không trả lời mới về CTV; CTV chậm thì rớt hạng và admin đỡ khách.** | M | quyết định chủ dự án 03/09/2026 |
| FR-174 | 🟡 **Địa bàn mở — Sài Gòn (phường mới) + Long An, trọng tâm bán.** | M | quyết định chủ dự án 03/09/2026; 15/09/2026; 17/09/2026 |
| FR-175 | ✅ **Rổ hàng đọc như Excel, không cần vào Supabase.** | M | phản hồi sếp qua chủ dự án 07/09/2026; chủ dự án 09/09/2026 |
| FR-176 | ✅ **Giọng người bán tự nhiên — câu sau bám câu trước, câu lệch thì hỏi lại.** | M | sếp qua chủ dự án 07/09/2026; log bridge 15:36–15:40; Gemini share "AI Ơi Nhà Đất" (d) 17/09/2026 (Zalo thật 16:42): câu rao mang ĐỊA CHỈ ở đường khác căn đang hỏi ("cô có căn nhà hẻm 4m Trần Hưng Đạo…" khi đang hỏi phường căn hẻm 4m Nguyễn Trãi) là căn KHÁC → mở tin mới, không ghi vào tin cũ; vị trí ghi từ câu dài chỉ lấy mệnh đề địa chỉ. 💾 báo cả HỒ SƠ vừa lưu: lượt mở hồ sơ có `Zalo: "…3339"` (che, 4 ký tự cuối), lượt ghi cách gọi có `cách gọi: "cô"`. Câu hỏi phường ngắn, nhắc địa chỉ đã có: "Hẻm 4m Trần Hưng Đạo đó phường mấy cô nhỉ?"; model chép nguyên văn câu hỏi kế, không thêm lý do. |
| FR-177 | ✅ **Nhận ký gửi như môi giới giỏi: hỏi một thứ, khích lệ một câu, chốt bằng bản nháp tin có điểm.** | M | sếp qua chủ dự án 07/09/2026; chủ dự án 09/09/2026; Gemini "Kịch bản huấn luyện môi giới BĐS" |
| FR-178 | ✅ **Giọng bot xây từ Aioinhadat lên, không đọc mã tin cho khách, có few-shot người bán.** | M | chủ dự án 07/09/2026; AOND SRD; Gemini |
| FR-179 | ⛔ [deprecated 28/10/2026 — lệnh "hello" xoá dữ liệu bỏ 22/10, `$$$$$` gỡ 26/10 (SRS-5.1zzzzzzz195); xoá phiên nay bằng lệnh gõ tay `/quit` (`src/aioi/lenh_zalo.py`, SRS-5.1zzzzzzz211)] **Chế độ test: nhắn "hello" là xoá sạch dữ liệu của số Zalo đó, tiếp đón như khách mới.** | C | chủ dự án 09/09/2026 |
| FR-180 | [deprecated 18/10/2026 — SRS-5.1zzzzzzz46: lõi Python không đọc `mau_cau`; trang /admin/mau-cau, nút "Sửa thành câu chuẩn" và bảng đã gỡ, 2 dòng mẫu chép sang `luu_tru.ts_mau_cau_20261018`] **Mẫu câu chuẩn — tài sản huấn luyện giọng bot.** | M | chủ dự án 09/09/2026 |
| FR-181 | ✅ **Mỗi khách một tên trợ lý riêng, giữ suốt; không còn một tên Thái.** | M | chủ dự án 09/09/2026 chiều (đối chiếu chat Gemini "AI Ơi Nhà Đất" 21–27/06/2026, chốt từng dòng OPEN-55) |
| FR-182 | ✅ **Chat Gemini 21/06 đối chiếu với hệ thống — 14 dòng đã chốt từng dòng.** | S | chủ dự án 09/09/2026 chiều (đối chiếu chat Gemini "AI Ơi Nhà Đất" 21–27/06/2026, chốt từng dòng OPEN-55) |
| FR-183 | ✅ **Điểm người rao 0–100, song song với điểm từng tin.** | M | chủ dự án 09/09/2026 chiều (đối chiếu chat Gemini "AI Ơi Nhà Đất" 21–27/06/2026, chốt từng dòng OPEN-55) |
| FR-184 | ✅ **Chủ nhà báo "bán rồi / không bán nữa" thì bot tự đóng tin và xác nhận; nhiều căn thì hỏi căn nào.** | M | chủ dự án 09/09/2026 chiều (đối chiếu chat Gemini "AI Ơi Nhà Đất" 21–27/06/2026, chốt từng dòng OPEN-55) |
| FR-185 | ✅ **Ảnh chủ nhà gửi qua chat vào KHO của mình, được phân loại, ảnh sổ đọc diện tích đối chiếu.** | M | chủ dự án 09/09/2026 chiều (đối chiếu chat Gemini "AI Ơi Nhà Đất" 21–27/06/2026, chốt từng dòng OPEN-55) |
| FR-186 | ✅ **Bộ câu hỏi theo loại BĐS và cho thuê, thứ tự hỏi giống người trong nghề; hướng hỏi với chung cư và đất.** | M | chủ dự án 09/09/2026 chiều (đối chiếu chat Gemini "AI Ơi Nhà Đất" 21–27/06/2026, chốt từng dòng OPEN-55); tối: chủ dự án 09/09/2026 tối ("chia luôn từ lúc có câu rao phân loại… file json dành cho từng mã BĐS chứ không phải nguyên một rổ dài… trang null trong Supabase thì không cần hiển thị… chia nhóm luôn, đọc lại 2 cái chat Gemini xem có trường hợp nào, đây là production nên không thể bỏ sót"); chat Gemini 21/06 lượt 38 (§III SRD: toà nhà dòng tiền, đất nông nghiệp, SKC/TMD, kho xưởng) + lượt 65–67 (câu hỏi bù: móng, hẻm thông, ngập, cách mặt tiền, trường học, công chứng, gym); chat 07/09 (sổ cầm tay hay thế chấp, đang ở hay cho thuê, động cơ bán, giá linh động) |
| FR-188 | 🟡 **Cần bán gấp / không gấp là một thông tin, hỏi ngay sau giá; khách mua cũng có cờ gấp; căn gấp lên đầu khi ghép.** | M | chủ dự án 10/09/2026 00:40 ("triển khai hết không được sót cái nào"; chat Gemini 21/06 lượt 1, 33, 34, 35–36, 57–60) |
| FR-189 | ✅ **Người thật giữ khách / trả lại bot.** | M | chủ dự án 10/09/2026 00:40 ("triển khai hết không được sót cái nào"; chat Gemini 21/06 lượt 1, 33, 34, 35–36, 57–60) |
| FR-190 | ⛔ [deprecated 28/10/2026 — bỏ CTV, chủ dự án 28/10; `assign_ctv_round_robin` gỡ (`20261025a`, SRS-5.1zzzzzzz172), câu khách hỏi đi chủ nhà / admin (SRS-5.1zzzzzzz170)] **CTV theo khu vực, trần 15 ca đang mở.** | M | chủ dự án 10/09/2026 00:40 ("triển khai hết không được sót cái nào"; chat Gemini 21/06 lượt 1, 33, 34, 35–36, 57–60) |
| FR-191 | ❌ **Keep-alive 6 ngày theo luật 7 ngày Zalo.** | M | chủ dự án 10/09/2026 00:40 ("triển khai hết không được sót cái nào"; chat Gemini 21/06 lượt 1, 33, 34, 35–36, 57–60) |
| FR-192 | ✅ **Quota tiêu hao hiện trong CRM: lượt gọi model so với trần ngày, số dư tài khoản model, người nhắn nhiều nhất so với trần theo người.** | M | chủ dự án 10/09/2026 ~10:20 ("có chỗ để hiển thị quota tiêu hao trong admin đi") |
| FR-193 | ✅ **Đọc được chữ THIẾU DẤU và viết tắt lẫn trong câu có dấu; không tự khẳng định quận; chào lại khi khách chào.** | M | chủ dự án 10/09/2026 ~10:45 (ảnh chụp Zalo OA) |
| FR-194 | ✅ **Đường dự phòng khi model chính hết số dư: tự chuyển sang Groq thay vì rơi về câu mẫu.** | S | chủ dự án 10/09/2026 ~11:10 · 15/09/2026 · 23/09/2026 |
| FR-195 | ✅ **Lượm thông tin DỰ ÁN từ chat, có cửa duyệt.** | S | chủ dự án 10/09/2026 |
| FR-196 | ✅ **Số về dự án lấy từ KHO, không lấy từ trí nhớ model; model đào lại hồ sơ dự án thành bảng.** | S | chủ dự án 10/09/2026 |
| FR-197 | ✅ **Dọn dữ liệu KIỂM THỬ lúc 21 giờ mỗi tối; màn hình nói đúng trạng thái model; chuông đếm theo LOẠI lỗi.** | S | chủ dự án 10/09/2026 |
| FR-198 | ✅ **Model chính hạ xuống Haiku 4.5, đổi được bằng secret mà không cần deploy; tham số riêng của họ Claude 5 phải lọc theo model.** | S | chủ dự án 10/09/2026 |
| FR-199 | ✅ **Lưới VÉT bằng model: câu có mùi dự án mà tầng tiền định không nhặt được gì thì cho model bóc, kết quả vào hàng chờ duyệt.** | M | chủ dự án 10/09/2026 |
| FR-200 | ⛔ [deprecated 28/10/2026 — trang `/admin/prompt` và bảng `bot_prompts` gỡ 18/10/2026, SRS-5.1zzzzzzz31 / 46; prompt chỉ ở `src/aioi/prompts.py`, câu mẫu sửa ở `/admin/cau-chuan`] **Sửa prompt bot ngay trong CRM (`/admin/prompt`), và màn hình nói rõ sửa xong thì đồng bộ tới đâu.** | S | chủ dự án 10/09/2026 |
| FR-201 | ✅ **Rao tin chỉ đi qua màn SỬA: nút “Duyệt & rao tin” nằm trong đó, dropdown ngoài bảng không rao được nữa.** | S | chủ dự án 10/09/2026 |
| FR-202 | ✅ **Lời nhắc chủ động đi Zalo clone khi chưa có OA — tới đúng Zalo ID người nhận, và chủ nhà cũng được nhắc trước buổi xem.** | S | chủ dự án 11/09/2026 |
| FR-203 | ✅ **Đăng nhập lại acc Zalo clone bằng mã QR hiện ngay trên `/admin`; bridge tự nhận ra phiên chết.** | S | chủ dự án 11/09/2026 |
| FR-204 | ✅ **Tìm nhà gần nơi khách muốn (bệnh viện, trường, chợ, siêu thị, công viên, dự án, địa danh) — bot hiểu NGHĨA câu, còn mốc và khoảng cách do SQL tính.** | M | chủ dự án 11/09/2026 |
| FR-205 | ✅ **Phân vai mua/bán bằng AI khi luật cứng không kết luận được — AI đề xuất, code kiểm rồi mới dùng.** | S | chủ dự án 11/09/2026 |
| FR-206 | ✅ **Bản nháp đọc như một TIN RAO THẬT (mẫu tin lẻ mogi.vn), và thứ đã ghi vào DB đi riêng MỘT tin đứng trước.** | S | chủ dự án 12/09/2026 |
| FR-207 | ⛔ [deprecated 28/10/2026] **Ngay sau mỗi tin khách, nhắn lại đúng thứ tin đó ĐÃ LƯU THẬT vào DB — cho cả người bán lẫn người mua.** | — | xem lưu trữ |
| FR-208 | 🟡 **AI bóc tách tin nhắn người bán, CẤM BỊA bằng code kiểm bằng chứng.** | — | xem lưu trữ |
| FR-209 | ✅ **Có tên đường mà không có quận → bot TỰ TRA phường mới (Nominatim) và quận cũ (bảng `wards`), HỎI XÁC NHẬN rồi mới ghi.** | M | chủ dự án 15/09/2026, 23/09/2026 |
| FR-210 | ✅ **Nút XOÁ HÀNG LOẠT ở tab CRM: xoá mọi khách mua, người bán, tin rao để test lại từ đầu; chỉ admin, phải gõ đúng chữ XOA HET.** | S | chủ dự án 15/09/2026 |
| FR-211 | 🟡 **Nhãn tìm kiếm: ý khách nói mà không có ô (yên tĩnh, gần chợ, xe hơi vào nhà…) thành NHÃN trong từ điển đóng, gắn vào tin và LỌC được ở web lẫn bot.** | M | chủ dự án 18/09/2026 |
| FR-212 | ✅ **Từ điển TÊN ĐƯỜNG địa bàn: khách gõ không dấu → bot viết đúng dấu; gõ sai 1–2 ký tự → bot HỎI XÁC NHẬN rồi mới ghi; hẻm không vào từ điển.** | M | chủ dự án 21/09/2026 |
| FR-213 | ✅ **Người mua: nói thật, làm đúng điều đã nói, lọc kho ngay khi đủ tiêu chí.** | M | bắn thật 23/09/2026; chủ dự án 23/09/2026 |
| FR-214 | 🟡 **Một người (một Zalo) vừa đăng NHIỀU nhu cầu mua vừa rao NHIỀU căn bán, trong MỘT hội thoại; bot không trộn chúng.** | M | chủ dự án 23/09/2026; OPEN-22 |
| FR-215 | ⛔ [deprecated 28/10/2026 — luật prompt TS (`bot_prompts`, `bao_lai.ts`) gỡ 18/10/2026, SRS-5.1zzzzzzz31 / 46; giọng hiện tại theo SRS-5.1zzzzzzz207 / 219] **Bot bớt cứng nhắc: bỏ luật "hỏi ĐÚNG MỘT, chép nguyên văn, dưới 30 từ"; dòng 🤖 Đã lưu ghi đầy đủ.** | M | chủ dự án 23/09/2026 |
| FR-216 | ✅ **Tìm theo NGHĨA (RAG) cho rổ hàng + lọc kho theo loại hẻm + nhãn "xe hơi quay đầu".** | M | chủ dự án 23/09/2026 |
| FR-217 | ⛔ [deprecated 28/10/2026 — lệnh `/json` của `chat-reply` gỡ 18/10/2026, SRS-5.1zzzzzzz31 / 46; thay bằng `/state` / `/listings` / `/whoami` (`src/aioi/lenh_zalo.py`, SRS-5.1zzzzzzz211)] **Lệnh TEST "/json" trong Zalo: in ra thứ bot đã lưu cho chính người nhắn.** | S | chủ dự án 23/09/2026 |
| FR-218 | ✅ **Chào gọn, hiểu nhầm ý khách thì xin lỗi; không tự suy điều căn không ghi; đủ quận + giá thì đưa căn ngay.** | S | chủ dự án 23/09/2026 |
| FR-219 | ✅ **Thứ tự hỏi người bán: chủ nhà dễ trả lời trước — một nguyên tắc cho mọi loại BĐS, không cứng nhắc.** | M | chủ dự án 24/09/2026 |
| FR-220 | ✅ **Hỏi bù sau khi lên kệ: nhà có tầng lửng, sân thượng hay tầng hầm không.** | S | chủ dự án 24/09/2026 |
| FR-221 | ✅ **Người bán: loại ảnh đủ hơn + ảnh nhầm; "đăng đi" là đăng luôn; bỏ gạch dài.** | M | chủ dự án 24/09/2026 |
| FR-222 | ✅ **Người bán: không đẻ căn giả, không hiểu "đăng rao bán đi" thành "bán rồi", không hỏi câu ngớ ngẩn.** | M | chủ dự án 24/09/2026 |
| FR-223 | ✅ **Rẽ nhánh câu hỏi người bán theo NỘI DUNG câu trả lời.** | M | chủ dự án 24/09/2026 |
| FR-224 | ✅ **AI đọc NGUYÊN câu khách và trả lời thẳng câu bot đang hỏi — không bắt theo từ khoá.** | M | chủ dự án 25/09/2026 |
| FR-225 | ✅ **Nở hậu, năm xây, "sang tên" — bóc đúng, không bịa, không ghi trùng.** | M | chủ dự án 25/09/2026 |
| FR-226 | ✅ **"Nhà" trần chưa phải nhà phố; AI gộp / sửa thông tin khách nói nhỏ giọt.** | M | chủ dự án 25/09/2026 |
| FR-227 | ✅ **Tra toạ độ OSM qua DB; hẻm từ 3m là hẻm xe hơi; bot tự viết câu sau số nhà.** | M | chủ dự án 25/09/2026 |
| FR-228 | ✅ **Bộ câu tư vấn người mua — hỏi dần, mỗi lượt một câu.** | M | chủ dự án 25/09/2026 |
| FR-229 | ✅ **Bộ câu hỏi người bán theo danh sách của chủ dự án — pháp lý hỏi trước bản nháp; thanh toán / hợp tác / dẫn xem hỏi khi có khách muốn xem.** | M | chủ dự án 25/09/2026 |
| FR-230 | ⛔ [deprecated 28/10/2026 — lời chào nay hỏi cả tìm mua (`cau_mau` `chao_lan_dau`, SRS-5.1zzzzzzz174), số tư vấn chào riêng (`chao_tu_van`, SRS-5.1zzzzzzz210); `bot_prompts` gỡ 18/10/2026, SRS-5.1zzzzzzz31 / 46] **Câu chào chỉ hỏi bán; vá lượt test Zalo căn Botanic.** | M | chủ dự án 27/09/2026 |
| FR-231 | ✅ **Vá lượt test Zalo 26–27/09 của chủ dự án và sếp (nhà Trần Hưng Đạo Q1, đất Cần Đước, nhà Đặng Văn Ngữ).** | M | chủ dự án 27/09/2026 |
| FR-232 | ✅ **Tin bán hỏi ít câu pháp lý trước bản nháp.** | M | chủ dự án 27/09/2026 |
| FR-233 | ✅ **Câu không ghi được vào ô đang hỏi thì ghi chú, KHÔNG hỏi lại.** | M | chủ dự án 27/09/2026 |
| FR-234 | ✅ **Không hỏi lại khi khách nói sang ô khác; AI đọc lại ghi chú trước bản nháp; "cứ đăng trước, chiều gửi thêm" thì đăng luôn.** | M | chủ dự án 28/09/2026 |
| FR-235 | ✅ **Trả lời rồi thì câu hỏi đóng, dù ghi qua đường nào; "ok" sau lời hoãn không mở lại câu hỏi; "bận rồi" không phải "bán rồi".** | M | chủ dự án 28/09/2026 |
| FR-236 | ✅ **Tin lên kệ nói đúng điều khách vừa nói: hướng có trong tin, tin đất gọi là tin đất, "full thổ cư" là đủ thổ cư; "bận" khi bot không hỏi gì thì không xin lỗi hỏi dồn.** | M | chủ dự án 28/09/2026 |
| FR-237 | ✅ **Xin ảnh theo loại BĐS.** | S | chủ dự án 28/09/2026 |
| FR-238 | ✅ **Câu hỏi đứng tên sổ đi nguyên câu mẫu, kể cả ở vòng hỏi bù.** | M | chủ dự án 28/09/2026 |
| FR-239 | ✅ **Sửa 13 chỗ bất hợp lý khi phát lại 3 hội thoại test 27–28/09 trên bot hiện tại; tin đất hỏi giá sớm.** | M | chủ dự án 28/09/2026 |
| FR-240 | ✅ **Nắn tiếp sau khi phát lại 3 hội thoại test trên production (28/09): khen suông, thổ cư hỏi lại, tin đất gọi "nhà" và bỏ câu giá.** | M | chủ dự án 28/09/2026 |
| FR-241 | ✅ **Mười ca làm khó trên production (28/09, lx-70..79): bóc tách sai / hỏi lại, và nhà phố hỏi phòng ngủ sau.** | M | chủ dự án 28/09/2026 |
| FR-242 | ✅ **Năm lỗi luật tìm thấy khi chạy 10 kịch bản mới (K1–K10, 29/09) qua tầng luật — ghi nguyên nhân từng lỗi.** | M | chủ dự án 29/09/2026 |
| FR-243 | ✅ **Tám lỗi còn lại của 10 kịch bản K1–K10 (29/09) chạy qua bot giả lập, phía người bán — ghi nguyên nhân từng lỗi.** | M | chủ dự án 29/09/2026 |
| FR-244 | ✅ **Tám lỗi phía người bán từ 10 kịch bản mới L1–L10 (29/09) chạy qua bot giả lập — ghi nguyên nhân từng lỗi.** | M | chủ dự án 29/09/2026 |
| FR-245 | ✅ **Tách dữ liệu THỬ khỏi dữ liệu THẬT, kho lưu trước khi xoá hàng loạt, máy soi dữ liệu tin hằng ngày.** | M | chủ dự án 29/09/2026 |
| FR-246 | ✅ **Bắn thử bot trên production từ GitHub Actions, không cần Supabase MCP; đổi model chính khi chủ dự án yêu cầu.** | S | chủ dự án 29/09/2026 |
| FR-247 | ✅ **Bốn lỗi từ 6 kịch bản bắn thật trên production 30/09 (workflow `ban-thu.yml`, ID thử `lx-`) — ghi nguyên nhân từng lỗi.** | S | chủ dự án 30/09/2026 |
| FR-248 | ✅ **Các lỗi còn lại sau khi bắn lại 6 kịch bản trên chat-reply v274 (30/09) — ghi nguyên nhân từng lỗi.** | S | chủ dự án 30/09/2026 |
| FR-249 | ✅ **Hai câu hứa suông của nhánh mua lộ ra khi bắn lại trên chat-reply v275 (30/09) — ghi nguyên nhân.** | S | chủ dự án 30/09/2026 |
| FR-250 | ✅ **Bắn thật chat-reply v277 (30/09) khi AI bóc tách chết (Gemini 503) — bốn lỗi, ghi nguyên nhân.** | S | chủ dự án 30/09/2026 |
| FR-187 | ✅ **JSON bóc tách CHIA NHÓM, mỗi mã tin một file; trường trống không hiện; xem ngay trong CRM.** | M | chủ dự án 09/09/2026 tối ("chia luôn từ lúc có câu rao phân loại… file json dành cho từng mã BĐS chứ không phải nguyên một rổ dài… trang null trong Supabase thì không cần hiển thị… chia nhóm luôn, đọc lại 2 cái chat Gemini xem có trường hợp nào, đây là production nên không thể bỏ sót"); chat Gemini 21/06 lượt 38 (§III SRD: toà nhà dòng tiền, đất nông nghiệp, SKC/TMD, kho xưởng) + lượt 65–67 (câu hỏi bù: móng, hẻm thông, ngập, cách mặt tiền, trường học, công chứng, gym); chat 07/09 (sổ cầm tay hay thế chấp, đang ở hay cho thuê, động cơ bán, giá linh động) |

### Tính năng sau 18/10/2026 ghi theo SRS

Từ 30/09/2026 sửa lỗi / tính năng mới không bắt buộc cấp FR (CLAUDE.md §6); các tính năng sau ghi thẳng ở `07-srs.md`, truy vết ở `08-traceability.md` §8.3: tìm nhà `tim_nha` + vector (SRS-5.1zzzzzzz138); gợi một căn mỗi lượt (SRS-5.1zzzzzzz145 / 160); báo căn mới tự động (SRS-5.1zzzzzzz150 / 188); khách tắt báo / chê căn (SRS-5.1zzzzzzz175); kho pháp lý + điều luật nguyên văn (SRS-5.1zzzzzzz176 / 231); tra kho dự án phía mua (SRS-5.1zzzzzzz184 / 185); khách chấm sao AI (SRS-5.1zzzzzzz104); câu chuẩn và câu mẫu cố định (SRS-5.1zzzzzzz88 / 106); hai số Zalo (SRS-5.1zzzzzzz210); lệnh gõ tay trên Zalo (SRS-5.1zzzzzzz211); lõi gửi nhắc + ô admin gửi tin (SRS-5.1zzzzzzz216); tra phường theo số nhà (SRS-5.1zzzzzzz236).

---

## 2.5 Yêu cầu phi chức năng

| ID | Loại | Yêu cầu | Đo bằng |
|---|---|---|---|
| NFR-01 | Hiệu năng | 🟡 Bot phản hồi tin nhắn thường < 3s (p95). Hiện thực: view `bot_do_tre` (p50/p95 7 ngày) trên `/admin`. Chưa: chưa chốt số đo trên lưu lượng thật. | Log; thẻ `/admin` |
| NFR-02 | Hiệu năng | 🟡 Trang listing/search LCP < 2.5s trên 4G. Hiện thực: ISR + chọn cột + ảnh lazy (FR-171 j). Chưa: chưa chạy Lighthouse. | Lighthouse ≥ 90 mobile |
| NFR-03 | Sẵn sàng | 🟡 Bot Zalo (cá nhân, qua bridge) phục vụ 24/7, uptime ≥ 99.5%. Hiện thực: nhịp tim bridge + sổ lỗi (FR-152). Chưa: chưa có công cụ đo uptime. | Monitoring |
| NFR-04 | Tin cậy | ✅ Tin nhắn **không được mất** khi một bên offline → hàng đợi bền. Hiện thực: sổ inbound + đường cứu mỗi phút (FR-162/166). | PDF hệ thống §5 |
| NFR-05 | Quy mô | 🟡 6 tháng đầu: ~10 chat mới/ngày, ~300 chat sống đồng thời, ~5.000 listing. Chưa: chưa chạm ngưỡng nên chưa đo tải thật. | BR-03, BR-01 |
| NFR-06 | Bảo mật | ✅ Ảnh sổ đỏ/giấy tờ lưu bucket riêng, admin xem bằng link ký hạn 15 phút; đường dẫn riêng không bao giờ ra trang công khai. Hiện thực: bucket `listing-private` + thẻ giấy tờ ở `/admin`. | RSK-07 |
| NFR-07 | Riêng tư | ✅ Không thu số ĐT của B ngoài bước đặt lịch xem nhà; cho phép ngắt kết nối bất cứ lúc nào. Hiện thực: `/admin` không đọc cột `phone`, câu cam kết trên web. | BR-06, FR-04 |
| NFR-08 | Riêng tư | ❌ Fingerprint chỉ dùng cá nhân hoá kết quả, có thông báo và cơ chế từ chối. Chưa: đi cùng FR-16 (OPEN-14). | FR-16 |
| NFR-09 | SEO | 🟡 100 URL tag render server-side, có canonical, sitemap, structured data. Hiện thực: 64 tag SSG + JSON-LD (FR-12/17). Chưa: bộ TOP-100 keyword (OPEN-06). | BR-08 |
| NFR-10 | i18n | ✅ Toàn bộ giao diện và nội dung chat: tiếng Việt, xưng hô anh/chị/em. | chats w B.docx |
| NFR-11 | Vận hành | 🟡 Mọi dữ liệu thống kê phải **kết nối được từ Excel** — không cần dashboard đẹp. Hiện thực: view + CSV ở `/admin`, đọc thẳng qua Table Editor. Chưa: xuất Excel phía server. | chats w B.docx §Thống kê |
| NFR-12 | Khả chuyển | 🟡 Tầng messaging trừu tượng hoá để thêm Messenger/Telegram mà không sửa lõi. Hiện thực: bộ não là lõi Python `src/aioi/` tách khỏi kênh, bridge gọi một cửa `/chat-reply` (cổng 8000). Chưa: chưa có adapter kênh thứ ba. | RSK-02 |
| NFR-13 | Khả kiểm | ✅ Mọi sự kiện listing và hội thoại có timestamp, truy vết được. Hiện thực: `property_events`, `messages.seq`, sổ lỗi. | FR-70, FR-71 |
| NFR-14 | Chi phí | 🟡 Tổng chi phí build MVP ≤ 418tr VND. Hiện thực: hạ tầng còn ở bậc miễn phí (NFR-16). Chưa: chưa có số đo chi phí thực tế. | §1.4 |
| NFR-15 | Tuân thủ | ✅ Asset theme thương mại chỉ dùng trong phạm vi license đã mua (regular = 1 end product); không commit theme vào repo public. | OPEN-07 chốt 24/08/2026 |
| NFR-16 | Chi phí | ✅ **Free-tier trước, trả tiền sau**: mọi dịch vụ hạ tầng khởi đầu ở bậc miễn phí, chỉ nâng cấp khi chạm ngưỡng đo được và ghi lại ngưỡng trong docs. Ràng buộc kèm theo: bậc Free không có backup tự động (OPEN-25) — 11/09/2026 chủ dự án bỏ luôn sao lưu tự làm, chấp nhận rủi ro mất dữ liệu. | trao đổi chủ dự án 24/08/2026 |
| NFR-17 | Hiệu năng | ✅ **Trang tin phải nằm trong cache**, không hỏi DB từng lượt xem. Route động có tham số đường dẫn bắt buộc khai `generateStaticParams()`; route đọc `searchParams` thì bọc truy vấn trong Data Cache. Nghiệm thu: bảng route sau build hiện `●`/`○` cho trang tin. | soát cloud/compute 27/08/2026 |
| NFR-18 | Vận hành | ✅ **Xanh phải là xanh thật**: không dùng trạng thái của lớp xếp hàng thay cho kết quả thật của việc — `cron.job_run_details.status` không phải bằng chứng bot chạy được. Kết quả thật phải được quét và ghi vào sổ bền (FR-152). | soát cloud/compute 27/08/2026 |

## 2.6 Giả định

| ID | Giả định | Đổ vỡ nếu sai |
|---|---|---|
| ASM-01 | Zalo (OA trước đây, nay Zalo cá nhân qua bridge) cho phép gửi tin chủ động ở tần suất cần cho FR-63, FR-64 | Toàn bộ chiến lược giữ chân sụp |
| ASM-02 | Zalo SSO khả dụng cho ứng dụng bên thứ ba của nhadat.cc | Phải làm OTP/đăng nhập riêng |
| ASM-03 | AI bóc tách địa chỉ Việt Nam (hẻm, ngã tư, mốc tiện ích) đạt độ chính xác dùng được | FR-92, FR-22 phải có người kiểm duyệt |
| ASM-04 | CCRB/NMG chịu trả lời câu hỏi bổ sung trong vài giờ | Vòng lặp INS-06 đứt, B mất kiên nhẫn |
| ASM-05 | Giao dịch được ghi nhận và thu phí ngoài hệ thống (thủ công, hợp đồng giấy) | Cần module hợp đồng/thanh toán, vượt ngân sách |
