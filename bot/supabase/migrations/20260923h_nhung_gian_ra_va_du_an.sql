-- 20260923h — FR-216 (g), chủ dự án 23/09/2026 đêm: "lấy key free này đi, chạy bị kẹt thì dãn ra, các dự án xong chưa,
-- tự chạy cho đến khi xong luôn đi".
-- (1) nhung-tick GIÃN RA khi Gemini từ chối (402 hết tiền nạp trước / 429 quá hạn mức / 5xx): tạm dừng 2 → 4 → 8 … 60 phút
--     (402 thì 60 phút ngay), ghi sổ MỘT lần mỗi đợt thay vì 2 phút một dòng; thành công là trả về nhịp thường.
--     Mỗi tick chỉ gửi khi lượt trước đã thu xong (một mẻ một lúc), mẻ tối đa `app_config.nhung_moi_tick` (mặc định 10).
-- (2) Nhúng KHO DỰ ÁN (1.639 dự án): projects.nhung + hàng chờ nhung_viec_du_an; tin rao ưu tiên trước, dự án sau.
--     Văn bản dự án bỏ `amenities` (bản cào mogi dính chân trang "Chịu trách nhiệm chính…", "Giấy phép số…").
-- (3) tim_nghia_san_sang(): chat-reply chỉ gọi Gemini khi công tắc bật + có khoá + KHÔNG đang tạm dừng.
-- (4) Còi "HẾT TIỀN API" (bat_het_tien_api) không còn coi lỗi 402 của Gemini embedding là "bộ não câm, nạp Anthropic"
--     (23/09 17:12 báo nhầm như vậy trong khi Claude vẫn trả lời bình thường).

insert into public.app_config (key, value, ghi_chu) values
  ('nhung_tam_dung_den', '', 'FR-216 g: nhung-tick TỰ ĐẶT — Gemini từ chối thì tạm dừng tới mốc này (ISO UTC); rỗng = đang chạy.'),
  ('nhung_lan_loi', '0', 'FR-216 g: nhung-tick TỰ ĐẶT — số lượt Gemini từ chối liên tiếp (dãn 2, 4, 8 … 60 phút).'),
  ('nhung_moi_tick', '10', 'FR-216 g: số lượt gửi Gemini tối đa mỗi tick 2 phút (tin rao trước, dự án sau). Hạn mức free thấp thì hạ xuống.')
on conflict (key) do nothing;

alter table public.projects
  add column if not exists nhung extensions.vector(768),
  add column if not exists nhung_md5 text,
  add column if not exists nhung_luc timestamptz;
comment on column public.projects.nhung is 'FR-216 g: vector nghĩa (Gemini gemini-embedding-001, 768 chiều) của van_ban_du_an(id).';
comment on column public.projects.nhung_md5 is 'FR-216 g: md5 văn bản đã nhúng — khác md5 hiện tại thì nhung-tick nhúng lại.';
comment on column public.projects.nhung_luc is 'FR-216 g: lúc ghi vector gần nhất.';
create index if not exists projects_nhung_hnsw on public.projects using hnsw (nhung extensions.vector_cosine_ops);

create table if not exists public.nhung_viec_du_an (
  project_id uuid primary key references public.projects(id) on delete cascade,
  request_id bigint not null,
  md5 text not null,
  gui_luc timestamptz not null default now()
);
comment on table public.nhung_viec_du_an is
  '[BOT & HÀNG ĐỢI] FR-216 g: dự án đang chờ Gemini trả vector (request pg_net). nhung-tick đọc kết quả rồi xoá dòng.';
alter table public.nhung_viec_du_an enable row level security;
revoke all on public.nhung_viec_du_an from anon, authenticated;

