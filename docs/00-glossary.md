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
| **CTV** *[đã bỏ 28/10/2026]* | Cộng Tác Viên — người thật dẫn khách xem nhà, nhận câu khách hỏi mà bot không biết (FR-173). **Đã bỏ hẳn 28/10/2026** [nguồn: chủ dự án 28/10/2026, chat — bỏ CTV]; việc cũ của CTV nay về chủ nhà (nếu có trên hệ thống) hoặc admin (SRS-5.1zzzzzzz165, SRS-5.1zzzzzzz170). Giữ dòng này để đọc tài liệu cũ. Code / DB còn tàn dư chưa dọn (bảng `ctvs`, view `ctv_ranks`, cột `ctv_id`, lịch `ctv-sla-tick`). | cộng tác viên |
| **Admin** (chuyên viên) | Nhân sự nội bộ: nhận mọi việc cần người thật — câu khách hỏi khi chủ nhà quá hạn hoặc không có trên hệ thống, lịch xem, ca bot báo cần người; tự báo người dẫn khách qua Zalo (SRS-5.1zzzzzzz170, SRS-5.1zzzzzzz172). Gửi tin cho khách từ `/admin/tin-nhan` (SRS-5.1zzzzzzz216). | admin, chuyên viên, nhân viên |
| **Tên trợ lý** | Mỗi khách một tên trợ lý riêng, gán theo Zalo ID (băm), giữ suốt; cùng một người gặp cùng một tên ở cả nhánh mua và bán (FR-181). Kho 13 tên có chấm giữa (`assistants.ASSISTANT_NAMES`, SRS-5.1zzzzzzz183): Th•ái, M•ai, H•ải, L•ai, Kh•ải, T•ài, Đ•ại, Đ•ài, Nh•ài, Gi•ai, Ph•ái, L•ài, Ho•ài. Viết đúng có chấm. Kho đổi thì khách đang chat có thể đổi tên. *Lịch sử: "Trai" (2024) → "Thái" (25/08–09/09/2026) → kho •ai (09/09–14/10) → 20 tên người thật Thảo, Tuấn… (14–25/10) → 10 tên "…ai" không chấm (25/10, SRS-5.1zzzzzzz182) → 13 tên có chấm (25/10).* | Th•ái, M•ai…; Thảo, Tuấn [cũ], T•ai, Kh•ai [cũ], Thái [cũ], Trai [cũ] |
| **Aioinhadat** | Tên thương hiệu sản phẩm, chốt 03/09/2026 (OPEN-08/39). **Cách VIẾT ra cho khách và trên web: "AI Ơi Nhà Đất", tách chữ, không viết gộp** [chủ dự án 09/09/2026]; "Aioinhadat" chỉ là tên gọi tắt trong tài liệu/repo. Bot tự giới thiệu "em là Th•ái bên AI Ơi Nhà Đất" (tên theo khách, FR-181). Link web bot gửi lấy từ `AIOI_SITE_URL` (mặc định `aioinhadat.vercel.app`; `nhadat.cc`, `aioinhadat.com` chưa trỏ về web — SRS-5.1zzzzzzz220); tài liệu vẫn gọi dự án theo tên repo. | AI Ơi Nhà Đất, AOND (SRD gốc) |

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
| **Zalo cá nhân qua bridge** | Kênh chat duy nhất với cả B và S: tài khoản Zalo cá nhân (clone) chạy qua bridge `zca-js` trên VPS (`bot/bridge-zca/`). Hai số (SRS-5.1zzzzzzz210): **số ký gửi** và **số tư vấn người mua**. |
| **Zalo OA** *[không dùng]* | Official Account trên Zalo. Tài liệu 2024 coi là kênh chính; hệ thống hiện KHÔNG có OA (nút bấm trong tin vì thế chưa có). Giữ dòng để đọc tài liệu cũ. |
| **Số ký gửi** | Số Zalo hiện tại (bridge `nhadat-bridge`): nhận tin rao của người bán; nhắn nhầm việc mua vẫn trả lời; tin nội bộ và nhắc người bán đi từ số này (SRS-5.1zzzzzzz210). |
| **Số tư vấn** | Số Zalo thứ hai (`nhadat-bridge-tu-van.service`, `SO_NHAN=tu_van`): tư vấn người mua; lượt mơ hồ ở số này vào vai mua (SRS-5.1zzzzzzz210). |
| **Bridge** | Tiến trình Node trên VPS giữ phiên Zalo cá nhân: nhận tin khách, gọi lõi `http://127.0.0.1:8000/chat-reply`, gửi lời bot + ảnh (`/send`), thả tim, kéo việc từ `escalation-feed`. Mỗi số một bridge. |
| **Lõi** (aond-core) | Bộ não duy nhất của bot từ 18/10/2026: Python `src/aioi/`, chạy trên VPS bằng `aond-core.service` cổng 8000 (SRS-5.1zzzzzzz31). Mọi logic chat, prompt, bóc tách, phí, phiên đều ở đây. Edge function TS `chat-reply` đã gỡ. |
| **Câu mẫu** (câu mẫu cố định) | Câu bot nói NGUYÊN VĂN (lời chào, duyệt tin, báo phí, tin nhắc…): một nguồn `src/aioi/cau_mau.py` (`MAC_DINH`), chủ dự án sửa đè ở `/admin/cau-chuan` (bảng `cau_mau`) (SRS-5.1zzzzzzz106). |
| **Câu chuẩn** | Câu bot cũ được chủ dự án / tester chấm điểm và sửa tay ở `/admin/cau-chuan` (bảng `cau_chuan`); lõi đưa tối đa 16 dòng làm ví dụ cho model (SRS-5.1zzzzzzz88, SRS-5.1zzzzzzz180). Khác câu mẫu: câu chuẩn là ví dụ giọng, không nói nguyên văn. |
| **Bản tin 📋** | Bản tin rao bot soạn trong chat cho người bán duyệt; dòng mở là dòng riêng có dấu 📋 — mọi bước nhận bản tin dựa vào dấu này (SRS-5.1zzzzzzz222). Soạn khi có loại hình + vị trí + giá (SRS-5.1zzzzzzz200). |
| **ID thử** | Zalo ID mang tiền tố thử (`thu-`, `e2e-`…) do `la_id_thu(zalo)` nhận diện — chỗ DUY NHẤT giữ danh sách tiền tố (FR-245). Bắn thử production chỉ bằng ID thử; dữ liệu thử tự dọn. |
| **B Side** | Phân hệ phục vụ người mua: Zalo (số tư vấn) + lõi phía mua (`src/aioi/mua.py`) + `/admin`. |
| **S Side** | Phân hệ phục vụ người bán: Zalo (số ký gửi) + lõi phía bán (rao một câu, hỏi 1 ý mỗi lượt, bản tin 📋). Mini-site rao tin 2024 đã bỏ (OPEN-48). |
| **Fingerprint** | Định danh trình duyệt khách vãng lai (chưa đăng nhập) để cá nhân hoá kết quả tìm kiếm. |
| **Sự kiện BĐS** | Bản ghi có timestamp mỗi khi listing được tạo/sửa/hỏi thêm/bổ sung/yêu cầu xem. |
| **BĐS hot** | Listing có nhiều sự kiện nhất trong 2 tháng gần nhất. |
| **Cuộc trò chuyện** | Chuỗi tin nhắn liên tục, khoảng cách giữa 2 tin ≤ 30 phút. |
| **Hộp mời kết nối** | Widget CTA trên web đẩy người dùng sang Zalo, mang theo ngữ cảnh tìm kiếm. |
| **Cue** | Câu nhắc mã listing trên trang chi tiết: *"Khi Zalo nhớ hỏi #35148"*. |
| **Việc bỏ rơi** | Việc chạy nền mà đường nhanh không làm xong: có sự kiện mà không có job, job kẹt ở `processing`, hoặc trả lời đã soạn xong mà chưa gửi hết (FR-166). |
| **Thư chết** (dead letter) | Việc đã hết đường thử lại, ngừng quét để khỏi kẹt hàng đợi. Trong DB mang **hai tên** vì hai bảng đặt tên khác nhau và trạng thái đã nằm trong CHECK: `dead` ở `reminders`, `chet` ở `media_cleanup_queue`. Cùng một khái niệm (FR-166 b, g). Bảng `inbound_ledger` đã gỡ 18/10/2026 (SRS-5.1zzzzzzz46). |
| **Hợp đồng thuê** (lease) | Cách một worker báo "việc này của tôi" mà không cần thêm trạng thái: đóng dấu `locked_at`/`locked_by`, hết hạn thì worker khác nhặt lại. Dùng cho `reminders` (5 phút) (FR-166 b, f); `inbound_ledger` (150 giây) đã gỡ 18/10/2026. |

## Lưu ý về tên thương hiệu

Tài liệu gốc dùng lẫn **nhadat.cc**, **nhadatCC**, **Nhã Đạt CC**, **nhaadaat.com**.
Trong `docs/` thống nhất: tên miền web **https://aioinhadat.vercel.app/** (project Vercel đổi tên 09/09/2026, chủ dự án chốt; `nhadat-cc.vercel.app` cũ không còn), thương hiệu/tên đọc **Aioinhadat**, tên VIẾT cho khách và trên web **AI Ơi Nhà Đất** (mọi chữ "nhadat.cc" trong giao diện, prompt, tin bot đã đổi 09/09 — email `admin.buyerside@nhadat.cc` giữ nguyên vì là hộp thư thật) (OPEN-08 chốt 03/09/2026; "Nhã Đạt CC" chỉ còn trong trích dẫn tài liệu gốc 2024).
