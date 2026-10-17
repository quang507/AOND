-- 20260829d — Soát bảo mật: bịt các lỗ tìm được bằng kiểm thử theo VAI THẬT
--
-- Toàn bộ phát hiện dưới đây đến từ việc ĐÓNG VAI `anon` / `authenticated` thật
-- (set local role + request.jwt.claims) rồi thử đọc/ghi, chứ không phải đọc
-- policy rồi suy diễn. Ba lỗ đầu là lỗ THẬT, có bằng chứng chạy được.
--
-- KHÔNG đụng hành vi nghiệp vụ: mọi thứ ở đây chỉ SIẾT quyền. Đường đọc của
-- web (tin đã lên kệ + ảnh của tin đó) giữ nguyên từng ly.

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) ẢNH VÀ MÃ CỦA TIN CHƯA ĐĂNG BỊ LỘ CHO ANON
-- ═══════════════════════════════════════════════════════════════════════════
-- Bằng chứng: dựng một tin `cho_thong_tin` có ảnh rồi đọc bằng vai `anon`:
--   • đọc thẳng `listings`      → 0 dòng  (RLS đúng)
--   • đọc thẳng `listing_media` → 1 DÒNG  (SAI)
--   • đọc `listing_photos_v`    → 1 DÒNG  (SAI)
-- Gốc hai chỗ:
--   a) policy `listing_media_doc_cong_khai` chỉ hỏi "bucket có công khai
--      không", KHÔNG hỏi "tin này đã lên kệ chưa". Bucket công khai là chuyện
--      của CÁI FILE; đăng hay chưa là chuyện của CÁI TIN. Hai câu hỏi khác nhau.
--   b) `listing_photos_v` là view SECURITY DEFINER nên nó đọc `listings` bằng
--      quyền chủ view, vượt qua RLS của người gọi.
-- Hậu quả: mã tin, đường dẫn ảnh và URL công khai của tin CHƯA đăng (đang nháp,
-- chủ nhà chưa chốt giá, có thể chưa đồng ý rao) đọc được từ Internet.

drop policy if exists listing_media_doc_cong_khai on public.listing_media;
create policy listing_media_doc_cong_khai on public.listing_media
  for select to anon, authenticated
  using (
    bucket = 'listing-public'
    and exists (
      select 1 from public.listings l
       where l.id = listing_media.listing_id
         and l.status in ('dang_ban','dang_quan_tam','da_chot')
    )
  );

-- View giữ nguyên SECURITY DEFINER — CỐ Ý. Đổi sang security_invoker thì nó
-- gãy: thân view có subquery đọc `app_config`, mà anon không có quyền bảng đó
-- (đúng cái bẫy đã vấp ở FR-165 TS-KHO-21). Thay vào đó ĐƯA ĐIỀU KIỆN VÀO
-- THÂN VIEW, để quyền của chủ view không còn là đường vòng.
create or replace view public.listing_photos_v as
select l.code,
       (select c.value from public.app_config c where c.key = 'storage_public_base_url')
         || '/' || m.bucket || '/' || m.storage_path as url,
       m.storage_path as path,
       m.sort_order,
       m.is_cover,
       m.created_at,
       m.listing_id,
       m.id as media_id
  from public.listing_media m
  join public.listings l on l.id = m.listing_id
 where m.bucket = 'listing-public'
   and l.status in ('dang_ban','dang_quan_tam','da_chot');

comment on view public.listing_photos_v is
  'FR-165 + soát bảo mật 29/08/2026: chỉ ảnh công khai CỦA TIN ĐÃ LÊN KỆ. '
  'Là SECURITY DEFINER có chủ đích (cần đọc app_config), nên điều kiện lên kệ '
  'phải nằm TRONG thân view — không thể trông vào RLS của người gọi.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) HÀM SECURITY DEFINER CÒN MỞ CHO NGƯỜI DÙNG THƯỜNG
-- ═══════════════════════════════════════════════════════════════════════════
-- `next_listing_code()` chạy được bằng vai `authenticated` — đã thử, nó trả về
-- mã kế tiếp thật. Hàm là SECURITY DEFINER nên nó ĐẾM `listings` vượt RLS:
-- người ngoài biết được tổng số tin THẬT của công ty (kể cả tin nháp), thứ mà
-- RLS đang cố giấu. Nó cũng xin `pg_advisory_xact_lock` — gọi liên tục là
-- giành khoá với luồng tạo tin thật.
-- Không ai cần gọi trực tiếp: nó chỉ được dùng bên trong trigger
-- `listings_fill_code()`, mà trigger đó là SECURITY DEFINER của postgres nên
-- lời gọi lồng bên trong vẫn chạy bình thường sau khi siết.
revoke execute on function public.next_listing_code() from public, anon, authenticated;

