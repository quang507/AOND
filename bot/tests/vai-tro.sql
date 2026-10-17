-- vai-tro.sql — ma trận quyền theo VAI, chạy trên DB thật, TỰ CUỘN LẠI.
--
-- ═══════════════ VÌ SAO CÓ FILE NÀY ═══════════════
-- `ts-sec-anon.mjs` (chạy trong CI) chỉ bắn được vai `anon`, vì nó đi qua
-- PostgREST bằng khoá công khai. Bốn vai còn lại — `authenticated` người lạ,
-- người dùng có hồ sơ, admin, `service_role` — chưa từng có ca kiểm nào.
-- Đó là nửa quan trọng hơn: RLS của repo này phân quyền chủ yếu bằng
-- `auth.uid()` và `auth.jwt()->>'email'`, tức toàn bộ luật nằm ở vai
-- `authenticated`.
--
-- CÁCH CHẠY (cần quyền SQL, không chạy được trong CI):
--     Supabase Dashboard → SQL Editor → dán cả file → Run
--     hoặc MCP `execute_sql`.
-- Kết thúc bằng `raise exception` nên MỌI dòng chèn ở trên tự cuộn lại —
-- không để lại rác trên production. KHÔNG dùng `commit` ở đây.
--
-- ĐỌC KẾT QUẢ: mọi dòng phải là `OK`. Một chữ `HONG` là một cửa mở.
--
-- ═══════════════ LUẬT CỦA BÀI KIỂM NÀY ═══════════════
-- Mỗi khẳng định "vai X KHÔNG thấy gì" phải đi kèm ĐỐI CHỨNG DƯƠNG chứng minh
-- dữ liệu có thật và một vai khác THẤY được. Không có đối chứng thì "0 dòng"
-- có thể chỉ là "chưa chèn dữ liệu" — đúng kiểu bài kiểm câm mà repo này đã
-- dính một lần với TS-SEC (báo 24/24 xanh trong lúc proxy chặn sạch).
-- Soát 05/09/2026 đã dùng đúng luật này để BÁC BỎ một giả thuyết của chính
-- người soát: bảy view cấp cho `authenticated` trông như bỏ qua RLS (chủ sở
-- hữu `postgres` có BYPASSRLS), nhưng đối chứng dương cho thấy chúng tự canh
-- cửa ngay trong mệnh đề WHERE. Không có đối chứng thì đã báo nhầm một lỗ.

do $$
declare
  o text := ''; b uuid; c uuid; l uuid; s uuid; n int; t text;
  -- Bảng KHÔNG vai công khai nào được đọc. `admins` và `chat_quota` nằm đây vì
  -- một cái là danh sách người có quyền, một cái là hạn mức chống đốt tiền.
  BANG_KIN text[] := array['buyers','sellers','messages','conversations','inbound_ledger',
                           'inbound_events','media_cleanup_queue','admins','chat_quota'];
  -- View cấp cho `authenticated`. Chủ sở hữu là `postgres` (có BYPASSRLS) nên
  -- chúng KHÔNG được bảo vệ bởi RLS — hàng rào duy nhất là mệnh đề WHERE bên
  -- trong chính view. Vì vậy phải kiểm từng cái, không suy ra từ RLS.
  VIEW_QT  text[] := array['khach_can_nguoi_that','hoi_thoai_phien','bds_hot','ctv_ranks','nmg_hoat_dong'];
