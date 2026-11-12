# LQC — Listing Quality Controller: đặc tả 4 mảng, đã có / cần thêm / cần sửa

Ngày 12/11/2026 · cập nhật: mảng Ảnh 1.1, 1.3, 1.4 đã làm (SRS-425). Nguồn: đặc tả anh Luận gửi chủ dự án (4 mảng, 22 câu mẫu). Đối chiếu với code `main` @ 1a9a594 và Supabase cùng ngày.

LQC là "người chăm tin" sau khi tin lên web: xem tin còn thiếu gì để bán được, rồi hỏi chủ nhà **từng câu một, ngắn, khéo**. Image LQC
(SRS-422 → 424) là mảng đầu tiên đã chạy trên máy 146; tài liệu này mở nó ra thành 4 mảng.

Ký hiệu: **✅ có sẵn** · **🟡 có một phần** · **❌ chưa có**.

---

## Luật chung (đã chốt, áp cho cả 4 mảng)

| Luật | Nguồn |
|---|---|
| Mỗi tin nhắn hỏi **MỘT** điều, một câu ngắn, giọng nhờ vả | chủ dự án 11/11, `LUAT_XIN_ANH_KHEO` |
| Tin tự động chỉ gửi **8–21 giờ** | SRS-423 (`GIO_KET_THUC = 21`) |
| Không chen khi bot còn câu hỏi chưa được đáp, chat phải im ≥ 10 phút | SRS-422 (`cau_hoi_cuoi_cua_bot`, `IM_TOI_THIEU_GIAY`) |
| Thiếu / nghi thì **hỏi lại**, không trừ điểm, không chê | chủ dự án 12/11, SRS-424 |
| AI đọc theo nghĩa, code không dò từ khoá | `chan-ly-di-tu-goc` |
| **Không bịa**: chỉ nói số, giao dịch, tiện ích có thật trong dữ liệu | CLAUDE.md repo, SRS-390/394 |
| Hiện Image LQC nhắn tối đa **2 tin / căn** (`TOI_DA_NHAN_MOI_CAN`) | SRS-422 — mở 4 mảng thì cần trần chung, xem câu hỏi cuối |

**Thứ tự ưu tiên khi nhiều mảng cùng muốn hỏi:** ảnh → pháp lý → lợi thế → so sánh giá. Một hàng đợi chung, không phải 4 vòng nhắn riêng.

---

## Số 1 — Ảnh

| # | Câu mẫu | Trạng thái | Đã có | Cần thêm / sửa |
|---|---|---|---|---|
| 1.1 ✅ (SRS-425) | "Có hình phòng ngủ rồi mà chưa có phòng tắm" · "mặt tiền có 1 góc, không đủ cả nhà" · "thiếu cái bếp. Bếp đẹp không anh?" | 🟡 | Image LQC chấm lại mỗi khi bộ ảnh đổi, ra **một** `goc_can_xin`; gợi góc theo loại căn (`GOC_ANH_THEO_NHOM`); tin xin ảnh 10 phút sau đăng (SRS-421). Đã bắt được "mặt tiền chưa thấy trọn 6 tầng" ở tin anh Luận. | **Gắn nhãn từng ảnh** (mặt tiền · phòng khách · phòng ngủ · WC · bếp · sân thượng · xung quanh · giấy tờ) và lưu lại → danh sách *đã có / còn thiếu* theo loại căn. Câu hỏi nói được "có phòng ngủ rồi, còn thiếu WC". Câu mở kiểu "bếp đẹp không anh?" để chủ tự khoe. |
| 1.2 | Ảnh có nêu bật thế mạnh không: mặt tiền kinh doanh → có ảnh dãy phố sầm uất? pháp lý đầy đủ → có ảnh sổ? | 🟡 | QC đã trả `the_manh_da_co_anh` / `the_manh_chua_co_anh`. | Thế mạnh "kinh doanh" → xin **ảnh xung quanh / dãy phố** (nối Số 3). Thế mạnh "pháp lý" → xin **ảnh sổ** (nối Số 2; ảnh sổ cất riêng, không lên web). |
| 1.3 ✅ (SRS-425) | "Tấm mặt tiền nắng đẹp quá, còn tấm nào nữa không?" · "Tấm nội thất lên đèn đẹp ghê" | ❌ | Lúc chủ gửi, bot đã được dặn khen tấm vừa gửi (SRS-423). Cột `listing_media.is_cover` có sẵn. | QC chọn **`anh_dep_nhat` + lý do** (nắng, lên đèn, góc rộng) → tin khen và xin thêm cùng kiểu. Đặt tấm đẹp nhất làm **ảnh bìa** (`is_cover`). |
| 1.4 ✅ (SRS-425) | "Hình này hơi xấu, em xoá nha anh?" | ❌ | Ảnh xấu không làm điểm về 0 (SRS-424, hệ số ≥ 0,75). | QC đánh dấu ảnh **mờ / tối / nghiêng / trùng** → hỏi chủ "em ẩn tấm này nha". **Chủ đồng ý mới ẩn**, không xoá file. `listing_media` **chưa có cột ẩn** → thêm cột (vd `an_khoi_web`) và cho view `listing_photos_v` lọc ra. |

