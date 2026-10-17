-- FR-158 · Một dãy mã tin duy nhất, sinh ở tầng DB.
--
-- Hai chuyện cùng một gốc "mã tin được đúc ở đâu":
--
-- (a) HAI DÃY MÃ SONG SONG. `admin_dang_tin` sinh `BDS-Q5-####` nối tiếp, còn
--     nhánh chat của `chat-reply` tự đúc `CCRB-<base36 theo timestamp>`. Mã tin
--     là thứ khách ĐỌC QUA ZALO, là URL `/tin/<mã>`, là thư mục ảnh
--     `listing-photos/<mã>/` (bot/README.md). Hai dãy nghĩa là mọi chỗ khớp mã
--     phải nhớ cả hai dạng — `chat-reply` đang phải viết `(?:BDS-Q5|CCRB)-` —
--     và base36 thì đọc qua điện thoại không nổi.
--     Kiểm 27/08/2026: kho có 173 tin, 100% `BDS-Q5-####`, CHƯA một mã `CCRB-`
--     nào tồn tại. Gộp bây giờ không phải migrate dữ liệu, chỉ là chốt một dãy
--     trước khi dãy kia kịp đẻ ra tin thật.
--
-- (b) BỘ SINH MÃ BỊ CHÉP HAI BẢN, và hai bản không cùng mức an toàn: bản trong
--     `admin_dang_tin` có khoá, bản trong edge function không khoá gì. Đúng vết
--     mà `_shared/claude.ts` đã phải đi dọn một lần.
--
-- Chữa: MỘT hàm sinh mã + MỘT trigger điền mã khi INSERT không đưa mã. Mọi
-- đường ghi `listings` dùng chung một bộ sinh, kể cả đường chưa được viết.

-- ─────────────────────────────────────────────────────────────────────────────
-- Bộ sinh mã. KHOÁ BẰNG ADVISORY LOCK, KHÔNG dùng `lock table` như bản cũ.
--
-- Hàm này được gọi từ trigger BEFORE INSERT, mà lúc đó transaction ĐÃ giữ
-- ROW EXCLUSIVE trên `listings`. Xin thêm SHARE ROW EXCLUSIVE là NÂNG CẤP KHOÁ:
-- hai lượt insert đồng thời sẽ ôm nhau chết cứng, mỗi bên chờ ROW EXCLUSIVE của
-- bên kia nhả ra. Advisory lock không dính dáng gì tới khoá hàng/khoá bảng nên
-- không có đường nâng cấp, và nó là đúng thứ `ensure_seller_conversation` đang
-- dùng cho cùng loại việc.
--
-- Khoá theo transaction: bên thứ hai chờ tới khi bên thứ nhất COMMIT rồi mới
-- đọc `max(...)`, nên nó thấy mã vừa cấp. Bên thứ nhất rollback thì số được
-- dùng lại, không thủng dãy.
create or replace function public.next_listing_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_code text;
begin
  perform pg_advisory_xact_lock(hashtext('listing_code'));

  select 'BDS-Q5-' || lpad(
           (coalesce(max((regexp_match(code, '^BDS-Q5-([0-9]+)$'))[1]::int), 0) + 1)::text,
           4, '0')
    into v_code
    from listings
   where code ~ '^BDS-Q5-[0-9]+$';

  return v_code;
end $function$;

comment on function public.next_listing_code() is
  'FR-158: cap ma tin ke tiep trong day BDS-Q5-####. Advisory lock, khong khoa bang.';

revoke execute on function public.next_listing_code() from public, anon;
grant execute on function public.next_listing_code() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger điền mã. Đặt ở DB chứ không ở từng đường gọi vì đúng bài học FR-157
-- (b): tin rao sinh ra từ nhiều đường (`chat-reply`, `admin_dang_tin`, script
-- nhập liệu, và đường nào đó chưa viết) — nhét bộ sinh vào một đường là những
-- đường kia vẫn tự đúc mã theo kiểu riêng.
--
-- `listings.code` là NOT NULL không default. BEFORE ROW trigger chạy TRƯỚC lúc
-- Postgres kiểm ràng buộc, nên INSERT đưa `code = null` vẫn hợp lệ: tới lúc
-- kiểm thì trigger đã điền xong.
create or replace function public.listings_fill_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.code is null or btrim(new.code) = '' then
    new.code := public.next_listing_code();
  end if;
  return new;