-- Văn bản mô tả một dự án để nhúng: tên, chủ đầu tư, nơi chốn, mô tả, tình trạng, giá, bàn giao. SĐT che qua che_sdt().
create or replace function public.van_ban_du_an(p_id uuid)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select public.che_sdt(concat_ws('. ',
    'Dự án ' || p.name,
    case when p.developer is not null then 'Chủ đầu tư ' || p.developer end,
    nullif(concat_ws(', ', p.location_raw, p.ward, p.district, p.province), ''),
    left(p.description, 2000),
    case when p.status_text is not null then 'Tình trạng: ' || p.status_text end,
    case when p.specs ->> 'gia_dong' is not null then p.specs ->> 'gia_dong' end,
    case when p.handover is not null then 'Bàn giao ' || p.handover end,
    case when p.legal_status is not null then 'Pháp lý ' || p.legal_status end
  ))
  from public.projects p where p.id = p_id;
$$;
comment on function public.van_ban_du_an(uuid) is 'FR-216 g: văn bản mô tả một dự án để nhúng vector (không lấy amenities — dính chân trang nguồn cào).';
revoke execute on function public.van_ban_du_an(uuid) from public, anon, authenticated;
grant execute on function public.van_ban_du_an(uuid) to service_role;

create or replace function public.nhung_tick()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
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
     where l.status in ('cho_thong_tin', 'dang_ban', 'dang_quan_tam')
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
end $$;
comment on function public.nhung_tick() is
  'FR-216: cron nhung-tick — thu vector lượt trước, gửi Gemini nhúng tin rao rồi dự án (≤ nhung_moi_tick / tick); Gemini từ chối thì giãn 2→60 phút.';
revoke execute on function public.nhung_tick() from public, anon, authenticated;

-- chat-reply hỏi MỘT lần: công tắc bật + có khoá + không đang tạm dừng → mới nhúng câu tìm.
create or replace function public.tim_nghia_san_sang()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.cau_hinh('tim_theo_nghia'), 'tat') = 'bat'
     and coalesce(nullif(public.cau_hinh('nhung_tam_dung_den'), '')::timestamptz, '-infinity'::timestamptz) <= now()
     and public.get_secret('GEMINI_API_KEY') is not null;
$$;
comment on function public.tim_nghia_san_sang() is 'FR-216 g: bật tìm theo nghĩa + có khoá Gemini + nhung-tick không đang tạm dừng.';
revoke execute on function public.tim_nghia_san_sang() from public, anon, authenticated;
grant execute on function public.tim_nghia_san_sang() to service_role;

-- Dự án gần nghĩa nhất với câu tìm (dùng về sau: khách hỏi "dự án nào gần trường quốc tế, có hồ bơi…").
create or replace function public.tim_du_an_theo_nghia(p_vec double precision[], p_limit integer default 5)
returns table (id uuid, name text, do_gan double precision)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select p.id, p.name, 1 - (p.nhung <=> (p_vec::extensions.vector(768)))
    from public.projects p
   where p.nhung is not null
   order by p.nhung <=> (p_vec::extensions.vector(768))
   limit greatest(1, least(coalesce(p_limit, 5), 30));
$$;
comment on function public.tim_du_an_theo_nghia(double precision[], integer) is 'FR-216 g: xếp dự án theo độ gần nghĩa với vector câu tìm (768 chiều).';
revoke execute on function public.tim_du_an_theo_nghia(double precision[], integer) from public, anon, authenticated;
grant execute on function public.tim_du_an_theo_nghia(double precision[], integer) to service_role;

-- Còi hết tiền: lỗi của Gemini embedding (nhung-tick, hay phản hồi pg_net từ ai.studio / generativelanguage) KHÔNG phải
-- "bộ não câm" — Claude vẫn trả lời. Chỉ đổi phần lọc đầu hàm; phần còn lại giữ nguyên.
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
  if new.source = 'nhung-tick'
     or lower(coalesce(new.detail, '')) like '%ai.studio%'
     or lower(coalesce(new.detail, '')) like '%generativelanguage%' then
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