## Số 2 — Pháp lý

| # | Câu mẫu | Trạng thái | Đã có | Cần thêm / sửa |
|---|---|---|---|---|
| 2.1 ✅ (SRS-426) | "Anh nói pháp lý an tâm, ý là có sổ hồng rồi hả anh?" | 🟡 | Ô `phap_ly`, `phap_ly_hoan_cong`; cột `legal_status`, `has_completion`. | **Sửa:** chat anh Luận nói "không phải lo gì cả" → `legal_status` rỗng và bot không hỏi lại. Câu mơ hồ **không ghi ô** mà hỏi xác nhận một câu: sổ hồng riêng / sổ chung / HĐMB / giấy tay. |
| 2.2 ✅ (SRS-426, phương án a) | "Anh có hình chụp cho em xin. Em xoá thông tin rồi mới gửi công ty" | 🟡 | AI đọc sổ (số thửa, tờ, diện tích, mục đích, sơ đồ), luật không đọc tên chủ / CCCD; ảnh giấy tờ cất riêng, không lên web. | **Sửa câu hứa:** hệ thống **chưa che** thông tin trên ảnh, nên bot chưa được hứa "em xoá thông tin". Chọn một: (a) nói thật "ảnh sổ chỉ để nội bộ kiểm, không đăng" — làm được ngay; (b) xây bước làm mờ tên / số CCCD trên ảnh rồi mới được hứa. |
| 2.3 ✅ (SRS-426) | "Em thấy sổ mà không thấy nhà, anh chưa hoàn công ạ?" | 🟡 | Đọc sổ có `loai_giay_to`, `loai_hinh`, `so_thua`… | Thêm ô đọc **"tài sản gắn liền với đất"** (nhà đã ghi trên sổ chưa). Lệch với tin (sổ không có nhà, tin ghi "nhà 6 tầng") → hỏi hoàn công. |
| 2.4 ✅ (SRS-426, ô `du_kien_hoan_cong`) | "Hoàn công có dễ không? Còn bao lâu nữa?" | ❌ | — | Ô mới `hoan_cong_tien_do` (đang làm / dự kiến bao lâu / vướng gì). Đề xuất để **nội bộ** (`O_NOI_BO`); tin công khai chỉ ghi "đang hoàn công". |
| 2.5 ✅ (SRS-426, ô `du_kien_ra_so`) | "Chủ đầu tư hứa khi nào có sổ?" | ❌ | Kho 1.643 dự án — chưa có ô tiến độ sổ theo căn. | Ô mới `du_kien_co_so` cho căn hộ / đất dự án, hỏi khi pháp lý là HĐMB. |

## Số 3 — Khai thác lợi thế

