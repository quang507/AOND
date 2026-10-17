-- 20260921a — FR-208 (f): ĐẢO TẦNG — chế độ `chinh` (chủ dự án 21/09/2026: "đảo tầng: AI đọc là
-- đường chính có kiểm bằng chứng rồi bắn thử 15 tin"). Không đổi bảng nào; chỉ ghi chú công tắc
-- và bật `chinh`. Luật tiền định thành lưới đỡ: chỉ chạy khi model hỏng / trả rỗng, hoặc cho
-- khoá AI không có chỗ nói (KHOA_FACT_AI_BIET trong kiem-bang-chung.ts). Đổi lại `ghi` / `bong`
-- / `tat` ở Table Editor là có hiệu lực lượt kế, không cần deploy.

comment on table public.boc_tach_bong is
  '[BOT & HÀNG ĐỢI] FR-208: AI bóc tách tin người bán — mỗi tin có mùi dữ liệu một dòng: model đề xuất gì (kèm trích dẫn), code kiểm cho đạt/bỏ vì sao, so với thứ luật đã ghi vào tin (trung/lech/ai_them), và (chế độ ghi/chinh) đã ghi fact nào nguồn ai_kiem. Công tắc app_config.boc_tach_ai = tat | bong | ghi | chinh (21/09: AI là đường chính, luật đỡ).';

update public.app_config
   set value = 'chinh',
       ghi_chu = 'FR-208: tat = không chạy; bong = AI bóc tách song song, chỉ ghi boc_tach_bong; ghi (17/09) = như bong + ghi fact nguồn ai_kiem cho trường luật không ghi; chinh (21/09) = ĐẢO TẦNG: chờ AI trước, AI đọc ra (qua kiểm bằng chứng) thì lấy của AI cho câu treo, fact kèm, cột lõi lúc tạo tin — luật chỉ đỡ khi model hỏng hoặc khoá AI không có chỗ nói. Đổi là có hiệu lực lượt kế, không cần deploy.'
 where key = 'boc_tach_ai';
