-- 20260918b — FR-211: NHÃN TÌM KIẾM của tin (chủ dự án 18/09/2026: "làm cái gắn nhãn để tìm
-- được luôn đi"). Ý khách nói không có ô (yên tĩnh, gần chợ, xe hơi vào nhà…) từ nay thành nhãn
-- trong từ điển đóng `_shared/extraction/nhan.ts`, ghi vào listings.nhan, lọc bằng `contains`.
-- Từ điển nằm ở TS (một nguồn, web nhập cùng file); DB chỉ giữ mảng + hàm gộp.

alter table public.listings add column if not exists nhan text[] not null default '{}'::text[];
create index if not exists listings_nhan_gin_idx on public.listings using gin (nhan);
comment on column public.listings.nhan is
  'FR-211: nhãn tìm kiếm (yen_tinh, gan_cho, xe_hoi_vao_nha…) — khoá trong từ điển đóng _shared/extraction/nhan.ts; chat-reply gắn từ câu rao, câu trả lời và kiến thức AI đọc thêm (qua ganNhan, tiền định); web/bot lọc bằng contains. Thêm nhãn = sửa từ điển TS, không thêm tay.';

-- Gộp nhãn mới vào tin (không trùng, giữ thứ tự cũ trước). Trả về số nhãn MỚI thêm.
create or replace function public.them_nhan_tin(p_listing_id uuid, p_nhan text[])
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cu  text[];
  v_moi text[] := '{}'::text[];
  n     text;
begin
  if p_listing_id is null or p_nhan is null then return 0; end if;
  select nhan into v_cu from public.listings where id = p_listing_id;
  if v_cu is null then return 0; end if;
  foreach n in array p_nhan loop
    if n is not null and btrim(n) <> '' and not (n = any(v_cu)) and not (n = any(v_moi)) then
      v_moi := v_moi || n;
    end if;
  end loop;
  if array_length(v_moi, 1) is null then return 0; end if;
  update public.listings set nhan = v_cu || v_moi where id = p_listing_id;
  return array_length(v_moi, 1);
end $function$;

revoke all on function public.them_nhan_tin(p_listing_id uuid, p_nhan text[]) from public, anon, authenticated;
grant execute on function public.them_nhan_tin(p_listing_id uuid, p_nhan text[]) to service_role;
