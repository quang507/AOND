# 12 — Mô hình kinh doanh, persona, hành trình, thấu cảm, kế hoạch nghiên cứu, insight → cơ hội

Phiên bản: **v1.0** · Ngày: **02/11/2026** · Thay §2.2 persona của `02` (bản 2024–09, còn P5 CTV) và bổ sung `01 §1.3`.
Tầng: nghiên cứu (cùng tầng `01`). Không sinh ID mới — insight đặt nhãn **N1…N8** trong file này; khi một insight thành yêu cầu thì
cấp `FR-` ở `02` như thường.

**Cách viết file này (khác bản cũ).** Bản cũ dựng persona từ giả định. Bản này đi từ **dữ liệu thật đang có** rồi mới suy:
DB production 02/11/2026 (số đếm, không chép lời khách — CLAUDE.md §5) + quyết định chủ dự án đã ghi ở `09` / `07`.
Chỗ nào chưa có dữ liệu ghi `[giả định BA]` và đưa vào kế hoạch nghiên cứu §12.5 để kiểm.

## 12.0 Dữ liệu thật làm nền (02/11/2026)

| Đo | Số | Nguồn |
|---|---|---|
| Hội thoại thật (trừ ID thử) | **9** — 7 người bán, 2 người mua | `conversations` × `la_id_thu` |
| Tin nhắn thật | 154 (76 của khách), **17,1 tin / hội thoại** | `messages` |
| Tin rao thật | **3** (2 nhà phố, 1 nhà cấp 4; 3–12,5 tỷ); **2/3 kẹt "chờ thông tin"** | `listings` trừ `seed_thu` |
| Lịch xem nhà | **0** | `viewings` |
| Người dùng thật | chủ dự án, anh L. (khuôn bot), chị N., anh T. | điều phối 02/11 |
| Kho tham chiếu | 2.647 dự án, 39.350 tên đường / hẻm, 168 phường mới TP.HCM | `projects`, `duong`, `wards` |

**Đọc nhanh:** phía BÁN đã có người dùng và họ nói chuyện khá dài với bot; phía MUA gần như chưa có. Nghẽn hiện tại là **cầu**,
và **tin rao chưa đủ ô để lên web** — không phải thiếu tính năng.

## 12.1 Mô hình kinh doanh (hiện hành, theo code)

| Khối | Nội dung | Nguồn |
|---|---|---|
| Khách hàng trả tiền | Người BÁN: chính chủ (CCRB), môi giới (NMG); chủ đầu tư (CĐT) đi kênh hợp tác riêng | `revenue.py`, OPEN-21 |
| Người dùng không trả tiền | Người MUA / THUÊ — 0 đ, không bị đòi số điện thoại trước khi chốt lịch xem | SRS-5.1zzzzzzz148 |
| Giá trị cho người bán | Rao **một câu** trong Zalo, bot hỏi bù, viết tin, đưa lên web + bản đồ, trả lời khách thay, báo lại khi khách hỏi | INS-05, INS-09 |
| Giá trị cho người mua | Hỏi bằng lời nói thường, không bị gọi điện, được gợi ý căn có lý do, hẹn xem trong chat | INS-04, INS-07 |
| Doanh thu | Chỉ khi **chốt giao dịch**: CCRB **1 %**, NMG **0,5 %**; cho thuê **0,75 tháng tiền thuê**. Từ tin **bán thứ 3** của một người, tính như môi giới (0,5 %). CĐT: bot không báo phí, admin liên hệ | `revenue.SALE_FEE_RATE`, `RENTAL_FEE_MONTHS`, `TIN_BAN_LA_MOI_GIOI = 3`, OPEN-28 |
| Kênh | Zalo cá nhân (2 số: ký gửi / tư vấn mua) là kênh chính; web là mồi SEO + bản đồ, đẩy về Zalo | CLAUDE.md §1 |
| Chi phí chính | Gọi model (Claude, dự phòng Gemini / Groq); Supabase Free (không sao lưu — chủ dự án chấp nhận); VPS | OPEN-25, `bot_usage` |
| Đòn bẩy giữ người bán | Hạng Đồng / Bạc / Vàng theo điểm người rao; hạng cao được ưu tiên khi gợi ý căn (SRS-361), hạng ẩn khỏi web | OPEN-26 |
| Rủi ro mô hình | Doanh thu chỉ khi chốt → cần **cầu** đủ lớn; hiện 2 người mua thật. Sửa ghi chú cũ "0,5 % trả CTV" ở `01 §1.3`: CTV đã bỏ 28/10, toàn bộ phí về công ty | OPEN-01, OPEN-28 |

