-- SRS-5.1zzzzzzz402 (11/11/2026): còi giám sát máy 146. `bot_health_tick` (cron 15 phút) trước chỉ canh nhịp `bridge-zca` (số ký gửi):
--  * bridge số tư vấn chết — nhịp `bridge-zca-tu-van` có ghi mà không ai canh;
--  * lõi AOND Core chết — bridge vẫn gõ nhịp đều nên không ai biết (nay lõi đóng nhịp `aond-core` mỗi phút, server.py `_vong_nhip_loi`);
--  * acc Zalo văng phiên chờ quét QR — bridge vẫn gõ nhịp, `bridge_dang_nhap.trang_thai` không ai canh;
--  * lời báo còn ghi "VPS" / "nhadat-bridge" (đã bỏ VPS 06–08/11).
-- Nay gom mọi sự cố của khung 7–22 giờ vào một tin 🚨 (tiết chế 1 giờ như cũ). Nhịp tư vấn / lõi chỉ báo khi ĐÃ từng có (chưa từng = chưa
-- triển khai, không báo nhầm). Phần quét lỗi pg_net, kiểm lượt ntfy trước, dọn report / bot_errors giữ nguyên.
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
  v_van text[] := '{}';
  rr record;
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
    -- (1) Số ký gửi — giữ nguyên hành vi cũ: chưa từng điểm danh cũng báo.
    if not v_co_hang then
      v_chua_bao_gio := true;
      v_dead := true;
      v_van := array_append(v_van, 'bridge số ký gửi CHƯA TỪNG điểm danh');
      insert into bot_errors (source, detail)
      select 'bridge', 'bridge-zca CHƯA TỪNG điểm danh lần nào — chưa chạy, hoặc chạy mà không ghi được bot_health.'
      where not exists (select 1 from bot_errors
                        where source = 'bridge' and at > now() - interval '1 hour');
    elsif v_beat < now() - interval '15 minutes' then
      v_dead := true;
      v_van := array_append(v_van, format('bridge số ký gửi im từ %s',
                                          to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')));
      insert into bot_errors (source, detail)
      select 'bridge', format('bridge-zca im từ %s (VN)',
                              to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI'))
      where not exists (select 1 from bot_errors
                        where source = 'bridge' and at > now() - interval '1 hour');
    end if;

    -- (2) SRS-5.1zzzzzzz402: số tư vấn và lõi (nhịp 'aond-core' lõi đóng mỗi phút). Chỉ báo khi ĐÃ từng có nhịp — chưa từng = chưa
    -- triển khai bản lõi có nhịp, không báo nhầm.
    for rr in select h.who, h.at from bot_health h
              where h.who in ('bridge-zca-tu-van', 'aond-core') and h.at < now() - interval '15 minutes'
              order by h.who loop
      v_van := array_append(v_van, format('%s im từ %s',
                 case rr.who when 'aond-core' then 'lõi AOND Core (cổng 8000)' else 'bridge số tư vấn' end,
                 to_char(rr.at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')));
    end loop;

    -- (3) SRS-5.1zzzzzzz402: acc Zalo văng phiên — bridge vẫn gõ nhịp khi chờ quét QR nên (1)(2) không thấy.
    for rr in select d.id, d.trang_thai, d.cap_nhat from bridge_dang_nhap d
              where d.trang_thai in ('cho_quet', 'het_han', 'tu_choi') and d.cap_nhat < now() - interval '10 minutes'
              order by d.id loop
      v_van := array_append(v_van, format('Zalo số %s cần quét lại QR (%s từ %s) — mở /admin',
                 case rr.id when 2 then 'tư vấn' else 'ký gửi' end, rr.trang_thai,
                 to_char(rr.cap_nhat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')));
    end loop;

    if coalesce(array_length(v_van, 1), 0) > 0 then
      v_dead := true;
      insert into bot_errors (source, detail)
      select 'coi 146', left(array_to_string(v_van, ' · '), 500)
      where not exists (select 1 from bot_errors
                        where source = 'coi 146' and at > now() - interval '1 hour');
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

  -- Báo động khi có sự cố (v_dead): bridge / lõi im, hoặc Zalo cần quét lại QR. Tin 🚨 đi đường bridge số ký gửi (số đó chết thì tin
  -- nằm chờ); ntfy chỉ đi khi app_config.ntfy_topic có giá trị.
  if v_dead
     and not exists (select 1 from reminders
                     where kind = 'escalation' and note like '🚨%'
                       and created_at > now() - interval '1 hour') then
    update reminders set status = 'cancelled'
     where kind = 'escalation' and status = 'pending' and note like '🚨%';
    insert into reminders (kind, due_at, note)
    values ('escalation', now(),
      '🚨 CẢNH BÁO máy 146: ' || array_to_string(v_van, ' · ') || '. Kiểm tra task Windows trên máy 146 (ssh nuc).');
  end if;

  if v_dead and not v_da_gui then
    v_ntfy := public.canh_bao_ngoai(
      '🚨 [BOT 146] Sự cố bot Zalo',
      'Máy 146: ' || array_to_string(v_van, ' · ') || '. Kiểm tra task Windows AOND trên máy 146.',
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
                            'lan_truoc_da_gui', v_da_gui,
                            'su_co', to_jsonb(v_van));
end $function$;
