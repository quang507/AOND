-- 20261028a — Kho nguyên văn điều luật + vector nghĩa (SRS-5.1zzzzzzz231). Chủ dự án 28/10/2026: "cho supabase nhúng vector hóa đi"
-- → chọn "nguyên văn luật" và "24 câu + trích điều": khách hỏi pháp lý thì bot vẫn đáp bằng 24 câu soạn sẵn (src/aioi/phap_ly.py)
-- nhưng kèm ĐÚNG điều luật tra được theo nghĩa; câu ngoài 24 mục thì bot chỉ tóm điều tra được, ghi "tham khảo", không suy diễn.
--
-- Nguồn: nguyên văn Công báo / văn bản hợp nhất (VBHN) tải từ datafiles.chinhphu.vn, vanban.chinhphu.vn (cổng pháp điển
-- phapdien.moj.gov.vn không vào được từ máy dựng). Chữ tách bằng scripts/tach-dieu-luat.py, nạp bằng scripts/nap-luat.mjs
-- (apply-migration ô `nap-luat`) — KHÔNG ghi tay vào hai bảng này. Vector do lịch `nhung-luat-tick` nuôi, cùng model / khoá nền /
-- mốc tạm dừng với nhung-tick và nhung-dia-danh-tick (chung hạn mức Gemini).

create table if not exists public.van_ban_luat (
  so_hieu        text primary key,
  ten            text not null,
  loai           text not null check (loai in ('luat', 'bo_luat', 'nghi_dinh', 'thong_tu', 'nghi_quyet', 'vbhn')),
  ngay_hieu_luc  date,
  con_hieu_luc   boolean not null default true,
  nguon_url      text not null,
  ghi_chu        text,
  nap_luc        timestamptz not null default now()
);

create table if not exists public.dieu_luat (
  id          bigint generated always as identity primary key,
  so_hieu     text not null references public.van_ban_luat (so_hieu) on delete cascade,
  dieu        text not null,
  phan        int not null default 1 check (phan between 1 and 99),
  tieu_de     text not null,
  noi_dung    text not null,
  nhung       extensions.halfvec(768),
  nhung_md5   text,
  nhung_luc   timestamptz,
  unique (so_hieu, dieu, phan)
);
create index if not exists dieu_luat_nhung_hnsw on public.dieu_luat using hnsw (nhung extensions.halfvec_cosine_ops);

create table if not exists public.nhung_viec_luat (
  dieu_id     bigint primary key references public.dieu_luat (id) on delete cascade,
  request_id  bigint not null,
  md5         text not null,
  gui_luc     timestamptz not null default now()
);

-- Chỉ lõi (service_role) đọc / ghi. Project này cấp sẵn quyền cho anon / authenticated qua default privileges → thu hồi TRƯỚC.
alter table public.van_ban_luat enable row level security;
alter table public.dieu_luat enable row level security;
alter table public.nhung_viec_luat enable row level security;
revoke all on public.van_ban_luat, public.dieu_luat, public.nhung_viec_luat from anon, authenticated;
drop policy if exists van_ban_luat_admin_doc on public.van_ban_luat;
create policy van_ban_luat_admin_doc on public.van_ban_luat as permissive for select to authenticated using (la_admin());
drop policy if exists dieu_luat_admin_doc on public.dieu_luat;
create policy dieu_luat_admin_doc on public.dieu_luat as permissive for select to authenticated using (la_admin());
grant select on public.van_ban_luat, public.dieu_luat to authenticated;

