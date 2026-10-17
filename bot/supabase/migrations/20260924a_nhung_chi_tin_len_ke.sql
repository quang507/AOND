-- 20260924a — FR-216 i: nhúng vector tin CHỈ khi tin đã lên kệ (dang_ban / dang_quan_tam).
--
-- Chủ dự án 24/09/2026 duyệt: "Tin chỉ nhúng một lần, khi lên kệ. Sau đó chủ nhà sửa gì thì mới nhúng lại".
-- Trước bản này `nhung_tick` nhúng cả tin `cho_thong_tin`: mỗi câu người bán trả lời làm văn bản đổi → 2 phút sau
-- gọi Gemini lại, một tin hỏi 6–8 câu là 6–8 lượt nhúng trong lúc bot mua CHƯA tìm thấy tin đó (chỉ tìm tin
-- đang lên kệ). Tin lên kệ rồi mà chủ sửa → md5 đổi → nhúng lại như cũ. Chỉ đổi đúng một dòng lọc trạng thái.

CREATE OR REPLACE FUNCTION public.nhung_tick()
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
  v_loi int;
  v_dung timestamptz;
  v_tu_choi boolean := false;
  v_ma int;
  v_mau text;
  v_ok boolean := false;
begin
  -- (1) Thu kết quả lượt trước (tin + dự án). Chưa có phản hồi thì chờ; quá 10 phút thì bỏ, lượt sau gửi lại.
  for v in
    select nv.listing_id as id, 'tin' as loai, nv.md5, nv.gui_luc, h.status_code, h.content, h.error_msg
      from public.nhung_viec nv left join net._http_response h on h.id = nv.request_id
    union all
    select nd.project_id, 'du_an', nd.md5, nd.gui_luc, h.status_code, h.content, h.error_msg
      from public.nhung_viec_du_an nd left join net._http_response h on h.id = nd.request_id
  loop
    if v.status_code is null and v.error_msg is null then
      if v.gui_luc < now() - interval '10 minutes' then
        if v.loai = 'tin' then delete from public.nhung_viec where listing_id = v.id;
        else delete from public.nhung_viec_du_an where project_id = v.id; end if;
      end if;
      continue;
    end if;
    if v.status_code = 200 then
      v_vals := (v.content::jsonb) -> 'embedding' -> 'values';
      if jsonb_typeof(v_vals) = 'array' and jsonb_array_length(v_vals) = 768 then
        if v.loai = 'tin' then
          update public.listings set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where id = v.id;
        else
          update public.projects set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now() where id = v.id;
        end if;
        v_ok := true;
      else
        perform public.log_loi('nhung-tick', 'Gemini embed trả khuôn lạ cho ' || v.loai || ' ' || v.id, null);
      end if;
    else
      v_tu_choi := true;
      v_ma := coalesce(v_ma, v.status_code);
      v_mau := coalesce(v_mau, left(coalesce(v.error_msg, v.content, ''), 200));
    end if;
    if v.loai = 'tin' then delete from public.nhung_viec where listing_id = v.id;
    else delete from public.nhung_viec_du_an where project_id = v.id; end if;
  end loop;

  -- Giãn nhịp: Gemini từ chối → tạm dừng 2, 4, 8 … 60 phút (402 hết tiền: 60 phút ngay); ghi sổ một lần mỗi đợt.
  v_loi := coalesce(nullif(public.cau_hinh('nhung_lan_loi'), '')::int, 0);
  if v_tu_choi then
    v_loi := v_loi + 1;
    v_dung := now() + make_interval(mins => case when v_ma = 402 then 60 else least(60, (2 ^ least(v_loi, 6))::int) end);
    update public.app_config set value = v_loi::text where key = 'nhung_lan_loi';
    update public.app_config set value = to_char(v_dung at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') where key = 'nhung_tam_dung_den';
    if v_loi = 1 or v_loi % 12 = 0 then
      perform public.log_loi('nhung-tick',
        'Gemini embed từ chối HTTP ' || coalesce(v_ma::text, '?') || ' (lần ' || v_loi || ') — tạm dừng tới '
          || to_char(v_dung at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM') || ' giờ VN. ' || coalesce(v_mau, ''),
        null);
    end if;
  elsif v_ok and v_loi > 0 then
    update public.app_config set value = '0' where key = 'nhung_lan_loi';
    update public.app_config set value = '' where key = 'nhung_tam_dung_den';
  end if;

  -- (2) Gửi mẻ mới: tin còn sống đổi văn bản trước, rồi dự án. Một mẻ một lúc; đang tạm dừng thì thôi.
  if coalesce(public.cau_hinh('tim_theo_nghia'), 'tat') <> 'bat' then return; end if;
  v_dung := nullif(public.cau_hinh('nhung_tam_dung_den'), '')::timestamptz;
  if v_dung is not null and v_dung > now() then return; end if;
  if exists (select 1 from public.nhung_viec) or exists (select 1 from public.nhung_viec_du_an) then return; end if;
  v_key := public.get_secret('GEMINI_API_KEY');
  if v_key is null then return; end if;
  v_tran := greatest(1, least(coalesce(nullif(public.cau_hinh('nhung_moi_tick'), '')::int, 10), 50));

  for r in
    select l.id, l.nhung_md5 from public.listings l
     where l.status in ('dang_ban', 'dang_quan_tam')
     order by l.updated_at desc nulls last
     limit 300
  loop
    exit when v_gui >= v_tran;
    v_txt := public.van_ban_nhung(r.id);
    if v_txt is null or length(v_txt) < 10 then continue; end if;
    v_md5 := md5(v_txt);
    if r.nhung_md5 is not distinct from v_md5 then continue; end if;
    insert into public.nhung_viec (listing_id, request_id, md5)
    values (r.id, net.http_post(
      url := 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-goog-api-key', v_key),
      body := jsonb_build_object(
        'content', jsonb_build_object('parts', jsonb_build_array(jsonb_build_object('text', left(v_txt, 6000)))),
        'taskType', 'RETRIEVAL_DOCUMENT', 'outputDimensionality', 768),
      timeout_milliseconds := 20000), v_md5);
    v_gui := v_gui + 1;
  end loop;

  for r in
    select p.id, p.nhung_md5 from public.projects p
     where p.nhung_md5 is null or p.updated_at > coalesce(p.nhung_luc, '-infinity'::timestamptz)
     order by p.is_partner desc nulls last, p.priority nulls last, p.updated_at desc nulls last
     limit 200
  loop
    exit when v_gui >= v_tran;
    v_txt := public.van_ban_du_an(r.id);
    if v_txt is null or length(v_txt) < 10 then continue; end if;
    v_md5 := md5(v_txt);
    if r.nhung_md5 is not distinct from v_md5 then continue; end if;
    insert into public.nhung_viec_du_an (project_id, request_id, md5)
    values (r.id, net.http_post(
      url := 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-goog-api-key', v_key),
      body := jsonb_build_object(
        'content', jsonb_build_object('parts', jsonb_build_array(jsonb_build_object('text', left(v_txt, 6000)))),
        'taskType', 'RETRIEVAL_DOCUMENT', 'outputDimensionality', 768),
      timeout_milliseconds := 20000), v_md5);
    v_gui := v_gui + 1;
  end loop;
end $function$;
