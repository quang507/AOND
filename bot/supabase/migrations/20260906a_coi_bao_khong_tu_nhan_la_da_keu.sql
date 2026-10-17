-- 20260906a — đợt soát giám sát 06/09/2026 (FR-152, NFR-18).
-- Không sửa migration cũ. Không dựng nền giám sát mới: vẫn `bot_errors` +
-- `bot_health` + ntfy như cũ, chỉ vá bốn chỗ nói dối.
--
-- ══════════════════════════════════════════════════════════════════════════
-- 1. CÒI TỰ NHẬN LÀ ĐÃ KÊU TRONG KHI CHƯA AI NGHE  ← lỗi nặng nhất đợt này
-- ══════════════════════════════════════════════════════════════════════════
-- `bot_health_tick` gọi `canh_bao_ngoai(...)` rồi đóng dấu
-- `bot_health(who='ntfy', at=now())` NGAY, và dùng chính con dấu đó để im lặng
-- suốt một giờ sau. Nhưng `canh_bao_ngoai` trả về **id của request pg_net vừa
-- XẾP HÀNG**, không phải kết quả gửi. Xếp hàng luôn thành công.
--
-- Đúng cái bẫy CLAUDE.md đã ghi cho `cron.job_run_details.status` — và lặp lại
-- ngay bên trong cái còi dựng ra để canh nó.
--
-- Bắt tại trận 06/09/2026, không phải suy luận:
--     bot_health(who='ntfy') → at=2026-09-06 00:00:00.054, last_id=2221
--     net._http_response(id=2221) → status_code NULL,
--         "Timeout of 5000 ms reached" @ 00:00:00.212
-- Cùng một request. Còi báo "đã gửi" lúc 00:00:00.054; 158 mili-giây sau
-- pg_net ghi rằng nó không tới đâu cả. Rồi im một giờ.
-- Đếm trong sổ: 24 lượt `Timeout of 5000 ms` từ 27/08, nhiều lượt rơi đúng
-- phút :00 — tức đúng nhịp gọi ntfy hằng giờ. Mỗi lượt như vậy là một giờ
-- không ai được báo, mà cũng không có gì nói ra là không ai được báo.
--
-- Sửa tối thiểu, hai vế:
--   (a) `canh_bao_ngoai` nới hạn chờ 5 s → 15 s. 5 s là mặc định của
--       `net.http_post`, không phải con số ai chọn; từ ap-southeast-1 ra
--       ntfy.sh, quan sát cho thấy nó sát mép.
--   (b) `bot_health_tick` ĐỌC LẠI kết quả lượt báo trước trong
--       `net._http_response` rồi mới quyết im. Không 2xx → coi như CHƯA gửi,
--       bắn lại ngay nhịp này và ghi một dòng `coi ntfy` để chính cái hỏng đó
--       nhìn thấy được.
--
-- Hàng trong `net._http_response` bị pg_net dọn theo ttl (6 giờ). Không thấy
-- hàng = không kết luận được = coi như đã gửi. Cố ý nghiêng về im lặng ở
-- nhánh này: bắn lại vô hạn vì một dòng đã bị dọn thì tệ hơn.

create or replace function public.canh_bao_ngoai(
  p_title text, p_text text, p_priority integer default 4, p_email boolean default false
) returns bigint
language plpgsql security definer set search_path to 'public', 'net'
as $$
declare v_topic text; v_mail text; v_token text; v_body jsonb; v_hdr jsonb; v_id bigint;
begin
  select value into v_topic from app_config where key = 'ntfy_topic';
  if v_topic is null or btrim(v_topic) = '' then return null; end if;
  v_body := jsonb_build_object('topic', v_topic, 'title', left(p_title, 120),
                               'message', left(p_text, 900), 'priority', p_priority,
                               'tags', jsonb_build_array('house'));
  v_hdr := '{"Content-Type": "application/json"}'::jsonb;
  begin
    v_token := public.get_secret('NTFY_TOKEN');
  exception when others then v_token := null;
  end;
  if v_token is not null and btrim(v_token) <> '' then
    v_hdr := v_hdr || jsonb_build_object('Authorization', 'Bearer ' || btrim(v_token));
  end if;
  if p_email then
    select value into v_mail from app_config where key = 'admin_email';
    if v_mail is not null and btrim(v_mail) <> '' then
      v_body := v_body || jsonb_build_object('email', btrim(v_mail));
    end if;
  end if;
  -- 15 s thay cho mặc định 5 s. Đây là đường CỨU HOẢ, chờ thêm 10 giây không
  -- ảnh hưởng ai; im lặng thì ảnh hưởng tất cả.
  select net.http_post(url := 'https://ntfy.sh', body := v_body, headers := v_hdr,
                       timeout_milliseconds := 15000) into v_id;
  return v_id;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. SĐT THẬT CÓ ĐƯỜNG CHUI VÀO SỔ LỖI
