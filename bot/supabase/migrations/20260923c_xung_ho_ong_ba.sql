-- 20260923c — FR-176: khách tự xưng ÔNG / BÀ.
-- 23/09/2026 (Zalo thật): "chào cháu, ông bán nhà Trần Bình Trọng Q5 7 tỷ" mà bot đáp "Dạ cháu chào mình ạ!"
-- và hỏi "…đúng không mình?" — code chỉ biết anh/chị/chú/cô/bác, và ràng buộc cột cũng chỉ cho năm từ đó,
-- nên dù code nhận ra "ông" thì lượt ghi `sellers.xung_ho = 'ông'` vẫn bị DB từ chối.
alter table public.sellers drop constraint if exists sellers_xung_ho_check;
alter table public.sellers add constraint sellers_xung_ho_check CHECK (
  (xung_ho IS NULL) OR (xung_ho = ANY (ARRAY['anh'::text, 'chị'::text, 'chú'::text, 'cô'::text, 'bác'::text, 'ông'::text, 'bà'::text]))
);
comment on column public.sellers.xung_ho is
  'Cách gọi khách (FR-176): anh/chị (bot xưng em) hoặc chú/cô/bác/ông/bà (bot xưng cháu). NULL = chưa biết.';