comment on table public.van_ban_luat is '[BOT & HÀNG ĐỢI] Văn bản pháp luật nguyên văn bot được trích (SRS-5.1zzzzzzz231): số hiệu, tên, hiệu lực, link nguồn chính thức. Nạp bằng scripts/nap-luat.mjs, không ghi tay. con_hieu_luc = false thì tim_dieu_luat bỏ qua.';
comment on table public.dieu_luat is '[BOT & HÀNG ĐỢI] Nguyên văn từng điều luật (điều dài cắt thành nhiều phần theo khoản) + vector nghĩa Gemini 768 chiều. Lịch nhung-luat-tick nuôi vector; lõi tra bằng tim_dieu_luat khi khách hỏi pháp lý (SRS-5.1zzzzzzz231).';
comment on table public.nhung_viec_luat is '[BOT & HÀNG ĐỢI] Hàng đợi nhúng của dieu_luat: một dòng = một lượt gọi Gemini chưa thu kết quả (request_id của net.http_post). Rỗng là bình thường.';
comment on column public.dieu_luat.dieu is 'Số điều như in trong văn bản ("45", "3a").';
comment on column public.dieu_luat.phan is 'Phần thứ mấy khi một điều quá dài bị cắt theo khoản (1 = phần đầu / cả điều).';
comment on column public.dieu_luat.nhung is 'Vector nghĩa 768 chiều (gemini-embedding-001, RETRIEVAL_DOCUMENT, halfvec) của "<tên văn bản> — <tiêu đề điều>\n<nội dung>". Lịch nhung-luat-tick nuôi; null = chưa nhúng.';

-- Văn bản đưa đi nhúng — MỘT chỗ, md5 của nó quyết có phải nhúng lại không.
create or replace function public.van_ban_dieu_luat(p_id bigint)
 returns text
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select v.ten || ' — ' || d.tieu_de || case when d.phan > 1 then ' (tiếp, phần ' || d.phan || ')' else '' end || E'\n' || d.noi_dung
    from public.dieu_luat d join public.van_ban_luat v on v.so_hieu = d.so_hieu
   where d.id = p_id
$function$;

