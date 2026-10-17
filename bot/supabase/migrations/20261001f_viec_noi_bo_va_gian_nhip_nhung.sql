-- 20261001f: (1) việc báo NỘI BỘ đang chờ gửi (❓ khách hỏi, 😟 cảm xúc) lỡ gắn seller_id → chuyển về người phụ trách;
--            (2) nhúng địa danh nền giãn nhịp khi Gemini 429 (chung bộ đếm với nhung-tick), ghi sổ một lần mỗi đợt.
--
-- (1) Soát sau bắn thử lx-cx-01 (01/10/2026): `escalation-feed` / `nudge` chọn người nhận seller → CTV → admin, và
-- `escalationText` bọc tin có seller_id thành lời chào CHỦ NHÀ (FR-144). Việc "❓ … hỏi" (PR #384) và "😟 … có vẻ bực"
-- (PR #388) gắn seller_id làm ngữ cảnh → tin nội bộ đi thẳng về máy khách. Code đã bỏ seller_id + chặn ở tầng gửi
-- (`laTinNoiBo`, _shared/tin_nhac.ts); đây dọn dòng còn chờ gửi. Câu cuối chỉ trả SỐ ĐẾM (không nội dung, không Zalo ID).
--
-- (2) `nhung_dia_danh_tick` dừng cố định 4 phút + ghi sổ mỗi lần Gemini từ chối → 50 dòng 429 / 24 giờ, hạn mức free
-- cạn liên tục, câu tìm theo nghĩa của khách 429 theo. Thân hàm chép từ schema.sql, chỉ đổi khối "Gemini từ chối".

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
          update public.wards set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where ten = v.khoa;
        elsif v.bang = 'phuong_cu' then
          update public.phuong_cu set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where id::text = v.khoa;
        elsif v.bang = 'quan_cu' then
          update public.quan_cu set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where ten = v.khoa;
        else
          update public.duong set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where id::text = v.khoa;
        end if;
      else
        perform public.log_loi('nhung-dia-danh-tick', 'Gemini embed trả khuôn lạ cho ' || v.bang || ' ' || v.khoa, null);
      end if;
    else
      v_tu_choi := true;
      v_ma := coalesce(v_ma, v.status_code);
      v_mau := coalesce(v_mau, left(coalesce(v.error_msg, v.content, ''), 200));
    end if;
    delete from public.nhung_viec_dia_danh where bang = v.bang and khoa = v.khoa;
  end loop;

  -- Gemini từ chối → đặt mốc tạm dừng CHUNG với nhung-tick (chung hạn mức).
  -- 20261001f: bản trước dừng CỐ ĐỊNH 4 phút và ghi sổ MỖI lần → hết 4 phút lại gửi mẻ mới vào đúng hạn mức đã cạn (50 dòng
  -- 429 / 24 giờ), và câu tìm theo nghĩa của khách cũng 429 theo. Nay giãn nhịp dùng CHUNG bộ đếm với nhung-tick
  -- (nhung_lan_loi): 2, 4, 8 … 60 phút; 402 hết tiền thì 60 phút ngay; ghi sổ lần đầu và mỗi 12 lần.
  v_loi := coalesce(nullif(public.cau_hinh('nhung_lan_loi'), '')::int, 0);
  if v_tu_choi then
    v_loi := v_loi + 1;
    v_dung := now() + make_interval(mins => case when v_ma = 402 then 60 else least(60, (2 ^ least(v_loi, 6))::int) end);
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
  v_key := coalesce(public.get_secret('GEMINI_API_KEY_2'), public.get_secret('GEMINI_API_KEY'));
  if v_key is null then return; end if;
  v_tran := greatest(1, least(coalesce(nullif(public.cau_hinh('nhung_dia_danh_moi_tick'), '')::int, 20), 50));

  for r in
    (select 'quan_cu' as bang, q.ten as khoa, q.nhung_md5 from public.quan_cu q where q.nhung is null limit 50)
    union all
    (select 'wards', w.ten, w.nhung_md5 from public.wards w where w.nhung is null limit 50)
    union all
    (select 'phuong_cu', p.id::text, p.nhung_md5 from public.phuong_cu p where p.nhung is null limit 50)
    union all
    (select 'duong', d.id::text, d.nhung_md5 from public.duong d where d.nhung is null and d.loai <> 'hem' limit 100)
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

with doi as (
  update public.reminders set seller_id = null
   where kind = 'escalation' and status = 'pending' and seller_id is not null
     and (note like '❓ Zalo%' or note like '😟 Zalo%')
  returning 1
)
select (select count(*) from doi) as chuyen_ve_nguoi_phu_trach,
       (select count(*) from public.reminders r join public.sellers s on s.id = r.seller_id
         where r.kind = 'escalation' and r.status = 'sent' and (r.note like '❓ Zalo%' or r.note like '😟 Zalo%')
           and not public.la_id_thu(s.zalo_user_id)) as da_gui_nham_chu_nha_that,
       (select count(*) from public.reminders r join public.sellers s on s.id = r.seller_id
         where r.kind = 'escalation' and r.status = 'sent' and (r.note like '❓ Zalo%' or r.note like '😟 Zalo%')
           and public.la_id_thu(s.zalo_user_id)) as da_gui_nham_id_thu;
