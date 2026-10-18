# 00 — Định hướng (BRD hợp nhất Aioinhadat × nhadat.cc)

Phiên bản: **v1.4** · Ngày: **07/09/2026** · Trạng thái: **tên, luồng CTV, địa bàn đã chốt; còn §0.8 — thêm OPEN-48 (07/09: sếp muốn bớt kế thừa nhadat.cc); OPEN-49 hỏi người bán ĐÃ CHỐT 07/09 theo kịch bản Gemini của sếp → FR-177; dọn 13 OPEN hướng 2024; Figma page 00 vẫn ở v1.3**

> Bộ `docs/` viết từ tài liệu nhadat.cc 2024; từ 25/08/2026 code chạy theo SRD
> "AI Ơi Nhà Đất" (AOND, `AOND req + chat examples.docx`) ở ngày càng nhiều chỗ.
> Trang này nói thẳng **sản phẩm hôm nay là gì, giữ gì của bên nào, còn gì chưa
> quyết** — và đứng trên `01`–`10`: tầng dưới không được mâu thuẫn với nó
> [nguồn: quyết định chủ dự án 03/09/2026]. Khung mượn `phuryn/pm-skills`
> (canvas §0.4, sao Bắc Đẩu §0.5, phản biện §0.7); nội dung có nguồn từng dòng.

## 0.1 Định vị

**DH-01.** **Aioinhadat** là *người môi giới thường trực đứng sau mọi môi giới
khác* [nguồn: OKRs eo2024.pptx, slide 1], vận hành bằng **một bot tên Thái**
với hai mặt [nguồn: chốt 03/09/2026, OPEN-39]:

| Mặt | Chạy theo | Cốt lõi | Neo |
|---|---|---|---|
| **Bán** | AOND §I–§VI | Rao một câu + ảnh, không form; khen trước hỏi sau, 1 thông tin/lần, nhặt dần nhiều ngày; người rao có hạng | FR-129, FR-144, FR-155, FR-172 |
| **Mua** | nhadat.cc 2024 | Web là phễu SEO đẩy về Zalo; khách không để SĐT; trả lời như người, ≤3 căn/tin, không khẳng định điều chưa xác minh; kết nối sống 3–4 năm | INS-01…04, FR-01…65 |
| **Vòng nối** | Cả hai (INS-06 = AOND §VII) | Khách hỏi → bot không biết → **CTV** hỏi chủ, nhắn lại `#mã tin: câu trả lời` → tin giàu thêm → bot báo lại khách. CTV quá 120' → admin đỡ khách, CTV tụt hạng | FR-140 c, **FR-173** |

