-- 20260829f — Vá các lỗi do chính đợt FR-166/167 đẻ ra, tìm thấy khi soát
-- thù địch + hai lượt review diff (29/08/2026).
--
-- Ba việc, đều là lỗi của tôi trong hai bản vá trước:
--   (1) H2 — `nha_viec_nhac` nhả khoá mà KHÔNG kiểm ai đang giữ.
--   (2) H6 — `ask_seller_drip` nhúng cứng publishable key.
--   (3) FR-152 — `bo_dem_nhac_treo()`: đếm việc nằm chờ quá lâu để lộ ra chỗ
--       hỏng im lặng mà (1) cố ý chừa lại.

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) H2 — nhả việc thì phải NHẢ ĐÚNG VIỆC CỦA MÌNH
-- ═══════════════════════════════════════════════════════════════════════════
-- Bản `20260829c` chỉ lọc `where id = p_id and status = 'pending'`, tức nó
-- kiểm DÒNG chứ không kiểm HỢP ĐỒNG THUÊ. Kịch bản hỏng:
--   * worker A giành dòng R (locked_by = A, attempts 1), rồi treo quá hạn thuê;
--   * worker B giành lại R (locked_by = B, attempts 2) và đang chạy;
--   * A tỉnh dậy, không tới được đích, gọi `nha_viec_nhac(R)`;
--   * A xoá khoá của B và trừ luôn lượt của B.
-- Từ đó worker thứ ba giành được R trong khi B vẫn đang làm — đúng cái cảnh
-- `for update skip locked` dựng lên để chặn. Thêm vế `locked_by` là hết.
--
-- `p_worker` để `default null` có chủ ý: migration và bản deploy `nudge` là hai
-- kênh riêng, không khoá được với nhau. Trong khoảng vài giây giữa hai bước,
-- bản `nudge` cũ vẫn gọi một tham số — cho nó chạy như cũ còn hơn ném lỗi.
-- Bỏ `default` này đi sau khi `nudge` mới đã lên và chạy qua một nhịp cron.
drop function if exists public.nha_viec_nhac(uuid);

create or replace function public.nha_viec_nhac(p_id uuid, p_worker text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update reminders
     set locked_at = null,
         locked_by = null,
         attempts  = greatest(attempts - 1, 0)
   where id = p_id
     and status = 'pending'
     and (p_worker is null or locked_by = p_worker);
  if not found then return 'khong_co'; end if;
  return 'da_nha';
end $$;

comment on function public.nha_viec_nhac(uuid, text) is
  'FR-166: nhả một lời nhắc đã giành mà KHÔNG tính một lượt thử, dùng cho việc '
  'worker không thật sự thử được (thiếu đích/thiếu token OA — phần của bridge). '
  'Chỉ nhả khi `locked_by` khớp `p_worker`: nhả nhầm việc của worker khác là mở '
  'đường cho hai worker cùng chạy một dòng.';

revoke execute on function public.nha_viec_nhac(uuid, text) from public, anon, authenticated;
grant  execute on function public.nha_viec_nhac(uuid, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) H6 — thôi nhúng cứng publishable key
-- ═══════════════════════════════════════════════════════════════════════════
-- `20260829e` vá đường drip nhưng thay một khoá nhúng cứng đời cũ bằng một khoá
-- nhúng cứng đời mới — trong đúng cái migration mà comment bảo là đang dọn khoá
-- nhúng cứng. Xoay khoá publishable bây giờ phải viết migration, chuyện đáng lẽ
-- chỉ là sửa một dòng cấu hình. `functions_base_url` ngay dòng trên đã đi qua
-- `app_config` rồi; khoá này đi cùng đường cho hết chuyện.
insert into public.app_config (key, value, ghi_chu)
values (
  'publishable_key',
  'sb_publishable_zmJBmEgFPn3bBKx_1ve6Pg_dXdo4haX',
  'Khoá publishable (công khai, đã nằm trong bundle JS của web). Dùng cho các '
  'hàm DB gọi edge function qua net.http_post. Xoay khoá thì sửa Ở ĐÂY, không '
  'sửa trong thân hàm.'
)
on conflict (key) do update set value = excluded.value, ghi_chu = excluded.ghi_chu;

create or replace function public.ask_seller_drip(p_listing_id uuid)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  select net.http_post(
    url := public.cau_hinh('functions_base_url') || '/ask-seller',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || public.cau_hinh('publishable_key'),
      'x-bridge-secret', public.get_secret('BRIDGE_SECRET')),
    body := jsonb_build_object('listing_id', p_listing_id, 'mode', 'drip'),
    timeout_milliseconds := 60000
  );
$$;

comment on function public.ask_seller_drip(uuid) is
  'FR-129/144: hỏi nhỏ giọt chính chủ MỘT câu. Gọi từ cron seller-drip-tick và '
  'trigger trg_listing_drip. Phải mang x-bridge-secret vì ask-seller có cổng từ '
  'FR-167 — thiếu là vòng drip đứt IM LẶNG (net.http_post bắn-rồi-quên).';

revoke execute on function public.ask_seller_drip(uuid) from public, anon, authenticated;
grant  execute on function public.ask_seller_drip(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) LỘ RA CHỖ (1) CỐ Ý CHỪA: việc nhả mãi mà không ai làm
-- ═══════════════════════════════════════════════════════════════════════════
-- `nha_viec_nhac` cố ý KHÔNG có trần thử lại, vì dòng escalation/report thiếu
-- token OA là việc của bridge chứ không phải của đường OA — đặt trần ở đây là
-- vứt việc đi trong lúc worker thật (bridge) chỉ đang tạm nghỉ.
-- Nhưng đánh đổi đó có mặt trái: nếu bridge KHÔNG BAO GIỜ tới — chưa cấu hình,
-- chết hẳn, sai bí mật cổng — dòng đó nhả rồi giành lại mỗi 30 phút đến hết
-- đời, `attempts` luôn về 0, không một dòng lỗi nào. Đúng kiểu hỏng im lặng mà
-- NFR-18 đã dặn. Nên: không đặt trần, mà ĐẾM và KÊU.
create or replace function public.bo_dem_nhac_treo(p_gio int default 24)
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_so int;
begin
  select count(*) into v_so
    from reminders
   where status = 'pending'
     and kind in ('escalation', 'report')
     and created_at < now() - make_interval(hours => p_gio);

  if v_so > 0 then
    perform public.log_loi(
      'nhac treo qua lau',
      format('%s lời nhắc escalation/report nằm chờ quá %s giờ — bridge (escalation-feed) '
             || 'nhiều khả năng không chạy hoặc sai BRIDGE_SECRET. Chúng KHÔNG tự vào thư '
             || 'chết: nudge nhả lại mỗi nhịp nên đếm lượt luôn về 0 và không có lỗi nào '
             || 'khác lộ ra. Xem /admin.', v_so, p_gio),
      null::int
    );
  end if;
  return v_so;
end $$;

comment on function public.bo_dem_nhac_treo(int) is
  'FR-152/NFR-18: đếm lời nhắc escalation/report nằm chờ quá lâu và ghi bot_errors. '
  'Đây là con mắt bù cho việc nha_viec_nhac cố ý không có trần thử lại.';

revoke execute on function public.bo_dem_nhac_treo(int) from public, anon, authenticated;
grant  execute on function public.bo_dem_nhac_treo(int) to service_role;
