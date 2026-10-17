-- 20260911f — mã tin đi theo QUẬN và LOẠI thật, không đứng yên ở Q5.
--
-- Chủ dự án 11/09/2026 (test Zalo thật): "sao cái nào cũng ghi Q5 hết vậy, bấm
-- quận khác mà". Mã tin chỉ được cấp MỘT lần lúc INSERT (trg_listings_zz_fill_code)
-- theo quận/loại lúc đó. Câu rao không nói quận → cột district mặc định 'Quận 5'
-- → mã BDS-..-Q5-…; lượt sau chủ nhà nói "quận 8 phường 6" thì district đổi đúng
-- nhưng mã giữ Q5 vĩnh viễn. Tin BDS-NP-Q5-0016 (căn hộ ehome 3, Quận 8) là ví dụ:
-- loại và quận đều đã đúng mà mã vẫn nói "nhà phố Quận 5".
--
-- Nay: tin CHƯA ĐĂNG (cho_thong_tin, chủ chưa duyệt bản nháp) đổi quận hoặc loại
-- mà tiền tố mã không còn khớp → cấp mã mới bằng next_listing_code. Tin đã đăng
-- hoặc đã duyệt GIỮ mã (khách, CTV, web đã thấy mã đó). Mã kiểu cũ BDS-Q5-NNNN
-- (ba khúc) không đụng. Số cũ bỏ trống, không ai dùng lại.
--
-- Phía chat-reply (cùng lượt): câu rao không nói quận thì câu hỏi địa chỉ đầu tiên
-- hỏi thêm quận, và boc_tach.quan_mac_dinh = true cho tới khi chủ nhà nói quận.

create or replace function public.listings_doi_ma_theo_quan_loai()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_moi text;
begin
  if new.status = 'cho_thong_tin' and new.chu_duyet_at is null
     and (new.district is distinct from old.district or new.property_type is distinct from old.property_type)
     and new.code ~ '^BDS-[A-Z0-9]+-[A-Z0-9]+-[0-9]+$' then
    v_moi := public.next_listing_code(new.property_type::text, new.district, null);
    if regexp_replace(v_moi, '[0-9]+$', '') <> regexp_replace(new.code, '[0-9]+$', '') then
      new.code := v_moi;
    end if;
  end if;
  return new;
end $function$;

revoke all on function public.listings_doi_ma_theo_quan_loai() from public, anon, authenticated;
comment on function public.listings_doi_ma_theo_quan_loai() is
  'BEFORE UPDATE OF district, property_type trên listings: tin chưa đăng, chưa duyệt mà tiền tố mã lệch quận/loại thì cấp mã mới (20260911f).';

-- Tên xếp sau trg_listings_fill_property_type (BEFORE chạy theo thứ tự tên) nên
-- loại đã được đoán xong trước khi tính mã.
drop trigger if exists trg_listings_zz_doi_ma on public.listings;
create trigger trg_listings_zz_doi_ma
  before update of district, property_type on public.listings
  for each row execute function public.listings_doi_ma_theo_quan_loai();

-- Một lần cho các tin đang lệch (lúc viết: đúng một tin, BDS-NP-Q5-0016). Từng
-- câu UPDATE riêng để next_listing_code thấy mã vừa cấp của dòng trước.
do $d$
declare
  r record;
  v text;
begin
  for r in
    select id, code, property_type, district from public.listings
     where status = 'cho_thong_tin' and chu_duyet_at is null
       and code ~ '^BDS-[A-Z0-9]+-[A-Z0-9]+-[0-9]+$'
     order by created_at
  loop
    v := public.next_listing_code(r.property_type::text, r.district, null);
    if regexp_replace(v, '[0-9]+$', '') <> regexp_replace(r.code, '[0-9]+$', '') then
      update public.listings set code = v where id = r.id;
    end if;
  end loop;
end
$d$;
