-- 20260904b — vá bốn chỗ lòi ra khi nghiệm thu theo từng tài liệu (04/09/2026,
-- docs/10 §10.8). Mỗi mục ghi rõ ca kiểm nào đỏ và vì sao.
--
-- (1) FR-164 gãy ở tầng DB từ 20260902e (TS-OUNG-01/02/04/08, TS-TOANVEN-02b/03).
--     Bản 20260902e viết lại toàn bộ `listing_facts_sync_cols` để nối cụm thông
--     số FR-172, nhưng chép từ bản 20260828a chứ không phải 20260828d — nên rơi
--     mất bốn nhánh 20260828b/d đã thêm: `gia`, `phuong`, `loai_bds`,
--     `dien_tich_tim_tuong`; nhánh `dien_tich` lùi về "chỉ ghi khi cột trống" và
--     `like 'dien_tich%'` nuốt luôn diện tích tim tường (đúng lỗ FR-163 đã bịt).
--     Hệ quả đo được trên DB thật: chủ nhà đính chính giá/phường/loại qua chat
--     không vào cột; tin mới có fact giá + phường kẹt `cho_thong_tin` mãi;
--     `price_source`/`ward_source`/`property_type_source` không bao giờ lên
--     `chu_xac_nhan` qua fact. Hai bản test trước (29/08, 02/09) không bắt được vì
--     `listing_facts` thật rỗng và TS-THONGSO-13 chỉ thử cụm thông số.
--     Nay gộp lại: giữ nguyên bản 20260903a (bậc nguồn `bac_nguon`, `ap_thong_so`)
--     và cấy lại bốn nhánh theo đúng luật 20260828b/d (validate, bậc riêng từng
--     cột). Thêm: `gia` của tin cho thuê được nhận dải 1 triệu – 10 tỷ (bản cũ
--     chỉ 100 triệu – 1.000 tỷ nên "15tr/tháng" bị bỏ).
--
-- (2) `agents_public` đang `security_invoker = true` (TS-SEC-08, TS-HANG-02).
--     20260827g dựng lại view với invoker để thoả advisor, nhưng `sellers` không
--     có policy cho anon → anon đọc 0/3 NMG → trang `/moi-gioi` (đọc bằng
--     publishable key) TRỐNG. docs/07 §3.9(4) và docs/09 ("advisor 27/08") vẫn
--     nói view này cố ý giữ definer — tài liệu đúng, DB sai. Trả về definer:
--     view chỉ lộ `id, name, seller_type, rating_*, listing_count, rank,
--     closed_count`, không SĐT/Zalo (FR-104). `seller_ranks` GIỮ invoker: hạng
--     đã ẩn khỏi web (OPEN-26), chỉ `/admin` (JWT admin, policy `sellers_admin_*`)
--     cần đọc; anon nhận 0 dòng là đúng ý.
--
-- (3) Người bán đăng nhập web tự đăng tin (policy `listings_own_insert`,
--     FR-124) vỡ `42501 permission denied for function parse_vnd` — trigger
--     `listings_set_price_vnd` và `listings_fill_property_type` KHÔNG security
--     definer, gọi `parse_vnd`/`guess_property_type` mà hai hàm này chỉ cấp cho
--     postgres + service_role (20260829d). Bot đi service_role nên không thấy;
--     bộ test 29/08 có thể đã "đạt" nhờ plan cache. Hai hàm đều thuần (IMMUTABLE,
--     không đụng bảng) → cấp EXECUTE cho authenticated là đủ, anon vẫn không.
--
-- (4) Dọn: `lan_thu_ke` bảng SRS-3.12 ghi "chỉ service_role" nhưng đang mở cho
--     PUBLIC (hàm thuần, vô hại, nhưng tài liệu là luật) → thu hồi; hàm
--     `listing_facts_touch_status()` không còn trigger nào gọi (đã thay bởi
--     `trg_zz_listings_dang_tin`, FR-164 d) và enum `rating_target` mồ côi từ
--     khi xoá `ratings` (OPEN-23) → xoá.
--
-- Bảng `media` cũ (1.005 dòng), view `public_media`, bucket `listing-photos`
-- KHÔNG đụng ở đây: là dữ liệu, chờ chủ dự án gật (docs/09 OPEN-18 ghi việc).

