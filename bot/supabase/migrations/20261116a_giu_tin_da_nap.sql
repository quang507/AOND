-- 20261116a (SRS-5.1zzzzzzz501, chủ dự án 16/11/2026): TIN ĐÃ NẠP LÀ KIẾN THỨC LISTING CHUNG CỦA DỰ ÁN — KHÔNG XOÁ.
--
-- "sửa nút đó thành chỉ xóa dữ liệu người nhắn thôi, còn tin đã nạp để test cho thành kiến thức listing chung của dự án luôn, ko xóa gì hết,
--  nếu xóa t nhắn vào claude".
--
-- Chuyện đã xảy ra: 13/11 nạp 962 tin Mogi (`source = 'mogi_thu'`, người bán `thu-mogi`, SRS-474). Job `don-du-lieu-thu` (21:00 mỗi đêm)
-- xoá mọi người bán có ID bắt đầu `thu-` TRỪ người bán có tin `seed_thu` — `thu-mogi` không được chừa nên cả bộ biến mất, không có bản lưu.
-- Nút "XOA HET" ở /admin thì xoá luôn mọi tin rao.
--
-- Luật mới (một nguồn: `la_tin_da_nap`): tin KHÔNG sinh từ chat Zalo (`source <> 'chat_zalo'` — import_excel, seed_thu, mogi_thu, mọi nguồn nạp
-- sau này) là tin đã nạp: được giữ, cùng người bán / ảnh / dữ liệu nội bộ của nó.
--   1. `admin_xoa_het_khach_va_ro_hang` ("XOA HET") chỉ xoá dữ liệu NGƯỜI NHẮN: khách, người bán đang chat, hội thoại, tin nhắn, tin rao sinh từ chat,
--      câu hỏi, lịch hẹn, giao dịch, nhắc. Vẫn chép sang `luu_tru` trước khi xoá (khôi phục được).
--   2. `don_du_lieu_thu` (cron 21:00) cùng luật.
--   3. Chốt chặn cuối: trigger BEFORE DELETE trên `listings` từ chối xoá tin đã nạp, mọi đường (nút admin, SQL tay, hàm khác, xoá người bán).
--      Muốn xoá thật: phiên SQL đặt `set local aond.cho_phep_xoa_tin_da_nap = 'XOA TIN DA NAP'` — chỉ Claude làm khi chủ dự án nhắn.

create or replace function public.la_tin_da_nap(p_source text)
returns boolean
language sql immutable
set search_path to 'pg_catalog'
as $$ select coalesce(p_source, 'import_excel') <> 'chat_zalo' $$;

create or replace function public.chan_xoa_tin_da_nap()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if public.la_tin_da_nap(old.source)
     and coalesce(current_setting('aond.cho_phep_xoa_tin_da_nap', true), '') <> 'XOA TIN DA NAP' then
    raise exception 'tin đã nạp (%) được giữ làm kiến thức listing chung, không xoá — muốn xoá thì nhắn Claude', old.code
      using errcode = '42501';
  end if;
  return old;
end $$;

drop trigger if exists trg_listings_giu_tin_da_nap on public.listings;
create trigger trg_listings_giu_tin_da_nap before delete on public.listings
  for each row execute function public.chan_xoa_tin_da_nap();

