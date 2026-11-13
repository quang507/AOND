# LQC — Listing Quality Controller: bot hỏi gì, khi nào, đã chạy tới đâu

Cập nhật 13/11/2026 (lần 3, SRS-475 điều phối chung), đối chiếu code `main` @ 4ebda18 và dữ liệu Supabase cùng ngày. Nguồn: đặc tả anh Luận (4 mảng, 22 câu mẫu).

LQC là "người chăm tin" sau khi tin lên web. Nó xem tin còn thiếu gì để bán được, rồi hỏi chủ nhà **từng câu một, ngắn, khéo** — như một
quản lý rảo qua các chat. Bot không đọc thuộc lòng 22 câu mẫu: mỗi lần nhắn, AI tự viết câu theo đúng việc cần hỏi và theo chuyện đang nói.

Ký hiệu: **✅ đã chạy** · **🟡 có một phần** · **❌ chưa có**.

## 2. Khi nào bot hỏi

**Lúc chủ đang khai tin (trước khi đăng)** — chỉ một loại câu: chủ vừa nói loại giấy thì lượt kế bot hỏi **một** câu theo đúng loại đó
(sổ chung / ủy quyền → người đứng tên đồng ý ký bán chưa; HĐMB / sổ đang làm / chưa có sổ → khi nào có sổ; đất thuê → thuê tới năm nào;
giấy tay → đất gốc có sổ chưa; nói chung chung kiểu "pháp lý an tâm" → hỏi lại cụ thể là giấy gì; chưa hoàn công → dự kiến khi nào xong).
Câu đã hỏi ở đây thì sau khi đăng không hỏi lại.

**Sau khi tin lên web** — một hàng câu hỏi theo thứ tự, mỗi lần một câu:

1. **Ảnh** — tin chưa đủ 6 ảnh thì xin trước. Tin xin ảnh đầu tiên đi **10 phút sau khi báo đăng**.
2. **Pháp lý** — hỏi lại loại giấy nếu còn mơ hồ; xin ảnh sổ nếu chủ nói có sổ mà chưa gửi; rồi người đứng tên, thế chấp, quy hoạch.
3. **Hợp đồng thuê** — chỉ khi nhà đang có người thuê: tiền thuê mỗi tháng.
4. **Lợi thế** — chỉ căn buôn bán được (mặt bằng, shophouse, nhà mặt tiền): hợp kinh doanh gì, chỗ đậu xe.
5. **So sánh** — gửi 2–3 căn cùng loại đang rao gần; kho chưa đủ căn thì bỏ qua, mỗi ngày tra lại.
6. Giá (có thương lượng không, lý do bán) · thuế phí · giờ xem nhà, chìa khoá · chi tiết nhà (hướng, năm xây, nội thất).
7. Hết hàng mà vẫn thiếu ảnh → nhắc xin ảnh **một lần cuối**.

Câu tới chủ bằng hai đường: chủ đang nhắn thì bot đáp xong hỏi câu kế ngay trong lượt đó; chủ im thì vòng nền tự nhắn.

**LQC điều phối mọi tin chủ động tới chủ nhà** (SRS-475, `src/aioi/lqc.py`): tin xin ảnh 10 phút, hàng câu hỏi sau đăng, Image LQC,
hỏi còn bán, giữ kết nối đều hỏi chung MỘT bộ luật ở mục 3 trước khi gửi — trước đây mỗi vòng giữ luật riêng, trần ngày chỉ đếm tin
của hàng câu hỏi nên một chủ có thể nhận tin của nhiều vòng trong cùng buổi.
**Image LQC** chạy riêng: mỗi khi bộ ảnh của tin đổi thì chấm lại, rồi nhắn xin góc thiếu / khen tấm đẹp / xin ẩn tấm kém (tối đa 2 tin mỗi căn).

## 2b. LQC nghe chủ (SRS-476)

AI đọc theo nghĩa lời chủ ở mỗi lượt chat (không bắt từ khoá), code kiểm cụm trích rồi ghi trạng thái vào căn:

