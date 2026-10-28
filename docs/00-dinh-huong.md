# 00 — Định hướng (BRD hợp nhất Aioinhadat × nhadat.cc)

Phiên bản: **v1.5** · Ngày: **28/10/2026** · Trạng thái: **tên, địa bàn đã chốt; kiến trúc = lõi Python `src/aioi/`; CTV bỏ hẳn 28/10/2026 — mọi việc người thật phía mua về chủ nhà (nếu có trên hệ thống) hoặc admin; còn §0.8**

**Nhật ký phiên bản**

| Bản | Ngày | Thay đổi |
|---|---|---|
| v1.4 | 07/09/2026 | Thêm OPEN-48; OPEN-49 chốt theo kịch bản Gemini → FR-177; dọn 13 OPEN hướng 2024 |
| v1.5 | 28/10/2026 | (1) **Bỏ CTV** [nguồn: chủ dự án 28/10/2026, chat — bỏ CTV]: vòng nối DH-01, bất biến, I3 (§0.5), lộ trình DH-06, giả định §0.7, Lean Canvas §0.10 viết lại sang chủ nhà → admin. (2) **Kiến trúc**: một lõi Python `src/aioi/` thay `chat-reply` TS (SRS-5.1zzzzzzz31). (3) **Kênh**: Zalo cá nhân qua bridge, hai số (ký gửi, tư vấn — SRS-5.1zzzzzzz210); không có Zalo OA. (4) **Trợ lý**: 13 tên có chấm giữa (SRS-5.1zzzzzzz183), thay "một bot tên Thái" và kho 20 tên. (5) **Model**: chat Claude Sonnet 5.5, bóc tách Haiku, dự phòng Gemini → Groq (SRS-5.1zzzzzzz235, SRS-5.1zzzzzzz117). (6) Nhắc khách do lõi gửi (`gui_nhac.py`, SRS-5.1zzzzzzz216), thay `nudge`. (7) §0.3 cập nhật theo code hiện tại; đánh dấu phần đã gỡ là lịch sử |

> Bộ `docs/` viết từ tài liệu nhadat.cc 2024; từ 25/08/2026 code chạy theo SRD
> "AI Ơi Nhà Đất" (AOND, `AOND req + chat examples.docx`) ở ngày càng nhiều chỗ;
> từ 18/10/2026 bộ não duy nhất là lõi Python `src/aioi/` (SRS-5.1zzzzzzz31).
> Trang này nói thẳng **sản phẩm hôm nay là gì, giữ gì của bên nào, còn gì chưa
> quyết** — và đứng trên `01`–`11`: tầng dưới không được mâu thuẫn với nó
> [nguồn: quyết định chủ dự án 03/09/2026]. Khung mượn `phuryn/pm-skills`
> (canvas §0.4, sao Bắc Đẩu §0.5, phản biện §0.7); nội dung có nguồn từng dòng.

## 0.1 Định vị

**DH-01.** **Aioinhadat** là *người môi giới thường trực đứng sau mọi môi giới
khác* [nguồn: OKRs eo2024.pptx, slide 1]. Một bộ não (lõi Python `src/aioi/`)
nói với mỗi khách qua **một trợ lý mang tên riêng**, gán theo Zalo ID, giữ suốt;
kho 13 tên có chấm giữa (Th•ái, M•ai, H•ải…) [nguồn: FR-181; SRS-5.1zzzzzzz183].
Hai mặt [nguồn: chốt 03/09/2026, OPEN-39]:

| Mặt | Chạy theo | Cốt lõi | Neo |
|---|---|---|---|
| **Bán** | AOND §I–§VI | Rao một câu + ảnh, không form; khen điểm mạnh rồi hỏi 1 ý; đủ loại hình + vị trí + giá là soạn bản tin 📋, ô còn lại hỏi sau; người rao có hạng | FR-129, FR-144, FR-172, SRS-5.1zzzzzzz200, SRS-5.1zzzzzzz207 |
| **Mua** | nhadat.cc 2024, nay đặc tả ở `07` | Web là phễu SEO đẩy về Zalo; khách chỉ để SĐT lúc chốt lịch xem; mỗi lượt gợi một căn kèm link; không khẳng định điều chưa xác minh; báo căn mới vừa nhu cầu; kết nối sống 3–4 năm | INS-01…04, FR-01…65, SRS-5.1zzzzzzz148, SRS-5.1zzzzzzz150, SRS-5.1zzzzzzz160 |
| **Vòng nối** | Cả hai (INS-06 = AOND §VII) | Khách hỏi → bot không biết → hỏi **chủ nhà** nếu có trên hệ thống (hạn 12 giờ) → quá hạn hoặc không có chủ nhà thì **admin** → câu trả lời vào tin → lõi báo lại khách | SRS-5.1zzzzzzz170, SRS-5.1zzzzzzz216; FR-173 *[deprecated 28/10/2026 — phần CTV]* |