## 12.2 Persona

Persona là **nhóm hành vi**, không phải người thật (tên dưới đây là tên đặt). Mỗi persona ghi bằng chứng đang có và chỗ còn là giả định.

### PS-A — Cô Bảy, 61, chính chủ bán một căn (CCRB)
- **Ai:** có một căn nhà phố / nhà cấp 4, chỉ dùng Zalo, gõ chậm, nói kiểu chợ. Bán vì cần tiền hoặc chia tài sản.
- **Muốn:** bán được giá, không bị lừa, không mất phí oan, không phải "điền form".
- **Sợ:** lộ số điện thoại, bị môi giới gọi dồn, ký giấy tờ gì đó mà không hiểu.
- **Bằng chứng:** 7/9 hội thoại thật là người bán; 2/3 tin kẹt "chờ thông tin" → trả lời được vài câu rồi dừng.
  `[giả định BA]` dừng vì mệt / không biết đáp gì, chưa phỏng vấn.

### PS-B — Anh Tuấn, 29, môi giới có 10–30 căn (NMG)
- **Muốn:** thêm khách mà không tốn phí đăng tin; nhận câu hỏi của khách **ngay** để không mất khách; đẩy nhiều căn một lần.
- **Sợ:** bị lấy khách, bị lộ nguồn hàng, mất thời gian khai lại từng căn.
- **Bằng chứng:** kho có luồng nhập bảng tính (`nhap_bang_tinh`), vai tự đổi sang môi giới từ tin thứ 3 (OPEN-28).
  `[giả định BA]` chưa có NMG thật trong DB.

### PS-C — Chị Dương, 42, mua để ở
- **Muốn:** nhà trong tầm tiền, đúng khu, hẻm xe hơi, pháp lý sạch; hỏi rất cụ thể (sổ, hoàn công, quy hoạch).
- **Sợ:** bị gọi điện, tin ảo, "căn này bán rồi" sau khi đã hẹn.
- **Bằng chứng:** 2 hội thoại mua thật; luồng hỏi chủ nhà / báo lại khách chạy được (ban-thu-mua 17/17, 02/11).
  `[giả định BA]` quy mô nhu cầu, chưa có người mua thật đủ để kết luận.

### PS-D — Anh Hưng, 35, nhà đầu tư / mua bận
- **Muốn:** so sánh nhanh nhiều căn, biết giá thị trường khu đó, căn mới báo ngay.
- **Sợ:** mất thời gian đọc tin rác, bị dắt mũi giá.
- **Bằng chứng:** có "giá rao thị trường của dự án" (SRS-325), báo căn mới (`bao_can_moi`). `[giả định BA]` chưa có người dùng thật.

### PS-E — Admin vận hành (người thật phía công ty)
- **Muốn:** một hàng việc rõ (khách hỏi chưa có chủ trả lời, lịch xem cần chốt, khách cần người thật), không bị báo động giả.
- **Bằng chứng:** việc nội bộ đi `reminders → escalation-feed → Zalo`; ID thử đã thôi nhắn admin (SRS-330).

*(Chủ đầu tư — CĐT — là đối tác, không phải persona tự phục vụ: bot chuyển admin, OPEN-21.)*

## 12.3 Hành trình (journey map)

Mỗi bảng: **Giai đoạn → Việc khách làm → Chạm hệ thống → Cảm xúc → Điểm đau → Cơ hội** (cơ hội đánh số ở §12.6).

### PS-A Cô Bảy (chính chủ bán)