| Chủ nói | LQC làm |
|---|---|
| Hẹn: "chiều chị gửi ảnh", "mai ra phường hỏi rồi báo", "để chị hỏi chồng" | Ghi việc + giờ hẹn (không nói giờ thì ước: chiều 16:00, tối 19:30, mai 9:30). Tới giờ hẹn thì im; quá 30 phút mà chưa xong thì nhắc **một câu đúng lời hẹn** rồi thôi. Ảnh về trước giờ hẹn → huỷ hẹn. Hẹn lần hai mà lỡ → không nhắc. Quá giờ hẹn hơn 12 tiếng (ngoài khung giờ…) → bỏ, không nhắc trễ |
| Bận: "đang chạy xe", "bận, tối nói" | Im mọi tin chủ động tới lúc chủ rảnh; chủ nhắn lại là hết bận |
| Không có: "nhà đang cho thuê không vào chụp được", "sổ ngân hàng giữ" | Thôi xin ảnh nhà / ảnh sổ (hàng câu hỏi và Image LQC); Image LQC vẫn được xin ẩn ảnh kém |
| Phiền: "hỏi gì hỏi hoài", "thôi em, vậy đủ rồi" | Thôi hẳn câu hỏi; vẫn còn hỏi còn bán (20 ngày) và giữ kết nối |

Nhà trong hẻm mà chủ nói có gara / đậu xe hơi trong nhà → AI ghi đường vào là **hẻm xe hơi**.

## 3. Khi nào bot KHÔNG nhắn

| Luật | Giá trị |
|---|---|
| Khung giờ | chỉ 8–21 giờ |
| Chủ đang nhắn | chat phải im ≥ 10 phút |
| Người thật (admin) đang tiếp chủ | không chen (cờ nhường sân + nút "giữ" trên CRM) |
| Chủ đang khai dở một căn khác | không hỏi chuyện căn cũ |
| Câu hỏi trước chưa được đáp | chờ 24 giờ; chủ bỏ qua **2 tin liền** thì thôi hẳn (hỏi còn bán / giữ kết nối có nhịp riêng 20 / 6 ngày, không theo luật này) |
| Mỗi **người bán** / ngày | tối đa 3 tin chủ động, tính **mọi loại tin và mọi căn** của người đó, đếm từ lịch sử chat (SRS-475) |
| Mỗi căn / tổng sau đăng | tối đa **10 câu** (tính cả tin Image LQC) — chạm trần thì phần cuối hàng (giá, xem nhà, chi tiết) bị cắt |
| Mỗi tin | đúng MỘT câu hỏi; AI viết ra hơn một câu hỏi hay quá dài thì không gửi |
| Chủ đáp chung ("ok", "ừ", "được") cho câu hỏi chọn | coi là chưa chọn: không hỏi lại, không đoán, để trống tới khi có khách hỏi (SRS-450) |
| Xưng hô | gọi chủ đúng như chat đang gọi (giữ cả khi máy khởi động lại — SRS-440) |
| Giọng | nói miệng như nhắn Zalo người quen ("Mặt tiền 7m vậy là ngon luôn."), nhờ vả nhẹ, không thúc ép |
| Không bịa | chỉ nói số, căn, tiện ích, giao dịch có thật trong dữ liệu |

---

## 4. Từng câu mẫu của anh Luận

### Số 1 — Ảnh

