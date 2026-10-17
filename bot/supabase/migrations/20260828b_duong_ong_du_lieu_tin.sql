-- FR-164 · Đường ống dữ liệu tin rao: bằng chứng → fact → chuẩn hoá → cột
--          quyền uy → đánh giá đủ → quyết định đăng.
--
-- ══ NGUỒN SỰ THẬT (chốt lại, mở rộng FR-163) ═════════════════════════════════
--   listing_facts = BẰNG CHỨNG hội thoại, append-only, không bao giờ sửa/xoá.
--                   Provenance sẵn có: `source` + `created_at`.
--   listings      = GIÁ TRỊ HIỆN HÀNH để tìm kiếm/hiển thị/đăng.
--   price_raw     = lời NGƯỜI nói (giữ nguyên văn); price_vnd = DẪN XUẤT.
--
-- ══ THỨ TỰ ƯU TIÊN — GIỮ LUẬT CỦA REPO, KHÔNG theo mẫu thường gặp ════════════
--        chu_xac_nhan  >  admin  >  suy_doan
--
-- Mẫu phổ biến ngoài đời là "admin_verified > seller_confirmed". Repo này
-- NGƯỢC LẠI, và đó là chủ ý:
--   * FR-156 nói rõ admin nhập tin từ NGUỒN THỨ BA — "nhặt trên Facebook, Chợ
--     Tốt, Batdongsan, sổ tay CTV, đi đường thấy bảng". Đó là dữ liệu hạng hai,
--     không phải xác minh hiện trường.
--   * Cả vòng hỏi nhỏ giọt FR-129 tồn tại để lấy lời CHÍNH CHỦ. Nếu lời chính
--     chủ không thắng được dòng admin chép từ Chợ Tốt thì vòng drip vô nghĩa.
--   * `trg_listings_fill_property_type` (FR-150) vốn CHỈ điền khi null/chua_ro —
--     tức suy đoán regex đã đứng bét từ đầu. Giữ nguyên.
-- Nói cách khác: người biết nhà mình nhất là người đang ở trong nhà.
--
-- ══ BẢNG AUDIT TỪNG TRƯỜNG TRÙNG GIỮA listing_facts VÀ listings ══════════════
-- (1 nguồn sự thật · 2 hàm chuẩn hoá · 3 giá trị hợp lệ · 4 kiểm tra ·
--  5 luật cập nhật · 6 lịch sử · 7 provenance · 8 khi chủ nhà sửa)
--
-- price_raw / price_vnd
--   1 price_raw ← fact `gia` (chủ) | form admin | regex câu rao (lúc INSERT).
--     price_vnd KHÔNG có nguồn riêng — luôn = parse_vnd(price_raw).
--   2 parse_vnd() cho price_vnd; price_raw là bản TRÌNH BÀY, gọt tiểu từ cuối
--     câu bằng chuan_hoa_gia_raw() (thêm ở 20260828d, hạ xuống tầng cột ở
--     20260828f nên mọi cửa ghi đều qua). Nguyên văn nằm ở listing_facts.answer.
--   3 price_vnd 1e8..1e12 (100 triệu … 1000 tỷ) mới nhận.
--   4 fact `gia` mà parse_vnd trả null hoặc ngoài dải → BỎ, không đụng cột.
--   5 fact mới nhất thắng theo bậc ưu tiên (chu_xac_nhan ≥ nguồn đang giữ).
--   6 listing_facts giữ mọi lần chủ báo giá.       7 listings.price_source.
--   8 "à 6.8 tỷ nha em" → price_raw='6.8 tỷ', price_vnd=6.8e9, source=chu_xac_nhan.
--
-- area_m2
--   1 fact `dien_tich` | `dien_tich_dat` | (chung cư) `dien_tich_tim_tuong`;
--     hoặc form admin.  2 số đầu tiên trong câu, dấu phẩy → chấm.
--   3 (5, 5000) m².  4 ngoài dải → BỎ.  5 fact mới nhất thắng.
--   6 listing_facts.  7 không cột riêng — không có đường SUY ĐOÁN nào ghi
--     area_m2 (chỉ chủ hoặc admin), nên không có tranh chấp để phân xử.
--   8 "à 27m2" → area_m2=27.
--
-- bedrooms  1 fact `so_phong_ngu` | admin. 2 số nguyên đầu câu. 3 1..20 (CHECK
--   sẵn có). 4 ngoài dải → BỎ. 5 mới nhất thắng. 6 facts. 7 như area_m2. 8 3→4 đổi.
-- floor     1 fact `tang` | admin. 3 0..80. còn lại như bedrooms.
-- direction 1 fact `huong` | admin. 3 chuỗi 2..40 ký tự. còn lại như bedrooms.
--
-- ward
--   1 fact `phuong` (chủ) | form admin | regex câu rao (lúc INSERT).
--   2 chuan_hoa_phuong(): rút số → 'Phường N'; không số thì giữ tên chữ
--     (hạ xuống tầng cột ở 20260828f, xem lý do ở đó).
--   3 'Phường 1'..'Phường 25' hoặc tên chữ 2..50 ký tự.  4 khác → BỎ.
--   5 theo bậc ưu tiên.  6 facts.  7 listings.ward_source.  8 A→B đổi được.
--
-- property_type
--   1 fact `loai_bds` (chủ) | form admin | guess_property_type (suy đoán).
--   2 guess_property_type_answer().  3 enum property_type.
--   4 không đoán ra → BỎ, hỏi lại (chat-reply đã làm).  5 theo bậc ưu tiên;
--   suy đoán CHỈ điền khi đang null/chua_ro.  6 facts.
--   7 listings.property_type_source.  8 chua_ro→nha_pho đổi + source lên chu_xac_nhan.