-- Hai hàm TRIGGER bị cấp EXECUTE cho PUBLIC. Gọi trực tiếp thì vỡ (0A000) nên
-- không phá được gì hôm nay, nhưng đây là SECURITY DEFINER mở cho cả người lạ:
-- một lần sửa thân hàm sau này là thành lỗ thật. Đóng luôn.
revoke execute on function public.listings_fill_code() from public, anon, authenticated;
revoke execute on function public.info_request_set_active_listing() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) QUYỀN BẢNG THỪA — SIẾT CHO KHỚP VỚI Ý ĐỊNH
-- ═══════════════════════════════════════════════════════════════════════════
-- `seller_ranks` (view trên `sellers`) đang cấp ĐỦ BỘ INSERT/UPDATE/DELETE/
-- TRUNCATE cho anon và authenticated. Hôm nay không khai thác được vì view có
-- LATERAL nên Postgres không cho ghi, nhưng đó là may, không phải thiết kế:
-- sửa view cho đơn giản hơn một chút là nó thành cửa ghi thẳng vào `sellers`.
revoke all on public.seller_ranks from anon, authenticated;
grant select on public.seller_ranks to anon, authenticated;

-- `bot_prompts` giữ prompt hệ thống của bot (luật vai, luật phí, giọng nói).
-- RLS đang chặn vì bảng không có policy nào, nhưng quyền ghi vẫn nằm đó cho
-- `authenticated`. Thêm một policy sơ ý ở tương lai là mở đường sửa prompt —
-- tức đổi hành vi bot từ bên ngoài. Bỏ quyền ghi, giữ đúng quyền đọc.
revoke insert, update, delete on public.bot_prompts from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) GHIM search_path CHO CÁC HÀM CÒN THẢ
-- ═══════════════════════════════════════════════════════════════════════════
-- Không phải SECURITY DEFINER nên không leo thang quyền được, nhưng `bo_dau`
-- và `seller_rank` thì anon gọi được, và cả bốn đều bị advisor gắn cờ. Ghim là
-- việc một dòng, không đổi kết quả trả về.
alter function public.bo_dau(text) set search_path to 'public';
alter function public.seller_rank(seller_type, integer, integer, integer) set search_path to 'public';
alter function public.parse_vnd(text) set search_path to 'public';
alter function public.guess_property_type(text) set search_path to 'public';

-- ═══════════════════════════════════════════════════════════════════════════
-- (5) CRON PHẢI MANG THEO BÍ MẬT CỦA CỬA
-- ═══════════════════════════════════════════════════════════════════════════
-- `nudge` và `ctv-report` sắp được gắn cổng `x-bridge-secret` (như chat-reply,
-- media-cleanup, inbound-sweep đã có). Hai hàm tick này đang chỉ gửi
-- publishable key — thứ nằm sẵn trong bundle JS của web, ai cũng có. Thêm
-- header TRƯỚC khi deploy hàm mới, để không có khoảng thời gian cron bị 403.
create or replace function public.nudge_tick()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform net.http_post(
    url := public.cau_hinh('functions_base_url') || '/nudge',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer sb_publishable_zmJBmEgFPn3bBKx_1ve6Pg_dXdo4haX',
      'x-bridge-secret', public.get_secret('BRIDGE_SECRET')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000);
end $$;

revoke execute on function public.nudge_tick() from public, anon, authenticated;
grant execute on function public.nudge_tick() to service_role;

create or replace function public.ctv_report_tick()
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform net.http_post(
    url := public.cau_hinh('functions_base_url') || '/ctv-report',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer sb_publishable_zmJBmEgFPn3bBKx_1ve6Pg_dXdo4haX',
      'x-bridge-secret', public.get_secret('BRIDGE_SECRET')),
    body := '{}'::jsonb);
end $$;

revoke execute on function public.ctv_report_tick() from public, anon, authenticated;
grant execute on function public.ctv_report_tick() to service_role;
