-- 20260904a — FR-152 (e): kênh cảnh báo NGOÀI bridge.
--
-- Sự cố 27/08 → 04/09/2026: bridge-zca (chạy trên máy local) im 8 ngày. Nhịp
-- kiểm 15 phút PHÁT HIỆN đúng (117 dòng "bridge im" trong bot_errors) nhưng
-- lời cảnh báo 🩺 đi ra bằng reminders → escalation-feed → CHÍNH cái bridge đã
-- chết, nên 117 tin nằm chờ, không ai biết. Hệ thống biết mình chết mà chỉ tự
-- nói với mình.
--
-- Sửa: nhịp kiểm gọi thẳng ntfy.sh (pg_net, không token, không phụ thuộc
-- bridge/OA) tới một topic ngẫu nhiên lưu ở app_config. Chủ dự án cài app ntfy
-- và đăng ký đúng topic → nhận push trên điện thoại. 1 tin/giờ (bot_health
-- who='ntfy'). Cùng lúc: 🩺 cũ quá 1 giờ chưa gửi được thì huỷ (giữ tin mới
-- nhất), báo cáo CTV quá 36 giờ chưa gửi cũng huỷ — bridge sống lại không xả
-- một tràng tin cũ.

-- ── Topic ntfy (ngẫu nhiên, ai biết tên là đọc được → không dán nơi công khai)
insert into public.app_config (key, value, ghi_chu)
values ('ntfy_topic', 'nhadat-' || encode(gen_random_bytes(12), 'hex'),
        'FR-152 e: topic ntfy.sh nhận cảnh báo sức khoẻ bot. Đăng ký đúng tên này trên app ntfy. Xoá giá trị = tắt kênh.')
on conflict (key) do nothing;

-- ── Gửi một cảnh báo ra ngoài. Trả về id yêu cầu pg_net (kết quả thật nằm ở
--    net._http_response; nhịp kiểm sau sẽ tự soi nó như mọi request khác).
create or replace function public.canh_bao_ngoai(p_title text, p_text text, p_priority int default 4)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'net'
as $$
declare v_topic text; v_id bigint;
begin
  select value into v_topic from app_config where key = 'ntfy_topic';
  if v_topic is null or btrim(v_topic) = '' then return null; end if;
  select net.http_post(
    url     := 'https://ntfy.sh',
    body    := jsonb_build_object('topic', v_topic, 'title', left(p_title, 120),
                                  'message', left(p_text, 900), 'priority', p_priority,
                                  'tags', jsonb_build_array('house')),
    headers := '{"Content-Type": "application/json"}'::jsonb
  ) into v_id;
  return v_id;
end $$;
revoke all on function public.canh_bao_ngoai(text, text, int) from public, anon, authenticated;
comment on function public.canh_bao_ngoai(text, text, int) is 'FR-152 e: đẩy cảnh báo ra ntfy.sh, không qua bridge/OA. Chỉ service_role/cron.';

-- ── Nhịp kiểm: thêm ntfy + dọn tin treo. Phần quét pg_net, nhịp tim, 🩺 giữ nguyên.
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
  v_hour integer;
  v_dead boolean := false;
  v_cnt  integer;
  v_last text;
  v_ntfy bigint;
begin
  select last_id into v_from from bot_health where who = 'pg_net';
  if v_from is null then
    select coalesce(max(id), 0) into v_from from net._http_response;
    insert into bot_health (who, last_id) values ('pg_net', v_from);
  end if;

  select coalesce(max(id), v_from) into v_to from net._http_response;

  insert into bot_errors (at, source, status_code, detail)
  select r.created, 'pg_net', r.status_code,
         left(coalesce(r.error_msg, r.content), 500)
  from net._http_response r
  where r.id > v_from and r.id <= v_to
    and (r.status_code is null or r.status_code < 200 or r.status_code >= 300);
  get diagnostics v_new = row_count;
  update bot_health set last_id = v_to, at = now() where who = 'pg_net';

  v_hour := extract(hour from (now() at time zone 'Asia/Ho_Chi_Minh'))::int;
  select at into v_beat from bot_health where who = 'bridge-zca';
  if v_beat is not null and v_hour between 7 and 22
     and v_beat < now() - interval '15 minutes' then
    v_dead := true;
    insert into bot_errors (source, detail)
    select 'bridge', format('bridge-zca im từ %s (VN)',
                            to_char(v_beat at time zone 'Asia/Ho_Chi_Minh',
                                    'DD/MM HH24:MI'))
    where not exists (select 1 from bot_errors
                      where source = 'bridge' and at > now() - interval '1 hour');
  end if;

  select count(*) into v_cnt from bot_errors where at > now() - interval '1 hour';

  -- Còi trong nhà (đi qua bridge, như cũ): gộp 1 tin/giờ.
  if (v_new > 0 or v_dead or v_cnt > 0)
     and not exists (select 1 from reminders
                     where kind = 'escalation' and note like '🩺%'
                       and created_at > now() - interval '1 hour') then
    -- 🩺 cũ chưa đi được thì huỷ trước — bridge sống lại chỉ nhận tin mới nhất.
    update reminders set status = 'cancelled'
     where kind = 'escalation' and status = 'pending' and note like '🩺%';
    insert into reminders (kind, due_at, note)
    values ('escalation', now(),
      format('🩺 nhadat.cc: %s lỗi trong 1 giờ qua%s. Xem trang /admin.',
             v_cnt, case when v_dead then ' + bridge-zca đang im' else '' end));
  end if;

  -- Còi NGOÀI (FR-152 e): ntfy.sh, không qua bridge. 1 tin/giờ.
  if (v_new > 0 or v_dead or v_cnt > 0)
     and not exists (select 1 from bot_health where who = 'ntfy' and at > now() - interval '1 hour') then
    select left(source || ': ' || coalesce(detail, ''), 200) into v_last
      from bot_errors order by at desc limit 1;
    v_ntfy := public.canh_bao_ngoai(
      case when v_dead then 'nhadat.cc: bridge Zalo đang im' else 'nhadat.cc: có lỗi mới' end,
      format('%s lỗi trong 1 giờ qua%s. Mới nhất: %s. Xem /admin.',
             v_cnt, case when v_dead then ' + bridge-zca im từ ' || to_char(v_beat at time zone 'Asia/Ho_Chi_Minh', 'DD/MM HH24:MI') else '' end,
             coalesce(v_last, '-')),
      case when v_dead then 5 else 4 end);
    insert into bot_health (who, at, last_id) values ('ntfy', now(), coalesce(v_ntfy, 0))
    on conflict (who) do update set at = now(), last_id = excluded.last_id;
  end if;

  -- Báo cáo CTV của ngày cũ chưa gửi được thì thôi — không ai cần bản 27/08 vào 04/09.
  update reminders set status = 'cancelled'
   where kind = 'report' and status = 'pending' and created_at < now() - interval '36 hours';

  delete from bot_errors where at < now() - interval '30 days';

  return jsonb_build_object('loi_moi', v_new, 'bridge_im', v_dead,
                            'quet_toi', v_to, 'ntfy', v_ntfy);
end $$;
