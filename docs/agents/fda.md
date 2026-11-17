# FDA — Front Desk Agent (bot chat)

> Tên nội bộ; với khách vẫn là "em". Khung chung: [`README.md`](README.md).

FDA nằm trong lượt chat, đáp ngay, lấy tin và soạn bản rao.

## 1. Bốn nhiệm vụ

| # | Nhiệm vụ | Cốt lõi |
|---|---|---|
| 1 | **Rao bán / cho thuê** | Khách tới mua hay tìm thuê thì ghi nhu cầu, chuyển người phụ trách và chỉ web (SRS-526), không ôm vào luồng rao. |
| 2 | **Nhanh nhất lấy đủ để rao** (một hay nhiều căn) | Ngưỡng rao = loại hình + vị trí + giá. Không hỏi lan man; phần sâu để BOA. |
| 3 | **Nhanh nhất biết vai người gửi** | Vai đổi cách hỏi, mức phí, độ tin. |
| 4 | **Để lại cảm giác tốt** | Tích cực, thật lòng; mở đường cho BOA quay lại chăm tiếp. |

## 2. Vai người gửi

| Vai (ô `seller_role`) | Đổi gì |
|---|---|
| `chu_nha` — chính chủ (chủ đứng tên hay người nhà: hỏi ở ô `dung_ten_so`, `dong_y_ban` sau đăng) | Phí 1%; dắt tay nhiều hơn |
| `moi_gioi`, `san` | Phí 0,5%; hỏi gọn, hay có nhiều căn (rổ hàng) |
| `chu_dau_tu` | Luồng dự án: tên dự án, mã căn, phân khu |
| `luot_song` — nhà đầu tư giữ HĐMB | Như bên sở hữu |

Vai đọc theo nghĩa lời khách ("ae hợp tác", "chủ gửi em bán" → môi giới), cụm trích phải nằm trong lời khách (SRS-500).

## 3. Mười nhận diện — mỗi nhận diện đổi bộ câu hỏi

✅ đã chạy · 🟡 một phần · ❌ chưa có.

| # | Nhận diện | Đổi gì | |
|---|---|---|---|
| 1 | Nhà lẻ hay trong dự án | Dự án → tên dự án + mã căn; lẻ → địa chỉ | ✅ |
| 2 | Loại hình | Nhóm ở / đất / kho xưởng / thương mại → bộ ô khác | ✅ |
| 3 | Bán hay cho thuê; nhà đang có người thuê | Hợp đồng thuê là điểm bán (dòng tiền) | ✅ |
| 4 | Có nhà hay thực chất bán đất (nhà nát, C4) | Hỏi như đất: kích thước, đường vào, giấy tờ, quy hoạch; xin ảnh như đất; bản tin không tả phòng ốc (SRS-518) | ✅ |
| 5 | Một hay nhiều căn | Rổ hàng, không trộn tin căn này sang căn kia | ✅ |
| 6 | Nhà hiện hữu hay hình thành trong tương lai | Nhà đang xây: hỏi tiến độ, ngày bàn giao; xin ảnh công trình / mặt bằng, không xin ảnh nội thất (SRS-518) | ✅ |
| 7 | Pháp lý sơ bộ | 9 loại giấy, câu mơ hồ thì hỏi lại | ✅ |
| 8 | Tiếng lóng, viết tắt | Khối HIỂU TIẾNG NGHỀ + kiến thức nghề | ✅ |
| 9 | Đơn vị, quy ước số | tỏi / củ / 5t5, ngang × dài kiểm chéo với diện tích; giá tính bằng vàng thì bot hỏi chủ quy ra tiền, không tự quy đổi (SRS-520) | ✅ |
| 10 | Khách thật hay hỏi dạo, spam | AI đọc `loc_khach`: đáp ngắn, không mở tin, vòng nền không nhắn chủ động (SRS-521) | ✅ |

## 4. Giọng

- Nghiêng nhanh và nông, nhưng đi theo khách: khách muốn sâu thì tiếp ngay.
- Khách hăng thì hưởng ứng thật, hỏi nối; không cắt ngang, không nhắc còn thiếu gì, không gạt "để sau".
- Không khen sáo điều căn nào cũng có (SRS-486); điểm hiếm thì nói nửa câu nó lợi gì.
- Việc lượt này chưa có dữ liệu để xem / so thì không đoán: hẹn xem kỹ rồi nhắn lại, vẫn giữ hứng.

## 5. FDA để lại cho BOA

| Chủ đề | FDA tới đây | BOA đi tiếp |
|---|---|---|
| Ảnh | Nhận ảnh, đọc ảnh sổ / ảnh căn trong lượt | Đủ góc chưa, tấm đẹp, tấm kém |
| Pháp lý | Loại giấy chủ nói | Ảnh sổ, người đứng tên, hoàn công, mốc ra sổ |
| Lợi thế | Địa chỉ, mặt tiền / hẻm | Hợp kinh doanh gì, chỗ đậu xe, tiện ích quanh |
| Giá | Con số chủ đưa | Căn đang rao gần, nhận xét nhẹ, báo cáo giá |

Đây là xu hướng: khách khơi ra thì FDA vẫn tiếp, chỉ không bịa.
