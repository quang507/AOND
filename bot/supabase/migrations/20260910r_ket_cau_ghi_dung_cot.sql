-- 20260910r — CÂU TRẢ LỜI SỐ TẦNG GHI VÀO CỘT CHẾT (D3, đo bằng tầng ba).
--
-- Kịch bản hành vi số 3 chạy thật 10/09: bot hỏi kết cấu, chủ nhà gõ "3",
-- rồi `listings.floors` VẪN NULL. Bản vá `20260910n` chỉ đúng một nửa — nó cho
-- khoá `ket_cau` đi chung nhánh với `tang`, nhưng nhánh đó ghi vào cột `floor`:
--
--     update listings set floor = v_num::int … where id = new.listing_id …
--
-- Bảng có CẢ HAI cột: `floor` (int, không ai đọc) và `floors` (int, thứ mà web,
-- `ro_hang_ban.ket_cau` và `diem_tin` đọc). Đo trên chính tin thử:
--     code=BDS-NP-Q5-0002 · floor=3 · floors=NULL · floors_text=NULL
-- Câu trả lời của chủ nhà rơi vào cột chết, và vì dòng `listing_facts` đã tồn
-- tại nên `listing_missing_facts` coi câu này ĐÃ trả lời — không hỏi lại.
-- Chủ nhà tin là đã khai, hệ thống tin là đã hỏi, cột thì trống. Không có gì
-- kêu, ở cả ba tầng.
--
-- Bài học đáng ghi hơn cả bản vá: đọc mã nguồn không bắt được lỗi này. `floor`
-- và `floors` khác nhau đúng một chữ cái, `tsc` không soi SQL, mock e2e không
-- chạy trigger. Chỉ có bắn tin thật rồi đọc cột thật mới thấy.

do $do$
declare v_src text; v_moi text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'listing_facts_sync_cols' limit 1;

  if position('set floor = v_num::int' in v_src) = 0 then
    raise notice 'listing_facts_sync_cols khong con ghi vao cot floor, bo qua';
  else
    -- Ghi vào `floors`, và điền luôn `floors_text` khi còn trống — cột đó là thứ
    -- `ro_hang_ban.ket_cau` in ra cho người đọc.
    v_moi := replace(
      v_src,
      'update listings set floor = v_num::int, specs_source = bac' || chr(10) ||
      '       where id = new.listing_id and (floor is null or de);',
      'update listings set floors = v_num::int,' || chr(10) ||
      '             floors_text = coalesce(floors_text,' || chr(10) ||
      '               case when v_num::int <= 1 then ''trệt''' || chr(10) ||
      '                    else ''trệt + '' || (v_num::int - 1) || '' lầu'' end),' || chr(10) ||
      '             specs_source = bac' || chr(10) ||
      '       where id = new.listing_id and (floors is null or de);');
    if v_moi = v_src then
      raise exception 'Khong khop nguyen van khoi update — dung lai, dung va mu';
    end if;
    execute v_moi;
  end if;
end $do$;

comment on function public.listing_facts_sync_cols() is
  'Đồng bộ câu trả lời fact xuống cột listings. Khoá `tang`/`ket_cau` ghi vào `floors` '
  '(cột web đọc), KHÔNG phải `floor` — cột đó không ai đọc, và suốt thời gian trước 10/09 '
  'nó nuốt im câu trả lời số tầng của chủ nhà.';

-- Vá dữ liệu đã lỡ rơi vào cột chết. Hôm nay chỉ có tin thử, nhưng viết luôn để
-- lần dựng lại nào cũng nhất quán.
update public.listings
   set floors = floor,
       floors_text = coalesce(floors_text,
         case when floor <= 1 then 'trệt' else 'trệt + ' || (floor - 1) || ' lầu' end)
 where floors is null and floor is not null and floor between 0 and 80;

comment on column public.listings.floor is
  'CỘT CHẾT — không ai đọc. Số tầng thật nằm ở `floors`/`floors_text`. Giữ lại vì dữ liệu '
  'cũ còn trong đó; đừng ghi mới vào đây (soát 10/09, D3).';
