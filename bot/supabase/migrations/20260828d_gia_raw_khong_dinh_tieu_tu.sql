-- 20260828d — `price_raw` không dính tiểu từ cuối câu (FR-164)
--
-- BỆNH. Cửa fact `gia` nhận nguyên văn lời chủ. Người Việt nhắn tin đệm tiểu
-- từ cuối câu, nên chuỗi giá bắt được từ "à em ơi giá 6.8 tỷ nha, phường 3…"
-- là "6.8 tỷ nha". `price_vnd` vẫn ra đúng 6.800.000.000 (parse_vnd bỏ qua
-- chữ thừa), nhưng `price_raw` là thứ hiện NGUYÊN VĂN trên web — tin rao hiện
-- "6.8 tỷ nha" thì trông như dữ liệu rác.
--
-- VÌ SAO CHỮA Ở ĐÂY, KHÔNG CHỮA Ở APP. FR-164 đặt chuẩn hoá ở tầng DB: một
-- luật, một chỗ. Cắt trong chat-reply thì chỉ chữa được ĐÚNG cửa đó; câu trả
-- lời drip, form admin và mọi cửa ghi sau này vẫn để lọt. Đặt trong
-- `listing_facts_sync_cols` thì mọi cửa đi qua `ghi_fact_listing` đều sạch.
--
-- KHÔNG ĐƯỢC LÀM SAI NGHĨA. Đuôi câu đôi khi mang thông tin thật ("5 tỷ
-- thương lượng", "6 tỷ 8"). Nên hàm chỉ cắt đúng một danh sách tiểu từ/hô ngữ
-- ĐÓNG, bắt buộc có dấu cách hoặc phẩy đứng trước (để "8 tỷ" không mất chữ),
-- và CHỈ nhận bản đã cắt khi `parse_vnd()` của nó vẫn ra ĐÚNG con số cũ. Cắt
-- mà lệch giá thì trả nguyên văn — thà xấu còn hơn sai.
--
-- `listing_facts.answer` vẫn giữ NGUYÊN VĂN: fact là bằng chứng, không phải
-- chỗ để gọt. Chỉ cột `listings.price_raw` mới là bản trình bày đã chuẩn hoá.

create or replace function public.chuan_hoa_gia_raw(p_text text)
returns text
language plpgsql
stable
set search_path to 'public'
as $$
declare
  s   text := btrim(coalesce(p_text, ''));
  goc bigint := public.parse_vnd(p_text);
  t   text;
  m   text[];
begin
  if s = '' then return null; end if;

  loop
    -- bo_dau dùng lower() + translate() 1-đổi-1 nên ĐỘ DÀI không đổi:
    -- đo trên bản bỏ dấu, cắt trên bản gốc.
    t := public.bo_dau(s);
    m := regexp_match(
      t,
      '([[:space:],]+(nha|nhe|nhen|nhak|nho|a|ah|oi|em|anh|chi|do|day|luon|thoi|ok|nghen|he))$'
    );
    exit when m is null;
    s := btrim(substring(s from 1 for length(s) - length(m[1])));
    exit when s = '';
  end loop;

  if s = '' then return btrim(p_text); end if;
  -- Lưới an toàn: cắt xong mà số đọc ra khác số cũ thì coi như không cắt.
  if public.parse_vnd(s) is distinct from goc then return btrim(p_text); end if;
  return s;
end;
$$;

comment on function public.chuan_hoa_gia_raw(text) is
  'FR-164: gọt tiểu từ/hô ngữ cuối câu khỏi chuỗi giá trước khi ghi vào '
  'listings.price_raw. Chỉ nhận bản đã cắt khi parse_vnd() của nó vẫn ra đúng '
  'con số cũ. listing_facts.answer không đụng tới — fact là bằng chứng nguyên văn.';

-- Nối vào nhánh `gia` của cửa fact. Toàn bộ phần còn lại giữ Y NGUYÊN bản
-- 20260828b; chỉ nhánh `gia` đổi `btrim(v_txt)` → `chuan_hoa_gia_raw(v_txt)`.
create or replace function public.listing_facts_sync_cols()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_txt   text := coalesce(new.answer, '');
  v_num   numeric;
  v_pt    public.property_type;
  v_ward  text;
  v_vnd   bigint;
  v_ptype public.property_type;
  v_raw   text;
  v_bac   text := case when new.source in ('seller_chat', 'seller_zalo')
                       then 'chu_xac_nhan' else 'admin' end;
begin
  if new.question = 'so_phong_ngu' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 1 and 20 then
      update listings set bedrooms = v_num::int
       where id = new.listing_id and bedrooms is distinct from v_num::int;
    end if;

  elsif new.question in ('dien_tich', 'dien_tich_dat') then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num > 5 and v_num < 5000 then
      update listings set area_m2 = v_num
       where id = new.listing_id and area_m2 is distinct from v_num;
    end if;

  elsif new.question = 'dien_tich_tim_tuong' then
    select property_type into v_ptype from listings where id = new.listing_id;
    if v_ptype = 'chung_cu' then
      v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
      if v_num is not null and v_num > 5 and v_num < 5000 then
        update listings set area_m2 = v_num
         where id = new.listing_id and area_m2 is distinct from v_num;
      end if;
    end if;

  elsif new.question = 'tang' then
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 0 and 80 then
      update listings set floor = v_num::int
       where id = new.listing_id and floor is distinct from v_num::int;
    end if;

  elsif new.question = 'huong' then
    if length(btrim(v_txt)) between 2 and 40 then
      update listings set direction = btrim(v_txt)
       where id = new.listing_id and direction is distinct from btrim(v_txt);
    end if;

  elsif new.question = 'gia' then
    v_vnd := public.parse_vnd(v_txt);
    if v_vnd is not null and v_vnd between 100000000 and 1000000000000 then
      v_raw := public.chuan_hoa_gia_raw(v_txt);
      update listings set price_raw = v_raw, price_source = v_bac
       where id = new.listing_id
         and public.bac_nguon(v_bac) >= public.bac_nguon(price_source)
         and (price_raw is distinct from v_raw or price_source is distinct from v_bac);
    end if;

  elsif new.question = 'phuong' then
    v_ward := public.chuan_hoa_phuong(v_txt);
    if v_ward is not null then
      update listings set ward = v_ward, ward_source = v_bac
       where id = new.listing_id
         and public.bac_nguon(v_bac) >= public.bac_nguon(ward_source)
         and (ward is distinct from v_ward or ward_source is distinct from v_bac);
    end if;

  elsif new.question = 'loai_bds' then
    v_pt := public.guess_property_type_answer(v_txt);
    if v_pt is not null then
      update listings
         set property_type = v_pt, property_type_source = v_bac
       where id = new.listing_id
         and public.bac_nguon(v_bac) >= public.bac_nguon(property_type_source)
         and (property_type is distinct from v_pt
              or property_type_source is distinct from v_bac);
    end if;
  end if;

  return null;
end;
$$;
