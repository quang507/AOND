# 00 — Từ điển thuật ngữ

Mọi tài liệu trong `docs/` dùng đúng các từ dưới đây. Tài liệu gốc dùng lẫn lộn
nhiều biến thể; cột "Biến thể trong tài liệu gốc" để tra ngược.

## Vai trò người dùng

| Từ chuẩn | Nghĩa | Biến thể trong tài liệu gốc |
|---|---|---|
| **B** | Buyer — người mua hoặc người thuê. Không trả phí. | người mua, B Side, buyer |
| **S** | Seller — bên có BĐS cần bán/cho thuê. Gồm CCRB và NMG. | người bán, S Side, seller |
| **CCRB** | Chính Chủ Rao Bán — chủ sở hữu tự rao. Phí 1%. | chính chủ, owner |
| **NMG** | Nhà Môi Giới có hợp đồng môi giới với chủ sở hữu. Phí 0.5%. | môi giới, agent, broker |
| **CTV** | Cộng Tác Viên của nhadat.cc — người thật, dẫn khách xem nhà, quản lý NMG. Hưởng 0.5%. Từ 03/09/2026 còn nhận câu khách hỏi mà bot không biết, hỏi chủ rồi trả lời bot theo mẫu `#mã tin: câu trả lời` trong hạn; trễ thì tụt hạng Đồng/Bạc/Vàng (FR-173). | cộng tác viên |
| **Chuyên viên** | Nhân sự nội bộ nhadat.cc xử lý ca chat AI không giải quyết được. | admin, nhân viên |
| **Tên trợ lý (T•ai, Kh•ai…)** | Mỗi khách một tên trợ lý riêng, gán tất định theo Zalo ID từ kho 20 tên phụ âm tiếng Việt + "•ai", viết hoa chữ đầu, giữ suốt; cùng một người gặp cùng một tên ở cả nhánh mua và bán (FR-181, chốt lại 09/09/2026). *Lịch sử: "Trai" (2024) → "Thái" (25/08–09/09/2026, OPEN-39 bản 03/09).* | T•ai, Kh•ai, M•ai, gia đình •ai, Thái [cũ], Trai [cũ] |
| **Aioinhadat** | Tên thương hiệu sản phẩm, chốt 03/09/2026 (OPEN-08/39). **Cách VIẾT ra cho khách và trên web: "AI Ơi Nhà Đất", tách chữ, không viết gộp** [chủ dự án 09/09/2026]; "Aioinhadat" chỉ là tên gọi tắt trong tài liệu/repo. Bot tự giới thiệu "em là T•ai bên AI Ơi Nhà Đất" (tên theo khách, FR-181). Tên miền web vẫn `nhadat.cc`, tài liệu vẫn gọi dự án theo tên repo. | AI Ơi Nhà Đất, AOND (SRD gốc) |

## Nghiệp vụ BĐS

| Từ chuẩn | Nghĩa |
|---|---|
| **BĐS** | Bất động sản — một tài sản cụ thể. |
| **Listing** | Một tin rao của một BĐS trên hệ thống. Một BĐS có thể có nhiều phiên bản listing theo thời gian. |
| **MS / BĐS ID** | Mã số listing dùng để đối chiếu giữa web và Zalo, ví dụ `#35148`. |
| **HXH** | Hẻm Xe Hơi — hẻm ô tô vào được. Tiêu chí lọc rất phổ biến. |
| **HXT** | Hẻm Xe Tải. |
| **MT** | Mặt Tiền — nhà mặt đường lớn. |
| **DT công nhận** | Diện tích được công nhận trên sổ (khác diện tích thực tế). |
| **Hoàn công** | Thủ tục nghiệm thu công trình xây dựng; ảnh hưởng giá và tính pháp lý. |
| **Sổ đỏ / sổ hồng** | Giấy chứng nhận quyền sử dụng đất / quyền sở hữu nhà. |
| **Tỉ** | Tỉ đồng (10⁹ VND). Đơn vị giá mặc định khi mua bán. |
| **Bớt lộc / TL** | Thương lượng được về giá. |
| **Dự án** | Khu nhà/chung cư sơ cấp gồm nhiều căn cùng chủ đầu tư (ví dụ: "Ny'ah"). Phạm vi hỗ trợ: xem `OPEN-15`. |
| **Căn (unit)** | Một đơn vị bán được trong một dự án ("căn 50 của Ny'ah"). Thừa hưởng dữ liệu chung của dự án, có trạng thái bán riêng. |
| **Giỏ hàng** | Danh sách căn còn bán được của một dự án tại một thời điểm — cách gọi phổ biến của môi giới sơ cấp. |

