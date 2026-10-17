-- 20260907d — `sellers.xung_ho`: chủ nhà dặn "kêu chị nha" thì nhớ, không quên
-- ngay câu sau.
--
-- VÌ SAO. Lượt rao 15:39 07/09/2026: chủ nhà nhắn "Kêu chị nha", bot đáp "em
-- gọi chị nha", rồi câu KẾ TIẾP lại "rộng thoáng quá anh". Nhánh hỏi người
-- bán gọi model từng lượt cụt, không có lịch sử, không có chỗ nào ghi cách
-- xưng hô — nên lời dặn sống đúng một lượt. Sếp đọc log bảo "con AI nhắn
-- không tự nhiên" (FR-176).
--
-- Ghi ở `sellers` chứ không ở `buyers.preferences`: người bán có hồ sơ riêng,
-- và cột này phải sống qua mọi tin, mọi hội thoại của người đó. Chỉ hai giá
-- trị — đây là cách GỌI, không phải giới tính; ai dặn "cô/chú/bác" thì bot vẫn
-- chỉ có hai từ để chọn cho đúng tone "em ↔ anh/chị" của docs/06 §6.8.

alter table public.sellers
  add column if not exists xung_ho text
  check (xung_ho is null or xung_ho in ('anh', 'chị'));

comment on column public.sellers.xung_ho is
  'Cách chủ nhà dặn bot gọi mình (anh/chị). Bot ghi khi chủ nhà nói "kêu chị nha"; null = chưa dặn, bot dùng "anh/chị". FR-176.';
