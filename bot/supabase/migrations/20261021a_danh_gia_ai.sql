-- 20261021a — Khách chấm sao cho AI sau khi xong việc (SRS-5.1zzzzzzz104). Chủ dự án 21/10/2026 chốt: hỏi MỘT lần mỗi khách
-- (bên bán: sau khi tin đã lên web và đã nói xong phí; bên mua: khi khách báo đã nhận đủ thông tin căn), câu "Anh/chị chấm giúp em
-- 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ.", AI đọc câu trả lời theo nghĩa, điểm hiện trên CRM, ≤ 2 sao báo admin.
-- Lõi Python ghi bằng service_role (bỏ qua RLS); web chỉ admin đọc.

create table if not exists public.danh_gia_ai (
  id uuid primary key default gen_random_uuid(),
  zalo_user_id text not null unique,
  vai text not null check (vai in ('ban', 'mua')),
  ten_khach text,
  hoi_luc timestamptz not null default now(),
  sao smallint check (sao between 1 and 5),
  loi_khach text,
  tra_loi_luc timestamptz,
  da_bao_admin boolean not null default false,
  la_thu boolean generated always as (public.la_id_thu(zalo_user_id)) stored
);

comment on table public.danh_gia_ai is '[NGƯỜI & HỘI THOẠI] Khách chấm sao cho AI: một dòng mỗi khách (hỏi một lần). hoi_luc = lúc bot xin chấm; sao trống = khách chưa / không chấm. ≤ 2 sao → tin nội bộ ⭐ cho admin qua reminders. Chỉ admin đọc.';
comment on column public.danh_gia_ai.zalo_user_id is 'Zalo ID khách (một dòng mỗi khách — khoá chống hỏi lại).';
comment on column public.danh_gia_ai.vai is 'ban = người rao; mua = khách mua / thuê.';
comment on column public.danh_gia_ai.ten_khach is 'Tên Zalo lúc ghi (để đọc trên CRM).';
comment on column public.danh_gia_ai.sao is 'Số sao khách cho, 1 … 5 — lượt AI đọc theo nghĩa, code kiểm cụm trích có trong lời khách.';
comment on column public.danh_gia_ai.loi_khach is 'Nguyên văn cụm khách chấm (đã che dãy số dài).';
comment on column public.danh_gia_ai.da_bao_admin is 'Đã xếp tin nội bộ ⭐ cho admin (≤ 2 sao, không phải ID thử).';
comment on column public.danh_gia_ai.la_thu is 'Zalo ID thử theo la_id_thu() — tính lúc ghi; thêm tiền tố mới vào la_id_thu thì dòng cũ không tự đổi.';

create index if not exists danh_gia_ai_hoi_luc_idx on public.danh_gia_ai (hoi_luc desc);

alter table public.danh_gia_ai enable row level security;
revoke all on public.danh_gia_ai from anon, authenticated;
grant select on public.danh_gia_ai to authenticated;
drop policy if exists danh_gia_ai_admin_doc on public.danh_gia_ai;
create policy danh_gia_ai_admin_doc on public.danh_gia_ai for select to authenticated using (public.la_admin());
