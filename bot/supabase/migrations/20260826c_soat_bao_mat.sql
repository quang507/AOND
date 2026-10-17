-- Bản tham chiếu của 2 migration bảo mật ĐÃ ÁP LÊN Supabase 26/08/2026.
--
-- Bối cảnh: anon key (`sb_publishable_…`) là key CÔNG KHAI — nó nằm trong
-- bundle JS của web và trong `bot/bridge-zca/index.mjs`. Ai mở web cũng lấy
-- được. Repo để private KHÔNG làm nó bí mật. Vậy nên RLS + GRANT là bức tường
-- duy nhất, và soát ngày 26/08 thấy 6 chỗ thủng.
--
-- Tin tốt: `get_secret()` (cửa đọc Vault, giữ ANTHROPIC_API_KEY) chỉ cấp cho
-- `postgres` và `service_role` — anon chưa bao giờ chạm được. Kiểm lại ở
-- TS-SEC-09.

-- ─────────────────────────────────────────────────────────────────────────
-- LỖ 1 (NẶNG) — `reminders` không bật RLS, mà anon có full DML.
-- Ai cầm anon key cũng đọc được trích đoạn tin nhắn khách + ghi chú
-- escalation, và DELETE được cả hàng đợi nhắc việc (giết luôn đường báo
-- CTV/admin). Không tạo policy: chỉ service_role (bot) được dùng bảng này.
alter table public.reminders enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- LỖ 2 (NẶNG) — view SECURITY DEFINER đi vòng RLS.
-- `public_listings` = `SELECT … FROM listings` KHÔNG lọc trạng thái, mà view
-- definer chạy bằng quyền chủ view → anon đọc được cả tin nháp `cho_thong_tin`
-- lẫn tin đã ẩn, bất chấp policy `anon_read_listings`.
-- Web không dùng 3 view này (đã grep app/, lib/, components/) → khoá hẳn.
alter view public.public_listings       set (security_invoker = on);
alter view public.public_media          set (security_invoker = on);
alter view public.listing_missing_facts set (security_invoker = on);
revoke all on public.public_listings, public.public_media, public.listing_missing_facts
  from anon, authenticated;

-- `agents_public` và `listing_photos_v` GIỮ security definer có chủ đích:
--   agents_public chỉ lộ tên NMG + số tin (không SĐT), là nguồn trang /moi-gioi;
--   listing_photos_v chỉ đọc path của bucket VỐN ĐÃ công khai.
-- Đổi sang invoker là hỏng hai trang đó. Nhưng cấm ghi:
revoke insert, update, delete, truncate on public.agents_public, public.listing_photos_v
  from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- LỖ 3 (NẶNG) — mọi hàm SECURITY DEFINER để PUBLIC execute.
-- Nghĩa là người lạ gọi thẳng REST:
--   /rest/v1/rpc/seller_drip_tick  → ép bot nhắn tin hàng loạt cho người bán
--   /rest/v1/rpc/ctv_report_tick   → spam báo cáo vào Zalo cá nhân admin
--   /rest/v1/rpc/mark_listing_interest → đổi trạng thái tin tuỳ ý
-- Bot và cron chạy bằng service_role/postgres (Supabase cấp EXECUTE riêng cho
-- service_role) nên thu hồi ở đây không ảnh hưởng gì. Làm theo vòng lặp để
-- khỏi lệch chữ ký hàm.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- LỖ 4 (VỪA) — anon có INSERT/UPDATE/DELETE/TRUNCATE trên MỌI bảng public.
-- Hôm nay RLS chặn lại, nhưng chỉ cần một bảng quên bật RLS (đúng như lỗ 1)
-- là thủng ngay. Web chưa bao giờ ghi bằng vai anon → thu hồi sạch.
revoke insert, update, delete, truncate on all tables in schema public from anon;
-- authenticated vẫn cần ghi (buyers, listings nháp, listing_views) — policy gác;
-- riêng TRUNCATE thì không vai nào cần.
revoke truncate on all tables in schema public from authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- LỖ 5 (VỪA) — policy `anon_read_listing_facts` là USING (true).
-- Fact là chữ chính chủ gõ trong Zalo (địa chỉ chi tiết, số nhà, đôi khi cả
-- SĐT), mà policy cũ cho đọc fact của MỌI tin kể cả tin nháp chưa lên kệ.
drop policy if exists anon_read_listing_facts on public.listing_facts;
create policy anon_read_listing_facts on public.listing_facts
  for select to anon, authenticated
  using (
    question not in ('hinh_anh', 'dia_chi_chi_tiet')
    and exists (
      select 1 from public.listings l
      where l.id = listing_facts.listing_id
        and l.status in ('dang_ban', 'dang_quan_tam', 'da_chot')
    )
  );