## Hệ thống

| Từ chuẩn | Nghĩa |
|---|---|
| **Zalo OA** | Official Account của nhadat.cc trên Zalo — kênh chat chính với B. |
| **B Side** | Phân hệ phục vụ người mua: Zalo OA + chatbot + admin backend buyer. |
| **S Side** | Phân hệ phục vụ người bán: mini-site rao tin + luồng hỏi-đáp bổ sung thông tin. |
| **Fingerprint** | Định danh trình duyệt khách vãng lai (chưa đăng nhập) để cá nhân hoá kết quả tìm kiếm. |
| **Sự kiện BĐS** | Bản ghi có timestamp mỗi khi listing được tạo/sửa/hỏi thêm/bổ sung/yêu cầu xem. |
| **BĐS hot** | Listing có nhiều sự kiện nhất trong 2 tháng gần nhất. |
| **Cuộc trò chuyện** | Chuỗi tin nhắn liên tục, khoảng cách giữa 2 tin ≤ 30 phút. |
| **Hộp mời kết nối** | Widget CTA trên web đẩy người dùng sang Zalo OA, mang theo ngữ cảnh tìm kiếm. |
| **Cue** | Câu nhắc mã listing trên trang chi tiết: *"Khi Zalo nhớ hỏi #35148"*. |
| **Việc bỏ rơi** | Việc chạy nền mà đường nhanh không làm xong: có sự kiện mà không có job, job kẹt ở `processing`, hoặc trả lời đã soạn xong mà chưa gửi hết (FR-166). |
| **Thư chết** (dead letter) | Việc đã hết đường thử lại, ngừng quét để khỏi kẹt hàng đợi. Trong DB mang **hai tên** vì hai bảng đặt tên khác nhau và trạng thái đã nằm trong CHECK: `dead` ở `inbound_ledger` và `reminders`, `chet` ở `media_cleanup_queue`. Cùng một khái niệm (FR-166 b, g). |
| **Hợp đồng thuê** (lease) | Cách một worker báo "việc này của tôi" mà không cần thêm trạng thái: đóng dấu `locked_at`/`locked_by`, hết hạn thì worker khác nhặt lại. Dùng cho `reminders` (5 phút) và `inbound_ledger` (150 giây) (FR-166 b, f). |

## Lưu ý về tên thương hiệu

Tài liệu gốc dùng lẫn **nhadat.cc**, **nhadatCC**, **Nhã Đạt CC**, **nhaadaat.com**.
Trong `docs/` thống nhất: tên miền web **https://aioinhadat.vercel.app/** (project Vercel đổi tên 09/09/2026, chủ dự án chốt; `nhadat-cc.vercel.app` cũ không còn), thương hiệu/tên đọc **Aioinhadat**, tên VIẾT cho khách và trên web **AI Ơi Nhà Đất** (mọi chữ "nhadat.cc" trong giao diện, prompt, tin bot đã đổi 09/09 — email `admin.buyerside@nhadat.cc` giữ nguyên vì là hộp thư thật) (OPEN-08 chốt 03/09/2026; "Nhã Đạt CC" chỉ còn trong trích dẫn tài liệu gốc 2024).