**Địa bàn: Sài Gòn (TP.HCM theo phường mới sau 01/07/2025) + Long An; trọng
tâm là bán; khởi điểm cụm Quận 5 cũ** [nguồn: chốt 03/09/2026 — "bán sản phẩm
bất động sản ở Sài Gòn, các phường mới và Long An"; OPEN-27 nửa đầu, FR-174].
Cho thuê giữ như đang có *[giả định BA]*; tên hiển thị cũ/mới và thứ tự mở
từng cụm là OPEN-27 nửa sau.

**AOND là cách nhận và nuôi hàng; nhadat.cc là cách bán hàng.** Không có
"chuyển dự án" — một sản phẩm, hai bản thiết kế, một người đứng giữa là CTV.

**DH-02 · Bốn bất biến** (luật ở `ba-pipeline`, hướng nào cũng giữ):

| # | Bất biến | Neo |
|---|---|---|
| 1 | Mọi trang web là phễu về Zalo; không kéo hội thoại ra khỏi Zalo | IA-P1, INS-01 |
| 2 | Không hỏi SĐT người mua ngoài bước chốt lịch xem | NFR-07, FR-53, INS-04 |
| 3 | Không khẳng định pháp lý / quy hoạch / còn-hết khi chưa xác minh — chuyển thành câu hỏi | RSK-03, FR-40, AOND §II |
| 4 | Bot là trung gian toàn phần: lưu hết chủ chia sẻ, khách hỏi mới khai, liên hệ chỉ mở lúc chốt lịch xem | INS-11, FR-104, OPEN-36 |

**DH-03.** Mặt bán: AOND thắng khi vênh với nhadat.cc gốc, trừ khi đụng DH-02
(ví dụ TTL 7 ngày FR-107 → nhỏ giọt FR-129/144). **DH-04.** Mặt mua + web:
`chats w B.docx`, `nhadat.cc website.docx` là nguồn; văn phong AOND mượn cho
cả hai phía (`06 §6.8`).

## 0.2 Hai nguồn gốc, một sản phẩm

| Khía cạnh | nhadat.cc (2024) | AOND SRD (06/2026) | Hôm nay | Neo |
|---|---|---|---|---|
| Tên | nhadat.cc, "Thái" | aioinhadat.com, gia đình •ai | **Aioinhadat**, viết cho khách **AI Ơi Nhà Đất**; trợ lý **mỗi khách một tên** từ kho •ai (T•ai, Kh•ai…, FR-181 — chốt lại 09/09, bản 03–09/09 là một tên Thái); domain web: https://aioinhadat.vercel.app/ | OPEN-08, OPEN-39, FR-181 |
| Trọng tâm | Khách chat Zalo; web SEO | Người rao gửi hàng tự nhiên | Cả hai, một `chat-reply`, tách vai từng lượt | FR-157, FR-159 |
| Nhận tin rao | `/raoban` + câu rao | Text/thoại/ảnh, không form | Câu rao trong Zalo sinh mã tin; ảnh có; thoại chưa | FR-158, FR-134 |
| Nuôi tin | TTL 7 ngày | 1 thông tin/lần, 1–2 căn/ngày | Đúng AOND | FR-129, FR-144 |
| Khách hỏi điều bot không biết | Hỏi chủ | Bot-to-bot hỏi chủ | **Hỏi chủ nhà trước** (12 giờ), rồi CTV (120 phút), rồi admin (chốt lại 09/09) | FR-173 |
| Xếp hạng | NMG ≥10 tin, chốt ≥5% | Đồng/Bạc/Vàng người rao | Hạng người rao (ẩn) + **điểm người rao 0–100** (09/09, FR-183) + **hạng CTV** theo đúng hạn | FR-155, FR-183, FR-173, OPEN-26/42 |
| Phí | CCRB 1% · NMG 0.5% · thuê ¾ tháng | Giống | Giống | BR-05, AOND §V |
| Địa bàn | Quận 5 | Quận 5 rồi mở | **Sài Gòn (phường mới) + Long An**, trọng tâm bán; khởi điểm Q5 cũ (chốt 03/09) | BR-01, OPEN-27, FR-174 |
| Hạ tầng | Vendor, Slack, Logstash | Gemini → local, SharePoint | Supabase Edge + Claude, Storage, bridge Zalo, `/admin` | SRS-2, OPEN-41 |
| Vận hành | 1.5 CTV | CTV dẫn khách | 2 CTV xoay vòng + báo cáo 17h + hạng (CTV cần Zalo uid mới nhận được nhắc) | FR-136/137/173 |

## 0.3 SRD AOND: nhận / sửa / chưa / không

✅ đúng · 🔶 khác bản gốc · ⏳ chưa · ❌ không nhận · ❓ chờ chốt

| AOND | Nội dung | | Ở đây |
|---|---|---|---|
| §I | Rao tự nhiên, không form | ✅ | FR-92/158/144/161 |
| §I | Thoại | ⏳ | FR-134 "STT chưa làm" |
| §I | Tích lũy ngầm nhiều phiên | ✅ | FR-129/144/153/172 |
| §I | 200–300 người/ngày, 6–9k tin, phủ 90% Q5 | 🔶 | NFR-05; Free-tier chưa đo (NFR-16) |
| §II | Kho tên •ai (m•ai, t•ai…) | ✅ | Chốt lại 09/09: mỗi khách một tên, gán tất định theo Zalo ID, giữ suốt (FR-181); bản 03/09 "một tên Thái" đã bỏ |
| §II | Quy tắc 30 từ | ✅ | FR-178 (07/09), `TONE_RULES` 05/10 (SRS-5.1zzi): một tin khoảng 30 từ, kể cả nhánh mua; dài hơn chỉ khi khách hỏi điều cần giải thích hoặc liệt kê 2–3 căn (`06 §6.8`) |
| §II | Khen trước, hỏi 1/lần; "hình như là" | ✅ | FR-129, FR-134, FR-177 b (khích lệ phải gắn khách mua, không khen suông) |
| §II | Giọng mẫu: transcript 30 câu người bán | ✅ | FR-178 d: `SELLER_FEWSHOT` 16 cặp chép từ transcript AOND + kịch bản Gemini của sếp, khoá `bot_prompts.seller_fewshot` |
| §II | Nút bấm nhanh trong tin (`[Vẫn đang bán]`…) | ⏳ | Bridge zca-js gửi chữ, chưa gửi nút — OPEN-33 (Zalo OA) |
| §III | Nhóm 1 nhà ở | ✅ | FR-172 |
| §III | Nhóm 2 đất; thông số cho thuê | ✅ | FR-186 (09/09): đất hỏi đường, hướng, cột điện/hố ga, xây tự do/theo mẫu, sổ riêng/đất dự án; cho thuê hỏi nội thất, cọc, thời hạn, trượt giá |
| §III | Nhóm 3 công nghiệp | ✅ | FR-186 mở rộng (09/09 tối, OPEN-40 chốt): `kho_xuong`, `toa_nha`, `dat_kinh_doanh`, `dat_nong_nghiep` — bộ câu hỏi riêng, không thêm cột |
| §IV | Điểm uy tín 50% hoàn chỉnh + 50% kịp thời | 🔶 | FR-183 (09/09): điểm người rao = TB điểm tin × hệ số quy mô NMG; vế "kịp thời" đo và ghi DB từ 05/10 (SRS-5.1zzd), chưa gộp vào điểm; hạng theo ĐIỂM từ 05/10 (SRS-5.1zzf, thay FR-155 theo số tin); CTV đo kịp thời riêng — FR-173 |
| §IV | Điểm **từng tin** (khác điểm người rao) | ✅ | FR-177 d: `diem_tin()` 7 tiêu chí 0–100 theo kịch bản Gemini; ngưỡng rao 70 chờ chốt — OPEN-50 |
| §IV | Thưởng quy mô; quyền lợi Đồng/Bạc/Vàng | ✅ người rao · ❓ CTV | SRS-5.1zzf (05/10, OPEN-26 chốt): Đồng tối đa 5 căn, người bán Vàng ưu tiên khách nét (SRS-5.1zzx), CCRB Vàng đẩy tới 20 NMG lõi; hạng nói ra khi tin lên kệ (SRS-5.1zzs). CTV: OPEN-42 |
| §V | Phí; NMG ≥10 tin, chốt 5% | ✅ | BR-05, FR-125, FR-155 |
| §V | Hệ thống điều phối CTV | ✅ | FR-136, FR-173 |
| §VI | Quét im >5 ngày; hỏi 1–2 căn/ngày | ✅ | FR-63, FR-129, `seller_drip_tick` |
| §VII | Gemini → máy local | ❌ | Claude/Supabase; OPEN-41 |
| §VII | SharePoint 5 lớp | ❌ | Supabase Storage (FR-165) |
| §VII | Live Chat Monitor: nhãn + nút cướp quyền | 🔶 | FR-135/141/147; màn hình ⏳ |
| §VII | Bot-to-bot hỏi chủ, báo lại khách | 🔶 | Qua CTV thay vì bot-to-bot — FR-173 |

## 0.4 Canvas chiến lược

| Ô | Nội dung | Neo |
|---|---|---|
| Tầm nhìn | Môi giới thường trực đứng sau mọi môi giới; hội thoại bắt đầu thì không kết thúc | OKRs eo2024; demo2Vitalify |
| Phân khúc | Trước: người rao ở cụm Q5 cũ, rồi Sài Gòn (phường mới) + Long An (P3 chính chủ, P4 NMG 10–30 căn). Sau: người mua ở (P1), đầu tư (P2). Bán trước vì không hàng thì chat rỗng | 02 §2.2, RSK-04, FR-174 |
| Chi phí | Không phí đăng, không phí mua, thu khi chốt. Build ≤418tr; vận hành Free-tier + 20tr/tháng | NFR-14/16, §1.3–1.4 |
| Giá trị | Người rao: "rao một lần là xong". Người mua: được trả lời thật, không lộ số (thay cho 40 cuộc gọi/3 ngày) | INS-04/06/09 |
| KHÔNG làm | App · form nhiều trường · phí đăng · hỏi SĐT · marketplace tự phục vụ · đa ngôn ngữ · Messenger/Telegram · khẳng định pháp lý | 02 §2.3, DH-02 |
| Chỉ số | §0.5 | — |
| Tăng trưởng | Bán: mạng NMG + admin đăng tin (FR-156). Mua: SEO 100 tag + traffic batdongsan + widget Zalo (FR-145) | BR-02/08, §1.4 |
| Năng lực | Tin có cấu trúc (FR-172) · não cấu hình (FR-138) · Zalo + bridge · 2 CTV có hàng đợi + hạng (FR-136/173) · sổ lỗi (FR-152) | 07 §2 |
| Khó sao chép | Kho hỏi-đáp đã xác minh theo từng căn; kết nối Zalo nhiều năm; mạng NMG chịu luật 10 tin/5% | INS-02/06, BR-02 |

Địa bàn đã chốt 03/09 (Sài Gòn + Long An); mở cụm nào trước vẫn theo "mật độ
trước độ phủ" (INS-08) — OPEN-27 nửa sau (d).

## 0.5 Sao Bắc Đẩu

**DH-05 · NSM: số lịch xem nhà chốt mỗi tuần** *[giả định BA]* — dễ đếm, khách
làm trung tâm, chỉ tăng bằng chất lượng tin + trả lời, đo được
(`reminders.kind='viewing'`, FR-57), dẫn trước giao dịch (BR-04) vài tuần.
Không lấy "giao dịch" (quá thưa, hôm nay 0) hay "chat mới" (hoạt động, không
phải giá trị).

| # | Đầu vào | Kéo bằng | Đo |
|---|---|---|---|
| I1 | Tin đủ thông tin lên sàn / tuần | FR-129, FR-172, FR-156 | `listings.status='dang_ban'` |
| I2 | Hội thoại mua đủ khu vực + tầm giá | FR-130, FR-131 | `buyers.preferences` |
| I3 | **Câu khách hỏi được trả lời đúng hạn** | **FR-173**, FR-140 c | `info_requests.answered_at ≤ sla_due_at`; `ctv_ranks` |
| I4 | Kết nối Zalo sống sau 30 ngày | FR-63, `nudge` | `buyers.last_contact_at` (đo được từ ~21/09 — buyer đầu tạo cuối 08/2026) |
| I5 | NMG hoạt động (có tin + trả lời drip 7 ngày) | FR-155 | view `nmg_hoat_dong` (`20260904e`): có tin lên kệ VÀ ≥1 câu nhỏ giọt trả lời trong 7 ngày; hôm nay 0/3 |

**OMTM quý này: I3.** Vòng hỏi-đáp mới khép 02–03/09/2026, `info_requests` chưa
có lượt trả lời thật — mắt xích duy nhất chưa có số, và là mắt xích cả hai tài
liệu gốc đặt ở trung tâm.

## 0.6 Lộ trình

Đã dựng (03/09/2026): web + Supabase; bot hai mặt qua bridge (OA chờ — FR-145);
173 tin có cấu trúc; drip người bán; hỏi-đáp qua CTV + hạng CTV; CTV chia đơn +
báo cáo 17h; sổ lỗi, nhịp tim, chuông hết tiền, còi ngoài ntfy; kiểm thử 4 tầng
(`10`). **Đã chạy thật** (nghiệm thu 04/09, `10 §10.8`): web + kho tin + sổ lỗi.
Chưa: bridge **im từ 27/08** (VPS chưa bật), 0 chủ nhà/CTV có Zalo uid, 0 fact,
0 ảnh, 0 câu hỏi khách, 0 lịch xem — mọi vòng chat mới có bằng chứng từ test.

**DH-06 · 90 ngày:**

| Đợt | Việc | Neo |
|---|---|---|
| 1 · Chốt | §0.8 (OPEN-41/42, 27 nửa sau; OPEN-40 chốt 09/09) + OPEN-21 (5 vai), 26 (quyền lợi hạng), 28 (phí) | 09 |
| 2 · Đo I3 | 20 tin có chủ thật vào vòng CTV; đo tỷ lệ trả lời trong 120' / 24h; định cỡ lại OPEN-42 | FR-173 |
| 2b · Địa bàn | Đợt 1 xong 03/09 (không ghi cứng Quận 5, copy nói Sài Gòn + Long An). Đợt 2 khi OPEN-27 nửa sau chốt: bảng `wards` một nguồn, SEO theo khu mới, mở cụm kề Q5 cũ + một huyện Long An có hàng thật | FR-174 |
| 3 · Dữ liệu | 7 hạng mục theo `01 §1.5c` (sự kiện tin, khớp tin–hồ sơ, giá khu vực…) | INS-13 |
| 4 · AOND còn thiếu | Màn hình nhãn + nút cướp quyền; thông số cho thuê/đất/công nghiệp đã làm (FR-186, OPEN-40 chốt 09/09); thưởng quy mô nếu OPEN-26 chốt | FR-135/141/172 |
| 5 · Vận hành | Không sao lưu (chủ dự án bỏ 11/09/2026, chấp nhận rủi ro); lên Pro ngay khi có giao dịch thật đầu tiên | NFR-16, OPEN-25 |

Ngoài 90 ngày: thoại, Messenger/Telegram, app, công nghiệp, đổi domain.

## 0.7 Giả định chịu lực

| # | Giả định | Đổ nếu | Ngưỡng dừng | Thử rẻ nhất |
|---|---|---|---|---|
| 1 | **CTV + chủ nhà trả lời kịp** khi khách hỏi (FR-173) | <30% câu trả lời trong 48h; admin phải đỡ >50% | 2 tuần liền | 20 tin chủ thật; hỏi đúng câu khách hỏi |
| 2 | **Khách chịu chat bot** không cần người thật ngay (INS-04) | Hội thoại → lịch xem <2%; cờ cần người >30% | Cờ >30% | Widget Zalo trên 20 trang tin nhiều view; đọc 50 hội thoại |
| 3 | **Hạng làm người ta chăm hơn** (AOND §IV) | Hạng lên/xuống không đổi tỷ lệ trả lời | Không lệch sau 30 ngày | Nói hạng qua Zalo cho 3 NMG + 2 CTV, chưa cần UI |
| 4 | **Free-tier chịu tới giao dịch đầu** (NFR-16) | Mất dữ liệu; Vercel đình chỉ | Một sự cố | Không còn — chủ dự án bỏ sao lưu 11/09/2026, chấp nhận mất dữ liệu là không lấy lại được |
| 5 | **Mở Sài Gòn + Long An không loãng kho** (FR-174 vs INS-08) | >50% phường/huyện mở có <5 tin sau 60 ngày | — | Mở cụm phường kề Q5 cũ trước; Long An theo một huyện có nguồn hàng thật |

Đứng vững: không thu SĐT; phí chỉ khi chốt. Đã đổi: một tên bot Thái → mỗi khách một tên (FR-181, 09/09). Chưa đánh giá
được: "rao một câu" — 173/173 tin là `import_excel` ngày 21/08, chưa tin nào
sinh từ câu rao Zalo thật (04/09); OKR "1 giao dịch/2 ngày" (OPEN-01); nhu cầu
nhóm công nghiệp. Giả định 4 đã **đổ một lần**: bridge chết 8 ngày (27/08 →
04/09) mà không ai biết cho tới khi có còi ntfy.

## 0.8 Chờ chủ dự án chốt

Đã chốt 03/09/2026: **OPEN-08 + OPEN-39** (Aioinhadat; "một bot Thái" đã đảo lại 09/09 → kho
•ai theo khách, FR-181), **luồng CTV** (FR-173), **địa bàn — OPEN-27 nửa đầu** (Sài Gòn phường
mới + Long An, trọng tâm bán — FR-174). Đã chốt 04/09/2026: **giữ chân khách
mốc 5 ngày** (FR-60 đổi từ 3 ngày; FR-63 buộc giữ kết nối từ ngày 6) và **dựng
hết phần tài liệu có mà code chưa** (OPEN-43 → xem `10 §10.8.4`) [nguồn: chủ
dự án 04/09/2026 "dựng hết đi, giữ chân 5 ngày"]. Còn:

| ID | Câu hỏi | Khuyến nghị BA |
|---|---|---|
| OPEN-27 nửa sau | Tên hiển thị cũ hay mới; DB lưu gì; mã tin; mở phường/huyện nào trước; cho thuê có giữ | Hiển thị cả hai tên; bảng `wards` một nguồn; giữ mã tin; mở cụm kề Q5 cũ + một huyện Long An có hàng; giữ cho thuê như đang có |
| OPEN-40 | ✅ chốt 09/09/2026 tối — làm cả ba bằng `required_facts` (FR-186 mở rộng: `toa_nha`, `dat_nong_nghiep`, `dat_kinh_doanh`, `kho_xuong`) | — |
| OPEN-41 | Model: giữ Claude/Supabase hay Gemini → local theo AOND §VII | Giữ; lớp gọi model đã gom một chỗ, đổi sau được |
| OPEN-42 | CTV: hạn trả lời (đang 120') và mốc Vàng ≥90% / Bạc ≥70% / Đồng; hệ quả của hạng | Giữ tới khi có ~30 câu thật rồi định cỡ; chốt hệ quả cùng lúc |
| **OPEN-48** | ✅ **ĐÃ CHỐT 08/09/2026**: Bỏ toàn bộ nhóm tính năng thừa kế 2024 (mini-site rao web, tài khoản, trang phụ SEO cũ). Chuẩn hóa 100% tài liệu theo Aioinhadat 2026 | Đã chốt theo lệnh sếp và chủ dự án |

**Đã chốt 07/09/2026: cách hỏi người bán** — theo kịch bản huấn luyện môi giới sếp
làm trong Gemini (tài liệu gốc ở thư mục gốc): một thông tin/lần theo thứ tự địa chỉ →
giá → hẻm → diện tích → tầng → phòng → pháp lý → ảnh → lịch khảo sát; mỗi câu trả lời
được khích lệ; đủ thì gửi bản nháp tin kèm điểm 100 theo 7 tiêu chí, đủ điểm mới rao
(FR-177, thay thứ tự FR-176 f). Cùng ngày, 13 mục OPEN của hướng nhadat.cc 2024 đóng
vì không còn hợp AOND (`09` bảng "đã chốt / đã đóng").

**Đã chốt 07/09/2026 tối: giọng bot xây từ AOND lên, không đọc mã tin** (FR-178,
chủ dự án) — `TONE_RULES` viết lại theo SRD AOND §II (mỗi tin dưới 30 từ, khen
điểm mạnh thật gắn khách mua rồi hỏi đúng một thứ, không đọc tên trường), few-shot
người bán chép từ transcript AOND 30 câu + kịch bản Gemini của sếp, và **mã tin
không bao giờ đọc ra trong chat** — mua lẫn bán, gọi căn bằng địa chỉ. Mã vẫn là
khoá liên kết web ↔ chat (IA-P3): web hiện, khách gõ vào thì bot hiểu, chỉ không
tự đọc. Còn treo: ngưỡng điểm để tin được rao (**OPEN-50**), và mặt MUA vẫn theo
`chats w B.docx` cho tới khi OPEN-48 chốt bỏ mảng nào.

**DH-07.** Cho tới khi §0.8 chốt, việc mới đi theo cột phải và tầng dưới ghi
`[giả định BA]` ở chỗ phụ thuộc.

---

*Truy vết:* DH-01…DH-07 → `08-traceability.md §8.0`. (Bản Figma và `design/` đã xoá
08/09/2026 — OPEN-45 đóng; không còn bản trực quan riêng.)

## 0.9 Đánh giá 21/09/2026 theo khung Design Thinking

**DH-08.** Chủ dự án 21/09/2026 yêu cầu trả lời năm cột *Empathy → Define → Ideate →
Prototype → Test* cho dự án này và đánh giá khả năng thành công [nguồn: chủ dự án
21/09/2026, ảnh khung năm cột + "đánh giá khả năng thành công"]. Số liệu đo trực tiếp
trên DB production ngày 21/09/2026 11:50 UTC (đếm `listings`, `sellers`, `buyers`,
`viewings`, `deals`, `projects`, `duong`), không đọc từ code.

| Cột | Đã có | Bằng chứng | Còn thiếu |
|---|---|---|---|
| **Empathy** — hiểu ai, hiểu gì | Chân dung B (6–13 tỷ, "xem 3 căn → xin ảnh → hỏi 1 căn → im"), S chính chủ ngại form, NMG 10 tin / 5%; vấn đề lõi: tin luôn thiếu và không ai trả lời khách; Zalo cắt sau 7 ngày mà chu kỳ mua 3–4 năm; ba đối thủ đều listing-first, lộ SĐT | `01 §1.2`, INS-02/03/04/06, `01 §1.5` | Chân dung B dựa trên 24 hội thoại **giả định** 2024, chưa phỏng vấn người thật; chưa có số thị trường Quận 5 (`01 §1.7`) |
| **Define** — vấn đề, mục tiêu | Câu chuyện lõi "hỏi căn này có ai trả lời không" → vòng nối CTV (FR-173); persona P1–P4; sao Bắc Đẩu = lịch xem chốt/tuần, OMTM quý = câu khách hỏi trả lời đúng hạn | §0.5, `02 §2.2`, FR-173 | — (cột chắc nhất) |
| **Ideate** — lật giả định | Không form, không app, không SĐT, tin thiếu là tính năng, mỗi khách một tên bot, quận cũ là ngôn ngữ thị trường | INS-05/11/12, FR-181, §0.4 ô KHÔNG làm | Năm giả định chịu lực §0.7 chưa cái nào có số; giả định 4 đã đổ một lần |
| **Prototype** — giải pháp tối thiểu | Web SEO + kho tin cấu trúc, bot hai mặt qua bridge, bóc tách AI có kiểm bằng chứng (FR-208), từ điển đường 7.114 dòng (FR-212), 1.639 dự án, hỏi bù, CTV chia đơn, sổ lỗi + còi, 439 ca e2e, 10 cổng CI | `07`, `10 §10.8`, `bot/tests/e2e` | Đã vượt mức "mock test" về máy — nhưng là **phòng thí nghiệm sạch**: 21/09 DB có **0 tin, 0 người bán, 1 người mua** (chủ dự án), 0 lịch xem, 0 giao dịch; rổ hàng 173 tin cũ đã xoá theo lệnh 09/09 |
| **Test** — kiểm chứng | Máy chạy đúng luật, không sập, không lộ SĐT, giọng bớt máy (TS-DUONG, TS-BLDL, TS-HOIBU 21/09) | `10` | **Chưa quay được vòng nào với người thật**: giả định 1, 2, 3, 5 chưa có bằng chứng; mũi tên Test → Ideate chưa chạy |

**Đánh giá khả năng thành công** *[nhận định BA, không có số để tính xác suất]*:

- Điểm mạnh thật: luận điểm rõ và khác biệt thật so với batdongsan / mogi / alonhadat
  (INS-04/11), chi phí vận hành gần không (NFR-16), mọi mắt xích đều đo được (§0.5).
- Điểm yếu chí tử: dự án đi hết Prototype mà **chưa quay lại Empathy với người thật
  lần nào** — đang tối ưu giọng bot trước khi biết chủ nhà có trả lời CTV hay không.
- Rủi ro lớn nhất không nằm ở code: **RSK-04** (không hàng thì chat rỗng). Kho tin
  hôm nay bằng 0 theo quyết định chủ dự án; rủi ro thứ hai là **RSK-02** (kênh duy nhất
  là Zalo cá nhân qua bridge, chưa có OA — FR-145).

**Việc kế tiếp theo đánh giá này** (khớp §0.6 đợt 2, không mở việc mới):

1. Dừng chỉnh giọng; đưa **20 tin có chủ thật** vào vòng CTV, đo 2 tuần tỷ lệ câu
   khách hỏi được trả lời trong 48 giờ (giả định 1, ngưỡng dừng <30%).
2. Kéo **10 người mua thật** qua widget Zalo trên trang tin (FR-145), đọc nguyên văn
   hội thoại, đếm cờ "cần người thật" (giả định 2, ngưỡng >30%).
3. Vượt ngưỡng dừng ở 1 hoặc 2 → sửa **mô hình** (§0.7), không sửa prompt.

## 0.10 Lean Canvas (21/09/2026)

**DH-09.** Chủ dự án 21/09/2026 yêu cầu điền Lean Canvas 12 ô cho dự án [nguồn: chủ dự án
21/09/2026, ảnh mẫu Lean Canvas]. Khác §0.4 (canvas chiến lược 9 ô, nhìn từ tầm nhìn xuống),
Lean Canvas nhìn từ vấn đề khách hàng lên; hai bảng phải cùng một nội dung, lệch chỗ nào thì
§0.4 thắng. Mọi ô đều trích từ `01`, `02` và số đo DB 21/09 (§0.9); chỗ nào chưa có bằng chứng
thật thì ghi *[giả định]*.

| Ô | Nội dung | Neo |
|---|---|---|
| **Vấn đề** (1–3) | 1. Người mua hỏi một căn ("còn không, hẻm mấy mét, sổ chưa") và **không ai trả lời**, vì tin trên sàn luôn thiếu và người đăng không rảnh. 2. Người mua để lại SĐT là bị **40 cuộc gọi trong 3 ngày** từ môi giới lạ. 3. Chính chủ **ngại điền form** nhiều trường, đăng một lần rồi bỏ; tin cũ "còn bán" mãi trên sàn | INS-04, INS-05, INS-06, RSK-06, `01 §1.2` |
| **Giải pháp hiện có** | batdongsan / mogi / alonhadat: listing-first, lộ SĐT ngay trên tin, môi giới trả phí đăng, form nhiều bước + duyệt tay, không có khái niệm chính chủ; Zalo group / Facebook group môi giới: nhanh nhưng không cấu trúc, không lưu | `01 §1.5`, INS-13 |
| **Giải pháp** | 1. **Vòng nối CTV** (FR-173): bot không biết → CTV hỏi chủ trong 120' → câu trả lời vào kho, lần sau không hỏi lại. 2. **Bot là trung gian toàn phần** (INS-11): khách chat qua Zalo, không SĐT, liên hệ chỉ mở lúc chốt lịch xem. 3. **Rao một câu** qua Zalo, AI bóc tách + hỏi bù một thông tin/lần (FR-144, FR-177, FR-208); "còn bán không" hỏi định kỳ (FR-103) | FR-173, FR-104, FR-144, FR-208 |
| **Giá trị độc nhất** | **"Hỏi là có người trả lời, không phải để lại số."** Người mua được trả lời thật cho từng căn, ẩn danh, kết nối sống 3–4 năm; người bán rao một lần là xong | INS-01/02/04/09, DH-02 |
| **Khái niệm một dòng** | *Môi giới thường trực đứng sau mọi môi giới khác*: "Grab cho hỏi-đáp nhà đất" — người hỏi và người biết được nối bằng một bot giữ sổ *[giả định BA về cách nói]* | DH-01, OKRs eo2024 |
| **Lợi thế khó sao chép** | Kho **hỏi-đáp đã xác minh theo từng căn** (mỗi câu khách hỏi thành một fact có nguồn, ngày, người trả lời); kết nối Zalo nhiều năm với người mua ở giữa chu kỳ; mạng NMG chịu luật 10 tin / 5% chốt. **Hôm nay lợi thế này bằng 0** vì kho fact thật chưa có (§0.9) — nó là thứ phải tích luỹ, không mua được, và đó chính là lý do nó khó sao chép | INS-02, INS-06, BR-02, §0.4 ô "Khó sao chép" |
| **Phân khúc khách hàng** | Trả tiền: **CCRB** (chính chủ 1–2 căn, 1%) và **NMG** (10–30 căn, 0,5%) ở Sài Gòn (phường mới) + Long An, khởi điểm cụm Quận 5 cũ. Người dùng không trả tiền: **người mua ở** (P1, 6–13 tỷ) và **đầu tư** (P2, 21–30 tỷ) | `02 §2.2`, BR-05, FR-174 |
| **Khách hàng đầu tiên** | NMG đang rao 10+ căn cùng một cụm phường, hay bị khách hỏi lại cùng một câu, chịu trả lời drip trong 7 ngày (view `nmg_hoat_dong`); chính chủ Quận 5 cũ đã có sẵn Zalo, ngại đăng sàn. Người mua: đang xem 3–5 căn cùng khu, ghét bị gọi, chấp nhận chat với bot nếu được trả lời thật *[giả định — chưa phỏng vấn]* | FR-155, INS-04, `01 §1.7` |
| **Chỉ số chính** | Sao Bắc Đẩu: **lịch xem nhà chốt / tuần** (`reminders.kind='viewing'`). Đầu vào: I1 tin đủ thông tin lên sàn / tuần · I2 hội thoại mua đủ khu + tầm giá · **I3 câu khách hỏi được trả lời đúng hạn (OMTM)** · I4 kết nối Zalo sống sau 30 ngày · I5 NMG hoạt động. **21/09/2026: tất cả bằng 0** | §0.5, FR-57, FR-173 |
| **Kênh** | Vào (người mua): SEO 100 tag + trang tin (BR-08), traffic mua từ batdongsan (20tr/tháng theo kế hoạch 2024), widget Zalo trên trang tin (FR-145). Ra (người bán): mạng NMG qua CTV, admin đăng tin hộ (FR-156), Zalo cá nhân qua bridge (OA chưa có — FR-145). **Hôm nay chỉ một kênh sống là Zalo cá nhân qua bridge** | BR-08, BR-09, FR-145, FR-156, RSK-02 |
| **Cơ cấu chi phí** | Cố định gần 0: Supabase Free, Vercel Free, một VPS chạy bridge *(chi phí VPS chưa ghi trong docs)*, không sao lưu (OPEN-25). Biến đổi: token model theo lượt chat (đồng hồ tiền FR-171, chuông hết tiền), CTV 0,5% mỗi giao dịch chốt, 1,5 CTV × 7tr/tháng theo kế hoạch 2024, traffic 20tr/tháng nếu bật. Kế hoạch 2024 tổng 800tr/6 tháng (390tr build thuê vendor) — **đã không đi theo**: code tự làm trong repo từ 24/08/2026 | `01 §1.4`, NFR-14/16, FR-171 |
| **Nguồn thu** | 100% từ phía bán, chỉ thu khi chốt: CCRB **1%** giá trị giao dịch (0,5% trả CTV), NMG **0,5%**, cho thuê **3/4 tháng tiền thuê**. Người mua 0đ. OKR 2024 "1 giao dịch / 2 ngày, TB 10 tỷ" ≈ 6,7 tỷ / 6 tháng — BA đã cảnh báo cần chuyển đổi ~5% từ chat (OPEN-01). **21/09/2026: doanh thu 0, giao dịch 0** | `01 §1.3`, BR-04, BR-05, OPEN-01 |

Ô yếu nhất theo thứ tự: **Khách hàng đầu tiên** (chưa gặp ai thật) → **Kênh** (một kênh, mượn
tài khoản cá nhân) → **Lợi thế khó sao chép** (đang là lời hứa, chưa là tài sản). Ba ô này
đúng là ba việc §0.9 đề nghị làm trước.