| # | Câu mẫu | Trạng thái | Đã có | Cần thêm / sửa |
|---|---|---|---|---|
| 3.1 ✅ (SRS-427) · 3.4 · 3.5 | "Đoạn này buôn bán gì thì được?" · "Văn phòng kèm showroom hay chỉ office?" · "Spa cao cấp hả anh?" | 🟡 | Bot tự nhận xét chung ("dễ mở quán, showroom"). Căn đang cho thuê: ngành của khách thuê là bằng chứng (tin anh Luận: quán UME, Bud's Cafe). | Ô mới `phu_hop_kinh_doanh` — **hỏi chủ**, vì chủ biết đoạn đường hơn bot. Dùng cho mô tả tin và để khớp khách thuê / mua kinh doanh. |
| 3.2 ✅ (SRS-427) | "Có hình xung quanh cho em xin nhé" | 🟡 | = 1.2 | Đi qua Image LQC (góc "xung quanh"). |
| 3.3 ✅ (SRS-427) | "Khách để xe thuận tiện không anh?" | ❌ | — | Ô mới `cho_dau_xe` (trước nhà / vỉa hè / bãi gần). |
| 3.6 · 3.7 ✅ (SRS-427) | "Có AEON cách anh 1 km, làm nhà hàng được không?" · "Bên cạnh là trường gì?" | 🟡 | `listings.tien_ich_gan` từ Overpass (5 loại: trường học, bệnh viện, chợ, siêu thị, công viên) — **241/245 tin đã có**. Hiện chỉ bot phía mua dùng. | Đưa tiện ích gần vào lượt hỏi **phía bán**: bot nêu tiện ích **thật** từ dữ liệu ("cách siêu thị X khoảng 1 km") rồi hỏi chủ khai thác được gì. Còn lỗi Overpass 406 đang mở. Muốn nói "AEON" đúng tên thì cần lưu tên tiện ích, không chỉ loại. |

## Số 4 — So sánh cạnh tranh

| # | Câu mẫu | Trạng thái | Đã có | Cần thêm / sửa |
|---|---|---|---|---|
| 4.1 · 4.2 ✅ (SRS-428) | "Cho em vị trí, em gửi mấy căn đang bán gần đó để anh đừng bán rẻ" · "Căn gần anh 150 tr/m² mà nhà cũ" | 🟡 | 244 tin đang bán, đều có toạ độ. | Công cụ **căn đang rao gần**: cùng loại, trong bán kính, kèm đơn giá/m² → gửi chủ 2–3 căn (link). Chỉ dùng tin đang hiển thị. |
| 4.3 · 4.4 ✅ luật không bịa (SRS-428) | "Tháng trước em có căn bán tới 12 tỷ" · "Em mới cọc hôm qua căn 7 tỷ" | ❌ | Trạng thái `da_coc` / `da_chot` có trong hệ thống, nhưng **0 giao dịch** được ghi. | Bot **không được nói** những câu này khi không có giao dịch thật — đó là bịa. Cần admin ghi giá chốt vào tin `da_coc` / `da_chot`; bot chỉ dẫn dòng có thật. |
| 4.5 ✅ đơn giá từ kho + nhận xét nhẹ (SRS-428 · 429 · 431 tin thử tính như thật) | "Em đoán khu này 120 tr/m², anh rao 140 cũng hợp lý" | 🟡 | `dinh_gia_tham_khao` (SRS-390): bảng đơn giá **ước lượng cứng** theo vùng × loại, luôn nói "tham khảo". Phía mua đang **cấm** nhận xét giá cao / thấp. | Thay bảng cứng bằng đơn giá từ tin đang rao gần (4.1) khi đủ mẫu. Phía bán được nhận xét giá tới đâu: **cần chủ dự án quyết**. |
| 4.6 | "Em có báo cáo giá khu vực, làm miễn phí cho anh" | ❌ | — | Trang / PDF tổng hợp từ 4.1 + 4.5. Làm sau, vì phụ thuộc dữ liệu. |

---

## Đề xuất thứ tự làm

1. **Ảnh (1.1 · 1.3 · 1.4):** mở rộng Image LQC đang chạy — nhãn từng ảnh, ảnh đẹp nhất + ảnh bìa, xin ẩn ảnh xấu. Ít rủi ro, thấy ngay trên web.
2. **Pháp lý (2.1 · 2.3 · sửa câu hứa 2.2):** hỏi rõ câu mơ hồ, đối chiếu sổ với tin.
3. **Lợi thế (3.1 · 3.3 · 3.6):** ô kinh doanh / đậu xe, đưa tiện ích thật vào phía bán.
4. **So sánh (4.1 trước, 4.3–4.6 sau):** cần dữ liệu thật; làm công cụ "căn gần" trước, giao dịch thật khi admin bắt đầu ghi giá chốt.

## Câu hỏi cần chủ dự án quyết

1. **Ảnh sổ (2.2):** chỉ nói "không đăng, chỉ nội bộ kiểm" hay xây bước che thông tin trên ảnh?
2. **Ảnh xấu (1.4):** chủ đồng ý từng tấm mới ẩn, hay QC tự ẩn rồi báo chủ?
3. ~~**Giá (4.5):** phía bán, bot được nói giá chủ rao cao / thấp so với khu không, mức nào?~~ — **Đã quyết 12/11: được, nói nhẹ** (SRS-429).
4. **Trần tin nhắn:** LQC 4 mảng chung tối đa bao nhiêu tin / căn / tuần? (Image LQC hiện 2 tin / căn.)