| # | Câu mẫu | | Bot làm gì |
|---|---|---|---|
| 1.1 | "Có phòng ngủ rồi mà chưa có phòng tắm" · "thiếu cái bếp, bếp đẹp không anh?" | ✅ | QC gắn nhãn từng ảnh (mặt tiền, phòng khách, phòng ngủ, WC, bếp, sân thượng, xung quanh, giấy tờ…), biết đã có / còn thiếu góc nào theo loại căn, nói "có X rồi, còn thiếu Y", có thể hỏi mở để chủ tự khoe. SRS-425 |
| 1.2 | Ảnh có nêu bật thế mạnh không: mặt tiền kinh doanh → ảnh dãy phố; pháp lý đủ → ảnh sổ | ✅ | Căn mặt tiền kinh doanh: QC coi "mặt tiền thấy trọn căn", "xung quanh" là góc thiếu quan trọng nhất. Ảnh sổ xin ở hàng Pháp lý (chỉ để kiểm, không đăng). SRS-425 · 426 |
| 1.3 | "Tấm mặt tiền nắng đẹp quá, còn tấm nào nữa không?" | ✅ | QC chọn tấm đẹp nhất + lý do, khen rồi xin thêm cùng kiểu; tấm đẹp nhất thành **ảnh bìa**. SRS-425 |
| 1.4 | "Hình này hơi xấu, em xoá nha anh?" | ✅ | QC đánh dấu ảnh mờ / tối / nghiêng / trùng → hỏi "em ẩn tấm này nha". **Chủ đồng ý mới ẩn**, không xoá file, muốn hiện lại lúc nào cũng được. SRS-425 |
| 1.5 | *(thêm, học từ Moso)* Ảnh dính logo / số điện thoại của sàn khác | 🟡 | Vòng nền 5 phút một lượt: AI tìm chữ in đè (logo, web, số điện thoại), xoá, đóng dấu logo AOND góc dưới phải. Bản gốc giữ ở kho riêng. Ảnh giấy tờ để nguyên. Đã chạy trên máy 146 từ 13/11; vết xoá còn hơi nhoè ở ảnh nhỏ. SRS-454 |

### Số 2 — Pháp lý

| # | Câu mẫu | | Bot làm gì |
|---|---|---|---|
| 2.1 | "Anh nói pháp lý an tâm, ý là có sổ hồng rồi hả anh?" | ✅ | Câu mơ hồ không ghi thành "có sổ"; bot hỏi lại cụ thể (sổ riêng / sổ chung / HĐMB / giấy tay…). 9 loại giấy một nguồn. SRS-426 · 435 |
| 2.2 | "Anh có hình chụp cho em xin. Em xoá thông tin rồi mới gửi công ty" | 🟡 | Xin ảnh sổ, AI đọc số thửa / tờ / diện tích, không đọc tên chủ / CCCD; ảnh vào kho riêng, không lên web. Lời hứa là **"chỉ để em kiểm, không đăng"** — hệ thống chưa tự che thông tin trên ảnh nên bot không hứa "em xoá thông tin". SRS-426 |
| 2.3 | "Em thấy sổ mà không thấy nhà, anh chưa hoàn công ạ?" | ✅ | Đọc sổ có mục "tài sản gắn liền với đất"; sổ không ghi nhà mà tin là nhà → hỏi hoàn công. SRS-426 |
| 2.4 | "Hoàn công có dễ không? Còn bao lâu nữa?" | ✅ | Ô riêng `du_kien_hoan_cong` (chỉ admin thấy; tin công khai chỉ ghi chưa / đã hoàn công). SRS-426 |
| 2.5 | "Chủ đầu tư hứa khi nào có sổ?" | ✅ | Ô riêng `du_kien_ra_so`, hỏi khi giấy là HĐMB / sổ đang làm / chưa có sổ. SRS-426 · 435 |

### Số 3 — Khai thác lợi thế

| # | Câu mẫu | | Bot làm gì |
|---|---|---|---|
| 3.1 · 3.4 · 3.5 | "Đoạn này buôn bán gì thì được?" · "Văn phòng kèm showroom hay chỉ office?" · "Spa cao cấp hả anh?" | ✅ | Hỏi chủ (chủ rành đoạn đường hơn bot), ghi ô `phu_hop_kinh_doanh` để viết tin và khớp khách thuê / mua kinh doanh. Chỉ hỏi căn buôn bán được. SRS-427 |
| 3.2 | "Có hình xung quanh cho em xin nhé" | ✅ | Qua Image LQC (góc "xung quanh"). |
| 3.3 | "Khách để xe thuận tiện không anh?" | ✅ | Ô `cho_dau_xe`, cùng lượt lợi thế. SRS-427 |
| 3.6 · 3.7 | "Có AEON cách anh 1 km, làm nhà hàng được không?" · "Bên cạnh là trường gì?" | ✅ | Bot nêu tiện ích **thật** quanh căn (tên + khoảng cách, từ bản đồ) rồi hỏi chủ khai thác được gì. Không có dữ liệu thì không nêu. SRS-427 |

