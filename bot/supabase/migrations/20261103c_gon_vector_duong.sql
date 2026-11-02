-- 20261103c_gon_vector_duong — làm gọn DB: bỏ vector nhúng của HẺM và ĐƯỜNG SỐ trong `duong` (SRS-5.1zzzzzzz362).
-- Chủ dự án 02/11/2026 duyệt ("ừ làm đi") đề xuất làm gọn DB. Đo trên DB thật (thống kê 31 ngày, reset 02/10): DB 275 MB / 500 MB gói Free;
-- `duong` 168 MB (61 %) — 25.539 hẻm + 3.714 đường số mang vector 768 chiều (~44 MB) + index HNSW `duong_nhung_hnsw` 77 MB được dùng
-- ĐÚNG 1 LẦN trong 31 ngày. Tên hẻm ("Hẻm 137/28") / đường số không có nghĩa để tìm theo nghĩa — tra bằng chữ (`tim_duong`,
-- `tim_dia_danh`) như đang làm. Giữ vector của 10.097 TÊN ĐƯỜNG (tìm theo nghĩa vẫn chạy cho chúng).
--   1. Xoá vector hẻm / đường số.
--   2. `nhung_dia_danh_tick` chỉ nhúng `loai = 'duong'` — không thì 25 nghìn dòng hẻm `nhung is null` chiếm hết 100 suất mỗi lượt,
--      tên đường mới không bao giờ được nhúng.
--   3. BỎ index HNSW `duong_nhung_hnsw` (77 MB, 1 lượt / 31 ngày): còn 10.097 vector, quét tuần tự một lượt tìm theo nghĩa đo 113 ms
--      trên DB thật — đổi 77 MB lấy ~0,1 s cho một việc hiếm. (REINDEX trong giao dịch quá giờ khi chạy thử.)
--   4. Bỏ `projects_nhung_hnsw` (5,5 MB, 0 lượt dùng / 31 ngày; 2.647 dòng quét tuần tự đủ nhanh, cột vector giữ nguyên).
-- Giải phóng chỗ trên đĩa cần `vacuum full public.duong` NGOÀI giao dịch — chạy riêng sau khi áp (ghi trong mục SRS).
begin;

update public.duong set nhung = null, nhung_md5 = null, nhung_luc = null where loai in ('hem', 'so') and nhung is not null;

CREATE OR REPLACE FUNCTION public.nhung_dia_danh_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v record;
  r record;
  v_key text;
  v_txt text;
  v_md5 text;
  v_vals jsonb;
  v_gui int := 0;
  v_tran int;
  v_dung timestamptz;
  v_tu_choi boolean := false;
  v_ma int;
  v_mau text;
  v_ngay boolean := false;
  v_reset timestamp;
  v_ok boolean := false;
  v_loi int;
