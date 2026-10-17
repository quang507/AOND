-- 20261006b — Sổ VAN KÍCH: mỗi lần một van hậu kiểm (van-tra-loi.ts) đổi lời model thì ghi một dòng (SRS-5.1zzn, 06/10/2026).
--
-- Chủ dự án 06/10/2026 ("Làm bước 1 và 2 đi"): bước 1 = ghi lại van nào đã kích để đo trước khi bỏ. Hơn 80 van cắt / thay
-- lời model mà không ai đếm được bao nhiêu phần trăm tin bị sửa — bảng này là chỗ đếm. Chỉ ghi khi lời ĐỔI.
-- Không giữ SĐT: lời bot đã qua lớp che liên hệ trước khi vào đây; vẫn gọt số dài bằng trigger cho chắc (§5, repo public).

create table if not exists public.van_kich (
  id bigint generated always as identity primary key,
  conversation_id uuid references public.conversations(id) on delete set null,
  nhanh text not null check (nhanh in ('ban', 'mua')),
  van text not null,
  truoc text not null default '',
  sau text not null default '',
  created_at timestamptz not null default now()
);
comment on table public.van_kich is
  '[BOT & HÀNG ĐỢI] Sổ VAN KÍCH — mỗi dòng là một lần van hậu kiểm (van-tra-loi.ts) ĐỔI lời model: tên van, câu trước, câu sau. Chỉ để ĐO (van nào kích bao nhiêu, cắt gì) trước khi quyết bỏ van; không điều khiển gì. SRS-5.1zzn.';
comment on column public.van_kich.nhanh is 'ban = nhánh người bán · mua = nhánh người mua.';
comment on column public.van_kich.van is 'Tên hàm van trong _shared/extraction/van-tra-loi.ts (vd boGachDai, motCauHoiLuot).';
comment on column public.van_kich.truoc is 'Lời TRƯỚC khi qua van (cắt 600 chữ, số ≥ 9 chữ số đã gọt).';
comment on column public.van_kich.sau is 'Lời SAU khi qua van (cắt 600 chữ, số ≥ 9 chữ số đã gọt).';
create index if not exists van_kich_created_idx on public.van_kich (created_at desc);
create index if not exists van_kich_van_idx on public.van_kich (van);

-- §5: không bao giờ để một dãy số dài (SĐT, CCCD) nằm trong sổ đo — gọt ở DB, không tin phía gọi.
create or replace function public.van_kich_che_so()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.truoc := regexp_replace(coalesce(new.truoc, ''), '\d{9,}', '#', 'g');
  new.sau := regexp_replace(coalesce(new.sau, ''), '\d{9,}', '#', 'g');
  return new;
end;
$$;
drop trigger if exists trg_van_kich_che_so on public.van_kich;
create trigger trg_van_kich_che_so
  before insert or update on public.van_kich
  for each row execute function public.van_kich_che_so();

-- RLS: chỉ admin đọc (web qua la_admin()); edge function ghi bằng service_role (qua RLS). View mới mặc định LỘ ở project này
-- (alter default privileges) → revoke trước rồi mới grant.
alter table public.van_kich enable row level security;
revoke all on public.van_kich from anon, authenticated;
grant select on public.van_kich to authenticated;
drop policy if exists van_kich_admin_doc on public.van_kich;
create policy van_kich_admin_doc on public.van_kich for select to authenticated using (public.la_admin());

-- Bảng đếm cho /admin và cho người quyết bỏ van: van nào kích bao nhiêu lần trong 7 ngày, theo nhánh.
create or replace view public.van_kich_7_ngay
-- `= true` chứ không `= on`: cổng soat_db_cong_khai so chuỗi reloptions `security_invoker=true` (bắt 06/10 trên CI).
with (security_invoker = true) as
select nhanh, van, count(*) as so_lan, max(created_at) as lan_cuoi
from public.van_kich
where created_at > now() - interval '7 days'
group by nhanh, van
order by so_lan desc;
comment on view public.van_kich_7_ngay is
  '[BOT & HÀNG ĐỢI] Van nào đã đổi lời model bao nhiêu lần trong 7 ngày, theo nhánh — đọc trước khi quyết bỏ một van. security_invoker: admin mới thấy dòng. SRS-5.1zzn.';
revoke all on public.van_kich_7_ngay from anon, authenticated;
grant select on public.van_kich_7_ngay to authenticated;

-- Dọn: giữ 30 ngày là đủ để đo; cron dọn chung sẽ gọi hàm này (không thêm job mới — nối vào don_du_lieu_thu nếu có).
create or replace function public.don_van_kich()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.van_kich where created_at < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.don_van_kich() from public, anon, authenticated;
comment on function public.don_van_kich() is 'Xoá dòng van_kich quá 30 ngày; trả số dòng đã xoá. Chỉ service_role.';