-- ── (1) FR-164: cấy lại bốn nhánh fact → cột ─────────────────────────────────
create or replace function public.listing_facts_sync_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txt   text := coalesce(new.answer, '');
  v_num   numeric;
  v_vnd   bigint;
  v_raw   text;
  v_ward  text;
  v_pt    public.property_type;
  j       jsonb;
  -- Bậc nguồn theo FR-164/173: admin nhập tay hoặc CTV trả lời là `admin` (2);
  -- còn lại coi như lời chủ nhà `chu_xac_nhan` (3).
  bac     text := case when new.source ilike 'admin%' or new.source ilike 'ctv%'
                       then 'admin' else 'chu_xac_nhan' end;
  l       listings%rowtype;
  de      boolean;
begin
  select * into l from listings where id = new.listing_id;
  if not found then return null; end if;
  -- Cụm thông số (FR-172): được đè khi bậc của fact ≥ bậc cụm đang giữ.
  de := public.bac_nguon(bac) >= public.bac_nguon(coalesce(l.specs_source, 'boc_mo_ta'));
  j := public.boc_thong_so(v_txt, l.property_type::text);

  if new.question = 'so_phong_ngu' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 1 and 20 then
      update listings set bedrooms = v_num::int, specs_source = bac
       where id = new.listing_id and (bedrooms is null or de);
    end if;

  -- Diện tích đất / diện tích chung. KHÔNG khớp `dien_tich_tim_tuong` (FR-163).
  elsif new.question in ('dien_tich', 'dien_tich_dat') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num > 5 and v_num < 5000 then
      update listings set area_m2 = v_num, specs_source = bac
       where id = new.listing_id and (area_m2 is null or de)
         and area_m2 is distinct from v_num;
    end if;

  -- Tim tường chỉ là diện tích CỦA chung cư; nhà đất thì đó là sàn, không phải đất.
  elsif new.question = 'dien_tich_tim_tuong' then
    if l.property_type = 'chung_cu' then
      v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
      if v_num is not null and v_num > 5 and v_num < 5000 then
        update listings set area_m2 = v_num, specs_source = bac
         where id = new.listing_id and (area_m2 is null or de)
           and area_m2 is distinct from v_num;
      end if;
    end if;

  -- Giá: validate bằng parse_vnd, ghi NGUYÊN VĂN đã cắt tiểu từ (20260828d),
  -- bậc riêng `price_source`; trigger `trg_listings_price_vnd` tự tính lại price_vnd.
  elsif new.question = 'gia' then
    v_vnd := public.parse_vnd(v_txt);
    if v_vnd is not null and (
         (l.deal = 'cho_thue' and v_vnd between 1000000 and 10000000000)
      or (l.deal is distinct from 'cho_thue' and v_vnd between 100000000 and 1000000000000)
    ) then
      v_raw := public.chuan_hoa_gia_raw(v_txt);
      update listings set price_raw = v_raw, price_source = bac
       where id = new.listing_id
         and public.bac_nguon(bac) >= public.bac_nguon(price_source)
         and (price_raw is distinct from v_raw or price_source is distinct from bac);
    end if;

  elsif new.question = 'phuong' then
    v_ward := public.chuan_hoa_phuong(v_txt);
    if v_ward is not null then
      update listings set ward = v_ward, ward_source = bac
       where id = new.listing_id
         and public.bac_nguon(bac) >= public.bac_nguon(ward_source)
         and (ward is distinct from v_ward or ward_source is distinct from bac);
    end if;

  elsif new.question = 'loai_bds' then
    v_pt := public.guess_property_type_answer(v_txt);
    if v_pt is not null then
      update listings set property_type = v_pt, property_type_source = bac
       where id = new.listing_id
         and public.bac_nguon(bac) >= public.bac_nguon(property_type_source)
         and (property_type is distinct from v_pt or property_type_source is distinct from bac);
    end if;

  elsif new.question = 'tang' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 0 and 80 and not (j ? 'floors') then
      update listings set floor = v_num::int, specs_source = bac
       where id = new.listing_id and (floor is null or de);
    end if;
  elsif new.question = 'huong' and not (j ? 'direction') and length(btrim(v_txt)) between 2 and 40 then
    update listings set direction = btrim(v_txt), specs_source = bac
     where id = new.listing_id and (direction is null or de);
  elsif new.question in ('do_rong_hem', 'do_rong_duong') and not (j ? 'alley_width_m') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num between 1 and 40 then
      update listings set alley_width_m = v_num,
             access_type = coalesce(access_type, case when v_num >= 6 then 'hem_xe_tai' when v_num >= 3.5 then 'hem_xe_hoi' else 'hem_xe_may' end),
             specs_source = bac
       where id = new.listing_id and (alley_width_m is null or de);
    end if;
  elsif new.question = 'quy_hoach' and not (j ? 'planning_status') and public.bo_dau(v_txt) ~ '(khong|ko|k co|k dinh)' then
    update listings set planning_status = 'khong_quy_hoach', specs_source = bac
     where id = new.listing_id and (planning_status is null or de);
  elsif new.question = 'nam_xay' and not (j ? 'year_built') then
    v_num := nullif(substring(v_txt, '(?:19|20)[0-9]{2}'), '')::numeric;
    if v_num is not null then
      update listings set year_built = v_num::int, specs_source = bac
       where id = new.listing_id and (year_built is null or de);
    end if;
  elsif new.question = 'noi_that' and not (j ? 'furnishing') then
    update listings set furnishing = case when public.bo_dau(v_txt) ~ '(full|day du|cao cap)' then 'full'
                                          when public.bo_dau(v_txt) ~ '(khong|trong|ko)' then 'khong'
                                          when public.bo_dau(v_txt) ~ '(co ban)' then 'co_ban' end, specs_source = bac
     where id = new.listing_id and (furnishing is null or de)
       and public.bo_dau(v_txt) ~ '(full|day du|cao cap|khong|trong|ko|co ban)';
  elsif new.question = 'mat_tien' and not (j ? 'frontage_m') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num between 1.5 and 40 then
      update listings set frontage_m = v_num, specs_source = bac
       where id = new.listing_id and (frontage_m is null or de);
    end if;
  end if;

  perform public.ap_thong_so(new.listing_id, j, bac, de);
  return null;