| Giai đoạn | Làm | Chạm | Cảm xúc | Đau | Cơ hội |
|---|---|---|---|---|---|
| Biết tới | Người quen gửi số Zalo / thấy tin trên web | Web, lời giới thiệu | Nghi ngờ | "Có mất phí không?" | N1 |
| Rao | Nhắn một câu "bán nhà hẻm 5m Q5 6 tỷ" | Bot số ký gửi | Nhẹ nhõm nếu bot hiểu | Bị hỏi lại nhiều câu | N2 |
| Bổ sung | Trả lời diện tích, pháp lý, ảnh | Bot hỏi từng ý | Mệt dần | Không biết sổ ghi gì, ngại chụp ảnh | N2, N3 |
| Duyệt tin | Đọc bản nháp, gật | Bản tin 📋 | Hài lòng / lo sai | Chữ dài, khó đọc trên điện thoại | N2 |
| Chờ khách | Không làm gì | Bot báo khách hỏi | Sốt ruột | Im lặng lâu → nghĩ bot không làm | N4 |
| Khách hỏi | Trả lời câu khách hỏi qua bot | Tin nhắc chủ nhà | Có hy vọng | Câu hỏi đến giờ khó trả lời | N4 |
| Xem nhà / chốt | Hẹn, gặp khách, thương lượng | Admin chốt lịch | Căng thẳng | Phí lúc chốt có bị đòi thêm? | N1 |

### PS-B Anh Tuấn (môi giới)

| Giai đoạn | Làm | Chạm | Cảm xúc | Đau | Cơ hội |
|---|---|---|---|---|---|
| Thử | Gửi 1–2 căn thử | Bot ký gửi | Dò xét | Sợ bị lấy khách | N5 |
| Nạp hàng | Gửi bảng giá / bảng tính | `nhap_bang_tinh` | Tiết kiệm thời gian nếu chạy | Bảng không đọc ra căn nào | N5 |
| Giữ hàng | Cập nhật còn / hết, ẩn căn | Lệnh ẩn / giữ | Bực nếu phải nói lại | Bot hỏi lại căn nào khi nhiều căn | N5 |
| Nhận khách | Trả lời câu hỏi nhanh | Tin nhắc | Hài lòng nếu nhanh | Báo trễ = mất khách | N4 |
| Uy tín | Lên hạng → được ưu tiên | Hạng (ẩn web) | Có động lực `[giả định BA]` | Không biết mình hạng gì / vì sao | N6 |

### PS-C Chị Dương (mua để ở)

| Giai đoạn | Làm | Chạm | Cảm xúc | Đau | Cơ hội |
|---|---|---|---|---|---|
| Tìm | Gõ "nhà Q5 dưới 8 tỷ hẻm xe hơi" trên web | Ô tìm kiếm | Kỳ vọng | Ra ít căn / sai khu | N7 |
| Sang Zalo | Bấm "Hỏi qua Zalo" | Link kèm ngữ cảnh | Ngại | Sợ bị gọi | N1 |
| Hỏi | Hỏi pháp lý, hẻm, giá | Bot số tư vấn | Được trả lời ngay thì tin | Câu bot không biết → chờ chủ nhà | N4 |
| Hẹn xem | Chọn giờ, để lại số một lần | Lịch xem | Cam kết | Lịch không được chốt lại | N4 |
| Sau xem | Hỏi thêm, so sánh | Bot gợi căn khác | Phân vân | Bot quên gu đã chê | N7 |

### PS-D Anh Hưng (nhà đầu tư)

| Giai đoạn | Làm | Chạm | Cảm xúc | Đau | Cơ hội |
|---|---|---|---|---|---|
| Lọc | Hỏi nhanh nhiều khu | Bot / web | Thiếu kiên nhẫn | Trả lời dài | N7 |
| So giá | "Giá khu này thế nào?" | Giá rao dự án (SRS-325) | Cần số | Nhà phố chưa có dữ liệu giá khu | N8 |
| Theo dõi | Chờ căn mới | Báo căn mới | Tiện | Báo căn không đúng gu | N7 |

### PS-E Admin

| Giai đoạn | Làm | Chạm | Cảm xúc | Đau | Cơ hội |
|---|---|---|---|---|---|
| Nhận việc | Đọc tin nội bộ | Zalo admin | — | Tin thử lẫn tin thật (đã chặn SRS-330) | — |
| Xử lý | Hỏi chủ, chốt lịch `#mã: ok giờ` | Lệnh Zalo | Bận | Không thấy toàn cảnh hàng việc | N4 |

## 12.4 Bản đồ thấu cảm (empathy map)

