-- 20261029f_buyer_needs — SRS-5.1zzzzzzz286 (chủ dự án 29/10: "Một khách có nhiều bộ nhu cầu (mua ở, mua đầu tư, tìm giùm con). cái này cần làm").
-- Trước: `buyers.preferences` là MỘT bộ nhu cầu — khách nói thêm "tìm giùm con căn hộ Q7 3 tỷ" thì đè mất bộ "mua ở nhà phố Q5 8 tỷ".
-- Nay: mỗi bộ một dòng `buyer_needs` (nhãn do AI đọc theo nghĩa), lõi ghi cả bộ đang nói lẫn các bộ đã cất; vòng báo căn mới xét từng bộ.
-- `buyers.preferences` giữ là bộ ĐANG NÓI (CRM / chỗ đọc cũ không vỡ).
-- Ngân sách / diện tích có thêm cột SỐ min–max: chữ khách nói vẫn giữ ở `preferences`; số do AI đọc nghĩa ("dưới 6 tỷ" → max, "từ 8 tỷ" → min)
-- rồi `parse_vnd` đổi ra đồng (luật tiền một nguồn) — để lọc / thống kê khách theo khoảng giá mà không phải đọc lại chữ.
create table if not exists public.buyer_needs (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers(id) on delete cascade,
  lead_id text not null,
  nhan text,
  loai_giao_dich text not null default 'mua' check (loai_giao_dich in ('mua', 'thue')),
  preferences jsonb not null default '{}'::jsonb,
  gia_min bigint check (gia_min is null or gia_min > 0),
  gia_max bigint check (gia_max is null or gia_max > 0),
  dien_tich_min numeric check (dien_tich_min is null or dien_tich_min > 0),
  dien_tich_max numeric check (dien_tich_max is null or dien_tich_max > 0),
  dang_noi boolean not null default false,
  dang_tim boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint buyer_needs_buyer_lead_key unique (buyer_id, lead_id)
);
create index if not exists buyer_needs_buyer_idx on public.buyer_needs (buyer_id) where dang_tim;

comment on table public.buyer_needs is
  'Bộ nhu cầu của khách mua / thuê — một khách nhiều bộ (mua ở, đầu tư, tìm giùm con…). Lõi ghi (KhoNguoiMua.ghi_nhu_cau); bao_can_moi xét từng bộ (SRS-5.1zzzzzzz286)';
comment on column public.buyer_needs.lead_id is 'id bộ nhu cầu phía lõi (BuyerLead.lead_id) — khoá ghi đè';
comment on column public.buyer_needs.nhan is 'Nhãn bộ nhu cầu AI đọc theo nghĩa lời khách (mua ở / đầu tư / cho con…); null = khách mới có một bộ, chưa đặt nhãn';
comment on column public.buyer_needs.preferences is 'Các ô nhu cầu như buyers.preferences (chữ khách nói)';
comment on column public.buyer_needs.gia_min is 'Ngân sách sàn (đồng) — parse_vnd của cụm AI đọc là mức thấp nhất; null = khách không nêu sàn';
comment on column public.buyer_needs.gia_max is 'Ngân sách trần (đồng) — parse_vnd của cụm mức cao nhất, hoặc của cả câu ngân sách khi khách nói một mức';
comment on column public.buyer_needs.dien_tich_min is 'Diện tích khách muốn tối thiểu (m²)';
comment on column public.buyer_needs.dien_tich_max is 'Diện tích khách muốn tối đa (m²)';
comment on column public.buyer_needs.dang_noi is 'Bộ khách đang nói trong chat (một bộ mỗi khách)';
comment on column public.buyer_needs.dang_tim is 'false = khách thôi tìm theo bộ này; bao_can_moi bỏ qua';

alter table public.buyer_needs enable row level security;
revoke all on public.buyer_needs from anon, authenticated;
grant select on public.buyer_needs to authenticated;
drop policy if exists buyer_needs_admin_read on public.buyer_needs;
create policy buyer_needs_admin_read on public.buyer_needs as permissive for select to authenticated using ((exists (select 1
   from admins a
  where (a.email = ((select auth.jwt() as jwt) ->> 'email'::text)))));
