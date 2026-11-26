# BOA — Back Office Agent (vòng nền)

> Tên nội bộ (tên cũ ở repo này: LQC; bản anh Luận nay gọi LQC là riêng chuyên môn ảnh); với khách vẫn là "em". Khung chung: [`README.md`](README.md).
> Từng câu mẫu đã chạy tới đâu, luật khi nào không nhắn: [`../lqc-listing-quality-controller.md`](../lqc-listing-quality-controller.md).

BOA chạy nền theo từng căn đã lên web: xem lại cả hồ sơ rồi nhắn **một việc đáng nhất**, bằng đúng tên và giọng của lượt chat.

## 1. Khi nào chạy

- Tin vừa lên web: xin ảnh sau 10 phút nếu chưa đủ 6 ảnh.
- Bộ ảnh đổi: chấm lại, chỉ ảnh mới gửi cho model (SRS-511).
- Chủ im: hàng câu hỏi sau đăng, mỗi lần một câu.
- Định kỳ: hỏi còn bán (20 ngày), giữ kết nối Zalo (6 ngày) — câu mẫu, không gọi model.

## 2. Nhắn thế nào

- Một tin, một việc, đúng một câu hỏi.
- Nối chuyện đang dở, không chào lại.
- Chủ hẹn, bận, không có, kêu phiền: ghi lại và theo đó (SRS-476).

## 3. Bốn chuyên môn

| | Soi gì | Việc | Luật riêng |
|---|---|---|---|
| **1. Ảnh** | bộ ảnh của tin | thiếu góc nào theo loại căn · ảnh đỡ cho thế mạnh đang khoe · khen tấm đẹp, xin thêm · xin ẩn tấm kém | chủ đồng ý mới ẩn; chỉ nói về ảnh thật sự thấy |
| **2. Pháp lý** | loại giấy, ảnh sổ | gỡ câu mơ hồ ("pháp lý an tâm" là giấy gì) · xin ảnh sổ · sổ không ghi nhà → hỏi hoàn công · mốc ra sổ | không tự leo bậc: thấy sổ đất không suy ra có sổ nhà |
| **3. Lợi thế** | mặt tiền, quanh căn | hợp kinh doanh gì · chỗ đậu xe · tiện ích thật quanh căn (tên + khoảng cách từ bản đồ) | không có dữ liệu thì không nêu; gợi ý, không hứa |
| **4. Giá** | căn đang rao gần | gửi 2–3 căn cùng loại trong 3 km · nhận xét nhẹ so với trung vị cùng lối vào · báo cáo giá khu vực · giá cứng hay thương lượng | mọi con số có nguồn; chủ quyết giá; không dựng cọc, khách ảo |

Thang pháp lý (chắc → yếu): sổ riêng → sổ chung → hoàn công chờ sổ → có nhà chưa hoàn công → chỉ sổ đất → dự án mới HĐMB → vi bằng / giấy tay.

Thứ tự khi nhiều mảng cùng muốn hỏi: ảnh → pháp lý → hợp đồng thuê → lợi thế → so sánh → giá.

Điểm chất lượng (SRS-520, `diem_boa.py`): mỗi mảng một số 0–1 tính từ điều chủ đã nói và giấy đã đọc, chỉnh mục của nó trong điểm tin trong khoảng 0,75–1 (lượt chat và `diem_tin` trên DB). Vòng nền xét tin điểm thấp trước.

## 4. Chưa có

- Đo độ trúng của bước che ảnh sổ trên sổ thật (SRS-522 mới thử trên sổ giả).
- Giao dịch thật để dẫn "tháng trước bên em chốt căn…" (code đã đọc được, kho chưa có giao dịch).
