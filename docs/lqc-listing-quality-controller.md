# LQC — Listing Quality Controller: bot hỏi gì, khi nào, đã chạy tới đâu

Cập nhật 12/11/2026, đối chiếu code `main` @ 6d6f827 và dữ liệu Supabase cùng ngày. Nguồn: đặc tả anh Luận (4 mảng, 22 câu mẫu).

LQC là "người chăm tin" sau khi tin lên web. Nó xem tin còn thiếu gì để bán được, rồi hỏi chủ nhà **từng câu một, ngắn, khéo** — như một
quản lý rảo qua các chat. Bot không đọc thuộc lòng 22 câu mẫu: mỗi lần nhắn, AI tự viết câu theo đúng việc cần hỏi và theo chuyện đang nói.

Ký hiệu: **✅ đã chạy** · **🟡 có một phần** · **❌ chưa có**.

---

## 1. Tình hình thật hôm nay

- Hai vòng nền đang bật trên máy 146 (không có biến tắt nào trong `.env`): **Image LQC** 30 phút một lượt, **Hỏi sau đăng** 10 phút một lượt.
- LQC chỉ nhắn được chủ nhà **đăng tin qua chat Zalo với bot**. Hiện có **1 / 244** tin như vậy (#56F988C9). 243 tin còn lại nhập từ nguồn
  khác, không có Zalo chủ nhà nên LQC chưa với tới.
- Tin #56F988C9 đã nhận: xin ảnh (2 lần), "sổ đứng tên ai", 1 tin Image LQC xin ảnh mặt tiền thấy trọn 6 tầng. Chủ chưa đáp hai tin cuối,
  nên vòng nền **đang chờ đúng luật** (mục 3). Câu kế tiếp trong hàng: hỏi loại giấy tờ → đoạn đường hợp kinh doanh gì / chỗ đậu xe → gửi
  2–3 căn đang rao gần để so.
- Đã thấy bot nói thật với chủ: **mảng Ảnh**. Pháp lý, Lợi thế, So sánh chưa có chủ nhà thật nào đi tới lượt đó, nhưng **bắn thử production 12/11**
  (chủ thử nhà mặt tiền, đáp ngắn từng câu) ra đủ chuỗi: xin ảnh mặt tiền → ảnh sổ ("chỉ để kiểm, không đăng") → đứng tên → thế chấp → quy
  hoạch → "cách Bệnh viện Đa khoa Gò Vấp khoảng 250 m, đoạn này buôn bán gì thì hợp?" → đậu xe → gửi 3 căn mặt tiền gần kèm đơn giá / link →
  thương lượng → bán gấp hay thong thả. Hai lỗi lượt đầu (so sánh bị bỏ khi tin chưa có toạ độ; câu đáp đậu xe bị bỏ) đã sửa — SRS-441.

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
**Image LQC** chạy riêng: mỗi khi bộ ảnh của tin đổi thì chấm lại, rồi nhắn xin góc thiếu / khen tấm đẹp / xin ẩn tấm kém (tối đa 2 tin mỗi căn).

## 3. Khi nào bot KHÔNG nhắn

| Luật | Giá trị |
|---|---|
| Khung giờ | chỉ 8–21 giờ |
| Chủ đang nhắn | chat phải im ≥ 10 phút |
| Người thật (admin) đang tiếp chủ | không chen |
| Chủ đang khai dở một căn khác | không hỏi chuyện căn cũ |
| Câu hỏi trước chưa được đáp | chờ 24 giờ; chủ bỏ qua **2 tin liền** thì thôi hẳn |
| Mỗi căn / ngày | tối đa 3 tin chủ động |
| Mỗi căn / tổng sau đăng | tối đa **10 câu** (tính cả tin Image LQC) — chạm trần thì phần cuối hàng (giá, xem nhà, chi tiết) bị cắt |
| Mỗi tin | đúng MỘT câu hỏi; AI viết ra hơn một câu hỏi hay quá dài thì không gửi |
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
| 4.3 · 4.4 | "Tháng trước em có căn bán tới 12 tỷ" · "Em mới cọc hôm qua căn 7 tỷ" | 🟡 | Code đã đọc được căn đã cọc / chốt gần đó (180 ngày) — nhưng hiện **0 giao dịch** được ghi, nên bot **không nói** những câu này (nói là bịa). Admin chuyển tin sang "đã cọc / đã chốt" kèm giá thì bot tự dẫn được. SRS-428 |
| 4.5 | "Em đoán khu này 120 tr/m², anh rao 140 cũng hợp lý" | ✅ | Nhận xét **nhẹ** giá rao của chủ so với trung vị các căn **cùng lối vào** (mặt tiền với mặt tiền, hẻm với hẻm) đang rao gần, ±10 % là ngang. Cần ≥ 3 căn cùng lối vào, chưa đủ thì không nhận xét. Không đưa giá mới, không giục tăng / giảm. SRS-428 · 429 |
| 4.6 | "Em có báo cáo giá khu vực, làm miễn phí cho anh" | ❌ | Chưa làm. Cần dữ liệu giao dịch thật (4.3) trước. |

---

## 5. Còn thiếu để LQC phát huy

1. **Nhiều chủ nhà đăng qua Zalo hơn** — LQC chỉ chăm được tin có Zalo chủ nhà (hiện 1 / 244).
2. **Ghi giao dịch thật** — admin chuyển tin "đã cọc / đã chốt" kèm giá thì mở được 4.3 · 4.4 và về sau 4.6.
3. **Che thông tin trên ảnh sổ** — nếu muốn bot được hứa "em xoá thông tin rồi mới gửi" (2.2).
4. **Báo cáo giá khu vực** (4.6).

## 6. Quyết định đã chốt (chủ dự án 12/11)

- Ảnh sổ: chỉ nói "để em kiểm, không đăng"; chưa che thông tin trên ảnh.
- Ảnh kém: chủ đồng ý từng tấm mới ẩn.
- Giá: phía bán được nhận xét giá chủ rao, nói nhẹ.
- Trần tin: "Giữ 10" — 10 câu sau đăng / căn, ≤ 3 tin chủ động / căn / ngày, chủ bỏ qua 2 tin liền thì thôi.
- Thứ tự khi nhiều mảng cùng muốn hỏi: ảnh → pháp lý → lợi thế → so sánh → giá; một hàng chung, không phải 4 vòng nhắn riêng.
