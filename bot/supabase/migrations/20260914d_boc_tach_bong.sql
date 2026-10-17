-- 20260914d — FR-208 bước 1: AI bóc tách tin người bán CHẠY BÓNG.
-- Model đề xuất trường + trích dẫn; code kiểm (`_shared/extraction/kiem-bang-chung.ts`);
-- kết quả + so với thứ luật đã ghi vào DB nằm ở đây để ĐO trước khi cho AI ghi thật.
-- Không bảng nghiệp vụ nào đổi vì AI ở bước này.

create table if not exists public.boc_tach_bong (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  seller_id uuid references public.sellers(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  tin text not null,
  cau_dang_hoi text,
  model text,
  ms integer,
  so_can integer,
  de_xuat jsonb not null default '[]'::jsonb,
  dat jsonb not null default '[]'::jsonb,
  bo jsonb not null default '[]'::jsonb,
  so_sanh jsonb not null default '{}'::jsonb
);
create index if not exists boc_tach_bong_created_at_idx on public.boc_tach_bong (created_at desc);
create index if not exists boc_tach_bong_seller_idx on public.boc_tach_bong (seller_id);

-- Chỉ service_role (chat-reply) ghi/đọc. View/bảng mới ở project này mặc định LỘ cho web
-- (alter default privileges) → revoke trước, RLS bật không policy.
alter table public.boc_tach_bong enable row level security;
revoke all on table public.boc_tach_bong from anon, authenticated;

comment on table public.boc_tach_bong is
  '[BOT & HÀNG ĐỢI] FR-208: AI bóc tách tin người bán chạy BÓNG — mỗi tin có mùi dữ liệu một dòng: model đề xuất gì (kèm trích dẫn), code kiểm cho đạt/bỏ vì sao, và so với thứ luật đã ghi vào tin (trung/lech/ai_them). Chưa ghi tin rao. Công tắc app_config.boc_tach_ai.';
comment on column public.boc_tach_bong.tin is 'Tin khách đã che SĐT / mạng xã hội (thayLienHe).';
comment on column public.boc_tach_bong.cau_dang_hoi is 'Khoá câu bot đang hỏi lúc khách nhắn (info_requests.question), null nếu không có.';
comment on column public.boc_tach_bong.ms is 'Thời gian từ lúc khởi động lượt model bóng tới khi có kết quả (ms).';
comment on column public.boc_tach_bong.so_can is 'Model đếm số căn khác nhau trong tin (0 = không rao căn nào).';
comment on column public.boc_tach_bong.de_xuat is 'Nguyên đề xuất của model: [{khoa, gia_tri, trich_dan, can}].';
comment on column public.boc_tach_bong.dat is 'Đề xuất qua đủ ba lớp kiểm bằng chứng.';
comment on column public.boc_tach_bong.bo is 'Đề xuất bị bỏ, kèm ly_do (trich_dan_khong_co_trong_tin, tien_khong_khop_trich_dan, ngu_canh_coc_phi_hoa_hong…).';
comment on column public.boc_tach_bong.so_sanh is '{trung:[khoa], lech:[{khoa, db, ai}], ai_them:[{khoa, ai}]} — so đề xuất ĐẠT với cột tin + fact sau lượt.';

insert into public.app_config (key, value, ghi_chu)
values ('boc_tach_ai', 'bong', 'FR-208: tat = không chạy; bong = AI bóc tách tin người bán song song, chỉ ghi boc_tach_bong (chưa ghi tin rao)')
on conflict (key) do nothing;