-- ─────────────────────────────────────────────────────────────────────────────
-- (1) PROVENANCE cho hai trường còn lại có đường SUY ĐOÁN cạnh tranh.
-- Chỉ thêm cho price và ward — đúng hai trường mà regex câu rao có ghi vào
-- (chat-reply lúc tạo tin nháp). area_m2/bedrooms/floor/direction không có
-- đường suy đoán nào nên thêm cột source cho chúng là thêm thứ không ai đọc.
alter table public.listings
  add column price_source text not null default 'suy_doan'
    check (price_source in ('suy_doan', 'chu_xac_nhan', 'admin')),
  add column ward_source  text not null default 'suy_doan'
    check (ward_source  in ('suy_doan', 'chu_xac_nhan', 'admin'));

comment on column public.listings.price_source is
  'FR-164: ai chot price_raw — suy_doan (regex cau rao) / chu_xac_nhan (fact gia) / admin (form). Bac: chu_xac_nhan > admin > suy_doan.';
comment on column public.listings.ward_source is
  'FR-164: ai chot ward — suy_doan (regex cau rao) / chu_xac_nhan (fact phuong) / admin (form).';

-- Bậc ưu tiên thành SỐ để so sánh được trong SQL. Một chỗ định nghĩa duy nhất.
create or replace function public.bac_nguon(p_source text)
returns int
language sql
immutable
as $$
  select case p_source
    when 'chu_xac_nhan' then 3   -- chinh chu: nguoi dang o trong nha
    when 'admin'        then 2   -- admin nhat tu nguon thu ba (FR-156)
    else 1                       -- suy_doan: regex/AI
  end;
$$;

comment on function public.bac_nguon(text) is
  'FR-164: bac uu tien nguon du lieu. chu_xac_nhan(3) > admin(2) > suy_doan(1).';