**Địa bàn: Sài Gòn (TP.HCM theo phường mới sau 01/07/2025) + Long An; trọng
tâm là bán; khởi điểm cụm Quận 5 cũ** [nguồn: chốt 03/09/2026 — "bán sản phẩm
bất động sản ở Sài Gòn, các phường mới và Long An"; OPEN-27 nửa đầu, FR-174].
Vùng bot nhận tin rao nới 20/10/2026: TP.HCM, Bình Dương, Bà Rịa – Vũng Tàu,
Long An, Tây Ninh, Đồng Nai; Bình Phước cũ không nhận [nguồn: SRS-5.1zzzzzzz86,
một nguồn `prompts.VUNG_NHAN_TIN`]. Cho thuê giữ như đang có *[giả định BA]*;
tên hiển thị cũ/mới và thứ tự mở từng cụm là OPEN-27 nửa sau.

**AOND là cách nhận và nuôi hàng; nhadat.cc là cách bán hàng.** Không có
"chuyển dự án" — một sản phẩm, hai bản thiết kế, một bộ não ở giữa. Người thật
đứng sau là **chủ nhà** (trả lời về căn của mình) và **admin** (mọi việc còn
lại). *Trước 28/10/2026 người đứng giữa là CTV; nay bỏ* [nguồn: chủ dự án
28/10/2026, chat — bỏ CTV].

**DH-02 · Bốn bất biến** (luật ở `ba-pipeline`, hướng nào cũng giữ):

| # | Bất biến | Neo |
|---|---|---|
| 1 | Mọi trang web là phễu về Zalo; không kéo hội thoại ra khỏi Zalo | IA-P1, INS-01 |
| 2 | Không hỏi SĐT người mua ngoài bước chốt lịch xem (xin MỘT lần, số chỉ tới admin) | NFR-07, FR-53, INS-04, SRS-5.1zzzzzzz148 |
| 3 | Không khẳng định pháp lý / quy hoạch / còn-hết khi chưa xác minh — chuyển thành câu hỏi; câu pháp lý chỉ trả lời từ kho soạn sẵn, luôn nói "tham khảo" | RSK-03, FR-40, AOND §II, SRS-5.1zzzzzzz176 |
| 4 | Bot là trung gian toàn phần: lưu hết chủ chia sẻ, khách hỏi mới khai, liên hệ chỉ mở lúc chốt lịch xem; việc cần người thật đi chủ nhà hoặc admin, không qua bên thứ ba | INS-11, FR-104, OPEN-36, SRS-5.1zzzzzzz170 |

**DH-03.** Mặt bán: AOND thắng khi vênh với nhadat.cc gốc, trừ khi đụng DH-02
(ví dụ TTL 7 ngày FR-107 → nhỏ giọt FR-129/144). **DH-04.** Mặt mua + web:
`chats w B.docx`, `nhadat.cc website.docx` là nguồn gốc; từ 18/10/2026 hành vi
mặt mua đặc tả ở `07` (SRS-5.1zzzzzzz70 trở đi, `src/aioi/mua.py`). Văn phong
AOND mượn cho cả hai phía (`06 §6.8`).

## 0.2 Hai nguồn gốc, một sản phẩm

| Khía cạnh | nhadat.cc (2024) | AOND SRD (06/2026) | Hôm nay (28/10/2026) | Neo |
|---|---|---|---|---|
| Tên | nhadat.cc, "Thái" | aioinhadat.com, gia đình •ai | **Aioinhadat**, viết cho khách **AI Ơi Nhà Đất**; trợ lý **mỗi khách một tên**, 13 tên có chấm giữa (SRS-5.1zzzzzzz183). *Lịch sử: một tên Thái 03–09/09 → kho •ai 09/09–14/10 → 20 tên người thật 14–25/10.* Link web bot gửi lấy từ `AIOI_SITE_URL` (mặc định `aioinhadat.vercel.app`) | OPEN-08, OPEN-39, FR-181 |
| Trọng tâm | Khách chat Zalo; web SEO | Người rao gửi hàng tự nhiên | Cả hai, **một lõi Python**, vai theo ý định từng lượt; một Zalo = một khách = một hội thoại | SRS-5.1zzzzzzz31, SRS-5.1zzzzzzz149, SRS-5.1zzzzzzz153 |
| Kênh | Zalo OA (dự kiến) | Zalo | **Zalo cá nhân qua bridge zca-js**, hai số: **ký gửi** và **tư vấn người mua**; không có Zalo OA | SRS-5.1zzzzzzz210, RSK-02 |
| Nhận tin rao | `/raoban` + câu rao | Text/thoại/ảnh, không form | Câu rao trong Zalo sinh mã tin; ảnh, file, link nhận được; tin thoại giải mã thành chữ | FR-158, SRS-5.1zzzzzzz20 |
| Nuôi tin | TTL 7 ngày | 1 thông tin/lần, 1–2 căn/ngày | Hỏi 1 ý mỗi lượt; sau bản tin đầu, ô còn thiếu hỏi sau, mỗi facet một câu; nhắc 5 phút khi người bán im giữa chừng (`followup.py`). Drip TS (`ask-seller`) đã gỡ | FR-129, SRS-5.1zzzzzzz200, SRS-5.1zzzzzzz31 |
| Khách hỏi điều bot không biết | Hỏi chủ | Bot-to-bot hỏi chủ | **Hỏi chủ nhà trước** (12 giờ, `chu_nha_han_gio()`), quá hạn hoặc không có chủ nhà → **admin** | SRS-5.1zzzzzzz170 |
| Xếp hạng | NMG ≥10 tin, chốt ≥5% | Đồng/Bạc/Vàng người rao | Hạng người rao theo điểm (ẩn trên web) + **điểm người rao 0–100**; khối "ĐIỂM TIN" đưa điểm thật cho model | FR-155, FR-183, OPEN-26, SRS-5.1zzzzzzz216 |
| Phí | CCRB 1% · NMG 0.5% · thuê ¾ tháng | Giống | Giống; con số một nguồn `prompts.muc_phi` | BR-05, AOND §V, SRS-5.1zzzzzzz227 |
| Địa bàn | Quận 5 | Quận 5 rồi mở | **Sài Gòn (phường mới) + Long An**, trọng tâm bán; vùng nhận tin nới 20/10 (§0.1) | BR-01, OPEN-27, FR-174, SRS-5.1zzzzzzz86 |
| Hạ tầng | Vendor, Slack, Logstash | Gemini → local, SharePoint | Lõi Python trên VPS (`aond-core.service`); Supabase Free (DB, Storage, 3 edge function phụ); web Next.js trên Vercel; `/admin` | SRS-5.1zzzzzzz31, SRS-5.1zzzzzzz56 |
| Model | — | Gemini → local | Chat: Claude Sonnet 5.5; bóc tách: Claude Haiku; Claude hỏng → Gemini → Groq; vector Gemini | SRS-5.1zzzzzzz235, SRS-5.1zzzzzzz117, OPEN-41 |
| Vận hành | 1.5 CTV | CTV dẫn khách | **Admin** nhận mọi việc người thật phía mua (câu hỏi quá hạn, lịch xem) và tự báo người dẫn khách. *CTV bỏ 28/10/2026* | SRS-5.1zzzzzzz165, SRS-5.1zzzzzzz172; FR-136/137/173 *[deprecated 28/10/2026 — bỏ CTV]* |

## 0.3 SRD AOND: nhận / sửa / chưa / không

✅ đúng · 🔶 khác bản gốc · ⏳ chưa · ❌ không nhận · ❓ chờ chốt

| AOND | Nội dung | | Ở đây |
|---|---|---|---|
| §I | Rao tự nhiên, không form | ✅ | FR-92/158/144/161 |
| §I | Thoại | ✅ | Tin thoại Zalo giải mã thành chữ rồi chạy như tin chữ (SRS-5.1zzzzzzz20, `voice.py`) |
| §I | Tích lũy ngầm nhiều phiên | ✅ | FR-129/144/153/172; phiên nạp lại sau khi lõi khởi động lại (SRS-5.1zzzzzzz147) |
| §I | 200–300 người/ngày, 6–9k tin, phủ 90% Q5 | 🔶 | NFR-05; Free-tier chưa đo (NFR-16) |
| §II | Kho tên •ai (m•ai, t•ai…) | ✅ | Mỗi khách một tên, gán theo Zalo ID, giữ suốt (FR-181). 13 tên có chấm giữa: Th•ái, M•ai, H•ải, L•ai, Kh•ải, T•ài, Đ•ại, Đ•ài, Nh•ài, Gi•ai, Ph•ái, L•ài, Ho•ài (SRS-5.1zzzzzzz183) |
| §II | Quy tắc 30 từ | ✅ | Khuôn chat phía bán ~30 từ theo bản AOND (SRS-5.1zzzzzzz207); "ngắn vừa vừa" (SRS-5.1zzzzzzz97) |
| §II | Khen trước, hỏi 1/lần; "hình như là" | ✅ | Khen điểm mạnh trước rồi hỏi 1 ý (SRS-5.1zzzzzzz207); giọng một khối `GIONG_VUI` (SRS-5.1zzzzzzz219); không mở "Dạ", không gọi khách là "mình". *`TONE_RULES` TS là lịch sử* |
| §II | Giọng mẫu: transcript 30 câu người bán | 🔶 | Ví dụ lấy từ câu chuẩn chủ dự án / tester sửa ở `/admin/cau-chuan` (SRS-5.1zzzzzzz88, SRS-5.1zzzzzzz180) + câu mẫu cố định (SRS-5.1zzzzzzz106). *`SELLER_FEWSHOT`, `bot_prompts` đã gỡ 18/10* |
| §II | Nút bấm nhanh trong tin (`[Vẫn đang bán]`…) | ⏳ | Bridge gửi chữ + ảnh, không gửi nút; nút cần Zalo OA, chưa có |
| §III | Nhóm 1 nhà ở | ✅ | FR-172; bộ câu hỏi một nguồn `src/aioi/schema.py` (SRS-5.1zzzzzzz68) |
| §III | Nhóm 2 đất; thông số cho thuê | ✅ | FR-186; `CORE_THEO_LOAI` ở `schema.py` |
| §III | Nhóm 3 công nghiệp | ✅ | FR-186 mở rộng (OPEN-40 chốt 09/09): `kho_xuong`, `toa_nha`, `dat_kinh_doanh`, `dat_nong_nghiep` |
| §IV | Điểm uy tín 50% hoàn chỉnh + 50% kịp thời | 🔶 | FR-183; `gamification.py`; hạng theo điểm (SRS-5.1zzf) |
| §IV | Điểm **từng tin** (khác điểm người rao) | ✅ | FR-177 d; khối "ĐIỂM TIN" cho model (SRS-5.1zzzzzzz216). Cổng soạn bản tin nay là loại hình + vị trí + giá (SRS-5.1zzzzzzz200, SRS-5.1zzzzzzz202), không theo ngưỡng điểm — OPEN-50 |
| §IV | Thưởng quy mô; quyền lợi Đồng/Bạc/Vàng | ✅ | SRS-5.1zzf (OPEN-26 chốt 05/10); hạng giữ (SRS-5.1zzzzzzz214) |
| §V | Phí; NMG ≥10 tin, chốt 5% | ✅ | BR-05, FR-125, FR-155; `prompts.muc_phi` |
| §V | Hệ thống điều phối CTV | ❌ | *[deprecated 28/10/2026 — bỏ CTV, chủ dự án]*. Từng làm ở FR-136/173; bỏ dần 23–25/10 (SRS-5.1zzzzzzz165, 170, 172, 173), bỏ hẳn 28/10 |
| §VI | Quét im >5 ngày; hỏi 1–2 căn/ngày | ⏳ | Drip TS (`seller_drip_tick`, `ask-seller`) gỡ 18/10 (SRS-5.1zzzzzzz31). Lõi có nhắc 5 phút (`followup.py`) và hỏi sau đăng mỗi lượt một ô; quét im >5 ngày chưa có lại |
| §VII | Gemini → máy local | 🔶 | Claude là đường chính, Gemini → Groq dự phòng (SRS-5.1zzzzzzz117); vector Gemini; không chạy local — OPEN-41 |
| §VII | SharePoint 5 lớp | ❌ | Supabase Storage (FR-165, SRS-5.1zzzzzzz56) |
| §VII | Live Chat Monitor: nhãn + nút cướp quyền | 🔶 | Admin gửi tin từ `/admin/tin-nhan`; lời admin vào hội thoại thì bot im 30 phút (SRS-5.1zzzzzzz216); màn hình nhãn ⏳ |
| §VII | Bot-to-bot hỏi chủ, báo lại khách | 🔶 | Bot hỏi chủ nhà nếu có trên hệ thống, quá hạn hoặc không có thì admin (SRS-5.1zzzzzzz170); lõi báo lại khách (SRS-5.1zzzzzzz216) |

## 0.4 Canvas chiến lược

| Ô | Nội dung | Neo |
|---|---|---|
| Tầm nhìn | Môi giới thường trực đứng sau mọi môi giới; hội thoại bắt đầu thì không kết thúc | OKRs eo2024; demo2Vitalify |
| Phân khúc | Trước: người rao ở cụm Q5 cũ, rồi Sài Gòn (phường mới) + Long An (P3 chính chủ, P4 NMG 10–30 căn). Sau: người mua ở (P1), đầu tư (P2). Bán trước vì không hàng thì chat rỗng | 02 §2.2, RSK-04, FR-174 |
| Chi phí | Không phí đăng, không phí mua, thu khi chốt. Build ≤418tr; vận hành Free-tier + VPS + tiền model + 20tr/tháng | NFR-14/16, §1.3–1.4 |
| Giá trị | Người rao: "rao một lần là xong". Người mua: được trả lời thật, không lộ số (thay cho 40 cuộc gọi/3 ngày) | INS-04/06/09 |
| KHÔNG làm | App · form nhiều trường · phí đăng · hỏi SĐT (trừ lúc chốt lịch xem) · marketplace tự phục vụ · đa ngôn ngữ · Messenger/Telegram · khẳng định pháp lý · đội CTV (bỏ 28/10/2026) | 02 §2.3, DH-02 |
| Chỉ số | §0.5 | — |
| Tăng trưởng | Bán: mạng NMG + admin đăng tin (FR-156). Mua: SEO 100 tag + traffic batdongsan + widget Zalo (FR-145) + số Zalo tư vấn riêng (SRS-5.1zzzzzzz210) | BR-02/08, §1.4 |
| Năng lực | Tin có cấu trúc (FR-172) · một lõi Python (SRS-5.1zzzzzzz31) · Zalo hai số qua bridge · tìm nhà `tim_nha` + vector (SRS-5.1zzzzzzz138) · admin nhận việc người thật · sổ lỗi (FR-152) | 07 §2 |
| Khó sao chép | Kho hỏi-đáp đã xác minh theo từng căn; kết nối Zalo nhiều năm; mạng NMG chịu luật 10 tin/5% | INS-02/06, BR-02 |

Địa bàn đã chốt 03/09 (Sài Gòn + Long An); mở cụm nào trước vẫn theo "mật độ
trước độ phủ" (INS-08) — OPEN-27 nửa sau (d).

## 0.5 Sao Bắc Đẩu

**DH-05 · NSM: số lịch xem nhà chốt mỗi tuần** *[giả định BA]* — dễ đếm, khách
làm trung tâm, chỉ tăng bằng chất lượng tin + trả lời, đo được, dẫn trước giao
dịch (BR-04) vài tuần. Đo: `viewings.status = 'confirmed'` (admin chốt bằng
`#mã: ok giờ`, SRS-5.1zzzzzzz173). *Lịch sử: đo bằng `reminders.kind='viewing'`
(FR-57).* Không lấy "giao dịch" (quá thưa) hay "chat mới" (hoạt động, không
phải giá trị).

| # | Đầu vào | Kéo bằng | Đo |
|---|---|---|---|
| I1 | Tin đủ thông tin lên sàn / tuần | FR-129, FR-172, FR-156, SRS-5.1zzzzzzz200 | `listings.status='dang_ban'` |
| I2 | Hội thoại mua đủ khu vực + ngân sách | FR-130, FR-131, SRS-5.1zzzzzzz214 (`co_tieu_chi`) | `buyers.preferences` (lõi ghi qua `mua.py`) |
| I3 | **Câu khách hỏi được trả lời đúng hạn — chủ nhà hoặc admin** [nguồn: chủ dự án 28/10/2026, chat — bỏ CTV] | SRS-5.1zzzzzzz170, FR-140 c | `info_requests` nguồn `buyer_ask`: dòng chủ nhà `answered_at ≤ sla_due_at` (12 giờ); dòng admin `answered_at ≤ sla_due_at` (5 giờ, chủ dự án chốt 28/10/2026 — OPEN-65, SRS-5.1zzzzzzz238) |
| I4 | Kết nối Zalo sống sau 30 ngày | FR-63, báo căn mới (SRS-5.1zzzzzzz150), tin giữ kết nối `giu_ket_noi.py` (SRS-5.1zzzzzzz238) | View `ket_noi_zalo_song` (`20261028e`, SRS-5.1zzzzzzz240): khách mua có tin đầu ≥ 30 ngày, còn nhắn từ ngày thứ 30 [nguồn: chủ dự án 28/10/2026, chat — OPEN-67 a] |
| I5 | NMG hoạt động (có tin đang rao + nhắn bot trong 7 ngày) | FR-155 | View `nmg_hoat_dong` đếm tin người bán 7 ngày từ `messages` (`20261028e`, SRS-5.1zzzzzzz240) [nguồn: chủ dự án 28/10/2026, chat — OPEN-67 a] |

*Lịch sử I3 (tới 28/10/2026): "Câu khách hỏi được trả lời đúng hạn" đo qua CTV
(`ctv_ranks`, hạn 120 phút, FR-173) — deprecated cùng CTV.*

**OMTM quý này: I3.** Vòng hỏi-đáp chưa có lượt trả lời thật — mắt xích chưa có
số, và là mắt xích cả hai tài liệu gốc đặt ở trung tâm.

## 0.6 Lộ trình

**Hiện trạng 28/10/2026.** Đã dựng: lõi Python trên VPS (`aond-core`) là bộ não
duy nhất; hai số Zalo qua bridge (ký gửi, tư vấn); web Next.js + bản đồ
MapLibre; tìm nhà `tim_nha` + vector; báo căn mới; kho pháp lý + điều luật
nguyên văn; tra kho dự án phía mua; khách chấm sao AI; câu chuẩn / câu mẫu ở
`/admin/cau-chuan`; lõi gửi nhắc + admin gửi tin. Kiểm thử: pytest `tests/` +
ô bắn thử production bằng ID thử (`10`). Chưa: phần lớn tính năng mới ghi
"chưa thử Zalo thật" ở `07`; `listings` thật còn rất ít (5 tin, đếm 23/10 —
SRS-5.1zzzzzzz167), rổ thử mua là 242 tin mẫu `seed_thu`.

*Lịch sử (03/09/2026): web + Supabase; bot hai mặt qua bridge; 173 tin
`import_excel` (xoá 09/09); drip người bán; hỏi-đáp và chia đơn qua CTV (bỏ
28/10); sổ lỗi, nhịp tim, còi ntfy.*

**DH-06 · 90 ngày:**

| Đợt | Việc | Neo |
|---|---|---|
| 1 · Chốt | §0.8 (OPEN-41, 27 nửa sau) + OPEN-21 (5 vai), 26 (quyền lợi hạng), 28 (phí). OPEN-42 mất đối tượng khi bỏ CTV | 09 |
| 2 · Đo I3 | 20 tin có chủ thật trên hệ thống; đo tỷ lệ câu khách hỏi được chủ nhà trả lời trong 12 giờ, và phần admin phải đỡ | SRS-5.1zzzzzzz170 |
| 2b · Địa bàn | Đợt 1 xong 03/09 (không ghi cứng Quận 5, copy nói Sài Gòn + Long An). Đợt 2 khi OPEN-27 nửa sau chốt: SEO theo khu mới, mở cụm kề Q5 cũ + một huyện Long An có hàng thật | FR-174 |
| 3 · Dữ liệu | 7 hạng mục theo `01 §1.5c` (sự kiện tin, khớp tin–hồ sơ, giá khu vực…) | INS-13 |
| 4 · AOND còn thiếu | Màn hình nhãn hội thoại; quét người bán im >5 ngày (drip TS đã gỡ); thưởng quy mô | FR-135/141/172, §0.3 |
| 5 · Vận hành | Không sao lưu (chủ dự án bỏ 11/09/2026, chấp nhận rủi ro); lên Pro ngay khi có giao dịch thật đầu tiên | NFR-16, OPEN-25 |

Ngoài 90 ngày: Messenger/Telegram, app, công nghiệp, đổi domain.

## 0.7 Giả định chịu lực

| # | Giả định | Đổ nếu | Ngưỡng dừng | Thử rẻ nhất |
|---|---|---|---|---|
| 1 | **Chủ nhà trả lời kịp, admin đỡ được phần còn lại** khi khách hỏi (SRS-5.1zzzzzzz170) | <30% câu được trả lời trong 48h; admin phải đỡ >50% *[giả định BA]* | 2 tuần liền | 20 tin chủ thật; hỏi đúng câu khách hỏi |
| 2 | **Khách chịu chat bot** không cần người thật ngay (INS-04) | Hội thoại → lịch xem <2%; cờ cần người >30% | Cờ >30% | Widget Zalo trên 20 trang tin nhiều view; đọc 50 hội thoại |
| 3 | **Hạng làm người ta chăm hơn** (AOND §IV) | Hạng lên/xuống không đổi tỷ lệ trả lời | Không lệch sau 30 ngày | Nói hạng qua Zalo cho 3 NMG, chưa cần UI |
| 4 | **Free-tier chịu tới giao dịch đầu** (NFR-16) | Mất dữ liệu; Vercel đình chỉ | Một sự cố | Không còn — chủ dự án bỏ sao lưu 11/09/2026, chấp nhận mất dữ liệu là không lấy lại được |
| 5 | **Mở Sài Gòn + Long An không loãng kho** (FR-174 vs INS-08) | >50% phường/huyện mở có <5 tin sau 60 ngày | — | Mở cụm phường kề Q5 cũ trước; Long An theo một huyện có nguồn hàng thật |

Đứng vững: không thu SĐT ngoài lúc chốt lịch xem; phí chỉ khi chốt. Đã đổi:
một tên bot Thái → mỗi khách một tên (FR-181, 09/09; 13 tên có chấm giữa từ
25/10); vòng CTV → chủ nhà / admin (28/10). Chưa đánh giá được: "rao một câu"
với người rao thật ở quy mô; OKR "1 giao dịch/2 ngày" (OPEN-01); nhu cầu nhóm
công nghiệp. Giả định 4 đã **đổ một lần**: bridge chết 8 ngày (27/08 → 04/09)
mà không ai biết cho tới khi có còi ntfy; project Supabase cũ bị xoá nhầm
08/10/2026, không khôi phục được.

## 0.8 Chờ chủ dự án chốt

Đã chốt 03/09/2026: **OPEN-08 + OPEN-39** (Aioinhadat; "một bot Thái" đã đảo lại 09/09 → mỗi
khách một tên, FR-181; 13 tên có chấm giữa từ 25/10), **luồng CTV** (FR-173 — *deprecated
28/10/2026, bỏ CTV*), **địa bàn — OPEN-27 nửa đầu** (Sài Gòn phường mới + Long An, trọng tâm
bán — FR-174). Đã chốt 04/09/2026: **giữ chân khách mốc 5 ngày** (FR-60 đổi từ 3 ngày; FR-63
buộc giữ kết nối từ ngày 6) và **dựng hết phần tài liệu có mà code chưa** (OPEN-43 → xem
`10 §10.8.4`) [nguồn: chủ dự án 04/09/2026 "dựng hết đi, giữ chân 5 ngày"]. Đã chốt
28/10/2026: **bỏ hẳn CTV** [nguồn: chủ dự án 28/10/2026, chat — bỏ CTV]. Còn:

| ID | Câu hỏi | Khuyến nghị BA |
|---|---|---|
| OPEN-27 nửa sau | Tên hiển thị cũ hay mới; DB lưu gì; mã tin; mở phường/huyện nào trước; cho thuê có giữ | Hiển thị cả hai tên; bảng `wards` một nguồn; giữ mã tin; mở cụm kề Q5 cũ + một huyện Long An có hàng; giữ cho thuê như đang có |
| OPEN-40 | ✅ chốt 09/09/2026 tối — làm cả bốn loại (`toa_nha`, `dat_nong_nghiep`, `dat_kinh_doanh`, `kho_xuong`); bộ câu hỏi nay ở `src/aioi/schema.py` (SRS-5.1zzzzzzz68) | — |
| OPEN-41 | Model: giữ Claude hay Gemini → local theo AOND §VII | Code đã chạy theo khuyến nghị: Claude chính (chat Sonnet 5.5, bóc tách Haiku), Gemini → Groq dự phòng (SRS-5.1zzzzzzz117, SRS-5.1zzzzzzz235). Đề nghị đóng |
| OPEN-42 | *[mất đối tượng 28/10/2026 — bỏ CTV]* Hạn trả lời và mốc hạng CTV | Đóng ở `09` |
| **OPEN-48** | ✅ **ĐÃ CHỐT 08/09/2026**: Bỏ toàn bộ nhóm tính năng thừa kế 2024 (mini-site rao web, tài khoản, trang phụ SEO cũ). Chuẩn hóa 100% tài liệu theo Aioinhadat 2026 | Đã chốt theo lệnh sếp và chủ dự án |
| OPEN-65 | Hạn admin trả lời câu khách hỏi | ✅ Chốt 28/10/2026: 5 giờ (SRS-5.1zzzzzzz238); ngưỡng dừng I3 vẫn *[giả định BA]* |
| OPEN-67 | Đo I4 / I5 | ✅ Chốt 28/10/2026 (a): đo từ `messages` (SRS-5.1zzzzzzz240) |

**Đã chốt 07/09/2026: cách hỏi người bán** — theo kịch bản huấn luyện môi giới sếp
làm trong Gemini: một thông tin/lần theo thứ tự địa chỉ → giá → hẻm → diện tích →
tầng → phòng → pháp lý → ảnh → lịch khảo sát; khen ngắn khi khách vừa nói điểm mạnh
thật; đủ thì gửi bản nháp tin (FR-177, thay thứ tự FR-176 f). Cùng ngày, 13 mục OPEN
của hướng nhadat.cc 2024 đóng vì không còn hợp AOND (`09` bảng "đã chốt / đã đóng").
*Cập nhật 26/10/2026: cổng soạn bản tin = loại hình + vị trí + giá, ô khác hỏi sau
(SRS-5.1zzzzzzz200, SRS-5.1zzzzzzz202); giọng theo khuôn AOND + `GIONG_VUI`
(SRS-5.1zzzzzzz207, SRS-5.1zzzzzzz219). `TONE_RULES` TS là lịch sử.*

**Đã chốt 07/09/2026 tối: giọng bot xây từ AOND lên, không đọc mã tin** (FR-178,
chủ dự án) — mỗi tin ngắn, khen điểm mạnh thật rồi hỏi đúng một thứ, không đọc tên
trường, và **mã tin không bao giờ đọc ra trong chat** — mua lẫn bán, gọi căn bằng
địa chỉ. Mã vẫn là khoá liên kết web ↔ chat (IA-P3): web hiện, khách gõ vào thì
bot hiểu; phía mua bot gửi link trang tin thay vì đọc mã (SRS-5.1zzzzzzz145). OPEN-50 (ngưỡng điểm để tin được rao) đã đóng 28/10/2026: không còn cổng điểm 70, tin lên web theo trigger `listings_quyet_dinh_dang_tin`.

**DH-07.** Cho tới khi §0.8 chốt, việc mới đi theo cột phải và tầng dưới ghi
`[giả định BA]` ở chỗ phụ thuộc.

---

*Truy vết:* DH-01…DH-09 → `08-traceability.md §8.0`. (Bản Figma và `design/` đã xoá
08/09/2026 — OPEN-45 đóng; không còn bản trực quan riêng.)

## 0.9 Đánh giá 21/09/2026 theo khung Design Thinking

> *Ghi chú 28/10/2026:* mục này là ảnh chụp ngày 21/09. CTV đã bỏ 28/10/2026;
> chỗ nào nói "vòng CTV" thì đọc là vòng chủ nhà → admin (SRS-5.1zzzzzzz170).
> Kiến trúc nhắc ở đây (e2e TS, bóc tách TS) đã thay bằng lõi Python.

**DH-08.** Chủ dự án 21/09/2026 yêu cầu trả lời năm cột *Empathy → Define → Ideate →
Prototype → Test* cho dự án này và đánh giá khả năng thành công [nguồn: chủ dự án
21/09/2026, ảnh khung năm cột + "đánh giá khả năng thành công"]. Số liệu đo trực tiếp
trên DB production ngày 21/09/2026 11:50 UTC (đếm `listings`, `sellers`, `buyers`,
`viewings`, `deals`, `projects`, `duong`), không đọc từ code.

| Cột | Đã có | Bằng chứng | Còn thiếu |
|---|---|---|---|
| **Empathy** — hiểu ai, hiểu gì | Chân dung B (6–13 tỷ, "xem 3 căn → xin ảnh → hỏi 1 căn → im"), S chính chủ ngại form, NMG 10 tin / 5%; vấn đề lõi: tin luôn thiếu và không ai trả lời khách; Zalo cắt sau 7 ngày mà chu kỳ mua 3–4 năm; ba đối thủ đều listing-first, lộ SĐT | `01 §1.2`, INS-02/03/04/06, `01 §1.5` | Chân dung B dựa trên 24 hội thoại **giả định** 2024, chưa phỏng vấn người thật; chưa có số thị trường Quận 5 (`01 §1.7`) |
| **Define** — vấn đề, mục tiêu | Câu chuyện lõi "hỏi căn này có ai trả lời không" → vòng nối (21/09: qua CTV, FR-173; từ 28/10: chủ nhà → admin); persona P1–P4; sao Bắc Đẩu = lịch xem chốt/tuần, OMTM quý = câu khách hỏi trả lời đúng hạn | §0.5, `02 §2.2`, SRS-5.1zzzzzzz170 | — (cột chắc nhất) |
| **Ideate** — lật giả định | Không form, không app, không SĐT, tin thiếu là tính năng, mỗi khách một tên bot, quận cũ là ngôn ngữ thị trường | INS-05/11/12, FR-181, §0.4 ô KHÔNG làm | Năm giả định chịu lực §0.7 chưa cái nào có số; giả định 4 đã đổ một lần |
| **Prototype** — giải pháp tối thiểu | Web SEO + kho tin cấu trúc, bot hai mặt qua bridge, bóc tách AI có kiểm bằng chứng (FR-208), từ điển đường 7.114 dòng (FR-212), 1.639 dự án, hỏi bù, CTV chia đơn (bỏ 28/10), sổ lỗi + còi, 439 ca e2e, 10 cổng CI | `07`, `10 §10.8` | Đã vượt mức "mock test" về máy — nhưng là **phòng thí nghiệm sạch**: 21/09 DB có **0 tin, 0 người bán, 1 người mua** (chủ dự án), 0 lịch xem, 0 giao dịch; rổ hàng 173 tin cũ đã xoá theo lệnh 09/09 |
| **Test** — kiểm chứng | Máy chạy đúng luật, không sập, không lộ SĐT, giọng bớt máy (TS-DUONG, TS-BLDL, TS-HOIBU 21/09) | `10` | **Chưa quay được vòng nào với người thật**: giả định 1, 2, 3, 5 chưa có bằng chứng; mũi tên Test → Ideate chưa chạy |

**Đánh giá khả năng thành công** *[nhận định BA, không có số để tính xác suất]*:

- Điểm mạnh thật: luận điểm rõ và khác biệt thật so với batdongsan / mogi / alonhadat
  (INS-04/11), chi phí vận hành gần không (NFR-16), mọi mắt xích đều đo được (§0.5).
- Điểm yếu chí tử: dự án đi hết Prototype mà **chưa quay lại Empathy với người thật
  lần nào** — đang tối ưu giọng bot trước khi biết chủ nhà có trả lời câu khách hỏi hay không.
- Rủi ro lớn nhất không nằm ở code: **RSK-04** (không hàng thì chat rỗng). Kho tin
  hôm nay bằng 0 theo quyết định chủ dự án; rủi ro thứ hai là **RSK-02** (kênh duy nhất
  là Zalo cá nhân qua bridge, không có OA).

**Việc kế tiếp theo đánh giá này** (khớp §0.6 đợt 2, không mở việc mới):

1. Dừng chỉnh giọng; đưa **20 tin có chủ thật** vào vòng hỏi chủ nhà → admin, đo 2 tuần
   tỷ lệ câu khách hỏi được trả lời trong 48 giờ (giả định 1, ngưỡng dừng <30%).
2. Kéo **10 người mua thật** qua widget Zalo trên trang tin (FR-145), đọc nguyên văn
   hội thoại, đếm cờ "cần người thật" (giả định 2, ngưỡng >30%).
3. Vượt ngưỡng dừng ở 1 hoặc 2 → sửa **mô hình** (§0.7), không sửa prompt.

## 0.10 Lean Canvas (21/09/2026)

**DH-09.** Chủ dự án 21/09/2026 yêu cầu điền Lean Canvas 12 ô cho dự án [nguồn: chủ dự án
21/09/2026, ảnh mẫu Lean Canvas]. Khác §0.4 (canvas chiến lược 9 ô, nhìn từ tầm nhìn xuống),
Lean Canvas nhìn từ vấn đề khách hàng lên; hai bảng phải cùng một nội dung, lệch chỗ nào thì
§0.4 thắng. Mọi ô đều trích từ `01`, `02` và số đo DB 21/09 (§0.9); chỗ nào chưa có bằng chứng
thật thì ghi *[giả định]*. Cập nhật 28/10/2026: bỏ CTV, kênh hai số Zalo, chi phí model.

| Ô | Nội dung | Neo |
|---|---|---|
| **Vấn đề** (1–3) | 1. Người mua hỏi một căn ("còn không, hẻm mấy mét, sổ chưa") và **không ai trả lời**, vì tin trên sàn luôn thiếu và người đăng không rảnh. 2. Người mua để lại SĐT là bị **40 cuộc gọi trong 3 ngày** từ môi giới lạ. 3. Chính chủ **ngại điền form** nhiều trường, đăng một lần rồi bỏ; tin cũ "còn bán" mãi trên sàn | INS-04, INS-05, INS-06, RSK-06, `01 §1.2` |
| **Giải pháp hiện có** | batdongsan / mogi / alonhadat: listing-first, lộ SĐT ngay trên tin, môi giới trả phí đăng, form nhiều bước + duyệt tay, không có khái niệm chính chủ; Zalo group / Facebook group môi giới: nhanh nhưng không cấu trúc, không lưu | `01 §1.5`, INS-13 |
| **Giải pháp** | 1. **Vòng hỏi chủ nhà → admin** (SRS-5.1zzzzzzz170): bot không biết → hỏi chủ nhà nếu có trên hệ thống (12 giờ), không thì admin → câu trả lời vào tin, lõi báo lại khách. 2. **Bot là trung gian toàn phần** (INS-11): khách chat qua Zalo, không SĐT, liên hệ chỉ mở lúc chốt lịch xem. 3. **Rao một câu** qua Zalo, AI bóc tách + hỏi 1 ý mỗi lượt (FR-144, FR-177, SRS-5.1zzzzzzz200) | SRS-5.1zzzzzzz170, FR-104, FR-144 |
| **Giá trị độc nhất** | **"Hỏi là có người trả lời, không phải để lại số."** Người mua được trả lời thật cho từng căn, ẩn danh, kết nối sống 3–4 năm; người bán rao một lần là xong | INS-01/02/04/09, DH-02 |
| **Khái niệm một dòng** | *Môi giới thường trực đứng sau mọi môi giới khác*: "Grab cho hỏi-đáp nhà đất" — người hỏi và người biết được nối bằng một bot giữ sổ *[giả định BA về cách nói]* | DH-01, OKRs eo2024 |
| **Lợi thế khó sao chép** | Kho **hỏi-đáp đã xác minh theo từng căn** (mỗi câu khách hỏi thành dữ kiện có nguồn, ngày, người trả lời); kết nối Zalo nhiều năm với người mua ở giữa chu kỳ; mạng NMG chịu luật 10 tin / 5% chốt. **Hôm nay lợi thế này gần 0** vì chưa có câu trả lời thật (§0.9) — nó là thứ phải tích luỹ, không mua được, và đó chính là lý do nó khó sao chép | INS-02, INS-06, BR-02, §0.4 ô "Khó sao chép" |
| **Phân khúc khách hàng** | Trả tiền: **CCRB** (chính chủ 1–2 căn, 1%) và **NMG** (10–30 căn, 0,5%) ở Sài Gòn (phường mới) + Long An, khởi điểm cụm Quận 5 cũ. Người dùng không trả tiền: **người mua ở** (P1, 6–13 tỷ) và **đầu tư** (P2, 21–30 tỷ) | `02 §2.2`, BR-05, FR-174 |
| **Khách hàng đầu tiên** | NMG đang rao 10+ căn cùng một cụm phường, hay bị khách hỏi lại cùng một câu; chính chủ Quận 5 cũ đã có sẵn Zalo, ngại đăng sàn. Người mua: đang xem 3–5 căn cùng khu, ghét bị gọi, chấp nhận chat với bot nếu được trả lời thật *[giả định — chưa phỏng vấn]* | FR-155, INS-04, `01 §1.7` |
| **Chỉ số chính** | Sao Bắc Đẩu: **lịch xem nhà chốt / tuần** (`viewings.status='confirmed'`). Đầu vào: I1 tin đủ thông tin lên sàn / tuần · I2 hội thoại mua đủ khu + ngân sách · **I3 câu khách hỏi được trả lời đúng hạn — chủ nhà hoặc admin (OMTM)** · I4 kết nối Zalo sống sau 30 ngày · I5 NMG hoạt động. **21/09/2026: tất cả bằng 0** | §0.5, SRS-5.1zzzzzzz170 |
| **Kênh** | Vào (người mua): SEO 100 tag + trang tin (BR-08), traffic mua từ batdongsan (20tr/tháng theo kế hoạch 2024), widget Zalo trên trang tin (FR-145), số Zalo tư vấn người mua. Ra (người bán): mạng NMG, admin đăng tin hộ (FR-156), số Zalo ký gửi. **Kênh chat duy nhất là Zalo cá nhân qua bridge, hai số; không có OA** | BR-08, BR-09, FR-145, FR-156, RSK-02, SRS-5.1zzzzzzz210 |
| **Cơ cấu chi phí** | Cố định gần 0: Supabase Free, Vercel Free, một VPS chạy lõi Python + hai bridge *(chi phí VPS chưa ghi trong docs)*, không sao lưu (OPEN-25). Biến đổi: token model theo lượt chat (chat Sonnet 5.5 đắt hơn Haiku — SRS-5.1zzzzzzz235; đồng hồ tiền FR-171), traffic 20tr/tháng nếu bật. *Lịch sử: CTV 0,5% mỗi giao dịch + 1,5 CTV × 7tr/tháng theo kế hoạch 2024 — bỏ cùng CTV 28/10/2026.* Kế hoạch 2024 tổng 800tr/6 tháng (390tr build thuê vendor) — **đã không đi theo**: code tự làm trong repo từ 24/08/2026 | `01 §1.4`, NFR-14/16, FR-171 |
| **Nguồn thu** | 100% từ phía bán, chỉ thu khi chốt: CCRB **1%** giá trị giao dịch, NMG **0,5%**, cho thuê **3/4 tháng tiền thuê**. Người mua 0đ. *Phần 0,5% trước chia CTV: CTV bỏ 28/10/2026, chưa chốt phần này về đâu.* OKR 2024 "1 giao dịch / 2 ngày, TB 10 tỷ" ≈ 6,7 tỷ / 6 tháng — BA đã cảnh báo cần chuyển đổi ~5% từ chat (OPEN-01). **21/09/2026: doanh thu 0, giao dịch 0** | `01 §1.3`, BR-04, BR-05, OPEN-01 |

Ô yếu nhất theo thứ tự: **Khách hàng đầu tiên** (chưa gặp ai thật) → **Kênh** (một kênh, mượn
tài khoản cá nhân) → **Lợi thế khó sao chép** (đang là lời hứa, chưa là tài sản). Ba ô này
đúng là ba việc §0.9 đề nghị làm trước.