begin
  insert into admins (email) values ('vaitro-admin@example.com');
  insert into buyers (zalo_user_id, name, phone) values ('VAITRO-B1','Chi D.','0903xxxxxx') returning id into b;
  insert into sellers (zalo_user_id, name, phone, seller_type) values ('VAITRO-S1','Anh N.','0904xxxxxx','ccrb') returning id into s;
  insert into listings (code, seller_id, status, price_raw, ward) values ('VAITRO-0001', s,'cho_thong_tin','5 ty','Phuong 4') returning id into l;
  insert into conversations (buyer_id, channel, started_at, needs_human, needs_human_at) values (b,'zalo_oa',now(),true,now()) returning id into c;
  insert into messages (conversation_id, sender, body) values (c,'buyer','sdt toi la 0903xxxxxx');
  insert into inbound_ledger (zalo_msg_id, status) values ('VAITRO-M1','completed');
  insert into inbound_events (event_id, zalo_user_id, payload) values ('VAITRO-M1','VAITRO-B1','{"x":1}'::jsonb);
  insert into media_cleanup_queue (bucket, storage_path) values ('listing-public','vaitro/x.jpg');

  select count(*) into n from conversations where id=c;
  o := o || case when n=1 then 'OK' else 'HONG' end || ' [dc]du-lieu-co-that | ';

  -- ══ ANON ══ (khoá công khai — nằm sẵn trong bundle JS của web)
  set local role anon;
  set local request.jwt.claims = '{"role":"anon"}';
  foreach t in array BANG_KIN loop
    begin execute format('select count(*) from public.%I', t) into n;
      o := o || case when n=0 then 'OK' else 'HONG' end || ' anon:'||t||' ';
    exception when insufficient_privilege then o := o || 'OK anon:'||t||'(no-grant) '; end;
  end loop;
  begin execute format('select count(*) from public.listings where id=%L', l) into n;
    o := o || case when n=0 then 'OK' else 'HONG' end || ' anon:tin-chua-dang ';
  exception when insufficient_privilege then o := o || 'OK anon:tin-chua-dang(no-grant) '; end;
  begin insert into listings (code,status) values ('VAITRO-HACK','dang_ban'); o := o||'HONG anon:ghi-listings ';
  exception when others then o := o||'OK anon:ghi-listings '; end;
  begin perform bump_user_quota('x',1); o := o||'HONG anon:bump_user_quota ';
  exception when others then o := o||'OK anon:bump_user_quota '; end;
  begin perform giu_luot_gui('VAITRO-M1'); o := o||'HONG anon:giu_luot_gui ';
  exception when others then o := o||'OK anon:giu_luot_gui '; end;
  begin perform xuat_schema(); o := o||'HONG anon:xuat_schema ';
  exception when others then o := o||'OK anon:xuat_schema '; end;
  o := o || '| ';

  -- ══ NGƯỜI LẠ ĐÃ ĐĂNG NHẬP ══ (ai đăng ký cũng có vai này)
  set local role authenticated;
  set local request.jwt.claims = '{"role":"authenticated","email":"nguoi-la@example.com","sub":"00000000-0000-0000-0000-000000000099"}';
  foreach t in array BANG_KIN loop
    begin execute format('select count(*) from public.%I', t) into n;
      o := o || case when n=0 then 'OK' else 'HONG' end || ' la:'||t||' ';
    exception when insufficient_privilege then o := o || 'OK la:'||t||'(no-grant) '; end;
  end loop;
  foreach t in array VIEW_QT loop
    begin execute format('select count(*) from public.%I', t) into n;
      o := o || case when n=0 then 'OK' else 'HONG' end || ' la:view-'||t||' ';
    exception when insufficient_privilege then o := o || 'OK la:view-'||t||'(no-grant) '; end;
  end loop;
  begin execute format('select count(*) from public.listings where id=%L', l) into n;
    o := o || case when n=0 then 'OK' else 'HONG' end || ' la:tin-chua-dang ';
  exception when insufficient_privilege then o := o || 'OK la:tin-chua-dang(no-grant) '; end;
  begin perform admin_dang_tin('{}'::jsonb); o := o||'HONG la:admin_dang_tin ';
  exception when others then o := o||'OK la:admin_dang_tin '; end;
  begin perform tao_danh_sach(array['VAITRO-0001']); o := o||'HONG la:tao_danh_sach ';
  exception when others then o := o||'OK la:tao_danh_sach '; end;
  o := o || '| ';

  -- ══ ADMIN ══ — toàn ĐỐI CHỨNG DƯƠNG: nếu admin cũng thấy 0 thì mọi số 0 ở
  -- trên chỉ chứng minh "bảng rỗng", không chứng minh "RLS chặn".
  set local request.jwt.claims = '{"role":"authenticated","email":"vaitro-admin@example.com","sub":"00000000-0000-0000-0000-000000000001"}';
  select count(*) into n from buyers where id=b;    o := o || case when n=1 then 'OK' else 'HONG' end || ' [dc]admin:buyers ';
  select count(*) into n from messages;             o := o || case when n>0 then 'OK' else 'HONG' end || ' [dc]admin:messages ';
  select count(*) into n from khach_can_nguoi_that; o := o || case when n>0 then 'OK' else 'HONG' end || ' [dc]admin:view-khach ';
  select count(*) into n from listings where id=l;  o := o || case when n=1 then 'OK' else 'HONG' end || ' [dc]admin:tin-chua-dang ';
  begin execute 'select count(*) from public.inbound_ledger' into n;
    o := o || case when n=0 then 'OK' else 'HONG' end || ' admin:KHONG-doc-inbound_ledger ';
  exception when insufficient_privilege then o := o || 'OK admin:inbound_ledger(no-grant) '; end;
  o := o || '| ';

  -- ══ SERVICE_ROLE ══ — cũng là đối chứng dương: bot phải làm được việc.
  set local role service_role;
  set local request.jwt.claims = '{"role":"service_role"}';
  select count(*) into n from inbound_ledger; o := o || case when n>0 then 'OK' else 'HONG' end || ' [dc]svc:inbound_ledger ';
  select count(*) into n from messages;       o := o || case when n>0 then 'OK' else 'HONG' end || ' [dc]svc:messages ';
  begin perform giu_luot_gui('VAITRO-M1'); o := o||'OK [dc]svc:giu_luot_gui ';
  exception when others then o := o||'HONG svc:giu_luot_gui '; end;

  reset role;
  raise exception 'KQ: %', o;
end $$;