-- ─────────────────────────────────────────────────────────────────────────────
-- (2) CHUẨN HOÁ PHƯỜNG. Chủ nhà gõ "p8", "phuong 8", "Phường 8" đều là một chỗ.
create or replace function public.chuan_hoa_phuong(p_text text)
returns text
language sql
immutable
as $$
  select case
    when p_text is null or btrim(p_text) = '' then null
    -- Có số → 'Phường N' (1..25; Q5 có 1..16, chừa chỗ cho OPEN-27 mở địa bàn)
    when (regexp_match(public.bo_dau(p_text), '(?:phuong|p)\s*\.?\s*([0-9]{1,2})'))[1] is not null
     and ((regexp_match(public.bo_dau(p_text), '(?:phuong|p)\s*\.?\s*([0-9]{1,2})'))[1])::int between 1 and 25
      then 'Phường ' || ((regexp_match(public.bo_dau(p_text), '(?:phuong|p)\s*\.?\s*([0-9]{1,2})'))[1])::int
    -- Số trần ("8") khi câu chỉ có mỗi con số
    when btrim(p_text) ~ '^[0-9]{1,2}$' and btrim(p_text)::int between 1 and 25
      then 'Phường ' || btrim(p_text)::int
    -- Tên chữ (phường có tên, sau này mở địa bàn) — giữ nguyên văn
    when length(btrim(p_text)) between 2 and 50 then btrim(p_text)
    else null
  end;
$$;

comment on function public.chuan_hoa_phuong(text) is
  'FR-164: chuan hoa cau tra loi phuong ve dang "Phuong N" (1..25) hoac giu ten chu.';

-- ─────────────────────────────────────────────────────────────────────────────
-- (3) MỘT QUYẾT ĐỊNH ĐĂNG TIN DUY NHẤT.
--
-- Trước bản này BA nơi độc lập cùng quyết định, mỗi nơi chép lại luật:
--   * trg_listings_autopublish  — AFTER UPDATE OF area_m2, price_vnd, ward
--   * trg_listing_facts_touch_status — AFTER INSERT trên listing_facts (!)
--   * khối inline trong listings_normalize_status (BEFORE INS/UPD)
-- Nghĩa là quyết định đăng phụ thuộc THỨ TỰ TRIGGER CHÉO BẢNG: fact ghi trước
-- hay cột ghi trước ra kết quả khác nhau, và sửa luật phải nhớ sửa cả ba.
--
-- Nay: MỘT hàm luật + MỘT trigger BEFORE trên chính `listings`. Fact chỉ còn
-- việc ghi cột; ghi xong thì trigger của listings tự chạy. Không còn đường nào
-- từ bảng khác thò tay vào `status`.
create or replace function public.listing_du_dang_tin(
  p_price_vnd bigint, p_area_m2 numeric, p_ward text
) returns boolean
language sql
immutable
as $$
  select p_price_vnd is not null
     and p_area_m2  is not null
     and p_ward     is not null and btrim(p_ward) <> '';
$$;

comment on function public.listing_du_dang_tin(bigint, numeric, text) is
  'FR-164: LUAT DANG TIN DUY NHAT — du gia + dien tich + phuong thi len ke duoc.';

create or replace function public.listings_quyet_dinh_dang_tin()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare v_du boolean := public.listing_du_dang_tin(new.price_vnd, new.area_m2, new.ward);
begin
  if v_du and new.status = 'cho_thong_tin' then
    new.status := 'dang_ban';                 -- đủ thông tin → lên kệ
  elsif not v_du and new.status = 'dang_ban' then
    -- HẠ KỆ: tin mất dữ liệu bắt buộc thì không được nằm trên kệ nói dối.
    -- CHỈ hạ từ 'dang_ban'. 'dang_quan_tam' (khách đang hỏi), 'da_chot', 'an'
    -- là trạng thái có người/việc bám vào — không tự động đụng.
    new.status := 'cho_thong_tin';
  end if;
  return new;
end $function$;

drop trigger if exists trg_zz_listings_dang_tin on public.listings;
create trigger trg_zz_listings_dang_tin
  before insert or update on public.listings
  for each row execute function public.listings_quyet_dinh_dang_tin();

-- Gỡ hai nhà chức trách còn lại.
drop trigger if exists trg_listings_autopublish on public.listings;
drop trigger if exists trg_listing_facts_touch_status on public.listing_facts;

