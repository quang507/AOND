-- 20261009c — Nhãn người rao có NGUỒN: đoán hay người rao tự nói / admin xác nhận (SRS-5.1zzzzj, bắn production 09/10/2026).
--
-- "bán lô đất 10x50 củ chi … giấy tay" rồi "phí sao em, mà sao tin em được" → bot "phí bên em chỉ thu khi giao dịch thành công,
-- 1% giá chốt" — người rao chưa hề nói mình là chính chủ hay môi giới. Gốc: FR-159 (chủ dự án 02/09/2026) gán nhãn NGAY khi mở hồ sơ
-- — "có nhà = chính chủ" — để deal có phí (FR-170 f), hạng người rao, ưu tiên chủ nhà (FR-173 a) chạy được; `cauPhi()` đọc thẳng
-- nhãn đó nên nhãn ĐOÁN thành con số phí nói với khách. Hai việc khác nhau dùng chung một cột.
-- Tách: `seller_type` giữ nguyên nghĩa và cách gán (kế toán, hạng, ưu tiên — không đổi gì); cột mới `seller_type_source` nói nhãn
-- đó từ đâu. Con số phí chỉ được nói khi nguồn là `tu_nhan` (người rao tự nói — AI đọc có trích dẫn, luật từ khoá chỉ đỡ khi AI
-- không chạy) hoặc `admin`. Chủ duy nhất của câu phí vẫn là `cauPhi()` (prompts.ts); nơi gọi đưa vai qua `vaiPhi()`.
alter table public.sellers add column if not exists seller_type_source text not null default 'suy_doan';
alter table public.sellers drop constraint if exists sellers_seller_type_source_check;
alter table public.sellers add constraint sellers_seller_type_source_check
  check (seller_type_source = any (array['suy_doan'::text, 'tu_nhan'::text, 'admin'::text]));
comment on column public.sellers.seller_type_source is
  '[NGƯỜI & HỘI THOẠI] Nhãn seller_type từ đâu (20261009c): suy_doan = bot gán khi mở hồ sơ (FR-159, có nhà = chính chủ); tu_nhan = người rao tự nói; admin = admin đặt. Bot chỉ báo CON SỐ phí khi tu_nhan / admin.';

-- Admin đổi nhãn ở /admin (`doiNhan`, form sửa khách, admin_dang_tin) chạy bằng phiên `authenticated` của admin: nhãn admin đặt là nhãn
-- đã xác nhận. Edge function chạy service_role và tự ghi nguồn — trigger không đụng.
create or replace function public.sellers_nguon_nhan()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') = 'authenticated'
     and new.seller_type <> 'unknown'
     and (tg_op = 'INSERT' or new.seller_type is distinct from old.seller_type)
     and exists (select 1 from public.admins a where a.email = (auth.jwt() ->> 'email')) then
    new.seller_type_source := 'admin';
  end if;
  return new;
end $function$;
revoke all on function public.sellers_nguon_nhan() from public, anon, authenticated;
comment on function public.sellers_nguon_nhan() is
  '[NGƯỜI & HỘI THOẠI] 20261009c: admin (phiên authenticated, có trong admins) đặt / đổi seller_type → seller_type_source = admin.';
drop trigger if exists trg_sellers_nguon_nhan on public.sellers;
create trigger trg_sellers_nguon_nhan before insert or update of seller_type on public.sellers
  for each row execute function public.sellers_nguon_nhan();
