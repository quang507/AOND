-- 20260923e — FR-216: tìm theo NGHĨA (RAG) cho rổ hàng.
-- Chủ dự án 23/09/2026: "giờ ưu tiên lưu luôn semantic luôn", "lưu bằng RAG … để sau này còn tìm kiếm bằng Semantic".
-- Cột + nhãn (FR-211) vẫn là thứ lọc CỨNG (giá, khu vực, loại); vector chỉ XẾP HẠNG trong nhóm đã lọc, để câu
-- khách nói mà từ điển không có ("xe hơi quay đầu", "hẻm 7 chỗ vô được") vẫn tìm ra.
--
-- Vector do DB tự tính, không cần edge function mới: cron `nhung-tick` 2 phút một lần —
--   (1) đọc kết quả lượt trước trong `net._http_response` rồi ghi `listings.nhung`,
--   (2) tin nào văn bản mô tả (`van_ban_nhung`) đổi md5 thì gửi Gemini `gemini-embedding-001` (768 chiều).
-- "Đã gọi net.http_post" KHÔNG phải bằng chứng (NFR-18): chỉ ghi vector khi ĐỌC được 200 + đúng 768 số.
-- Công tắc `app_config.tim_theo_nghia`: tat (mặc định) | bat. Tắt thì tick không gửi gì, bot không xếp theo nghĩa.

create extension if not exists vector with schema extensions;

alter table public.listings
  add column if not exists nhung extensions.vector(768),
  add column if not exists nhung_md5 text,
  add column if not exists nhung_luc timestamptz;
comment on column public.listings.nhung is
  'FR-216: vector nghĩa (Gemini gemini-embedding-001, 768 chiều) của văn bản van_ban_nhung(id). Chỉ để XẾP HẠNG trong nhóm đã lọc cứng.';
comment on column public.listings.nhung_md5 is 'FR-216: md5 văn bản đã nhúng — khác md5 hiện tại thì nhung-tick nhúng lại.';
comment on column public.listings.nhung_luc is 'FR-216: lúc ghi vector gần nhất.';

create index if not exists listings_nhung_hnsw on public.listings using hnsw (nhung extensions.vector_cosine_ops);

create table if not exists public.nhung_viec (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  request_id bigint not null,
  md5 text not null,
  gui_luc timestamptz not null default now()
);
comment on table public.nhung_viec is
  '[BOT & HÀNG ĐỢI] FR-216: tin đang chờ Gemini trả vector (request pg_net). nhung-tick đọc kết quả rồi xoá dòng.';
alter table public.nhung_viec enable row level security;
revoke all on public.nhung_viec from anon, authenticated;

-- Văn bản mô tả một tin để nhúng: cột chính + nhãn + mọi fact (mới nhất mỗi khoá). SĐT che qua che_sdt().
-- Không lấy `description` (câu rao gốc, có thể lẫn liên hệ); fact đã chứa phần dữ liệu của nó.
create or replace function public.van_ban_nhung(p_id uuid)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select public.che_sdt(concat_ws('. ',
    (case l.deal when 'cho_thue' then 'Cho thuê ' else 'Bán ' end) ||
      case l.property_type
        when 'nha_pho' then 'nhà phố' when 'nha_cap4' then 'nhà cấp 4' when 'chung_cu' then 'căn hộ chung cư'
        when 'dat' then 'đất' when 'biet_thu' then 'biệt thự' when 'phong_tro' then 'phòng trọ'
        when 'mat_bang' then 'mặt bằng' when 'toa_nha' then 'toà nhà, căn hộ dịch vụ'
        when 'dat_nong_nghiep' then 'đất nông nghiệp' when 'dat_kinh_doanh' then 'đất kinh doanh'
        when 'kho_xuong' then 'kho xưởng' else 'bất động sản' end,
    nullif(concat_ws(', ', l.location_raw, l.street, l.ward, l.district), ''),
    (select 'Dự án ' || p.name from public.projects p where p.id = l.project_id),
    case when l.area_m2 is not null then 'Diện tích ' || trim_scale(l.area_m2) || ' m2' end,
    case when l.frontage_m is not null and l.length_m is not null
      then 'Ngang ' || trim_scale(l.frontage_m) || ' m, dài ' || trim_scale(l.length_m) || ' m' end,
    case when l.price_raw is not null then 'Giá ' || l.price_raw end,
    coalesce(l.floors_text, case when l.floors is not null then l.floors || ' tầng' end),
    case when l.bedrooms is not null then l.bedrooms || ' phòng ngủ' end,
    case when l.bathrooms is not null then l.bathrooms || ' WC' end,
    case l.access_type
      when 'mat_tien' then 'Mặt tiền đường' when 'hem_xe_tai' then 'Hẻm xe tải'
      when 'hem_xe_hoi' then 'Hẻm xe hơi' when 'hem_xe_may' then 'Hẻm xe máy' when 'hem' then 'Trong hẻm' end ||
      case when l.alley_width_m is not null then ' rộng ' || trim_scale(l.alley_width_m) || ' m' else '' end,
    case l.legal_status
      when 'so_hong_rieng' then 'Sổ hồng riêng' when 'so_hong_chung' then 'Sổ hồng chung' when 'so_hong' then 'Có sổ'
      when 'hdmb' then 'Hợp đồng mua bán' when 'giay_tay' then 'Giấy tay' end ||
      case when l.has_completion then ', đã hoàn công' else '' end,
    case when l.direction is not null then 'Hướng ' || l.direction end,
    case when l.floor is not null then 'Tầng ' || l.floor end,
    case when l.car_in_house then 'Xe hơi vào tận nhà' end,
    case when l.corner_lot then 'Căn góc' end,
    case when l.has_elevator then 'Có thang máy' end,
    case when coalesce(array_length(l.nhan, 1), 0) > 0
      then 'Đặc điểm: ' || array_to_string(array(select replace(x, '_', ' ') from unnest(l.nhan) x), ', ') end,
    (select string_agg(replace(f.question, '_', ' ') || ': ' || f.answer, '. ' order by f.question)
       from (select distinct on (question) question, answer
               from public.listing_facts
              where listing_id = l.id and coalesce(answer, '') <> ''
                and question not in ('hinh_anh', 'duyet_tin', 'danh_gia', 'xac_nhan_lich', 'con_ban', 'nhan')
              order by question, created_at desc) f)
  ))
  from public.listings l where l.id = p_id;