| Persona | NÓI | NGHĨ | LÀM | CẢM THẤY |
|---|---|---|---|---|
| A Cô Bảy | "Bán nhà hẻm 5m, 6 tỷ, sổ hồng" | "Có bị lừa phí không?", "Bot này có thật không?" | Trả lời vài câu rồi im | Lo, mệt khi bị hỏi nhiều |
| B Anh Tuấn | "Anh có 20 căn, gửi bảng nha" | "Họ có lấy khách mình không?" | Gửi bảng, thử 1–2 căn trước | Dè chừng, nóng ruột chờ khách |
| C Chị Dương | "Hẻm xe hơi vào tới không? Sổ riêng chưa?" | "Đừng gọi điện cho tôi" | Hỏi kỹ, so nhiều căn | Mệt vì tin ảo, cần được tin |
| D Anh Hưng | "Khu này giá bao nhiêu một mét?" | "Có rẻ hơn thị trường không?" | Hỏi nhanh, bỏ đi nếu chậm | Thiếu kiên nhẫn |
| E Admin | "#A12: ok 9h" | "Việc nào gấp nhất?" | Đọc tin nhắc, gọi chủ nhà | Quá tải nếu báo động giả |

Cột NÓI lấy theo kiểu câu đã gặp trong kịch bản chấm / bắn thử (không chép lời khách thật). Cột NGHĨ / CẢM THẤY là `[giả định BA]`
— kiểm ở §12.5.

## 12.5 Kế hoạch nghiên cứu và kịch bản phỏng vấn

**Mục tiêu:** trả lời 4 câu hỏi quyết định — (Q1) vì sao 2/3 tin thật dừng ở "chờ thông tin"? (Q2) người mua đến từ đâu và vì sao
chưa đến? (Q3) phí 1 % / 0,5 % có làm người bán chùn không? (Q4) hạng có làm người rao chăm hơn (giả định 3, `00 §0.7`)?

| Phương pháp | Với ai | Cỡ mẫu | Đo / sản phẩm | Thời gian |
|---|---|---|---|---|
| Đọc lại hội thoại (đã có) | 9 hội thoại thật | toàn bộ | Câu bot hỏi ở lượt khách bỏ đi; số lượt tới khi đủ ô | 1 ngày |
| Phỏng vấn sâu 30 phút qua Zalo gọi | Người bán (A, B) | 5–6 (2 người dùng thật + 3–4 tuyển qua người quen chủ dự án) | Trả lời Q1, Q3 | 1 tuần |
| Phỏng vấn sâu | Người mua (C, D) | 5 | Trả lời Q2 | 1 tuần |
| Thử 5 giây trên web | Người mua | 5 | Hiểu ngay site làm gì? | cùng buổi phỏng vấn |
| Đo trong DB (đã có sẵn bảng) | Toàn bộ | — | Tỷ lệ tin đủ ô; thời gian chủ trả lời (I3); lượt bỏ giữa chừng | hằng tuần |

**Tuyển & đạo đức:** chỉ người đồng ý; ghi chú ẩn danh (`chị N.`, `0903xxxxxx`); không ghi âm nếu không xin; không đưa lời thật vào repo.

