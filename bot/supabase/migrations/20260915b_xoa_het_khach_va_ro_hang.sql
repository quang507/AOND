-- 20260915b — FR-210: XOÁ HÀNG LOẠT khách + rổ hàng để test lại từ đầu (15/09/2026).
--
-- Chủ dự án 15/09/2026: "xóa hết data kh và rổ hàng cũ để test lại, thêm 1 nút để
-- xóa hàng loạt ở trang crm".
--
-- Khác `don_du_lieu_thu()` (FR-197: chỉ người thử theo tiền tố Zalo, cron 21:00) và
-- `admin_xoa_khach(p_zalo)` (một khách): hàm này xoá TẤT CẢ khách mua, người bán, tin
-- rao và mọi thứ treo vào họ. Vì thế ba lớp khoá:
--   1. chỉ admin (`la_admin()`), service_role, hoặc chủ DB gọi được — anon bị revoke;
--   2. phải đưa đúng chữ 'XOA HET' — gọi nhầm từ code / bấm nhầm không đủ để xoá;
--   3. trả về số dòng đã xoá và ghi dấu `bot_health(xoa_het)` + `app_config.xoa_het_lan_cuoi`
--      — xoá im lặng là xoá không kiểm được (NFR-18).
--
-- GIỮ LẠI (không phải dữ liệu khách): `projects` (kho dự án), `wards`, `ctvs`,
-- `ctv_daily_reports`, `admins`, `app_config`, `bot_prompts`, `required_facts`,
-- `mau_cau` (mẫu câu chuẩn FR-180 — khoá ngoại set null, câu vẫn còn), `bot_errors`,
-- `bot_usage`, `bot_health`, `inbound_ledger`/`inbound_events` (sổ chống trùng — xoá là
-- tin Zalo cũ giao lại bị xử lý hai lần), `media_cleanup_queue` (hàng đợi dọn file — xoá
-- `listing_media` là trigger tự xếp file vào đây, cron dọn sau), `reminders` KHÔNG gắn
-- khách/tin/lịch (🩺 còi hệ thống, báo cáo CTV).
--
-- Supabase Free KHÔNG có sao lưu (OPEN-25): xoá là mất vĩnh viễn. Nút ở /admin nói rõ.

create or replace function public.admin_xoa_het_khach_va_ro_hang(p_xac_nhan text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v jsonb := '{}'::jsonb;
  n int;
begin
  if not (public.la_admin()
          or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
          or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'chỉ admin được xoá hàng loạt' using errcode = '42501';
  end if;
  if coalesce(p_xac_nhan, '') <> 'XOA HET' then
    raise exception 'phải gõ đúng chữ XOA HET để xác nhận' using errcode = '22023';
  end if;

  delete from messages;                          get diagnostics n = row_count; v := v || jsonb_build_object('messages', n);
  delete from project_facts;                     get diagnostics n = row_count; v := v || jsonb_build_object('project_facts', n);
  delete from listing_facts;                     get diagnostics n = row_count; v := v || jsonb_build_object('listing_facts', n);
  delete from info_requests;                     get diagnostics n = row_count; v := v || jsonb_build_object('info_requests', n);
  delete from listing_media;                     get diagnostics n = row_count; v := v || jsonb_build_object('listing_media', n);
  delete from media;                             get diagnostics n = row_count; v := v || jsonb_build_object('media', n);
  delete from listing_views;                     get diagnostics n = row_count; v := v || jsonb_build_object('listing_views', n);
  delete from property_events;                   get diagnostics n = row_count; v := v || jsonb_build_object('property_events', n);
  delete from interests;                         get diagnostics n = row_count; v := v || jsonb_build_object('interests', n);
  delete from ratings_log;                       get diagnostics n = row_count; v := v || jsonb_build_object('ratings_log', n);
  delete from reminders
   where buyer_id is not null or seller_id is not null or listing_id is not null or viewing_id is not null
      or kind in ('promise', 'reengage', 'viewing', 'followup', 'match', 'feedback', 'sold', 'rating');
                                                 get diagnostics n = row_count; v := v || jsonb_build_object('reminders', n);
  delete from viewings;                          get diagnostics n = row_count; v := v || jsonb_build_object('viewings', n);
  delete from deals;                             get diagnostics n = row_count; v := v || jsonb_build_object('deals', n);
  delete from curated_lists;                     get diagnostics n = row_count; v := v || jsonb_build_object('curated_lists', n);
  delete from boc_tach_bong;                     get diagnostics n = row_count; v := v || jsonb_build_object('boc_tach_bong', n);
  update sellers set active_listing_id = null where active_listing_id is not null;
  delete from listings;                          get diagnostics n = row_count; v := v || jsonb_build_object('listings', n);
  delete from conversations;                     get diagnostics n = row_count; v := v || jsonb_build_object('conversations', n);
  delete from chat_quota;                        get diagnostics n = row_count; v := v || jsonb_build_object('chat_quota', n);
  delete from buyers;                            get diagnostics n = row_count; v := v || jsonb_build_object('buyers', n);
  delete from sellers;                           get diagnostics n = row_count; v := v || jsonb_build_object('sellers', n);

  insert into bot_health (who, at) values ('xoa_het', now())
    on conflict (who) do update set at = excluded.at;
  insert into app_config (key, value, ghi_chu) values ('xoa_het_lan_cuoi',
          format('%s: %s', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'), v::text),
          'FR-210: lần xoá hàng loạt khách + rổ hàng gần nhất (nút ở /admin, tab CRM).')
    on conflict (key) do update set value = excluded.value, ghi_chu = excluded.ghi_chu;
  return v;
end $$;

comment on function public.admin_xoa_het_khach_va_ro_hang(text) is
  'FR-210: xoá HÀNG LOẠT mọi khách mua, người bán, tin rao và thứ treo vào họ (không đụng '
  'dự án, wards, CTV, admin, cấu hình, prompt, mẫu câu, sổ lỗi, sổ chống trùng, còi hệ thống). '
  'Chỉ admin/service_role, phải đưa đúng chữ XOA HET. Trả số dòng đã xoá; dấu ở bot_health(xoa_het).';
revoke execute on function public.admin_xoa_het_khach_va_ro_hang(text) from public, anon;
grant execute on function public.admin_xoa_het_khach_va_ro_hang(text) to authenticated, service_role;