$$;
comment on function public.van_ban_nhung(uuid) is 'FR-216: văn bản mô tả một tin để nhúng vector (cột + nhãn + fact, SĐT đã che).';
revoke execute on function public.van_ban_nhung(uuid) from public, anon, authenticated;
grant execute on function public.van_ban_nhung(uuid) to service_role;

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
begin
  -- (1) Thu kết quả lượt trước. Chưa có phản hồi thì chờ; quá 10 phút thì bỏ, tick sau gửi lại.
  for v in
    select nv.listing_id, nv.md5, nv.gui_luc, h.status_code, h.content, h.error_msg
      from public.nhung_viec nv left join net._http_response h on h.id = nv.request_id
  loop
    if v.status_code is null and v.error_msg is null then
      if v.gui_luc < now() - interval '10 minutes' then
        delete from public.nhung_viec where listing_id = v.listing_id;
      end if;
      continue;
    end if;
    if v.status_code = 200 then
      v_vals := (v.content::jsonb) -> 'embedding' -> 'values';
      if jsonb_typeof(v_vals) = 'array' and jsonb_array_length(v_vals) = 768 then
        update public.listings set nhung = (v_vals::text)::extensions.vector, nhung_md5 = v.md5, nhung_luc = now()
         where id = v.listing_id;
      else
        perform public.log_loi('nhung-tick', 'Gemini embed trả khuôn lạ cho tin ' || v.listing_id, null);
      end if;
    else
      perform public.log_loi('nhung-tick',
        'Gemini embed ' || coalesce(v.status_code::text, '?') || ' ' || left(coalesce(v.error_msg, v.content, ''), 200),
        v.status_code);
    end if;
    delete from public.nhung_viec where listing_id = v.listing_id;
  end loop;

  -- (2) Gửi lượt mới: tin còn sống mà văn bản đổi so với lần nhúng trước. Tối đa 20 tin một tick.
  if coalesce(public.cau_hinh('tim_theo_nghia'), 'tat') <> 'bat' then return; end if;
  v_key := public.get_secret('GEMINI_API_KEY');
  if v_key is null then return; end if;
  for r in
    select l.id, l.nhung_md5 from public.listings l
     where l.status in ('cho_thong_tin', 'dang_ban', 'dang_quan_tam')
       and not exists (select 1 from public.nhung_viec nv where nv.listing_id = l.id)
     order by l.updated_at desc nulls last
     limit 300
  loop
    exit when v_gui >= 20;
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
end $$;
comment on function public.nhung_tick() is 'FR-216: cron nhung-tick — thu vector lượt trước, gửi Gemini nhúng tin mới/đổi (≤ 20 tin/tick).';
revoke execute on function public.nhung_tick() from public, anon, authenticated;

-- Xếp hạng theo nghĩa TRONG nhóm mã tin đã lọc cứng (bot) — hoặc cả kho đang lên kệ khi không truyền mã.
create or replace function public.tim_tin_theo_nghia(p_vec double precision[], p_codes text[] default null, p_limit integer default 10)
returns table (code text, do_gan double precision)
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select l.code, 1 - (l.nhung <=> (p_vec::extensions.vector(768)))
    from public.listings l
   where l.nhung is not null
     and l.status in ('dang_ban', 'dang_quan_tam')
     and (p_codes is null or l.code = any (p_codes))
   order by l.nhung <=> (p_vec::extensions.vector(768))
   limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;
comment on function public.tim_tin_theo_nghia(double precision[], text[], integer) is
  'FR-216: xếp tin theo độ gần nghĩa với vector câu tìm (768 chiều). Chỉ tin đang lên kệ, chỉ trong p_codes nếu có.';
revoke execute on function public.tim_tin_theo_nghia(double precision[], text[], integer) from public, anon, authenticated;
grant execute on function public.tim_tin_theo_nghia(double precision[], text[], integer) to service_role;

insert into public.app_config (key, value, ghi_chu)
values ('tim_theo_nghia', 'tat', 'FR-216: tat | bat — bật thì cron nhúng vector tin và bot người mua xếp kho theo nghĩa.')
on conflict (key) do nothing;

select cron.schedule('nhung-tick', '*/2 * * * *', 'select public.nhung_tick()');
