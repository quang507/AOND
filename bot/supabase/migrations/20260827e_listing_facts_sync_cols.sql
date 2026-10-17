-- FR-153: câu trả lời nhỏ giọt của người bán chảy ngược vào CỘT có cấu trúc.
--
-- Trước bản này, vòng hỏi drip (FR-129/FR-144) đổ mọi câu trả lời vào
-- listing_facts dạng (question, answer) TOÀN CHỮ. Kết quả: người bán khai
-- "3 phòng ngủ" xong web vẫn không lọc được theo phòng ngủ, vì bộ lọc đọc
-- listings.bedrooms — cột đó vẫn NULL (94/173 tin đang NULL lúc viết).
-- Đúng thứ ghi trong components/ListingBrowse.tsx: "Lọc số phòng ngủ chờ dữ
-- liệu có cấu trúc (nằm rải trong listing_facts)".
--
-- chat-reply đã tự ghi cột cho `dien_tich*` và `loai_bds` ngay trong hàm, vì
-- trigger auto-publish phải thấy giá trị mới NGAY lượt đó. Trigger này KHÔNG
-- thay chỗ đó — nó là lưới hứng cho mọi nguồn còn lại (CTV nhập tay, backfill,
-- bridge, lượt import) và cho các fact chưa ai nối dây: phòng ngủ, tầng, hướng.
-- Chỉ ghi khi cột đang trống → không bao giờ đè lên số liệu đã xác minh.
--
-- Cố ý KHÔNG đụng tới `description`: câu rao gốc là văn phong người bán, giữ
-- nguyên văn (FR-104 lọc SĐT lúc render, không sửa dữ liệu). Fact hiển thị ở
-- khối "Thông tin thêm" riêng trên trang tin.

create or replace function public.listing_facts_sync_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txt  text := coalesce(new.answer, '');
  v_num  numeric;
begin
  if new.question = 'so_phong_ngu' then
    -- "3", "3PN", "3 phòng ngủ 2wc" → 3. Không có chữ số thì bỏ qua ("ba phòng").
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 1 and 20 then
      update listings set bedrooms = v_num::int
       where id = new.listing_id and bedrooms is null;
    end if;

  elsif new.question like 'dien_tich%' then
    v_num := nullif(substring(replace(v_txt, ',', '.'), '[0-9]+[.]?[0-9]*'), '')::numeric;
    if v_num is not null and v_num > 5 and v_num < 5000 then
      update listings set area_m2 = v_num
       where id = new.listing_id and area_m2 is null;
    end if;

  elsif new.question = 'tang' then
    -- Chung cư: "tầng 12", "lầu 5". 0 = trệt nên biên dưới là 0, không phải 1.
    v_num := nullif(substring(v_txt, '[0-9]+'), '')::numeric;
    if v_num is not null and v_num between 0 and 80 then
      update listings set floor = v_num::int
       where id = new.listing_id and floor is null;
    end if;

  elsif new.question = 'huong' then
    -- Chuỗi tự do ngắn ("Đông Nam"); dài quá là người bán kể chuyện, không phải hướng.
    if length(btrim(v_txt)) between 2 and 40 then
      update listings set direction = btrim(v_txt)
       where id = new.listing_id and direction is null;
    end if;
  end if;

  return null;  -- AFTER trigger, giá trị trả về bị bỏ qua
end;
$$;

drop trigger if exists trg_listing_facts_sync_cols on public.listing_facts;
create trigger trg_listing_facts_sync_cols
  after insert on public.listing_facts
  for each row execute function public.listing_facts_sync_cols();

comment on function public.listing_facts_sync_cols() is
  'FR-153: đổ fact nhỏ giọt (so_phong_ngu, dien_tich*, tang, huong) sang cột listings khi cột còn trống.';
