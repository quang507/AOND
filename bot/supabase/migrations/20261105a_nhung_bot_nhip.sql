-- 20261105a_nhung_bot_nhip — SRS-5.1zzzzzzz385 (chủ dự án 05/11/2026 hỏi "cấu trúc db đã tối ưu chưa … nên sửa ntn").
-- Đo trên DB thật 24 giờ (cron.job_run_details): ba lịch nhúng chạy 720 lần / ngày mỗi lịch, trung bình 1,28 s + 0,44 s + 0,28 s ≈ 24 phút CPU / ngày
-- trong khi KHÔNG còn dòng nào cần nhúng (địa danh, điều luật, tin đã nhúng hết). Chạy tay trong giao dịch huỷ: 20 ms / 229 ms / 11 ms — phần còn lại
-- là chi phí mỗi lượt cron mở kết nối mới. Sửa: (1) giãn nhịp — tin + dự án 5 phút, địa danh + điều luật (dữ liệu tĩnh, chỉ đổi khi nạp) 15 phút:
-- 2.160 → 480 lượt / ngày; (2) nhung_tick (sửa tại chỗ trên định nghĩa đang chạy, cùng cách 20261019e — các bản sau 20261018g đã đổi halfvec / da_coc) ghi mốc đã soát cho dự án không đổi chữ / không có chữ (409 dự án bị băm lại mỗi lượt); (3) bỏ 3 index
-- HNSW 0 lần quét trên bảng nhỏ (wards 168, quan_cu 45, phuong_cu 544 dòng — quét tuần tự nhanh hơn). Giữ index HNSW của listings (bảng sẽ lớn)
-- và dieu_luat (60 lần dùng); giữ 3 index UNIQUE "mot_*" của reminders (0 lần quét nhưng là ràng buộc chống nhắc trùng).
-- Lịch nhúng vẫn chạy (luật đang áp: "vector do lịch nhung-tick / nhung-dia-danh-tick / nhung-luat-tick nuôi — đừng gỡ"), chỉ thưa hơn.

do $do$
declare
  def text;
  cu text := $q$    v_txt := public.van_ban_du_an(r.id);
    if v_txt is null or length(v_txt) < 10 then continue; end if;
    v_md5 := md5(v_txt);
    if r.nhung_md5 is not distinct from v_md5 then continue; end if;$q$;
  moi text := $q$    v_txt := public.van_ban_du_an(r.id);
    -- 20261105a (SRS-5.1zzzzzzz385): dự án không có chữ / chữ không đổi → ghi mốc đã soát để lượt sau không băm lại (409 dự án bị băm lại
    -- mỗi 2 phút: updated_at đổi mà văn bản không đổi, hoặc thiếu chữ). Bảng projects không có trigger cập nhật updated_at.
    if v_txt is null or length(v_txt) < 10 then
      update public.projects set nhung_md5 = coalesce(nhung_md5, ''), nhung_luc = now() where id = r.id;
      continue;
    end if;
    v_md5 := md5(v_txt);
    if r.nhung_md5 is not distinct from v_md5 then
      update public.projects set nhung_luc = now() where id = r.id;
      continue;
    end if;$q$;
begin
  def := pg_get_functiondef('public.nhung_tick'::regproc);
  if position(cu in def) = 0 then
    raise exception '20261105a: không thấy đoạn vòng dự án trong nhung_tick đang chạy — định nghĩa đã đổi, soát lại trước khi áp';
  end if;
  execute replace(def, cu, moi);
end
$do$;

select cron.schedule('nhung-tick', '*/5 * * * *', 'select public.nhung_tick()');
select cron.schedule('nhung-dia-danh-tick', '7-59/15 * * * *', 'select public.nhung_dia_danh_tick()');
select cron.schedule('nhung-luat-tick', '12-59/15 * * * *', 'select public.nhung_luat_tick()');

drop index if exists public.wards_nhung_hnsw;
drop index if exists public.quan_cu_nhung_hnsw;
drop index if exists public.phuong_cu_nhung_hnsw;