### Kịch bản — người bán (A / B), 30 phút
1. (Mở, 3') "Anh/chị đang bán / cho thuê căn nào? Bán vì sao, gấp không?"
2. (Hành vi, 7') "Lần gần nhất rao nhà, anh/chị làm thế nào? Đăng ở đâu? Mất bao lâu?"
3. (Trải nghiệm bot, 8') "Kể lại lúc nhắn bot: chỗ nào dễ, chỗ nào phải nghĩ lâu? Có câu nào không muốn trả lời không?"
   — hỏi riêng câu bot hỏi ở lượt họ dừng (lấy từ đọc hội thoại).
4. (Phí, 5') "Khi nghe phí X % lúc bán được, anh/chị nghĩ gì đầu tiên? So với chỗ khác?" — không bào chữa, chỉ ghi.
5. (Uy tín — B, 4') "Nếu căn của anh/chị được ưu tiên giới thiệu vì anh/chị trả lời khách nhanh, anh/chị có làm khác đi không?"
6. (Đóng, 3') "Nếu được sửa một thứ trong cách bot hỏi, anh/chị sửa gì?"

### Kịch bản — người mua (C / D), 30 phút
1. "Anh/chị đang tìm căn thế nào, tầm tiền, khu nào, gấp không?"
2. "Lần gần nhất tìm nhà, anh/chị dùng gì? Điều gì làm anh/chị bực nhất?"
3. "Anh/chị có ngại để lại số điện thoại không? Vì sao?"
4. (Thử) Đưa web, im 5 giây: "Trang này làm gì?" rồi "Anh/chị sẽ bấm vào đâu?"
5. "Nếu hỏi một trợ lý qua Zalo mà nó trả lời ngay về sổ, hẻm, giá — anh/chị có tin không? Cần gì để tin?"
6. "Điều gì làm anh/chị hẹn xem một căn?"

**Tổng hợp:** dán ghi chú vào bảng ái lực (affinity) theo 4 câu Q1–Q4; mỗi kết luận cần ≥ 3 người cùng ý mới thành insight;
cập nhật §12.6 và `01` (INS mới khi đủ bằng chứng).

## 12.6 Insight → cơ hội cải tiến

| # | Insight (bằng chứng) | Cơ hội | Đo | Ưu tiên |
|---|---|---|---|---|
| N1 | Người bán và người mua đều **sợ bị gọi / mất phí oan** (INS-04; bản cũ P1, P3) | Nói rõ phí MỘT lần, đúng lúc (đã có `bao_phi`); trang web nói "không thu số, phí chỉ khi chốt" ở đầu | Tỷ lệ bỏ đi ngay sau câu phí | Trung |
| N2 | **2/3 tin thật kẹt "chờ thông tin"** dù 17 tin / hội thoại (DB 02/11) | Đo **ô nào** làm kẹt (DB đã có `listing_noi_bo`); cho tin lên web với ô tối thiểu, hỏi bù sau; bot tự suy ô từ ảnh / bản đồ thay vì hỏi | Tỷ lệ tin đủ ô lên web; số lượt tới khi đủ | **Cao** |
| N3 | Người bán lớn tuổi ngại chụp / không hiểu giấy tờ `[giả định BA]` | Chấp nhận ảnh sổ chụp nghiêng, bot đọc giúp (đã có đường ảnh sổ); hỏi "ảnh mặt tiền" thay vì "ảnh pháp lý" | Tỷ lệ tin có ảnh | Trung |
| N4 | Giá trị lõi = **trả lời khách nhanh**; nghẽn ở chủ nhà / admin (I3, SRS-170) | Đo I3 thật; nhắc chủ nhà theo giờ họ hay online; admin có một trang hàng việc | % câu hỏi được trả lời trong 12 giờ | **Cao** khi có người mua |
| N5 | Môi giới cần **nạp nhiều căn một lần và quản lý nhanh** | Bảng tính → nhập; lệnh ẩn / còn theo nhóm; hỏi lại căn nào chỉ khi thật mơ hồ (SRS-343) | Số căn / NMG; lượt "hỏi lại căn nào" | Trung |
| N6 | Hạng chỉ có tác dụng nếu người rao **biết** nó và thấy lợi `[giả định BA]` (`00 §0.7` giả định 3) | Nói hạng + lợi ích cụ thể ("căn của anh được giới thiệu trước") khi lên hạng; đo trước / sau | Thời gian trả lời trước / sau khi báo hạng | Thấp tới khi có NMG |
| N7 | **Cầu là nghẽn chính**: 2 người mua thật, 0 lịch xem (DB 02/11) | Dồn lực kênh vào: SEO trang khu / dự án (web đã có 2.647 dự án), widget Zalo trên trang tin, nhờ người bán chia sẻ link tin của họ | Người mua mới / tuần; tỷ lệ web → Zalo | **Cao nhất** |
| N8 | Nhà đầu tư cần **giá khu vực**; mới có cho dự án (SRS-325) | Giá rao gộp theo phường cho nhà phố từ kho tin + nguồn công khai | Câu "giá khu này" được trả lời có số | Thấp |

**Đề xuất thứ tự:** N7 (cầu) → N2 (tin kẹt) → N4 (đo trả lời nhanh khi đã có cầu). Các việc còn lại chờ dữ liệu phỏng vấn.

**Làm "thông minh hơn" thay vì thêm tính năng:** mọi cơ hội trên đều đo được bằng bảng đã có trong DB (`listings`, `listing_noi_bo`,
`messages`, `info_requests`, `viewings`). Việc đầu tiên nên là **một view đo hằng tuần** cho N2 / N4 / N7 thay vì viết thêm luật bot.
