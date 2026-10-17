-- 20260829e — Vá đường drip cho khớp cổng mới (FR-167, hồi quy do chính FR-167 gây ra)
--
-- LỖI NÀY LÀ CỦA TÔI. `20260829d` gắn cổng `x-bridge-secret` cho `ask-seller`
-- nhưng chỉ sửa `nudge_tick` và `ctv_report_tick`. Còn một người gọi thứ ba mà
-- tôi bỏ sót: `ask_seller_drip()` — chính là đường drip FR-129/144, được gọi từ
-- cron `seller-drip-tick` (30 phút) VÀ từ trigger `trg_listing_drip` mỗi lần có
-- tin rao mới. Nó gửi mỗi anon JWT, không có bí mật cổng.
--
-- VÌ SAO KHÔNG AI THẤY: `net.http_post` là bắn-rồi-quên, nên cron vẫn báo
-- `succeeded` kể cả khi edge function trả 403 — đúng cái bẫy NFR-18 đã cảnh báo.
-- Vòng hỏi nhỏ giọt sẽ đứt IM LẶNG: chủ nhà không bao giờ được hỏi thêm, tin
-- nằm mãi ở `cho_thong_tin`, và không một dòng lỗi nào.
--
-- Bắt được nhờ đợt soát truy vết đối chiếu bảng "Cron THẬT đang chạy" trong
-- SRS với danh sách hàm tick đã sửa — chứ không phải nhờ test, vì test của tôi
-- chỉ gọi thẳng `ask-seller` bằng bridge secret và thấy nó qua.
--
-- Nhân tiện bỏ luôn anon JWT nhúng cứng (bản `eyJ…` đời cũ) và dùng
-- `app_config` + publishable key hiện hành, cho khớp mọi tick khác.
create or replace function public.ask_seller_drip(p_listing_id uuid)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select net.http_post(
    url := public.cau_hinh('functions_base_url') || '/ask-seller',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_zmJBmEgFPn3bBKx_1ve6Pg_dXdo4haX',
      'x-bridge-secret', public.get_secret('BRIDGE_SECRET')),
    body := jsonb_build_object('listing_id', p_listing_id, 'mode', 'drip'),
    timeout_milliseconds := 60000
  );
$$;

comment on function public.ask_seller_drip(uuid) is
  'FR-129/144: hỏi nhỏ giọt chính chủ MỘT câu. Gọi từ cron seller-drip-tick và '
  'trigger trg_listing_drip. Phải mang x-bridge-secret vì ask-seller có cổng từ '
  'FR-167 — thiếu là vòng drip đứt IM LẶNG (net.http_post bắn-rồi-quên).';

revoke execute on function public.ask_seller_drip(uuid) from public, anon, authenticated;
grant execute on function public.ask_seller_drip(uuid) to service_role;
