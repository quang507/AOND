-- 20260923d — FR-176: thêm cách gọi họ hàng hay gặp: dì, cậu, mợ, thím, dượng (bot xưng cháu).
-- Chủ dự án 23/09/2026: "xem còn thiếu cách xưng hô nào nữa ko, thím dượng chú, cậu…".
alter table public.sellers drop constraint if exists sellers_xung_ho_check;
alter table public.sellers add constraint sellers_xung_ho_check CHECK (
  (xung_ho IS NULL) OR (xung_ho = ANY (ARRAY['anh'::text, 'chị'::text, 'chú'::text, 'cô'::text, 'bác'::text, 'ông'::text, 'bà'::text,
    'dì'::text, 'cậu'::text, 'mợ'::text, 'thím'::text, 'dượng'::text]))
);
comment on column public.sellers.xung_ho is
  'Cách gọi khách (FR-176): anh/chị (bot xưng em) hoặc chú/cô/bác/ông/bà/dì/cậu/mợ/thím/dượng (bot xưng cháu). NULL = chưa biết.';