create or replace function public.nhung_luat_tick()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
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
  -- (1) Thu kết quả lượt trước. "Đã gọi net.http_post" KHÔNG phải bằng chứng (NFR-18): chỉ ghi vector khi đọc được 200 + đúng 768 số.
  for v in
    select nv.dieu_id, nv.md5, nv.gui_luc, h.status_code, h.content, h.error_msg
      from public.nhung_viec_luat nv left join net._http_response h on h.id = nv.request_id
  loop
    if v.status_code is null and v.error_msg is null then
      if v.gui_luc < now() - interval '10 minutes' then
        delete from public.nhung_viec_luat where dieu_id = v.dieu_id;
      end if;
      continue;
    end if;
    if v.status_code = 200 then
      v_vals := (v.content::jsonb) -> 'embedding' -> 'values';
      if jsonb_typeof(v_vals) = 'array' and jsonb_array_length(v_vals) = 768 then
        v_ok := true;
        update public.dieu_luat set nhung = (v_vals::text)::extensions.halfvec, nhung_md5 = v.md5, nhung_luc = now() where id = v.dieu_id;
      else
        perform public.log_loi('nhung-luat-tick', 'Gemini embed trả khuôn lạ cho dieu_luat ' || v.dieu_id, null);
      end if;
    else
      v_tu_choi := true;
      v_ma := coalesce(v_ma, v.status_code);
      v_mau := coalesce(v_mau, left(coalesce(v.error_msg, v.content, ''), 200));
      v_ngay := v_ngay or coalesce(v.content, '') ilike '%PerDay%';
    end if;
    delete from public.nhung_viec_luat where dieu_id = v.dieu_id;
  end loop;

  -- Gemini từ chối → cùng cách giãn nhịp / đổi khoá / mốc tạm dừng CHUNG với nhung-tick và nhung-dia-danh-tick (chung hạn mức).
  v_loi := coalesce(nullif(public.cau_hinh('nhung_lan_loi'), '')::int, 0);
  if v_tu_choi and v_ma = 429 and public.nhung_doi_khoa() then
    v_tu_choi := false;
  end if;
  if v_tu_choi then
    v_loi := v_loi + 1;
    v_dung := now() + make_interval(mins => case when v_ma = 402 then 60 else least(60, (2 ^ least(v_loi, 6))::int) end);
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
      perform public.log_loi('nhung-luat-tick',
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

  -- (2) Gửi mẻ mới — chỉ khi tin rao, dự án, địa danh không chờ (tin rao của khách đi trước kho luật).
  if coalesce(public.cau_hinh('tim_theo_nghia'), 'tat') <> 'bat' then return; end if;
  v_dung := nullif(public.cau_hinh('nhung_tam_dung_den'), '')::timestamptz;
  if v_dung is not null and v_dung > now() then return; end if;
  if exists (select 1 from public.nhung_viec) or exists (select 1 from public.nhung_viec_du_an)
     or exists (select 1 from public.nhung_viec_dia_danh) or exists (select 1 from public.nhung_viec_luat) then return; end if;
  v_key := public.khoa_nhung_nen();
  if v_key is null then return; end if;
  v_tran := greatest(1, least(coalesce(nullif(public.cau_hinh('nhung_luat_moi_tick'), '')::int, 20), 50));

  for r in
    select d.id, d.nhung_md5 from public.dieu_luat d join public.van_ban_luat vb on vb.so_hieu = d.so_hieu
     where vb.con_hieu_luc and d.nhung is null order by d.id limit 100
  loop
    exit when v_gui >= v_tran;
    v_txt := public.van_ban_dieu_luat(r.id);
    if v_txt is null or length(v_txt) < 10 then continue; end if;
    v_md5 := md5(v_txt);
    insert into public.nhung_viec_luat (dieu_id, request_id, md5)
    values (r.id, net.http_post(
      url := 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-goog-api-key', v_key),
      body := jsonb_build_object(
        'content', jsonb_build_object('parts', jsonb_build_array(jsonb_build_object('text', left(v_txt, 4000)))),
        'taskType', 'RETRIEVAL_DOCUMENT', 'outputDimensionality', 768),
      timeout_milliseconds := 20000), v_md5);
    v_gui := v_gui + 1;
  end loop;
end $function$;

-- Sửa chữ một điều (nạp lại) thì vector cũ không còn đúng → xoá để nhúng lại. md5 so với văn bản nhúng, không so cột rời.
create or replace function public.dieu_luat_doi_chu()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.tieu_de is distinct from old.tieu_de or new.noi_dung is distinct from old.noi_dung then
    new.nhung := null; new.nhung_md5 := null; new.nhung_luc := null;
  end if;
  return new;
end $function$;
drop trigger if exists dieu_luat_doi_chu on public.dieu_luat;
create trigger dieu_luat_doi_chu before update on public.dieu_luat for each row execute function public.dieu_luat_doi_chu();

-- Tìm theo nghĩa: lõi nhúng câu khách (RETRIEVAL_QUERY) rồi gọi hàm này. Chỉ văn bản còn hiệu lực.
create or replace function public.tim_dieu_luat(p_vec double precision[], p_limit integer default 5, p_so_hieu text[] default null)
 returns table(so_hieu text, ten_van_ban text, nguon_url text, dieu text, phan integer, tieu_de text, noi_dung text, do_gan double precision)
 language sql
 stable security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
  with v as (select p_vec::extensions.halfvec(768) as q)
  select d.so_hieu, vb.ten, vb.nguon_url, d.dieu, d.phan, d.tieu_de, d.noi_dung, 1 - (d.nhung <=> v.q) as do_gan
    from public.dieu_luat d join public.van_ban_luat vb on vb.so_hieu = d.so_hieu, v
   where d.nhung is not null and vb.con_hieu_luc and (p_so_hieu is null or d.so_hieu = any(p_so_hieu))
   order by d.nhung <=> v.q
   limit greatest(1, least(coalesce(p_limit, 5), 20));
$function$;
revoke all on function public.tim_dieu_luat(double precision[], integer, text[]) from public, anon, authenticated;
grant execute on function public.tim_dieu_luat(double precision[], integer, text[]) to service_role;
revoke all on function public.nhung_luat_tick() from public, anon, authenticated;
revoke all on function public.van_ban_dieu_luat(bigint) from public, anon, authenticated;

insert into public.app_config (key, value, ghi_chu)
values ('nhung_luat_moi_tick', '20', 'Số điều luật nhung-luat-tick gửi Gemini nhúng mỗi lượt 2 phút (1–50), SRS-5.1zzzzzzz231')
on conflict (key) do nothing;

select cron.unschedule('nhung-luat-tick') where exists (select 1 from cron.job where jobname = 'nhung-luat-tick');
select cron.schedule('nhung-luat-tick', '1-59/2 * * * *', 'select public.nhung_luat_tick()');
