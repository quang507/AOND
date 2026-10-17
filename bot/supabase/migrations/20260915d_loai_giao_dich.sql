-- 20260915d — fact `loai_giao_dich` lật `listings.deal` (15/09/2026, bắn thật C4).
--
-- Vì sao. Chủ nhà đang được hỏi phường, gõ "à mà nhà này cho thuê chứ ko bán, 25 triệu".
-- Bản trước: mảnh đầu vào ô "tiềm năng" (nguyên câu), tin vẫn là tin BÁN, "25 triệu"
-- bị `listing_facts_sync_cols` gạt vì dưới sàn giá bán (100 triệu) — bot lại nói
-- "đã ghi nhận 25 triệu cho thuê". Nay bộ bóc tách trả fact `loai_giao_dich` với
-- đáp án là giá trị enum (`ban` | `cho_thue`); trigger này lật cột và ÁP LẠI fact giá
-- gần nhất theo sàn/trần của loại mới — vì thứ tự ghi fact trong một lượt không
-- đảm bảo (giá có thể được ghi TRƯỚC câu đổi loại).
--
-- Tách hàm riêng thay vì sửa `listing_facts_sync_cols` (8.7 KB): thân hàm đó đang
-- khớp md5 với schema.sql, chép lại toàn bộ chỉ để thêm một nhánh là chỗ dễ lệch.
-- Trigger AFTER INSERT, tên xếp sau `…sync_cols` — cùng một dòng fact chỉ có một
-- trong hai hàm làm việc nên thứ tự không thành vấn đề.

create or replace function public.listing_facts_sync_deal()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_deal public.listing_deal;
  v_gia  text;
  v_vnd  bigint;
  v_raw  text;
begin
  if new.question <> 'loai_giao_dich' then return null; end if;
  v_deal := case when public.bo_dau(coalesce(new.answer, '')) ~ 'thue' then 'cho_thue' else 'ban' end;
  update public.listings set deal = v_deal
   where id = new.listing_id and deal is distinct from v_deal;
  -- Fact giá gần nhất của tin: áp lại theo sàn/trần của loại mới (cùng ngưỡng với
  -- `listing_facts_sync_cols`). Không có fact giá thì thôi.
  select answer into v_gia from public.listing_facts
   where listing_id = new.listing_id and question = 'gia' and id <> new.id
   order by created_at desc limit 1;
  if v_gia is not null then
    v_vnd := public.parse_vnd(v_gia);
    if v_vnd is not null and (
         (v_deal = 'cho_thue' and v_vnd between 1000000 and 10000000000)
      or (v_deal = 'ban' and v_vnd between 100000000 and 1000000000000)
    ) then
      v_raw := public.chuan_hoa_gia_raw(v_gia);
      update public.listings set price_raw = v_raw
       where id = new.listing_id and price_raw is distinct from v_raw;
    end if;
  end if;
  return null;
end;
$$;

comment on function public.listing_facts_sync_deal() is
  '[RỔ HÀNG] 20260915d: fact loai_giao_dich (ban | cho_thue) lật listings.deal và áp lại fact giá gần nhất theo sàn/trần loại mới.';

drop trigger if exists trg_listing_facts_sync_deal on public.listing_facts;
create trigger trg_listing_facts_sync_deal after insert on public.listing_facts
  for each row execute function public.listing_facts_sync_deal();