end $function$;

drop trigger if exists trg_listings_fill_code on public.listings;
create trigger trg_listings_fill_code
  before insert on public.listings
  for each row execute function public.listings_fill_code();

-- ─────────────────────────────────────────────────────────────────────────────
-- `admin_dang_tin` bỏ bộ sinh mã chép tay, để trigger điền rồi đọc lại bằng
-- RETURNING. Giữ NGUYÊN mọi hành vi còn lại: tự kiểm quyền theo bảng `admins`,
-- dùng lại người bán cũ khi trùng Zalo/SĐT, chỉ ghi phone/zalo khi form gửi lên.
create or replace function public.admin_dang_tin(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email  text := (select auth.jwt() ->> 'email');
  v_seller uuid;
  v_zalo   text;
  v_phone  text;
  v_code   text;
  v_id     uuid;
  v_price  bigint;
begin
  if v_email is null or not exists (select 1 from admins a where a.email = v_email) then
    raise exception 'Khong co quyen quan tri' using errcode = '42501';
  end if;

  v_seller := nullif(p->>'seller_id', '')::uuid;

  if v_seller is null and coalesce(btrim(p->>'seller_name'), '') <> '' then
    v_zalo  := nullif(btrim(p->>'seller_zalo'), '');
    v_phone := nullif(btrim(p->>'seller_phone'), '');

    -- Trùng Zalo ID hay trùng số thì dùng lại người cũ, đừng đẻ bản sao: một
    -- người bán hai bản ghi là hạng chia đôi và bot nhận nhầm người.
    if v_zalo is not null then
      select id into v_seller from sellers where zalo_user_id = v_zalo;
    end if;
    if v_seller is null and v_phone is not null then
      select id into v_seller from sellers where phone = v_phone;
    end if;

    if v_seller is null then
      insert into sellers (name, seller_type, phone, zalo_user_id)
      values (
        btrim(p->>'seller_name'),
        coalesce(nullif(p->>'seller_type', ''), 'ccrb')::seller_type,
        v_phone,
        v_zalo
      )
      returning id into v_seller;
    end if;
  end if;

  -- Mã do trg_listings_fill_code cấp (FR-158). Đưa null xuống rồi đọc lại bằng
  -- RETURNING — một bộ sinh mã duy nhất cho cả admin lẫn bot.
  insert into listings (
    code, seller_id, deal, district, ward, location_raw,
    area_m2, price_raw, bedrooms, property_type, description, source, status
  ) values (
    null,
    v_seller,
    coalesce(nullif(p->>'deal', ''), 'ban')::listing_deal,
    'Quận 5',
    nullif(btrim(p->>'ward'), ''),
    nullif(btrim(p->>'location_raw'), ''),
    nullif(p->>'area_m2', '')::numeric,
    nullif(btrim(p->>'price_raw'), ''),
    nullif(p->>'bedrooms', '')::int,
    coalesce(nullif(p->>'property_type', ''), 'chua_ro')::property_type,
    nullif(btrim(p->>'description'), ''),
    coalesce(nullif(btrim(p->>'source'), ''), 'admin'),
    coalesce(nullif(p->>'status', ''), 'cho_thong_tin')
  )
  returning id, code, price_vnd into v_id, v_code, v_price;

  return jsonb_build_object(
    'id', v_id, 'code', v_code, 'price_vnd', v_price, 'seller_id', v_seller
  );
end
$fn$;

revoke all on function public.admin_dang_tin(jsonb) from public, anon;
grant execute on function public.admin_dang_tin(jsonb) to authenticated;

comment on function public.admin_dang_tin(jsonb) is
  'FR-156: admin dang tin thu cong. Tu kiem quyen qua bang admins; chi ghi phone/zalo khi duoc dua vao. Ma tin do trg_listings_fill_code cap (FR-158).';