-- Kèm ở tầng web: `app/nha-dat/[code]/page.tsx` in `f.answer` NGUYÊN VĂN —
-- đã bọc `sanitizeDescription()` như description (FR-104).

-- ─────────────────────────────────────────────────────────────────────────
-- LỖ 6 (THẤP, nhưng là đường leo thang quyền) — hàm SECURITY DEFINER không
-- ghim search_path: role nào tạo được object trong schema nằm trên search_path
-- có thể chèn hàm giả và chạy bằng quyền postgres.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and coalesce(array_to_string(p.proconfig, ','), '') !~ 'search_path'
  loop
    execute format('alter function %s set search_path = public, pg_temp', f.sig);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────
-- KIỂM CHỨNG (TS-SEC, docs/10 §10.7) — đóng vai anon rồi thử phá.
-- Dán nguyên khối vào SQL Editor; cột ket_qua phải khớp cột mong đợi.
--
-- create temp table kq(buoc text, ket_qua text); grant all on kq to anon;
-- do $$
-- declare n int;
-- begin
--   set local role anon;
--   begin select count(*) into n from public.reminders;
--     insert into kq values ('TS-SEC-01 reminders SELECT', n || ' dòng');       -- mong đợi: 0
--   exception when others then insert into kq values ('TS-SEC-01','BỊ CHẶN'); end;
--   begin delete from public.reminders;
--     insert into kq values ('TS-SEC-02 DELETE reminders','XOÁ ĐƯỢC');          -- mong đợi: BỊ CHẶN
--   exception when others then insert into kq values ('TS-SEC-02','BỊ CHẶN'); end;
--   begin select count(*) into n from public.public_listings;
--     insert into kq values ('TS-SEC-03 public_listings', n || ' dòng');        -- mong đợi: BỊ CHẶN
--   exception when others then insert into kq values ('TS-SEC-03','BỊ CHẶN'); end;
--   begin perform public.seller_drip_tick();
--     insert into kq values ('TS-SEC-04 seller_drip_tick','CHẠY ĐƯỢC');         -- mong đợi: BỊ CHẶN
--   exception when others then insert into kq values ('TS-SEC-04','BỊ CHẶN'); end;
--   begin insert into public.listings(code, deal, district) values ('ZZ','ban','Q5');
--     insert into kq values ('TS-SEC-05 INSERT listings','GHI ĐƯỢC');           -- mong đợi: BỊ CHẶN
--   exception when others then insert into kq values ('TS-SEC-05','BỊ CHẶN'); end;
--   select count(*) into n from public.listings;
--     insert into kq values ('TS-SEC-07 listings SELECT', n || ' dòng');        -- mong đợi: chỉ tin đang hiện
--   reset role;
-- end $$;
-- select * from kq;
--
-- Kết quả chạy thật 26/08/2026: reminders 0 dòng · public_listings/RPC/INSERT/
-- UPDATE/DELETE đều BỊ CHẶN · sellers, ctvs, messages đều 0 dòng ·
-- listings 164/173 (9 tin nháp đã khuất) · agents_public, listing_photos_v,
-- projects vẫn đọc được (web không hỏng).