-- ══════════════════════════════════════════════════════════════════════════
-- Soát 06/09: 398 dòng `bot_errors`, 0 dòng chứa SĐT, 0 dòng chứa khoá. Hôm
-- nay sạch. Nhưng đường vào thì đang mở: `sellers.phone` có UNIQUE
-- (`sellers_phone_key`), nên một lượt chèn trùng sinh lỗi 23505 mà PostgREST
-- kèm nguyên `Key (phone)=(09xxxxxxxx) already exists`. Bất kỳ
-- `ghiLoi(client, "...", e)` nào trên đường đó là một SĐT khách nằm vĩnh viễn
-- trong sổ — trái CLAUDE.md §5, và repo đang PUBLIC.
--
-- Che ở `log_loi` chứ không ở từng chỗ gọi: mọi đường ghi sổ của edge function,
-- bridge (qua escalation-feed) và web (`instrumentation.ts`) đều chảy qua đây.
-- Một chỗ sửa, không ai quên được.
create or replace function public.che_sdt(p text)
returns text language sql immutable set search_path to 'public'
as $$
  -- Giữ 4 số đầu, thay phần còn lại bằng 'x' — đúng quy ước `0903xxxxxx` của
  -- CLAUDE.md §5. Bắt cả `0…`, `84…` lẫn `+84…`.
  --
  -- HAI CÁI NEO `\m` … `\M` LÀ PHẦN QUAN TRỌNG NHẤT, đừng gỡ. Không có chúng
  -- thì hàm ăn nhầm vào GIỮA những dãy số dài — thử trên DB thật 06/09 với
  -- `3f9a0e10-0000-4b1a-9c33-000000000001` cho ra `…-0000xxxxxx01`, tức là
  -- làm hỏng UUID trong sổ lỗi để đổi lấy không gì cả. Neo hai đầu + trần
  -- `\d{5,7}` khiến dãy 12–13 số (epoch ms, đoạn UUID) không còn khớp.
  --
  -- Đã thử trên DB thật: 6/6 ca dương (10 số, 11 số, +84, 84, hai số một dòng,
  -- trong JSON) che đúng; 5/5 ca âm (chuỗi timeout của pg_net, epoch 13 số,
  -- UUID, mã tin #BDS-0001, dãy 12 số) không bị đụng.
  select regexp_replace(coalesce(p, ''), '(\+84|\m84|\m0)(\d{3})\d{5,7}\M', '0\2xxxxxx', 'g')
$$;

create or replace function public.log_loi(
  p_source text,
  p_detail text,
  p_code   integer default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_src text := left(coalesce(nullif(trim(p_source), ''), 'khong_ro'), 40);
  v_nguon int;
  v_tong int;
  v_noi_bo boolean := coalesce(auth.role(), '') = 'service_role'
                      or current_user in ('postgres', 'supabase_admin');
begin
  select count(*) filter (where source = v_src), count(*)
    into v_nguon, v_tong
    from bot_errors where at > now() - interval '1 hour';

  if v_nguon >= 20 then
    return;
  end if;
  if not v_noi_bo and v_tong >= 200 then
    return;
  end if;

  -- Che SĐT ngay trước khi ghi. Trần theo nguồn/tổng giữ nguyên như 20260905k.
  insert into bot_errors (source, status_code, detail)
  values (v_src, p_code, left(public.che_sdt(coalesce(p_detail, '')), 500));
end $$;

revoke all on function public.log_loi(text, text, integer) from public;
grant execute on function public.log_loi(text, text, integer)
  to anon, authenticated, service_role;
revoke all on function public.che_sdt(text) from public;
grant execute on function public.che_sdt(text) to service_role;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. + 4. bot_health_tick: kiểm lượt báo trước, và bridge CHƯA TỪNG điểm danh
-- ══════════════════════════════════════════════════════════════════════════
-- (3) đã nói ở trên.
-- (4) `v_dead` chỉ chạy khi `v_beat is not null`. Bridge chưa từng chạy lần nào
--     thì `bot_health` không có hàng 'bridge-zca' → nhánh canh bridge KHÔNG BAO
--     GIỜ chạy → im lặng vĩnh viễn, đúng lúc đáng báo nhất. Cùng hình lỗi với
--     SEC-02: "không có" bị lẫn với "bình thường". Nay tách ba đường: chưa từng
--     điểm danh / im quá lâu / còn sống.
create or replace function public.bot_health_tick()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'net'
as $$
declare
  v_from bigint;
  v_to   bigint;
  v_new  integer := 0;
  v_beat timestamptz;
  v_co_hang boolean;
  v_hour integer;
  v_dead boolean := false;
  v_chua_bao_gio boolean := false;
  v_cnt  integer;
  v_last text;
  v_ntfy bigint;
  v_ntfy_truoc bigint;
  v_ma_truoc integer;
  v_co_dau_vet boolean;
  v_da_gui boolean := false;
begin
  select last_id into v_from from bot_health where who = 'pg_net';
  if v_from is null then
    select coalesce(max(id), 0) into v_from from net._http_response;
    insert into bot_health (who, last_id) values ('pg_net', v_from);
  end if;

  select coalesce(max(id), v_from) into v_to from net._http_response;

  -- che_sdt ở đây nữa: dòng này chép THÂN PHẢN HỒI của một dịch vụ ngoài
  -- (`r.content`) vào sổ, không đi qua log_loi.
  insert into bot_errors (at, source, status_code, detail)
  select r.created, 'pg_net', r.status_code,
         left(public.che_sdt(coalesce(r.error_msg, r.content)), 500)
  from net._http_response r
  where r.id > v_from and r.id <= v_to
    and (r.status_code is null or r.status_code < 200 or r.status_code >= 300);
  get diagnostics v_new = row_count;
  update bot_health set last_id = v_to, at = now() where who = 'pg_net';

  v_hour := extract(hour from (now() at time zone 'Asia/Ho_Chi_Minh'))::int;
  select at into v_beat from bot_health where who = 'bridge-zca';
  v_co_hang := found;

  if v_hour between 7 and 22 then
    if not v_co_hang then
      -- (4) Chưa từng điểm danh. Trước bản này là điểm mù tuyệt đối.
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

  -- (3) Lượt báo ntfy TRƯỚC có thật sự tới không? Đây là chỗ trước đây chỉ hỏi
  -- "có đóng dấu chưa", tức tự hỏi tự trả lời.
  select last_id into v_ntfy_truoc from bot_health
   where who = 'ntfy' and at > now() - interval '1 hour';
  if v_ntfy_truoc is not null then
    select status_code into v_ma_truoc from net._http_response where id = v_ntfy_truoc;
    v_co_dau_vet := found;
    if not v_co_dau_vet then
      v_da_gui := true;             -- pg_net đã dọn (ttl) → không kết luận được
    elsif v_ma_truoc between 200 and 299 then
      v_da_gui := true;             -- tới thật
    else
      v_da_gui := false;            -- xếp hàng rồi chết: CHƯA ai nghe
      insert into bot_errors (source, detail)
      select 'coi ntfy',
             format('lượt báo trước (pg_net req %s) KHÔNG tới nơi (mã %s) — bắn lại.',
                    v_ntfy_truoc, coalesce(v_ma_truoc::text, 'timeout/không có mã'))
      where not exists (select 1 from bot_errors
                        where source = 'coi ntfy' and at > now() - interval '1 hour');
    end if;
  end if;

  select count(*) into v_cnt from bot_errors where at > now() - interval '1 hour';

  if (v_new > 0 or v_dead or v_cnt > 0)
     and not exists (select 1 from reminders
                     where kind = 'escalation' and note like '🩺%'
                       and created_at > now() - interval '1 hour') then
    update reminders set status = 'cancelled'
     where kind = 'escalation' and status = 'pending' and note like '🩺%';
    insert into reminders (kind, due_at, note)
    values ('escalation', now(),
      format('🩺 nhadat.cc: %s lỗi trong 1 giờ qua%s. Xem trang /admin.',
             v_cnt, case when v_dead then ' + bridge-zca đang im' else '' end));
  end if;

  -- Điều kiện im lặng nay là "đã gửi ĐƯỢC trong 1 giờ qua", không còn là
  -- "đã thử trong 1 giờ qua".
  if (v_new > 0 or v_dead or v_cnt > 0) and not v_da_gui then
    select left(source || ': ' || coalesce(detail, ''), 200) into v_last
      from bot_errors order by at desc limit 1;
    v_ntfy := public.canh_bao_ngoai(
      case when v_dead then 'nhadat.cc: bridge Zalo đang im' else 'nhadat.cc: có lỗi mới' end,
      format('%s lỗi trong 1 giờ qua%s. Mới nhất: %s. Xem /admin.',
             v_cnt,
             case when v_chua_bao_gio then ' + bridge-zca chưa từng điểm danh'
                  when v_dead then ' + bridge-zca im từ ' || to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI')
                  else '' end,
             coalesce(v_last, '-')),
      case when v_dead then 5 else 4 end);
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
end $$;
