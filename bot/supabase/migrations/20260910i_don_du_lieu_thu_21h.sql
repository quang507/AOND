-- 20260910i — DỌN DỮ LIỆU THỬ LÚC 21 GIỜ MỖI TỐI (FR-197).
--
-- Chủ dự án 10/09/2026: "ko xóa, có script xóa thì chạy trong khoảng 9h tối nhé".
-- Ban ngày còn nhắn thử thì cứ để đó mà xem; tối dọn một lượt cho sạch rổ.
--
-- CHỈ DỌN NGƯỜI THỬ. Nhận diện bằng tiền tố Zalo ID: `thu-`, `b15-`, `hoi-`,
-- `z-`, `e2e-`. Khách thật trên Zalo mang ID toàn chữ số (19 chữ số), không bao
-- giờ dính. Dữ liệu thật của công ty không có đường nào rơi vào đây.
--
-- Đếm và ghi lại số dòng đã xoá vào `bot_health(who='don_thu')` — dọn im lặng
-- thì sáng mai không ai biết đêm qua có dọn hay không, mà một hàm cron không để
-- lại dấu vết là một hàm không kiểm được (NFR-18).

create or replace function public.don_du_lieu_thu()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_tin int := 0; v_tin_nhan int := 0; v_nguoi int := 0; v_khach int := 0; v_pf int := 0;
begin
  create temp table if not exists _nguoi_thu on commit drop as
    select id from sellers
     where zalo_user_id ~ '^(thu-|b15-|hoi-|z-|e2e-)';
  create temp table if not exists _khach_thu on commit drop as
    select id from buyers
     where zalo_user_id ~ '^(thu-|b15-|hoi-|z-|e2e-|b-)';
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
  delete from chat_quota     where zalo_user_id ~ '^(thu-|b15-|hoi-|z-|e2e-|b-)';
  delete from buyers         where id in (select id from _khach_thu);
  get diagnostics v_khach = row_count;
  delete from sellers        where id in (select id from _nguoi_thu);
  get diagnostics v_nguoi = row_count;

  -- Bảng bot_health chỉ có (who, at, last_id) — dấu thời gian ở đó, còn con số
  -- thì vào app_config để sáng hôm sau còn đọc được đêm qua dọn những gì.
  insert into bot_health (who, at) values ('don_thu', now())
    on conflict (who) do update set at = excluded.at;
  insert into app_config (key, value) values ('don_thu_lan_cuoi',
          format('%s: %s tin · %s tin nhắn · %s người bán · %s khách · %s fact dự án',
                 to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD HH24:MI'),
                 v_tin, v_tin_nhan, v_nguoi, v_khach, v_pf))
    on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('tin', v_tin, 'tin_nhan', v_tin_nhan,
                            'nguoi_ban', v_nguoi, 'khach', v_khach, 'fact_du_an', v_pf);
end $$;

comment on function public.don_du_lieu_thu() is
  'FR-197: dọn dữ liệu KIỂM THỬ (Zalo ID có tiền tố thu-/b15-/hoi-/z-/e2e-). Khách '
  'thật mang ID toàn chữ số nên không bao giờ dính. Ghi dấu vào bot_health(don_thu).';

revoke execute on function public.don_du_lieu_thu() from public, anon;
grant execute on function public.don_du_lieu_thu() to authenticated, service_role;

-- 21:00 giờ VN = 14:00 UTC.
select cron.unschedule('don-du-lieu-thu') where exists (
  select 1 from cron.job where jobname = 'don-du-lieu-thu');
select cron.schedule('don-du-lieu-thu', '0 14 * * *', $$select public.don_du_lieu_thu()$$);
