-- 20261002c · Còi Gemini: không báo nhầm "hết tiền", không chép 429 nhúng nền vào sổ lỗi, hết hạn mức ngày thì dừng tới lúc cấp lại
-- (docs/07 SRS-5.1z, đo 02/10/2026 bằng do-supabase.yml + kiem-khoa.yml).
--
-- Số đo: bot_errors 24h có 2.952 dòng nguồn pg_net, trong đó 2.951 là Gemini 429 RESOURCE_EXHAUSTED của lượt nhúng nền
-- (nhung-dia-danh-tick). 3 dòng "HET TIEN API" ngày 01/10 đều từ nhung-dia-danh-tick — kiem-khoa.yml thử 4 khoá: Anthropic,
-- Groq, Gemini đều HTTP 200 (không khoá nào hết tiền). GEMINI_API_KEY_2 không có trong Vault, nên nhúng nền dùng CHUNG khoá
-- với câu tìm theo nghĩa của khách.
--
-- Thân hàm lấy NGUYÊN từ schema.sql (bản DB hiện hành), chỉ thêm các đoạn ghi 20261002c.

CREATE OR REPLACE FUNCTION public.bat_het_tien_api()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lan_cuoi timestamptz;
  v_noi_dung text;
begin
  if new.source = 'HET TIEN API' then
    return null;
  end if;
  -- 20260923h: 402 của Gemini embedding (tìm theo nghĩa) không làm bot câm — nhung-tick tự giãn nhịp, không báo nhầm.
  -- 20261002c: lọc theo TIỀN TỐ nguồn 'nhung%' (bản cũ ghi đúng tên 'nhung-tick' nên 'nhung-dia-danh-tick' lọt: câu 429 của
  -- Gemini có chữ "billing" → 3 lần "BỘ NÃO ĐANG CÂM — HẾT TIỀN" báo nhầm ngày 01/10) + mọi lỗi Gemini (còi này nói về Anthropic).
  if new.source like 'nhung%'
     or lower(coalesce(new.detail, '')) like '%ai.studio%'
     or lower(coalesce(new.detail, '')) like '%generativelanguage%'
     or lower(coalesce(new.detail, '')) like '%resource_exhausted%'
     or lower(coalesce(new.detail, '')) like '%gemini%' then
    return null;
  end if;

  if not (
       lower(coalesce(new.detail,'')) like '%credit balance%'
    or lower(coalesce(new.detail,'')) like '%plans & billing%'
    or lower(coalesce(new.detail,'')) like '%plans and billing%'
    or lower(coalesce(new.detail,'')) like '%insufficient%quota%'
    or lower(coalesce(new.detail,'')) like '%billing%'
    or coalesce(new.status_code, 0) = 402
  ) then
    return null;
  end if;

  select max(at) into v_lan_cuoi
    from bot_errors where source = 'HET TIEN API';

  if v_lan_cuoi is not null and v_lan_cuoi > now() - interval '6 hours' then
    return null;
  end if;

  v_noi_dung :=
    '🔴 BỘ NÃO ĐANG CÂM — HẾT TIỀN TÀI KHOẢN AI. Mọi tin khách nhắn vào sẽ KHÔNG '
    || 'có câu trả lời cho tới khi nạp tiền. Vào console.anthropic.com → Plans & '
    || 'Billing để nạp, rồi xem mục Usage để biết khoá nào tiêu hết. '
    || 'Nguồn báo: ' || coalesce(new.source,'?')
    || ' · nguyên văn: ' || left(coalesce(new.detail,''), 200);

  insert into bot_errors (source, status_code, detail)
  values ('HET TIEN API', new.status_code, left(v_noi_dung, 500));

  return null;
exception when others then
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.bot_health_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_from bigint; v_to bigint; v_new integer := 0;
  v_beat timestamptz; v_co_hang boolean; v_hour integer;
  v_dead boolean := false; v_chua_bao_gio boolean := false;
  v_cnt integer; v_ntfy bigint;
  v_ntfy_truoc bigint; v_ma_truoc integer; v_co_dau_vet boolean;
  v_da_gui boolean := false;