-- `listings_normalize_status` chỉ còn việc CHUẨN HOÁ tên trạng thái cũ
-- (unverified/draft/active/sold…), bỏ hẳn khúc tự đăng.
create or replace function public.listings_normalize_status()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  new.status := case coalesce(new.status, 'cho_thong_tin')
    when 'unverified'     then 'cho_thong_tin'
    when 'draft'          then 'cho_thong_tin'
    when 'pending_review' then 'cho_thong_tin'
    when 'active'         then 'dang_ban'
    when 'negotiating'    then 'dang_quan_tam'
    when 'sold'           then 'da_chot'
    when 'expired'        then 'an'
    when 'hidden'         then 'an'
    else new.status end;
  return new;
end $function$;

-- Giữ `listings_try_publish` làm cửa tương thích cho đường gọi cũ: nó không
-- còn tự quyết gì, chỉ chạm vào dòng để trigger quyết định chạy.
create or replace function public.listings_try_publish(p_listing_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  update public.listings set id = id where id = p_listing_id;
$function$;

comment on function public.listings_try_publish(uuid) is
  'FR-164 [tuong thich]: khong con quyet dinh gi — cham dong de trg_zz_listings_dang_tin chay.';

-- ─────────────────────────────────────────────────────────────────────────────
-- (4) FACT → CỘT: thêm `gia`, `phuong`, và vá lỗ diện tích chung cư.
--
-- Ba thay đổi so với bản FR-163:
--   (a) `gia`   → price_raw (giữ nguyên văn) + price_source, có VALIDATE bằng
--       parse_vnd: câu không ra số hoặc số vô lý thì BỎ, không đụng cột — thà
--       thiếu giá còn hơn sai giá.
--   (b) `phuong` → ward qua chuan_hoa_phuong().
--   (c) `dien_tich_tim_tuong` → area_m2 CHỈ KHI là chung cư. Với chung cư đó là
--       diện tích chính danh và là fact diện tích DUY NHẤT trong required_facts
--       — không nối dây thì tin chung cư KHÔNG BAO GIỜ đủ điều kiện lên kệ.
--       Với nhà phố/biệt thự thì tim tường vẫn không được đè (giữ luật FR-163).
--   Ba trường có provenance thì áp BẬC ƯU TIÊN: fact của chủ (chu_xac_nhan, bậc
--   3) luôn ≥ mọi nguồn đang giữ nên luôn ghi được — nhưng luật viết bằng
--   `bac_nguon` để đường ghi khác (nếu sau này có) không phá được thứ tự.
create or replace function public.listing_facts_sync_cols()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_txt   text := coalesce(new.answer, '');
  v_num   numeric;
  v_pt    public.property_type;
  v_ward  text;
  v_vnd   bigint;
  v_ptype public.property_type;
  -- Fact do chính chủ trả lời trong hội thoại là 'chu_xac_nhan'; nguồn khác
  -- (import) không được leo bậc.
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
    -- Chỉ chung cư: tim tường LÀ diện tích chính danh của căn hộ.
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
    -- price_raw giữ NGUYÊN VĂN lời chủ; price_vnd do trigger giá dẫn xuất.
    -- parse_vnd ở đây chỉ để KIỂM: không ra số thì không ghi gì.
    v_vnd := public.parse_vnd(v_txt);
    if v_vnd is not null and v_vnd between 100000000 and 1000000000000 then
      update listings set price_raw = btrim(v_txt), price_source = v_bac
       where id = new.listing_id
         and public.bac_nguon(v_bac) >= public.bac_nguon(price_source)
         and (price_raw is distinct from btrim(v_txt) or price_source is distinct from v_bac);
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
$function$;

comment on function public.listing_facts_sync_cols() is
  'FR-164: fact -> cot quyen uy. Fact moi nhat cua chu thang; bac uu tien chu_xac_nhan > admin > suy_doan; gia/phuong/dien tich co validate, sai thi BO chu khong ghi bay.';

revoke execute on function public.listing_facts_sync_cols() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- (5) MỘT CỬA GHI FACT cho mọi đường gọi (edge function, script, admin).
-- Có cửa chung thì luật kiểm/chuẩn hoá nằm một chỗ, và nơi gọi không phải biết
-- bảng nào cần ghi — đúng bài học FR-157(b): nhét luật vào một đường gọi là
-- những đường khác vẫn làm theo kiểu riêng.
create or replace function public.ghi_fact_listing(
  p_listing_id uuid, p_question text, p_answer text, p_source text default 'seller_chat'
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_id uuid;
begin
  if p_listing_id is null or coalesce(btrim(p_answer), '') = '' then
    return null;
  end if;
  insert into listing_facts (listing_id, question, answer, source)
  values (p_listing_id, btrim(p_question), btrim(p_answer),
          coalesce(nullif(btrim(p_source), ''), 'seller_chat'))
  returning id into v_id;
  return v_id;
end $fn$;

comment on function public.ghi_fact_listing(uuid, text, text, text) is
  'FR-164: cua duy nhat de ghi bang chung hoi thoai. Trigger sync tu lo chuan hoa + do bac uu tien.';

revoke all on function public.ghi_fact_listing(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ghi_fact_listing(uuid, text, text, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- (6) CHUẨN HOÁ LẠI GIÁ KHI parse_vnd ĐỔI — theo lô, không khoá cả bảng.
--
-- KHÔNG thêm cột `parser_version`, và đây là lý do: từ FR-163 `price_vnd` là
-- hàm thuần của `price_raw`, tính lại ở MỌI insert/update. Không có giá trị nào
-- "sinh ra bởi parser cũ rồi mắc kẹt" cần đánh dấu — chạm dòng là nó tự đúng
-- theo parser hiện tại. Cột version sẽ là thứ phải tự nhớ cập nhật, mà thứ
-- không ai cập nhật thì đóng băng rồi nói dối (vết `sellers.rating_sum`).
--
-- Chiến lược an toàn: gọi hàm này sau khi đổi parse_vnd. Mỗi lô là một
-- transaction ngắn, chỉ chạm dòng có price_vnd LỆCH so với parser mới → chạy
-- lần hai là no-op. Trigger đăng tin ở (3) tự chạy theo, nên tin nào đổi trạng
-- thái vì giá mới cũng được xử đúng.
create or replace function public.chuan_hoa_lai_gia(p_batch int default 200)
returns int
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare n int;
begin
  with lech as (
    select id from listings
     where price_raw is not null and btrim(price_raw) <> ''
       and price_vnd is distinct from public.parse_vnd(price_raw)
     order by id
     limit greatest(1, p_batch)
  )
  update listings l set price_raw = l.price_raw   -- chạm để trigger tính lại
    from lech where l.id = lech.id;
  get diagnostics n = row_count;
  return n;
end $fn$;

comment on function public.chuan_hoa_lai_gia(int) is
  'FR-164: sau khi doi parse_vnd, goi lap lai theo lo toi khi tra ve 0. Chi cham dong co price_vnd lech — chay lai la no-op.';

revoke all on function public.chuan_hoa_lai_gia(int) from public, anon, authenticated;
grant execute on function public.chuan_hoa_lai_gia(int) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- (7) admin_dang_tin: đánh dấu nguồn cho giá và phường khi form có đưa.
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

  insert into listings (
    code, seller_id, deal, district, ward, ward_source, location_raw,
    area_m2, price_raw, price_source, bedrooms,
    property_type, property_type_source, description, source, status
  ) values (
    null,
    v_seller,
    coalesce(nullif(p->>'deal', ''), 'ban')::listing_deal,
    'Quận 5',
    nullif(btrim(p->>'ward'), ''),
    case when nullif(btrim(p->>'ward'), '') is not null then 'admin' else 'suy_doan' end,
    nullif(btrim(p->>'location_raw'), ''),
    nullif(p->>'area_m2', '')::numeric,
    nullif(btrim(p->>'price_raw'), ''),
    case when nullif(btrim(p->>'price_raw'), '') is not null then 'admin' else 'suy_doan' end,
    nullif(p->>'bedrooms', '')::int,
    coalesce(nullif(p->>'property_type', ''), 'chua_ro')::property_type,
    case when nullif(p->>'property_type', '') is not null then 'admin' else 'suy_doan' end,
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
