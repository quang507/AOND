-- 20261025f — Lịch dọn dữ liệu thử KHÔNG xoá rổ tin mẫu `seed_thu` (SRS-5.1zzzzzzz179 mục 1, 25/10/2026).
-- Ca gốc: `app_config.don_thu_lan_cuoi` = "2026-10-24 21:00: 242 tin · 0 tin nhắn · 1 người bán · 0 khách" — lịch `don-du-lieu-thu` (14:00 UTC
-- mỗi ngày) gọi `don_du_lieu_thu()`, hàm xoá mọi tin của người bán có `la_id_thu(zalo_user_id)`; người bán mẫu `thu-seed-001` mang tiền tố
-- `thu-` nên bị coi là dữ liệu thử → 242 tin mẫu + người bán bị xoá sạch, bot phía mua chỉ còn 1 căn để gợi ý. Đây cũng là lý do "30 tin nạp tay
-- mất khỏi DB, nguyên nhân chưa biết" (SRS-5.1zzzzzzz167). CLAUDE.md đã ghi luật "làm sạch thì đừng đụng `listings` `source = 'seed_thu'`" nhưng
-- hàm này viết trước luật đó.
-- Sửa: tin `source = 'seed_thu'` và người bán đang sở hữu tin đó nằm NGOÀI mọi bảng tạm của lượt dọn. Phần còn lại giữ nguyên 20260929a.
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
  if not (public.la_admin() or coalesce(auth.role(), '') = 'service_role' or current_user in ('postgres', 'supabase_admin')) then
    raise exception 'don_du_lieu_thu: chi admin' using errcode = '42501';
  end if;
  -- 20260929a (FR-245): ID thử đọc từ MỘT chỗ (`la_id_thu`).
  -- 20261025f (SRS-5.1zzzzzzz179): người bán giữ rổ mẫu `seed_thu` KHÔNG phải dữ liệu thử để dọn — bỏ khỏi `_nguoi_thu`, tin mẫu bỏ khỏi `_tin_thu`.
  create temp table if not exists _nguoi_thu on commit drop as
    select s.id from sellers s
     where public.la_id_thu(s.zalo_user_id)
       and not exists (select 1 from listings l where l.seller_id = s.id and l.source = 'seed_thu');
  create temp table if not exists _khach_thu on commit drop as
    select id from buyers
     where public.la_id_thu(zalo_user_id);
  create temp table if not exists _tin_thu on commit drop as
    select id from listings where seller_id in (select id from _nguoi_thu) and coalesce(source, '') <> 'seed_thu';
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
comment on function public.don_du_lieu_thu() is
  '[HỆ THỐNG] Dọn dữ liệu của ID thử (la_id_thu) — lịch don-du-lieu-thu 14:00 UTC. KHÔNG đụng tin mẫu listings.source = seed_thu và người bán của chúng (20261025f).';