begin
  select last_id into v_from from bot_health where who = 'pg_net';
  if v_from is null then
    select coalesce(max(id), 0) into v_from from net._http_response;
    insert into bot_health (who, last_id) values ('pg_net', v_from);
  end if;

  select coalesce(max(id), v_from) into v_to from net._http_response;

  insert into bot_errors (at, source, status_code, detail)
  select r.created, 'pg_net', r.status_code,
         left(public.che_sdt(coalesce(r.error_msg, r.content)), 500)
  from net._http_response r
  where r.id > v_from and r.id <= v_to
    and (r.status_code is null or r.status_code < 200 or r.status_code >= 300)
    -- 20261002c: Gemini 429 (RESOURCE_EXHAUSTED) của lượt nhúng nền là đường đi ĐÚNG THIẾT KẾ — nhung-tick / nhung-dia-danh-tick
    -- tự giãn nhịp và tự ghi sổ lần đầu + mỗi 12 lần. Chép thêm ở đây từng đẻ 2.951 dòng / 24h (đo 02/10, 2.951/2.952 dòng pg_net).
    and not (r.status_code = 429 and coalesce(r.content, '') ilike '%RESOURCE_EXHAUSTED%');
  get diagnostics v_new = row_count;
  update bot_health set last_id = v_to, at = now() where who = 'pg_net';

  v_hour := extract(hour from (now() at time zone 'Asia/Ho_Chi_Minh'))::int;
  select at into v_beat from bot_health where who = 'bridge-zca';
  v_co_hang := found;

  if v_hour between 7 and 22 then
    if not v_co_hang then
      v_chua_bao_gio := true;
      v_dead := true;
      insert into bot_errors (source, detail)
      select 'bridge', 'bridge-zca CHƯA TỪNG điểm danh lần nào — chưa chạy, hoặc chạy mà không ghi được bot_health.'
      where not exists (select 1 from bot_errors
                        where source = 'bridge' and at > now() - interval '1 hour');
    elsif v_beat < now() - interval '15 minutes' then
      v_dead := true;
      insert into bot_errors (source, detail)
      select 'bridge', format('bridge-zca im từ %s (VN)',
                              to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'))
      where not exists (select 1 from bot_errors
                        where source = 'bridge' and at > now() - interval '1 hour');
    end if;
  end if;

  select last_id into v_ntfy_truoc from bot_health
   where who = 'ntfy' and at > now() - interval '1 hour';
  if v_ntfy_truoc is not null then
    select status_code into v_ma_truoc from net._http_response where id = v_ntfy_truoc;
    v_co_dau_vet := found;
    if not v_co_dau_vet then
      v_da_gui := true;
    elsif v_ma_truoc between 200 and 299 then
      v_da_gui := true;
    else
      v_da_gui := false;
      insert into bot_errors (source, detail)
      select 'coi ntfy',
             format('lượt báo trước (pg_net req %s) KHÔNG tới nơi (mã %s) — bắn lại.',
                    v_ntfy_truoc, coalesce(v_ma_truoc::text, 'timeout/không có mã'))
      where not exists (select 1 from bot_errors
                        where source = 'coi ntfy' and at > now() - interval '1 hour');
    end if;
  end if;

  -- QUY TẮC: CHỈ báo động khi bot trên VPS đang tắt (v_dead = true)
  if v_dead
     and not exists (select 1 from reminders
                     where kind = 'escalation' and note like '🚨%'
                       and created_at > now() - interval '1 hour') then
    update reminders set status = 'cancelled'
     where kind = 'escalation' and status = 'pending' and note like '🚨%';
    insert into reminders (kind, due_at, note)
    values ('escalation', now(),
      format('🚨 CẢNH BÁO: Bot trên VPS (bridge-zca) đang tắt hoặc im từ %s. Cần kiểm tra VPS!',
             case when v_chua_bao_gio then 'chưa từng điểm danh'
                  else to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') end));
  end if;

  if v_dead and not v_da_gui then
    v_ntfy := public.canh_bao_ngoai(
      '🚨 [BOT VPS TẮT] Mất kết nối bridge Zalo',
      format('Bot trên VPS đang im tiếng từ %s. Vui lòng kiểm tra dịch vụ nhadat-bridge trên VPS.',
             case when v_chua_bao_gio then 'chưa từng điểm danh'
                  else to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') end),
      5, false);
    insert into bot_health (who, at, last_id) values ('ntfy', now(), coalesce(v_ntfy, 0))
    on conflict (who) do update set at = now(), last_id = excluded.last_id;
  end if;

  update reminders set status = 'cancelled'
   where kind = 'report' and status = 'pending' and created_at < now() - interval '36 hours';

  delete from bot_errors where at < now() - interval '30 days';

  return jsonb_build_object('loi_moi', v_new, 'bridge_im', v_dead,
                            'bridge_chua_bao_gio', v_chua_bao_gio,
                            'quet_toi', v_to, 'ntfy', v_ntfy,
                            'lan_truoc_da_gui', v_da_gui);
end $function$
;

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
  v_ngay boolean := false;
  v_reset timestamp;
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
      v_ngay := v_ngay or coalesce(v.content, '') ilike '%PerDay%';
    end if;
    if v.loai = 'tin' then delete from public.nhung_viec where listing_id = v.id;
    else delete from public.nhung_viec_du_an where project_id = v.id; end if;
  end loop;

  -- Giãn nhịp: Gemini từ chối → tạm dừng 2, 4, 8 … 60 phút (402 hết tiền: 60 phút ngay); ghi sổ một lần mỗi đợt.
  v_loi := coalesce(nullif(public.cau_hinh('nhung_lan_loi'), '')::int, 0);
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
  -- 20260930e: khoá thứ hai (nếu có) gánh việc nhúng NỀN, để khoá chính còn hạn mức cho câu tìm của khách.
  v_key := coalesce(public.get_secret('GEMINI_API_KEY_2'), public.get_secret('GEMINI_API_KEY'));
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
end $function$
;

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
      v_ngay := v_ngay or coalesce(v.content, '') ilike '%PerDay%';
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