### Số 4 — So sánh cạnh tranh

| # | Câu mẫu | | Bot làm gì |
|---|---|---|---|
| 4.1 · 4.2 | "Em gửi mấy căn đang bán gần đó để anh đừng bán rẻ" · "Căn gần anh 150 tr/m² mà nhà cũ" | ✅ | Gửi chủ 2–3 căn cùng loại đang rao trong 3 km, kèm đơn giá / m² và link. Dưới 2 căn thì không gửi. SRS-428 |
| 4.3 · 4.4 | "Tháng trước em có căn bán tới 12 tỷ" · "Em mới cọc hôm qua căn 7 tỷ" | 🟡 | Code đã đọc được căn đã cọc / chốt gần đó (180 ngày). Hiện **0 giao dịch** nên bot chưa nói câu này. Từ 13/11 **không cần admin nhập tay**: chủ báo "đã cọc" / "bán rồi" là bot tự hỏi **giá chốt** (một lần, chỉ để bên em nắm) và ghi vào giao dịch, cạnh giá rao. SRS-428 · 456 |
| 4.5 | "Em đoán khu này 120 tr/m², anh rao 140 cũng hợp lý" | ✅ | Nhận xét **nhẹ** giá rao của chủ so với trung vị các căn **cùng lối vào** (mặt tiền với mặt tiền, hẻm với hẻm) đang rao gần, ±10 % là ngang. Cần ≥ 3 căn cùng lối vào, chưa đủ thì không nhận xét. Không đưa giá mới, không giục tăng / giảm. SRS-428 · 429 |
| 4.6 | "Em có báo cáo giá khu vực, làm miễn phí cho anh" | ✅ | Trang `/bao-cao-gia/<mã tin>` (link do `web.link_bao_cao_gia` sinh theo `AIOI_SITE_URL`, mặc định `aond.vercel.app`; `nhadat.cc` chưa trỏ về web): dải đơn giá / m² các căn cùng loại đang rao trong 3 km, theo mặt tiền / hẻm, vị trí giá của căn, căn gần nhất. **Tính từ giá rao** (chủ dự án 13/11: "tạm để test"), trang ghi rõ. Bot mời chủ xem kèm tin so sánh khi có ≥ 3 căn. SRS-455 |

---

## 5. Còn thiếu để LQC phát huy

1. **Nhiều chủ nhà đăng qua Zalo hơn** — LQC chỉ chăm được tin có Zalo chủ nhà (hiện 2 / 244).
2. **Giao dịch thật đầu tiên** — bot đã tự hỏi giá chốt (SRS-456); có vài giao dịch thì bot dẫn được 4.3 · 4.4, và báo cáo 4.6 thêm được
   phần giá chốt.
3. **Che thông tin trên ảnh sổ** — nếu muốn bot được hứa "em xoá thông tin rồi mới gửi" (2.2).

## 6. Quyết định đã chốt (chủ dự án 12/11)

- Ảnh sổ: chỉ nói "để em kiểm, không đăng"; chưa che thông tin trên ảnh.
- Ảnh kém: chủ đồng ý từng tấm mới ẩn.
- Giá: phía bán được nhận xét giá chủ rao, nói nhẹ.
- Trần tin: "Giữ 10" — 10 câu sau đăng / căn, ≤ 3 tin chủ động / căn / ngày, chủ bỏ qua 2 tin liền thì thôi.
- Thứ tự khi nhiều mảng cùng muốn hỏi: ảnh → pháp lý → lợi thế → so sánh → giá; một hàng chung, không phải 4 vòng nhắn riêng.
