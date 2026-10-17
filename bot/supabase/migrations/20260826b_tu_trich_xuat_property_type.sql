-- FR-150 (a) — bản tham chiếu của migration ĐÃ ÁP LÊN Supabase 26/08/2026.
--
-- Quyết định chủ dự án: "Property type thì nó tự trích xuất ra chứ hỏi làm gì,
-- khó lắm mới hỏi nhé." Trước đó bot hỏi `loai_bds` với MỌI tin chưa rõ loại.
--
-- Cái bẫy đã xử lý: tin NHÀ ở Quận 5 rất hay ghi "DT đất 25.5m²" / "Diện tích
-- đất 4x16". Bắt chữ "đất" thô là gán nhầm hàng trăm căn nhà thành `dat`.
-- Nhánh 'dat' vì vậy vừa đòi cụm rao-bán-đất, vừa phủ định dấu hiệu công
-- trình (trệt/lầu/tầng/PN/WC).
--
-- Kết quả backfill trên kho thật: 173 tin → đoán được 164
-- (nha_pho 141, chung_cu 16, nha_cap4 2, biet_thu 2, phong_tro 2, mat_bang 1);
-- 9 tin còn `chua_ro` đúng là 9 tin rỗng, chưa có mô tả nào để mà đoán.

-- 1) Bộ trích xuất DÙNG CHUNG (trigger, backfill, và chat-reply gọi qua RPC).
create or replace function public.guess_property_type(p_text text)
returns public.property_type
language sql
immutable
as $$
  select case
    when p_text is null or btrim(p_text) = '' then null
    -- thứ tự = độ đặc hiệu giảm dần
    when p_text ~* '(phòng trọ|nhà trọ|dãy trọ|khu trọ|phòng cho thuê)' then 'phong_tro'
    when p_text ~* '(biệt thự|villa)'                                   then 'biet_thu'
    when p_text ~* 'mặt bằng'                                            then 'mat_bang'
    when p_text ~* '(chung cư|căn hộ|penthouse|duplex|officetel)'        then 'chung_cu'
    when p_text ~* '(cấp 4|cấp bốn)'                                     then 'nha_cap4'
    -- "đất" CHỈ tính khi rao bán đất, và KHÔNG có dấu hiệu công trình.
    -- Rất nhiều tin nhà ghi "DT đất 25.5m²" — bắt thô là gán nhầm hết.
    when p_text ~* '(đất nền|lô đất|nền đất|bán đất|đất thổ cư|đất trống)'
         and p_text !~* '(trệt|lầu|tầng|phòng ngủ|\mPN\M|\mWC\M)'        then 'dat'
    when p_text ~* '(nhà|trệt|lầu|tầng|hẻm|mặt tiền|\mHXH\M|\mMT\M)'     then 'nha_pho'
    else null
  end::public.property_type;
$$;

-- 1b) Bản đọc CÂU TRẢ LỜI của người bán cho câu hỏi `loai_bds`.
-- Khác bản trên (đọc CẢ CÂU RAO nên phải siết nhánh 'dat'): ở đây người bán
-- đang trả lời ĐÚNG câu hỏi loại, nên một chữ trần "đất" / "trọ" / "nền" đã đủ
-- nghĩa. Guard phủ định trệt/lầu/tầng/PN/WC vẫn giữ để "đất có nhà cấp 4,
-- 1 trệt" không bị đọc thành đất trống.
-- Thiếu hàm này thì câu trả lời cụt trả null → chat-reply vẫn ghi fact
-- `loai_bds` → view hết hỏi → tin kẹt `chua_ro` vĩnh viễn.
create or replace function public.guess_property_type_answer(p_text text)
returns public.property_type
language sql
immutable
as $$
  select coalesce(
    (case
      when p_text is null or btrim(p_text) = ''                       then null
      when p_text ~* '\mtrọ\M|phòng cho thuê'                          then 'phong_tro'
      when p_text ~* '(biệt thự|villa)'                                then 'biet_thu'
      when p_text ~* '(mặt bằng|\mmb\M)'                               then 'mat_bang'
      when p_text ~* '(chung cư|căn hộ|penthouse|duplex|officetel|\mcc\M)' then 'chung_cu'
      when p_text ~* '(cấp 4|cấp bốn)'                                 then 'nha_cap4'
      when p_text ~* '\m(đất|nền|thổ cư)\M'
           and p_text !~* '(trệt|lầu|tầng|phòng ngủ|\mPN\M|\mWC\M)'    then 'dat'
      when p_text ~* '\mnhà\M|nhà phố|nhà riêng|nhà hẻm'               then 'nha_pho'
      else null
    end)::public.property_type,
    public.guess_property_type(p_text)
  );
$$;

comment on function public.guess_property_type_answer(text) is
  'FR-150: doc cau tra loi loai_bds cua nguoi ban (chap nhan tu don: dat, tro, nen).';

-- 2) Gắn vào đường đi dữ liệu: tin mới (chat FR-144, /quan-ly, import) tự có
--    loại, không ai phải điền tay. Chỉ đụng khi cột còn trống hoặc 'chua_ro'
--    nên loại do người sửa tay không bao giờ bị đè.
create or replace function public.listings_fill_property_type()
returns trigger
language plpgsql
as $$
declare
  g public.property_type;
begin
  if new.property_type is null or new.property_type = 'chua_ro' then
    g := public.guess_property_type(
      coalesce(new.description, '') || ' ' || coalesce(new.location_raw, '')
    );
    if g is not null then
      new.property_type := g;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.listings_fill_property_type() is
  'FR-150: tu dien listings.property_type tu description/location_raw khi con trong hoac chua_ro.';

drop trigger if exists trg_listings_fill_property_type on public.listings;
create trigger trg_listings_fill_property_type
  before insert or update of description, location_raw, property_type
  on public.listings
  for each row
  execute function public.listings_fill_property_type();

-- 3) Backfill kho cũ.
update public.listings l
set property_type = g.pt
from (
  select id,
         public.guess_property_type(
           coalesce(description, '') || ' ' || coalesce(location_raw, '')
         ) as pt
  from public.listings
  where property_type is null or property_type = 'chua_ro'
) g
where l.id = g.id and g.pt is not null;