end;
$$;

revoke execute on function public.listing_facts_sync_cols() from public, anon, authenticated;

comment on function public.listing_facts_sync_cols() is
  'FR-153/164/172: fact -> cot. 20260904b cay lai gia/phuong/loai_bds/dien_tich_tim_tuong (roi mat tu 20260902e); bac rieng tung cot (price/ward/property_type_source), cum thong so theo specs_source.';

-- ── (2) agents_public về definer (FR-125), seller_ranks giữ invoker (OPEN-26) ──
-- Chỉ `alter view … set (security_invoker = false)` là CHƯA đủ: view definer mà
-- join qua `seller_ranks` (invoker) thì `seller_ranks` vẫn xét quyền theo người
-- gọi → anon vẫn 0 dòng (đo 04/09). Nên dựng lại view TỰ CHỨA: tính hạng ngay
-- trên `sellers` + `listings` bằng cùng `seller_rank()` — cùng luật, không lệ
-- thuộc `seller_ranks`. Cột giữ đúng tên/kiểu cũ (create or replace).
create or replace view public.agents_public
with (security_invoker = false) as
select
  s.id,
  s.name,
  s.seller_type,
  s.rating_sum,
  s.rating_count,
  (select count(*)
     from public.listings l
    where l.seller_id = s.id
      and l.status = any (array['dang_ban', 'dang_quan_tam', 'cho_thong_tin'])) as listing_count,
  public.seller_rank(s.seller_type, c.active::int, c.closed::int, c.total::int) as rank,
  c.closed::int as closed_count
from public.sellers s
left join lateral (
  select
    count(*) filter (where l.status in ('dang_ban', 'dang_quan_tam')) as active,
    count(*) filter (where l.status = 'da_chot')                      as closed,
    count(*)                                                          as total
  from public.listings l
  where l.seller_id = s.id
) c on true
where s.seller_type = 'nmg';

revoke insert, update, delete, truncate on public.agents_public from anon, authenticated;
grant select on public.agents_public to anon, authenticated;

comment on view public.agents_public is
  'FR-125: hinh chieu cong khai NMG cho /moi-gioi — ten + so tin + hang, KHONG phone/zalo (FR-104). CO Y security definer va TU CHUA (khong join seller_ranks): sellers khong co policy cho anon (20260904b, TS-SEC-08).';

-- ── (3) Người bán web tự đăng tin: trigger gọi được hàm thuần ────────────────
grant execute on function public.parse_vnd(text) to authenticated;
grant execute on function public.guess_property_type(text) to authenticated;

-- ── (4) Dọn theo SRS-3.12 / FR-164 d / OPEN-23 ──────────────────────────────
revoke execute on function public.lan_thu_ke(int) from public, anon, authenticated;
drop function if exists public.listing_facts_touch_status();
drop type if exists public.rating_target;