begin
  -- (1) Thu kết quả lượt trước. Chưa có phản hồi thì chờ; quá 10 phút thì bỏ, lượt sau gửi lại.
  -- "Đã gọi net.http_post" KHÔNG phải bằng chứng (NFR-18): chỉ ghi vector khi đọc được 200 + đúng 768 số.
  for v in
    select nv.bang, nv.khoa, nv.md5, nv.gui_luc, h.status_code, h.content, h.error_msg
      from public.nhung_viec_dia_danh nv left join net._http_response h on h.id = nv.request_id
  loop
    if v.status_code is null and v.error_msg is null then
      if v.gui_luc < now() - interval '10 minutes' then
        delete from public.nhung_viec_dia_danh where bang = v.bang and khoa = v.khoa;
      end if;
      continue;
    end if;
    if v.status_code = 200 then
      v_vals := (v.content::jsonb) -> 'embedding' -> 'values';
      if jsonb_typeof(v_vals) = 'array' and jsonb_array_length(v_vals) = 768 then
        v_ok := true;
        if v.bang = 'wards' then
          update public.wards set nhung = (v_vals::text)::extensions.halfvec, nhung_md5 = v.md5, nhung_luc = now() where ten = v.khoa;
        elsif v.bang = 'phuong_cu' then
          update public.phuong_cu set nhung = (v_vals::text)::extensions.halfvec, nhung_md5 = v.md5, nhung_luc = now() where id::text = v.khoa;
        elsif v.bang = 'quan_cu' then
          update public.quan_cu set nhung = (v_vals::text)::extensions.halfvec, nhung_md5 = v.md5, nhung_luc = now() where ten = v.khoa;
        else
          update public.duong set nhung = (v_vals::text)::extensions.halfvec, nhung_md5 = v.md5, nhung_luc = now() where id::text = v.khoa;
        end if;
      else
        perform public.log_loi('nhung-dia-danh-tick', 'Gemini embed trả khuôn lạ cho ' || v.bang || ' ' || v.khoa, null);
      end if;
    else
      v_tu_choi := true;
      v_ma := coalesce(v_ma, v.status_code);
      v_mau := coalesce(v_mau, left(coalesce(v.error_msg, v.content, ''), 200));
      v_ngay := v_ngay or coalesce(v.content, '') ilike '%PerDay%';
    end if;
    delete from public.nhung_viec_dia_danh where bang = v.bang and khoa = v.khoa;
  end loop;

  -- Gemini từ chối → đặt mốc tạm dừng CHUNG với nhung-tick (chung hạn mức).
  -- 20261001f: bản trước dừng CỐ ĐỊNH 4 phút và ghi sổ MỖI lần → hết 4 phút lại gửi mẻ mới vào đúng hạn mức đã cạn (50 dòng
  -- 429 / 24 giờ), và câu tìm theo nghĩa của khách cũng 429 theo. Nay giãn nhịp dùng CHUNG bộ đếm với nhung-tick
  -- (nhung_lan_loi): 2, 4, 8 … 60 phút; 402 hết tiền thì 60 phút ngay; ghi sổ lần đầu và mỗi 12 lần.
  v_loi := coalesce(nullif(public.cau_hinh('nhung_lan_loi'), '')::int, 0);
  -- 20261018d: 429 (hết hạn mức) → đổi sang khoá kế trong vòng và gửi tiếp ngay; chỉ khi cả vòng đều 429 mới giãn nhịp / dừng
  -- tới lúc Google cấp lại hạn mức như cũ.
  if v_tu_choi and v_ma = 429 and public.nhung_doi_khoa() then
    v_tu_choi := false;
  end if;
  if v_tu_choi then
    v_loi := v_loi + 1;
    v_dung := now() + make_interval(mins => case when v_ma = 402 then 60 else least(60, (2 ^ least(v_loi, 6))::int) end);
    -- 20261002c: hết hạn mức NGÀY (quotaId ...PerDay...) thì thử lại mỗi 60 phút chỉ đốt thêm 429 — dừng tới lúc Google cấp
    -- lại hạn mức (nửa đêm giờ Thái Bình Dương ≈ 07:00–08:00 UTC; lấy 08:00 cho chắc).
    if v_ngay then
      v_reset := date_trunc('day', now() at time zone 'UTC') + interval '8 hours';
      if v_reset <= (now() at time zone 'UTC') then v_reset := v_reset + interval '1 day'; end if;
      v_dung := greatest(v_dung, v_reset at time zone 'UTC');
    end if;
    update public.app_config set value = v_loi::text where key = 'nhung_lan_loi';
    update public.app_config set value = to_char(v_dung at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
     where key = 'nhung_tam_dung_den'
       and coalesce(nullif(value, '')::timestamptz, '-infinity'::timestamptz) < v_dung;
    if v_loi = 1 or v_loi % 12 = 0 then
      perform public.log_loi('nhung-dia-danh-tick',
        'Gemini embed từ chối HTTP ' || coalesce(v_ma::text, '?') || ' (lần ' || v_loi || ') — tạm dừng tới '
          || to_char(v_dung at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ' giờ VN. ' || coalesce(v_mau, ''),
        null);
    end if;
  elsif v_ok and coalesce(nullif(public.cau_hinh('nhung_khoa_vong'), '')::int, 0) > 0 then
    update public.app_config set value = '0' where key = 'nhung_khoa_vong';
    if v_loi > 0 then
      update public.app_config set value = '0' where key = 'nhung_lan_loi';
      update public.app_config set value = '' where key = 'nhung_tam_dung_den';
    end if;
  elsif v_ok and v_loi > 0 then
    update public.app_config set value = '0' where key = 'nhung_lan_loi';
    update public.app_config set value = '' where key = 'nhung_tam_dung_den';
  end if;

  -- (2) Gửi mẻ mới: quận cũ → phường mới → phường cũ → đường (không nhúng hẻm). Chỉ khi tin rao + dự án không chờ.
  if coalesce(public.cau_hinh('tim_theo_nghia'), 'tat') <> 'bat' then return; end if;
  v_dung := nullif(public.cau_hinh('nhung_tam_dung_den'), '')::timestamptz;
  if v_dung is not null and v_dung > now() then return; end if;
  if exists (select 1 from public.nhung_viec) or exists (select 1 from public.nhung_viec_du_an)
     or exists (select 1 from public.nhung_viec_dia_danh) then return; end if;
  -- 20260930e: khoá thứ hai (nếu có) gánh việc nhúng NỀN, để khoá chính còn hạn mức cho câu tìm của khách.
  -- 20261018d: xoay vòng khoá nhúng nền (app_config.nhung_khoa_ds), khoá chính GEMINI_API_KEY để dành câu tìm của khách.
  v_key := public.khoa_nhung_nen();
  if v_key is null then return; end if;
  v_tran := greatest(1, least(coalesce(nullif(public.cau_hinh('nhung_dia_danh_moi_tick'), '')::int, 20), 50));

  for r in
    (select 'quan_cu' as bang, q.ten as khoa, q.nhung_md5 from public.quan_cu q where q.nhung is null limit 50)
    union all
    (select 'wards', w.ten, w.nhung_md5 from public.wards w where w.nhung is null limit 50)
    union all
    (select 'phuong_cu', p.id::text, p.nhung_md5 from public.phuong_cu p where p.nhung is null limit 50)
    union all
    -- 20261103c (SRS-5.1zzzzzzz362): chỉ nhúng TÊN ĐƯỜNG; hẻm / đường số tra bằng chữ (tim_duong / tim_dia_danh), không nhúng.
    (select 'duong', d.id::text, d.nhung_md5 from public.duong d where d.nhung is null and d.loai = 'duong'
      order by (d.tinh <> 'TP.HCM') limit 100)
  loop
    exit when v_gui >= v_tran;
    v_txt := public.van_ban_dia_danh(r.bang, r.khoa);
    if v_txt is null or length(v_txt) < 4 then continue; end if;
    v_md5 := md5(v_txt);
    if r.nhung_md5 is not distinct from v_md5 then continue; end if;
    insert into public.nhung_viec_dia_danh (bang, khoa, request_id, md5)
    values (r.bang, r.khoa, net.http_post(
      url := 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-goog-api-key', v_key),
      body := jsonb_build_object(
        'content', jsonb_build_object('parts', jsonb_build_array(jsonb_build_object('text', left(v_txt, 1500)))),
        'taskType', 'RETRIEVAL_DOCUMENT', 'outputDimensionality', 768),
      timeout_milliseconds := 20000), v_md5);
    v_gui := v_gui + 1;
  end loop;
end $function$
;

drop index if exists public.duong_nhung_hnsw;
drop index if exists public.projects_nhung_hnsw;

commit;
