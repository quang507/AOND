-- 20260929a — FR-245: tách dữ liệu THỬ khỏi dữ liệu THẬT + máy soi dữ liệu tin hằng ngày.
-- Nguồn: chủ dự án 29/09/2026 — "giờ xóa data để test thì data thật cũng nên để sang 1 chỗ, trong code cũng dc làm 2 đi,
-- xong mày tự fix".
--
-- (1) `la_id_thu(zalo)` là chỗ DUY NHẤT nói Zalo ID nào là ID thử. Khách thật đến qua Zalo có ID toàn chữ số; ID thử mở
--     bằng tiền tố chữ + gạch. Trước bản này hai danh sách tiền tố viết tay (dọn đêm + e2e) lệch với ID bắn thử
--     production (lx-, do-), và `reset_nguoi_test` xoá được CẢ ID khách thật.
-- (2) `soat_du_lieu_tin()` soi dữ liệu tin THẬT (bỏ tin của ID thử) tìm dấu vết các lỗi bóc tách đã gặp: giá dính chữ,
--     giá không đọc ra số, địa chỉ dính phường, diện tích lệch ngang × dài, fact bằng NGUYÊN câu rao, fact còn tiếng đệm.
--     Chỉ trả MÃ TIN + MÃ LỖI, không trả nội dung (kết quả có thể nằm trong log Actions của repo công khai).
--     Cron `soat-du-lieu-tick` 08:05 giờ VN: có chỗ nghi lỗi thì một tin 🔎 cho admin (kind `report`, đường escalation-feed).

