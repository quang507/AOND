-- 20260902a — Gán nhãn chính chủ / môi giới NGAY lúc bóc tách
--
-- QUYẾT ĐỊNH CHỦ DỰ ÁN 02/09/2026: "Gán nhãn khi ai bóc tách là họ có bds muốn
-- bán". Tức là: ai nói mình CÓ bất động sản muốn bán thì là CHÍNH CHỦ (ccrb);
-- chỉ khi họ tự xưng môi giới ("em là sale", "bán giúp chủ", "môi giới") mới là
-- môi giới (nmg). Nhãn gán ngay lúc hồ sơ mở từ chat, không để `unknown` rồi
-- chờ ai đó gán sau.
--
-- VÌ SAO PHẢI CÓ NHÃN NGAY. Nhãn quyết định mức phí (BR-05: chính chủ 1%, môi
-- giới 0,5%) và được đọc lúc khách đồng ý chốt (FR-142). Bản 20260901d để
-- `unknown` cho hồ sơ mở từ chat; hệ quả (FR-170 f) là deal không có mức phí,
-- phải chờ người thật gán — mà trong khi chờ thì chẳng ai biết deal đó đang
-- thiếu phí. Gán ngay lúc bóc tách là đóng cái lỗ đó ở gốc.
--
-- HAI LUẬT NHỎ, CỐ Ý:
--   * `on conflict … do update` chỉ nâng `unknown` → nhãn mới, KHÔNG ghi đè nhãn
--     đã có: admin đã gán tay thì lời tự xưng trong chat không được lật.
--   * Mặc định `ccrb` khi người gọi không truyền: hồ sơ mở từ chat mà không có
--     tín hiệu môi giới thì là chính chủ — đúng chữ quyết định ở trên.
--
-- Chữ ký cũ (một tham số) bỏ hẳn: chat-reply chưa deploy nên chưa ai gọi.

drop function if exists public.mo_ho_so_nguoi_ban(text);

create or replace function public.mo_ho_so_nguoi_ban(
  p_zalo_user_id text,
  p_seller_type  seller_type default 'ccrb'
)
returns table(id uuid, name text, active_listing_id uuid, seller_type seller_type)
language sql
security definer
set search_path to 'public'
as $$
  insert into sellers (zalo_user_id, seller_type)
  values (p_zalo_user_id, coalesce(p_seller_type, 'ccrb'))
  on conflict (zalo_user_id) do update
    set seller_type = case
      when sellers.seller_type = 'unknown' then excluded.seller_type
      else sellers.seller_type
    end
  returning sellers.id, sellers.name, sellers.active_listing_id, sellers.seller_type;
$$;

comment on function public.mo_ho_so_nguoi_ban(text, seller_type) is
  'FR-159: mở (hoặc lấy lại) hồ sơ người bán theo zalo_user_id khi người nhắn tự '
  'nhận có BĐS, kèm NHÃN gán lúc bóc tách (mặc định ccrb; nmg khi tự xưng môi '
  'giới). Idempotent; chỉ nâng unknown → nhãn, không ghi đè nhãn đã có. Chỉ '
  'chat-reply gọi, chỉ service_role.';

revoke execute on function public.mo_ho_so_nguoi_ban(text, seller_type)
  from public, anon, authenticated;
