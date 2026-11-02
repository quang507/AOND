-- 20261102a_go_media_cu — chủ dự án 02/11/2026 ("gỡ hết mấy thứ đó", bảng đề xuất tầng DB ở PR dọn tàn dư TypeScript): gỡ đối tượng DB
-- không còn ai đọc. Đếm trên DB thật 02/11: bảng `media` 0 dòng (ảnh căn nay ở `listing_media`), view `public_media` 0 dòng, view
-- `ro_hang_ban` (đã có `so.ro_hang` thay), hàm `kd_ten()` và `tim_nghia_san_sang()` 0 chỗ gọi (code, view, hàm, cron, policy).
-- `media` 0 dòng nên không chép sang `luu_tru` (không có gì để giữ). Hai hàm xoá / khôi phục khách vẫn liệt kê `media` — định nghĩa lại
-- trước, bỏ `media` khỏi danh sách (bản ghi `media` cũ trong `luu_tru.ban_ghi`, nếu có, không khôi phục nữa vì bảng không còn).

CREATE OR REPLACE FUNCTION public.admin_xoa_het_khach_va_ro_hang(p_xac_nhan text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb := '{}'::jsonb;
  n int;
  v_lan bigint;
  t text;
begin
  if not (public.la_admin()
          or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
          or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'chỉ admin được xoá hàng loạt' using errcode = '42501';
  end if;
  if coalesce(p_xac_nhan, '') <> 'XOA HET' then
    raise exception 'phải gõ đúng chữ XOA HET để xác nhận' using errcode = '22023';
  end if;

  -- 20260929b (FR-245, chủ dự án 29/09: "xóa data để test thì data thật cũng nên để sang 1 chỗ" → chọn "chép sang kho lưu
  -- rồi mới xóa"): CHÉP mọi dòng sắp xoá sang `luu_tru.ban_ghi` (một lần xoá = một `lan`) TRƯỚC khi xoá, cùng giao dịch —
  -- chép hỏng thì không xoá gì. Khôi phục: `admin_khoi_phuc_lan_xoa(lan)`. Kho lưu nằm CÙNG DB: đỡ được bấm nút xoá,
  -- không đỡ được mất cả DB (không có sao lưu ngoài — OPEN-25).
  insert into luu_tru.lan_xoa (ai) values (coalesce(auth.uid()::text, current_user)) returning lan into v_lan;
  foreach t in array array['sellers', 'buyers', 'listings', 'conversations', 'messages', 'info_requests', 'listing_media', 'listing_views', 'property_events', 'interests',
                           'viewings', 'deals', 'curated_lists', 'chat_quota', 'listing_noi_bo'] loop
    execute format('insert into luu_tru.ban_ghi (lan, bang, du_lieu) select $1, %L, to_jsonb(x) from public.%I x', t, t)
      using v_lan;
  end loop;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu)
  select v_lan, 'reminders', to_jsonb(r) from reminders r
   where r.buyer_id is not null or r.seller_id is not null or r.listing_id is not null or r.viewing_id is not null
      or r.kind in ('promise', 'reengage', 'viewing', 'followup', 'match', 'feedback', 'sold', 'rating');
  v := v || jsonb_build_object('luu_tru_lan', v_lan);

  -- `where true` ở mọi câu xoá: role `authenticator` nạp `safeupdate`, câu DELETE không WHERE
  -- bị chặn khi hàm được gọi qua PostgREST (22/09/2026, nút /admin từng đổ lỗi này).
  delete from messages where true;               get diagnostics n = row_count; v := v || jsonb_build_object('messages', n);
  delete from info_requests where true;          get diagnostics n = row_count; v := v || jsonb_build_object('info_requests', n);
  delete from listing_media where true;          get diagnostics n = row_count; v := v || jsonb_build_object('listing_media', n);
  delete from listing_views where true;          get diagnostics n = row_count; v := v || jsonb_build_object('listing_views', n);
  delete from property_events where true;        get diagnostics n = row_count; v := v || jsonb_build_object('property_events', n);
  delete from interests where true;              get diagnostics n = row_count; v := v || jsonb_build_object('interests', n);
  delete from reminders
   where buyer_id is not null or seller_id is not null or listing_id is not null or viewing_id is not null
      or kind in ('promise', 'reengage', 'viewing', 'followup', 'match', 'feedback', 'sold', 'rating');
                                                 get diagnostics n = row_count; v := v || jsonb_build_object('reminders', n);
  delete from viewings where true;               get diagnostics n = row_count; v := v || jsonb_build_object('viewings', n);
  delete from deals where true;                  get diagnostics n = row_count; v := v || jsonb_build_object('deals', n);
  delete from curated_lists where true;          get diagnostics n = row_count; v := v || jsonb_build_object('curated_lists', n);
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
  update luu_tru.lan_xoa set so_dong = v where lan = v_lan;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.admin_khoi_phuc_lan_xoa(p_lan bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb := '{}'::jsonb;
  n int;
  t text;
  v_cot text;
  v_r text;
begin
  if not (public.la_admin()
          or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
          or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'chỉ admin được khôi phục' using errcode = '42501';
  end if;
  if not exists (select 1 from luu_tru.lan_xoa where lan = p_lan) then
    raise exception 'không có lần xoá %', p_lan using errcode = '22023';
  end if;
  -- Dòng khôi phục là dữ liệu CŨ: không cho trigger chạy lại (gửi tin, hỏi bù, cấp mã mới…) và không kiểm khoá ngoại theo
  -- thứ tự (sellers ↔ listings vòng tròn qua active_listing_id).
  set local session_replication_role = replica;
  foreach t in array array['sellers', 'buyers', 'listings', 'conversations', 'messages', 'info_requests', 'listing_media', 'listing_views', 'property_events', 'interests',
                           'viewings', 'deals', 'curated_lists', 'chat_quota', 'reminders', 'listing_noi_bo'] loop
    -- Cột sinh (generated) không chèn được — chỉ lấy cột thường của bảng HIỆN TẠI.
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum), string_agg('r.' || quote_ident(a.attname), ', ' order by a.attnum)
      into v_cot, v_r
      from pg_attribute a
     where a.attrelid = format('public.%I', t)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
    execute format(
      'insert into public.%I (%s) select %s from luu_tru.ban_ghi b, jsonb_populate_record(null::public.%I, b.du_lieu) r
        where b.lan = $1 and b.bang = %L on conflict do nothing', t, v_cot, v_r, t, t)
      using p_lan;
    get diagnostics n = row_count;
    v := v || jsonb_build_object(t, n);
  end loop;
  update luu_tru.lan_xoa set khoi_phuc_luc = now() where lan = p_lan;
  return v;
end $function$
;

drop view if exists public.public_media;
drop view if exists public.ro_hang_ban;
drop table if exists public.media;
drop function if exists public.kd_ten(text);
drop function if exists public.tim_nghia_san_sang();
