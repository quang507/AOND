-- FR-155 + FR-156 — bản chép tham chiếu của hai migration đã chạy trên Supabase
-- (`seller_rank_dong_bac_vang`, `admin_dang_tin_rpc`).
--
-- FR-155: hạng Đồng / Bạc / Vàng cho người rao (kế thừa ý tưởng từ AOND).
-- Hạng KHÔNG lưu thành cột — tính tại chỗ từ số tin. Lưu cột là phải có người
-- cập nhật nó, mà thứ không ai cập nhật thì đóng băng rồi nói dối; đúng vết xe
-- `sellers.rating_sum` đã đổ (xem đầu app/moi-gioi/page.tsx).
--
-- Hai thang bậc khác nhau vì hai vai khác nhau: NMG sống bằng SỐ LƯỢNG tin nên
-- đo bằng tin đang rao + tỷ lệ chốt (khớp đúng ràng buộc "tối thiểu 10 tin, tỷ
-- lệ chốt từ 5%" đang ghi trên trang /moi-gioi); CCRB cả đời có một căn nên đo
-- bằng việc căn đó có đủ thông tin lên sàn và có chốt được không.
-- Ngưỡng cụ thể là [giả định BA] — chờ chủ dự án chốt (OPEN-26).

create or replace function public.seller_rank(
  p_type   seller_type,
  p_active int,
  p_closed int,
  p_total  int
) returns text
language sql
immutable
as $fn$
  select case
    when p_type = 'nmg' then case
      when p_active >= 10 and p_total > 0 and p_closed::numeric / p_total >= 0.05 then 'vang'
      when p_active >= 5  or  p_closed >= 1                                        then 'bac'
      else 'dong'
    end
    else case
      when p_closed >= 1 then 'vang'
      when p_active >= 1 then 'bac'
      else 'dong'
    end
  end;
$fn$;

-- View chỉ lộ tên + số đếm + hạng. TUYỆT ĐỐI không kéo `phone`/`zalo_user_id`
-- vào đây: trang admin đọc view này để đổ ô xổ xuống, mà trang admin chạy trong
-- trình duyệt (FR-104).
create or replace view public.seller_ranks
with (security_invoker = true) as
select
  s.id,
  s.name,
  s.seller_type,
  coalesce(c.active, 0)::int  as active_count,
  coalesce(c.closed, 0)::int  as closed_count,
  coalesce(c.total,  0)::int  as total_count,
  public.seller_rank(
    s.seller_type,
    coalesce(c.active, 0)::int,
    coalesce(c.closed, 0)::int,
    coalesce(c.total,  0)::int
  ) as rank
from public.sellers s
left join lateral (
  select
    count(*) filter (where l.status in ('dang_ban', 'dang_quan_tam')) as active,
    count(*) filter (where l.status = 'da_chot')                      as closed,
    count(*)                                                          as total
  from public.listings l
  where l.seller_id = s.id
) c on true;

grant select on public.seller_ranks to anon, authenticated;

create or replace view public.agents_public
with (security_invoker = true) as
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
  r.rank,
  r.closed_count
from public.sellers s
join public.seller_ranks r on r.id = s.id
where s.seller_type = 'nmg';

comment on view public.seller_ranks is
  'FR-155: hang Dong/Bac/Vang cua nguoi rao. Chi lo dem tin, KHONG lo phone/zalo (FR-104).';


-- FR-156: admin tự đăng tin cho nguồn KHÔNG đi qua Zalo OA.
--
-- Làm bằng RPC security definer chứ không mở policy INSERT, vì mở policy thì
-- trang admin còn phải đọc được bảng `sellers` để chọn người bán — mà bảng đó
-- chứa số điện thoại thật của dân. Bọc vào hàm: admin gọi được hàm, nhưng
-- không đọc được bảng.
--
-- `seller_phone` / `seller_zalo` chỉ được ghi khi form gửi lên; form có ô tích
-- riêng cho từng cái, không tích thì cột NULL. Không giữ số của người chưa
-- đồng ý cho giữ.
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

  -- Mã nối tiếp dãy BDS-Q5-#### đang có. Khoá bảng để hai admin bấm cùng lúc
  -- không sinh trùng mã (code là thứ khách đọc qua Zalo, trùng là chỉ nhầm căn).
  lock table listings in share row exclusive mode;
  select 'BDS-Q5-' || lpad(
           (coalesce(max((regexp_match(code, '^BDS-Q5-([0-9]+)$'))[1]::int), 0) + 1)::text,
           4, '0')
    into v_code
    from listings
   where code ~ '^BDS-Q5-[0-9]+$';

  insert into listings (
    code, seller_id, deal, district, ward, location_raw,
    area_m2, price_raw, bedrooms, property_type, description, source, status
  ) values (
    v_code,
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
  returning id, price_vnd into v_id, v_price;

  return jsonb_build_object(
    'id', v_id, 'code', v_code, 'price_vnd', v_price, 'seller_id', v_seller
  );
end
$fn$;

revoke all on function public.admin_dang_tin(jsonb) from public, anon;
grant execute on function public.admin_dang_tin(jsonb) to authenticated;

comment on function public.admin_dang_tin(jsonb) is
  'FR-156: admin dang tin thu cong. Tu kiem quyen qua bang admins; chi ghi phone/zalo khi duoc dua vao.';
