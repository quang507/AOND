-- SRS-5.1zzzzzzz466 · Trần hạng Đồng: tối đa 5 căn đang hiện (SRD §IV.3), làm lại ở trigger lên kệ (13/11/2026)
--
-- Chủ dự án 13/11 chốt "vẫn chạy". Trần cũ (SRS-5.1zzf, 05/10) nằm ở edge function chat-reply TS — gỡ 18/10 (SRS-5.1zzzzzzz31), hàm
-- `con_duoc_rao` cũng không còn; lõi Python không kiểm nên trần ngừng chạy mà docs vẫn ghi ✅ (soát SRS-5.1zzzzzzz465).
--
-- Đặt ở `listings_quyet_dinh_dang_tin` (trigger `trg_zz_listings_dang_tin`): MỘT chỗ quyết cho_thong_tin → dang_ban, phủ mọi đường tạo tin của
-- lõi. Chỉ chặn lúc tin SẮP lên kệ; tin đang hiện không bị gỡ. Dữ liệu căn vẫn lưu đủ (tin ở cho_thong_tin, `ly_do_chua_dang = 'tran_hang_dong'`),
-- lên Bạc thì lượt ghi sau tự lên kệ. Thông tin DỰ ÁN (kho dự án, SRS-5.1zzzzzzz445) không phải tin rao — không qua đây.
-- Chỉ áp cho đường lõi bot (service_role): admin đăng tin hộ (`la_admin`) không bị trần; `diem_nguoi_ban` chỉ cho service_role / admin gọi.
-- Lỗi khi tính hạng → cho qua (không làm hỏng việc ghi tin).

alter table public.listings add column if not exists ly_do_chua_dang text;
comment on column public.listings.ly_do_chua_dang is
  'SRS-5.1zzzzzzz466: vì sao tin đủ điều kiện mà chưa lên kệ. ''tran_hang_dong'' = người rao hạng Đồng đã có 5 căn đang hiện (SRD §IV.3). NULL khi đã lên kệ / không bị giữ.';

create or replace function public.listings_quyet_dinh_dang_tin()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_du boolean := public.listing_du_dang_tin(new.price_vnd, new.area_m2, new.ward);
  v_dang_hien int;
begin
  if v_du and new.can_chu_duyet then
    v_du := new.chu_duyet_at is not null;
  end if;
  if v_du and new.status = 'cho_thong_tin' then
    -- SRS-5.1zzzzzzz466: trần hạng Đồng — 5 căn đang hiện
    if new.seller_id is not null and coalesce(auth.role(), '') = 'service_role' then
      begin
        select count(*) into v_dang_hien
          from listings l
         where l.seller_id = new.seller_id and l.id <> new.id
           and l.status in ('dang_ban', 'dang_quan_tam', 'da_coc');
        if v_dang_hien >= 5
           and public.hang_theo_diem((public.diem_nguoi_ban(new.seller_id)->>'diem')::int) = 'dong' then
          new.ly_do_chua_dang := 'tran_hang_dong';
          return new;
        end if;
      exception when others then
        null;   -- tính hạng hỏng thì cho qua, không chặn ghi tin
      end;
    end if;
    new.status := 'dang_ban';
    new.ly_do_chua_dang := null;
  elsif not v_du and new.status = 'dang_ban' then
    new.status := 'cho_thong_tin';
  end if;
  if new.status <> 'cho_thong_tin' then
    new.ly_do_chua_dang := null;
  end if;
  return new;
end $function$;

revoke all on function public.listings_quyet_dinh_dang_tin() from public, anon, authenticated;
grant execute on function public.listings_quyet_dinh_dang_tin() to service_role;