create or replace function public.admin_xoa_het_khach_va_ro_hang(p_xac_nhan text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v jsonb := '{}'::jsonb;
  n int;
  v_lan bigint;
begin
  if not (public.la_admin()
          or coalesce(auth.jwt() ->> 'role', '') = 'service_role') then
    raise exception 'chỉ admin được xoá hàng loạt' using errcode = '42501';
  end if;
  if coalesce(p_xac_nhan, '') <> 'XOA HET' then
    raise exception 'phải gõ đúng chữ XOA HET để xác nhận' using errcode = '22023';
  end if;

  -- Tin sinh từ chat thì xoá; tin đã nạp (kiến thức chung) và người bán sở hữu chúng thì giữ.
  create temp table if not exists _tin_xoa on commit drop as
    select id from listings where not public.la_tin_da_nap(source);
  create temp table if not exists _nguoi_xoa on commit drop as
    select s.id from sellers s
     where not exists (select 1 from listings l where l.seller_id = s.id and public.la_tin_da_nap(l.source));

  -- Chép sang kho lưu TRƯỚC khi xoá, cùng giao dịch (một lần xoá = một `lan`); chép hỏng thì không xoá gì.
  insert into luu_tru.lan_xoa (ai) values (coalesce(auth.uid()::text, session_user)) returning lan into v_lan;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'sellers', to_jsonb(x) from sellers x where x.id in (select id from _nguoi_xoa);
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'buyers', to_jsonb(x) from buyers x;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'listings', to_jsonb(x) from listings x where x.id in (select id from _tin_xoa);
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'listing_noi_bo', to_jsonb(x) from listing_noi_bo x where x.listing_id in (select id from _tin_xoa);
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'listing_media', to_jsonb(x) from listing_media x where x.listing_id in (select id from _tin_xoa);
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'listing_views', to_jsonb(x) from listing_views x where x.listing_id in (select id from _tin_xoa);
  insert into luu_tru.ban_ghi (lan, bang, du_lieu)
    select v_lan, 'property_events', to_jsonb(x) from property_events x
     where x.listing_id in (select id from _tin_xoa) or x.buyer_id is not null;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'conversations', to_jsonb(x) from conversations x;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'messages', to_jsonb(x) from messages x;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'info_requests', to_jsonb(x) from info_requests x;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'interests', to_jsonb(x) from interests x;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'viewings', to_jsonb(x) from viewings x;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'deals', to_jsonb(x) from deals x;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'curated_lists', to_jsonb(x) from curated_lists x;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu) select v_lan, 'chat_quota', to_jsonb(x) from chat_quota x;
  insert into luu_tru.ban_ghi (lan, bang, du_lieu)
  select v_lan, 'reminders', to_jsonb(r) from reminders r
   where r.buyer_id is not null or r.seller_id is not null or r.listing_id is not null or r.viewing_id is not null
      or r.kind in ('promise', 'reengage', 'viewing', 'followup', 'match', 'feedback', 'sold', 'rating');
  v := v || jsonb_build_object('luu_tru_lan', v_lan);

  -- `where true` ở các câu xoá cả bảng: role `authenticator` nạp `safeupdate`, DELETE không WHERE bị chặn khi gọi qua PostgREST (22/09/2026).
  delete from messages where true;               get diagnostics n = row_count; v := v || jsonb_build_object('messages', n);
  delete from info_requests where true;          get diagnostics n = row_count; v := v || jsonb_build_object('info_requests', n);
  delete from listing_media where listing_id in (select id from _tin_xoa);
                                                 get diagnostics n = row_count; v := v || jsonb_build_object('listing_media', n);
  delete from listing_views where listing_id in (select id from _tin_xoa);
                                                 get diagnostics n = row_count; v := v || jsonb_build_object('listing_views', n);
  delete from property_events where listing_id in (select id from _tin_xoa) or buyer_id is not null;
                                                 get diagnostics n = row_count; v := v || jsonb_build_object('property_events', n);
  delete from interests where true;              get diagnostics n = row_count; v := v || jsonb_build_object('interests', n);
  delete from reminders
   where buyer_id is not null or seller_id is not null or listing_id is not null or viewing_id is not null
      or kind in ('promise', 'reengage', 'viewing', 'followup', 'match', 'feedback', 'sold', 'rating');
                                                 get diagnostics n = row_count; v := v || jsonb_build_object('reminders', n);
  delete from viewings where true;               get diagnostics n = row_count; v := v || jsonb_build_object('viewings', n);
  delete from deals where true;                  get diagnostics n = row_count; v := v || jsonb_build_object('deals', n);
  delete from curated_lists where true;          get diagnostics n = row_count; v := v || jsonb_build_object('curated_lists', n);
  update sellers set active_listing_id = null where id in (select id from _nguoi_xoa) and active_listing_id is not null;
  delete from listings where id in (select id from _tin_xoa);
                                                 get diagnostics n = row_count; v := v || jsonb_build_object('listings', n);
  delete from conversations where true;          get diagnostics n = row_count; v := v || jsonb_build_object('conversations', n);
  delete from chat_quota where true;             get diagnostics n = row_count; v := v || jsonb_build_object('chat_quota', n);
  delete from buyers where true;                 get diagnostics n = row_count; v := v || jsonb_build_object('buyers', n);
  delete from sellers where id in (select id from _nguoi_xoa);
                                                 get diagnostics n = row_count; v := v || jsonb_build_object('sellers', n);
  v := v || jsonb_build_object('tin_da_nap_giu', (select count(*) from listings));

  insert into bot_health (who, at) values ('xoa_het', now())
    on conflict (who) do update set at = excluded.at;
  insert into app_config (key, value, ghi_chu) values ('xoa_het_lan_cuoi',
          format('%s: %s', to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'), v::text),
          'FR-210: lần xoá dữ liệu người nhắn gần nhất (nút ở /admin, tab CRM); tin đã nạp được giữ — SRS-501.')
    on conflict (key) do update set value = excluded.value, ghi_chu = excluded.ghi_chu;
  update luu_tru.lan_xoa set so_dong = v where lan = v_lan;
  return v;
end $function$;

create or replace function public.don_du_lieu_thu()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tin int := 0; v_tin_nhan int := 0; v_nguoi int := 0; v_khach int := 0;
begin
  -- 20260922f: hàm xoá dữ liệu, mở cho authenticated — chỉ admin, service_role hoặc cron (postgres) được gọi.
  if not (public.la_admin() or coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin')) then
    raise exception 'don_du_lieu_thu: chi admin' using errcode = '42501';
  end if;
  -- 20260929a (FR-245): ID thử đọc từ MỘT chỗ (`la_id_thu`).
  -- 20261116a (SRS-5.1zzzzzzz501): người bán sở hữu TIN ĐÃ NẠP (`la_tin_da_nap`: seed_thu, mogi_thu, import_excel…) không phải dữ liệu thử để dọn —
  -- bản 20261025f chỉ chừa `seed_thu`, nên người bán `thu-mogi` (ID bắt đầu `thu-`) bị dọn cùng 962 tin Mogi.
  create temp table if not exists _nguoi_thu on commit drop as
    select s.id from sellers s
     where public.la_id_thu(s.zalo_user_id)
       and not exists (select 1 from listings l where l.seller_id = s.id and public.la_tin_da_nap(l.source));
  create temp table if not exists _khach_thu on commit drop as
    select id from buyers
     where public.la_id_thu(zalo_user_id);
  create temp table if not exists _tin_thu on commit drop as
    select id from listings where seller_id in (select id from _nguoi_thu) and not public.la_tin_da_nap(source);
  create temp table if not exists _conv_thu on commit drop as
    select id from conversations
     where seller_id in (select id from _nguoi_thu) or buyer_id in (select id from _khach_thu);

  delete from messages       where conversation_id in (select id from _conv_thu);
  get diagnostics v_tin_nhan = row_count;
  delete from info_requests  where listing_id in (select id from _tin_thu);
  delete from listing_media  where listing_id in (select id from _tin_thu);
  delete from listing_views  where listing_id in (select id from _tin_thu);
  delete from property_events where listing_id in (select id from _tin_thu);
  delete from interests      where listing_id in (select id from _tin_thu)
                                or buyer_id in (select id from _khach_thu);
  delete from viewings       where listing_id in (select id from _tin_thu)
                                or buyer_id in (select id from _khach_thu);
  delete from reminders      where seller_id in (select id from _nguoi_thu)
                                or buyer_id in (select id from _khach_thu)
                                or listing_id in (select id from _tin_thu);
  update sellers set active_listing_id = null where id in (select id from _nguoi_thu);
  delete from listings       where id in (select id from _tin_thu);
  get diagnostics v_tin = row_count;
  delete from conversations  where id in (select id from _conv_thu);
  delete from chat_quota     where public.la_id_thu(zalo_user_id);
  delete from buyers         where id in (select id from _khach_thu);
  get diagnostics v_khach = row_count;
  delete from sellers        where id in (select id from _nguoi_thu);
  get diagnostics v_nguoi = row_count;

  insert into bot_health (who, at) values ('don_thu', now())
    on conflict (who) do update set at = excluded.at;
  insert into app_config (key, value) values ('don_thu_lan_cuoi',
          format('%s: %s tin · %s tin nhắn · %s người bán · %s khách',
                 to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
                 v_tin, v_tin_nhan, v_nguoi, v_khach))
    on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('tin', v_tin, 'tin_nhan', v_tin_nhan,
                            'nguoi_ban', v_nguoi, 'khach', v_khach);
end $function$;