create or replace function public.la_id_thu(p text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $function$
  select coalesce(p ~ '^(thu-|b15-|hoi-|z-|e2e-|b-|lx-|do-)', false)
$function$;
comment on function public.la_id_thu(text) is
  'FR-245: Zalo ID này có phải ID THỬ không. Chỗ duy nhất giữ danh sách tiền tố — thêm tiền tố thử mới là sửa ở đây.';

CREATE OR REPLACE FUNCTION public.don_du_lieu_thu()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tin int := 0; v_tin_nhan int := 0; v_nguoi int := 0; v_khach int := 0; v_pf int := 0;
begin
  -- 20260922f: hàm xoá dữ liệu, mở cho authenticated — chỉ admin, service_role hoặc cron (postgres) được gọi.
  if not (public.la_admin() or coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'don_du_lieu_thu: chi admin' using errcode = '42501';
  end if;
  -- 20260929a (FR-245): ID thử đọc từ MỘT chỗ (`la_id_thu`) — trước đây hai danh sách tiền tố viết tay ở đây lệch với
  -- ID bắn thử production (lx-, do-), nên dữ liệu thử đó không bao giờ được dọn.
  create temp table if not exists _nguoi_thu on commit drop as
    select id from sellers
     where public.la_id_thu(zalo_user_id);
  create temp table if not exists _khach_thu on commit drop as
    select id from buyers
     where public.la_id_thu(zalo_user_id);
  create temp table if not exists _tin_thu on commit drop as
    select id from listings where seller_id in (select id from _nguoi_thu);
  create temp table if not exists _conv_thu on commit drop as
    select id from conversations
     where seller_id in (select id from _nguoi_thu) or buyer_id in (select id from _khach_thu);

  delete from messages       where conversation_id in (select id from _conv_thu);
  get diagnostics v_tin_nhan = row_count;
  delete from project_facts  where listing_id in (select id from _tin_thu);
  get diagnostics v_pf = row_count;
  delete from listing_facts  where listing_id in (select id from _tin_thu);
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

  --  chỉ có (who, at, last_id) — dấu thời gian ở đó, còn con số thì
  -- vào  để sáng hôm sau còn đọc được đêm qua dọn những gì.
  insert into bot_health (who, at) values ('don_thu', now())
    on conflict (who) do update set at = excluded.at;
  insert into app_config (key, value) values ('don_thu_lan_cuoi',
          format('%s: %s tin · %s tin nhắn · %s người bán · %s khách · %s fact dự án',
                 to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
                 v_tin, v_tin_nhan, v_nguoi, v_khach, v_pf))
    on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('tin', v_tin, 'tin_nhan', v_tin_nhan,
                            'nguoi_ban', v_nguoi, 'khach', v_khach, 'fact_du_an', v_pf);
end $function$;

CREATE OR REPLACE FUNCTION public.xoa_nguoi_theo_zalo(p_zalo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sellers uuid[]; v_buyers uuid[]; v_listings uuid[]; v_convs uuid[];
  n_listings int := 0; n_msgs int := 0; n_convs int := 0; n_sellers int := 0; n_buyers int := 0;
begin
  if coalesce(btrim(p_zalo), '') = '' then return jsonb_build_object('ok', false, 'ly_do', 'thiếu zalo'); end if;
  select coalesce(array_agg(id), '{}') into v_sellers from sellers where zalo_user_id = p_zalo;
  select coalesce(array_agg(id), '{}') into v_buyers  from buyers  where zalo_user_id = p_zalo;
  select coalesce(array_agg(id), '{}') into v_listings from listings where seller_id = any(v_sellers);
  select coalesce(array_agg(id), '{}') into v_convs from conversations where seller_id = any(v_sellers) or buyer_id = any(v_buyers);
  delete from deals where listing_id = any(v_listings) or buyer_id = any(v_buyers);
  delete from viewings where listing_id = any(v_listings) or buyer_id = any(v_buyers);
  delete from listing_views where listing_id = any(v_listings);
  delete from info_requests where listing_id = any(v_listings) or buyer_id = any(v_buyers);
  delete from messages where conversation_id = any(v_convs);
  get diagnostics n_msgs = row_count;
  delete from conversations where id = any(v_convs);
  get diagnostics n_convs = row_count;
  update sellers set active_listing_id = null where id = any(v_sellers);
  delete from listings where id = any(v_listings);
  get diagnostics n_listings = row_count;
  delete from sellers where id = any(v_sellers);
  get diagnostics n_sellers = row_count;
  delete from buyers where id = any(v_buyers);
  get diagnostics n_buyers = row_count;
  delete from chat_quota where zalo_user_id = p_zalo;
  return jsonb_build_object('ok', true, 'listings', n_listings, 'messages', n_msgs,
    'conversations', n_convs, 'sellers', n_sellers, 'buyers', n_buyers);
end $function$;
revoke all on function public.xoa_nguoi_theo_zalo(text) from public, anon, authenticated;
grant execute on function public.xoa_nguoi_theo_zalo(text) to service_role;
comment on function public.xoa_nguoi_theo_zalo(text) is
  'FR-245: xoá một người (bán + mua) theo Zalo ID, mọi dữ liệu kèm theo. Chỉ gọi qua admin_xoa_khach (admin) hoặc reset_nguoi_test (ID thử).';

CREATE OR REPLACE FUNCTION public.reset_nguoi_test(p_zalo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- 20260929a (FR-245): công cụ THỬ chỉ xoá được ID thử. Trước đây hàm xoá sạch bất kỳ Zalo ID nào đưa vào — gõ nhầm một
  -- ID khách thật là mất tin, hội thoại, người bán của khách đó (không còn sao lưu, CLAUDE.md §6). Admin xoá khách thật
  -- theo yêu cầu đi đường `admin_xoa_khach` (→ `xoa_nguoi_theo_zalo`).
  if coalesce(btrim(p_zalo), '') = '' then return jsonb_build_object('ok', false, 'ly_do', 'thiếu zalo'); end if;
  if not public.la_id_thu(p_zalo) then
    return jsonb_build_object('ok', false, 'ly_do', 'không phải ID thử (la_id_thu) — chặn xoá dữ liệu thật');
  end if;
  return public.xoa_nguoi_theo_zalo(p_zalo);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_xoa_khach(p_zalo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.la_admin() then
    raise exception 'chỉ admin được xoá khách' using errcode = '42501';
  end if;
  return public.xoa_nguoi_theo_zalo(p_zalo);
end $function$;

create or replace function public.soat_du_lieu_tin()
returns table(ma text, loi text)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with tin as (
    select l.id, l.code, l.price_raw, l.price_vnd, l.location_raw, l.ward, l.area_m2, l.frontage_m, l.length_m, l.description
      from listings l join sellers s on s.id = l.seller_id
     where not public.la_id_thu(s.zalo_user_id) and l.status <> 'an'
  ), fact_moi as (
    select distinct on (f.listing_id, f.question) f.listing_id, f.question, f.answer
      from listing_facts f join tin on tin.id = f.listing_id
     order by f.listing_id, f.question, f.created_at desc
  )
  select t.code, 'gia_dinh_phi' from tin t
   where t.price_raw ~* '(^|\s)ph[ií]\s+(qu[ảa]n\s+l[ýy]|ql|d[ịi]ch\s+v[ụu]|b[ảa]o\s+tr[ìi])'
  union all
  select t.code, 'gia_khong_doc' from tin t
   where t.price_raw is not null and t.price_vnd is null
  union all
  select t.code, 'dia_chi_dinh_phuong' from tin t
   where t.location_raw ~* '(^|\s)(phường|phuong|p\.?)\s*[0-9]{1,2}\s*$'
  union all
  select t.code, 'dien_tich_lech' from tin t
   where t.area_m2 > 0 and t.frontage_m > 0 and t.length_m > 0
     and abs(t.area_m2 - t.frontage_m * t.length_m) > 0.25 * t.area_m2
  union all
  select t.code, 'fact_ca_cau:' || f.question from fact_moi f join tin t on t.id = f.listing_id
   where f.question in ('phap_ly', 'phi_quan_ly', 'ket_cau', 'vi_tri', 'huong', 'noi_that', 'tang')
     and length(f.answer) >= 40 and t.description is not null and btrim(f.answer) = btrim(t.description)
  union all
  select t.code, 'fact_tieng_dem:' || f.question from fact_moi f join tin t on t.id = f.listing_id
   where f.question in ('ket_cau', 'phap_ly', 'huong', 'vi_tri') and f.answer ~* '^(à|ừ|ờ|thôi|nhầm)[\s,]'
$function$;
revoke all on function public.soat_du_lieu_tin() from public, anon, authenticated;
grant execute on function public.soat_du_lieu_tin() to service_role;
comment on function public.soat_du_lieu_tin() is
  'FR-245: dấu vết lỗi bóc tách trên tin THẬT (bỏ ID thử). Chỉ trả mã tin + mã lỗi, không nội dung. Chỉ service_role.';

create or replace function public.soat_du_lieu_tick()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare v_n int; v_tom text;
begin
  select coalesce(sum(so), 0), string_agg(loi || ' ' || so, ', ' order by so desc)
    into v_n, v_tom
    from (select split_part(x.loi, ':', 1) as loi, count(*) as so from public.soat_du_lieu_tin() x group by 1) g;
  if v_n = 0 then return 0; end if;
  -- Một tin mỗi ngày: tin hôm trước chưa gửi thì thay, không chất đống.
  update reminders set status = 'cancelled'
   where kind = 'report' and status = 'pending' and note like '🔎%';
  insert into reminders (kind, due_at, note)
  values ('report', now(), format('🔎 Soát dữ liệu tin: %s chỗ nghi lỗi (%s). Xem: select * from soat_du_lieu_tin();', v_n, v_tom));
  return v_n;
end $function$;
revoke all on function public.soat_du_lieu_tick() from public, anon, authenticated;
comment on function public.soat_du_lieu_tick() is
  'FR-245: cron 08:05 giờ VN — có chỗ nghi lỗi trong soat_du_lieu_tin() thì một tin 🔎 cho admin (kind report).';

select cron.unschedule(jobid) from cron.job where jobname = 'soat-du-lieu-tick';
select cron.schedule('soat-du-lieu-tick', '5 1 * * *', 'select public.soat_du_lieu_tick()');
