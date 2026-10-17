-- 20260904h — dọn ba cảnh báo advisor sinh ra từ đợt 04/09 (FR-167).
--
-- (1) Hàm TRIGGER security definer bị phơi ra REST. Supabase cấp EXECUTE cho
--     `public` theo mặc định, nên hàm TẠO MỚI ở `20260904c/d/f` gọi được bằng
--     anon key qua `/rest/v1/rpc/<tên>` (`messages_bump_last_message` là hàm cũ
--     của `20260902d`, cùng cảnh vì chưa ai thu hồi). Hàm trigger cũ khác không
--     dính: `create or replace` giữ nguyên quyền đã thu hồi trước đó, nên
--     `route_info_request`, `notify_info_request_escalation`… vẫn sạch — đã đo.
--     Gọi trực tiếp thì Postgres từ chối ("trigger functions can only be called
--     as triggers") nên không phải lỗ, nhưng luật FR-167 là hàm nội bộ không
--     nằm trên API công khai, và một hàm trigger đổi thành hàm thường sau này
--     thì cửa đã mở sẵn.
-- (2) `thu_muc_dau_uuid` chưa ghim `search_path` (hàm mới của `20260904g`).
-- (3) Ba khoá ngoại chưa có index: xoá một tin / một khách phải quét bảng con.
--     Kho còn nhỏ nên chưa đau, thêm bây giờ rẻ hơn thêm lúc 5.000 tin.

-- ── (1) Thu hồi EXECUTE của các hàm trigger ─────────────────────────────────
do $$
declare
  f text;
  ten text[] := array[
    'trg_property_event()',
    'listings_bao_tin_moi_khop()',
    'listings_bao_can_da_chot()',
    'reminders_hen_hoi_cam_nhan()',
    'reminders_email_voice()',
    'conversations_email_upset()',
    'viewings_bao_ctv_va_email()',
    'messages_bump_last_message()'
  ];
begin
  foreach f in array ten loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- ── (2) Ghim search_path ────────────────────────────────────────────────────
alter function public.thu_muc_dau_uuid(text) set search_path = public;

-- ── (3) Index cho khoá ngoại ────────────────────────────────────────────────
create index if not exists curated_lists_buyer_idx on public.curated_lists (buyer_id);
create index if not exists property_events_buyer_idx on public.property_events (buyer_id);
create index if not exists ratings_log_listing_idx on public.ratings_log (listing_id);
