-- 20261001b — chế độ `ai` của app_config.boc_tach_ai (chủ dự án 01/10/2026: "bỏ luật, dùng AI bóc tách — biết từ đồng
-- nghĩa, viết gần giống"). Không đổi bảng / hàm nào; chỉ bật công tắc. `ai` đi chung đường `chinh` nhưng: AI đọc MỌI tin
-- của người đang rao / đang trả lời câu treo (không qua cổng regex), câu lệnh có khối CHUẨN HOÁ, lớp kiểm bằng chứng chỉ chặn
-- bịa (trích dẫn có trong tin, tiền / số đọc từ cụm trích, giá trị trong danh sách, quận / phường có thật), luật thôi gỡ lại
-- khi AI đã quyết. Lỗi thì đổi lại `chinh` ở Table Editor — hiệu lực lượt kế, không cần deploy.

update public.app_config
   set value = 'ai',
       ghi_chu = 'tat | bong | ghi | chinh | ai. chinh (21/09) = AI trước, luật đỡ khi AI im. ai (01/10) = AI quyết: AI đọc mọi tin người bán, chuẩn hoá đồng nghĩa / gõ sai, máy chỉ chặn bịa (kiem-bang-chung datKiemNhe), luật không gỡ lại. Đổi là có hiệu lực lượt kế, không cần deploy.'
 where key = 'boc_tach_ai';
