-- 22/09/2026 — FR-210: nút "Xoá hàng loạt" trên /admin (gọi RPC qua PostgREST bằng JWT admin) đổ
-- "DELETE requires a WHERE clause". Role `authenticator` của Supabase nạp `safeupdate`
-- (session_preload_libraries = supautils, safeupdate) nên MỌI `delete from t;` trần trong hàm —
-- kể cả SECURITY DEFINER — bị chặn khi phiên đi qua API. TS-XOAHET-01 (15/09) xanh vì chạy bằng
-- chủ DB (MCP), không qua API: kiểm không đi đúng cửa người dùng bấm. Vá: thêm `where true`
-- (safeupdate chỉ đòi CÓ mệnh đề WHERE). Bài kiểm phải gọi qua REST bằng JWT admin mới tính.
CREATE OR REPLACE FUNCTION public.admin_xoa_het_khach_va_ro_hang(p_xac_nhan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- `where true` ở mọi câu xoá: role `authenticator` nạp `safeupdate`, câu DELETE không WHERE
  -- bị chặn khi hàm được gọi qua PostgREST (22/09/2026, nút /admin từng đổ lỗi này).
  delete from messages where true;               get diagnostics n = row_count; v := v || jsonb_build_object('messages', n);
  delete from project_facts where true;          get diagnostics n = row_count; v := v || jsonb_build_object('project_facts', n);
  delete from listing_facts where true;          get diagnostics n = row_count; v := v || jsonb_build_object('listing_facts', n);
  delete from info_requests where true;          get diagnostics n = row_count; v := v || jsonb_build_object('info_requests', n);
  delete from listing_media where true;          get diagnostics n = row_count; v := v || jsonb_build_object('listing_media', n);
  delete from media where true;                  get diagnostics n = row_count; v := v || jsonb_build_object('media', n);
  delete from listing_views where true;          get diagnostics n = row_count; v := v || jsonb_build_object('listing_views', n);
  delete from property_events where true;        get diagnostics n = row_count; v := v || jsonb_build_object('property_events', n);
  delete from interests where true;              get diagnostics n = row_count; v := v || jsonb_build_object('interests', n);
  delete from ratings_log where true;            get diagnostics n = row_count; v := v || jsonb_build_object('ratings_log', n);
  delete from reminders
   where buyer_id is not null or seller_id is not null or listing_id is not null or viewing_id is not null
      or kind in ('promise', 'reengage', 'viewing', 'followup', 'match', 'feedback', 'sold', 'rating');
                                                 get diagnostics n = row_count; v := v || jsonb_build_object('reminders', n);
  delete from viewings where true;               get diagnostics n = row_count; v := v || jsonb_build_object('viewings', n);
  delete from deals where true;                  get diagnostics n = row_count; v := v || jsonb_build_object('deals', n);
  delete from curated_lists where true;          get diagnostics n = row_count; v := v || jsonb_build_object('curated_lists', n);
  delete from boc_tach_bong where true;          get diagnostics n = row_count; v := v || jsonb_build_object('boc_tach_bong', n);
  update sellers set active_listing_id = null where active_listing_id is not null;
  delete from listings where true;               get diagnostics n = row_count; v := v || jsonb_build_object('listings', n);
  delete from conversations where true;          get diagnostics n = row_count; v := v || jsonb_build_object('conversations', n);
  delete from chat_quota where true;             get diagnostics n = row_count; v := v || jsonb_build_object('chat_quota', n);
  delete from buyers where true;                 get diagnostics n = row_count; v := v || jsonb_build_object('buyers', n);
  delete from sellers where true;                get diagnostics n = row_count; v := v || jsonb_build_object('sellers', n);

  insert into bot_health (who, at) values ('xoa_het', now())
    on conflict (who) do update set at = excluded.at;
  insert into app_config (key, value, ghi_chu) values ('xoa_het_lan_cuoi',
          format('%s: %s', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'), v::text),
          'FR-210: lần xoá hàng loạt khách + rổ hàng gần nhất (nút ở /admin, tab CRM).')
    on conflict (key) do update set value = excluded.value, ghi_chu = excluded.ghi_chu;
  return v;
end $function$;
