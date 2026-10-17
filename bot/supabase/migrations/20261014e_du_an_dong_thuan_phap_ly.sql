-- 20261014e — thông tin DỰ ÁN tự xác nhận theo đồng thuận người rao + điểm uy tín (giống AOND), căn hộ dự án không hỏi pháp lý khi
-- dự án đã có pháp lý, chữ "thiếu pháp lý" của căn hộ đúng câu căn hộ (SRS-5.1zzzzzzz19).
--
-- Chủ dự án 14/10/2026: "Bật cái thu thập thông tin dự án lên nếu 5 người đưa dữ liệu về dự án vào thì xác nhận tin đúng dựa theo điểm uy
-- tín của người rao nữa giống bên AOND" → (hỏi lại) "Làm giống bên AOND, giờ ko duyệt tay"; "câu hỏi về dự án không cần hỏi về pháp lý"
-- → chọn "chỉ bỏ khi kho dự án đã có pháp lý"; "sao câu pháp lý nãy test nó cứ hỏi về sổ hồng riêng".
--
-- (1) AOND (`src/aioi/projects.py`, demo của AOND): mỗi điều người rao kể về dự án là MỘT PHIẾU theo người rao (một người một phiếu mỗi
--     khoá; nói giá trị khác thì phiếu CHUYỂN sang giá trị mới); giá trị dẫn đầu CHỐT khi có ≥ SETTLE_N người KHÁC NHAU và phe nói khác
--     ≤ N/3. AOND đặt N = 6; chủ dự án đặt 5. Thêm theo lời chủ dự án: phiếu mang TRỌNG SỐ điểm uy tín người rao (`diem_nguoi_ban`, sàn
--     10 điểm để người mới vẫn có tiếng) — giá trị dẫn đầu là giá trị có tổng trọng số cao nhất, và phe nói khác so bằng trọng số.
--     Trước bản này: hàng `project_facts` chờ admin bấm duyệt, người thứ hai nói cùng giá trị bị `on conflict do nothing` nuốt — không đếm
--     được ai xác nhận. Nay không duyệt tay: chốt là tự ghi vào `projects` (cùng đường `duyet_fact_du_an`), phe thua thành `bo`.
--     Khoá tiện ích (tien_ich_gan / tien_ich / ha_tang / khu_compound) là DANH SÁCH: hồ bơi với phòng gym không chọi nhau — mỗi giá trị
--     tự chốt khi đủ người, không có phe nói khác.
-- (2) Căn hộ đã gắn dự án mà dự án có pháp lý (cột `legal_status` hoặc specs `phap_ly` / `so_huu`) → ô `phap_ly` coi như có (view
--     `listing_missing_facts` + điểm `diem_tin`): không hỏi, không trừ điểm.
-- (3) Chữ thiếu pháp lý của căn hộ "sổ hồng riêng hay chung" (20261014d) đổi thành "đã ra sổ hồng hay còn hợp đồng mua bán" — câu lệnh
--     model đọc chữ này làm ý cần hỏi, nên bot hỏi căn hộ "sổ riêng hay chung" (Zalo thật 14/10 10:15).

-- ─── (2) pháp lý dự án ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.du_an_co_phap_ly(p_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_project_id is not null and exists (
    select 1 from projects p
     where p.id = p_project_id
       and (coalesce(btrim(p.legal_status), '') <> ''
            or coalesce(btrim(p.specs ->> 'phap_ly'), '') <> ''
            or coalesce(btrim(p.specs ->> 'so_huu'), '') <> ''))
$$;
comment on function public.du_an_co_phap_ly(uuid) is
  '[RỔ HÀNG] Dự án đã có pháp lý trong kho (legal_status hoặc specs phap_ly / so_huu) — căn hộ của dự án không hỏi pháp lý (20261014e).';
revoke all on function public.du_an_co_phap_ly(uuid) from public, anon, authenticated;
grant execute on function public.du_an_co_phap_ly(uuid) to service_role;

create or replace view public.listing_missing_facts as
 SELECT l.id AS listing_id,
    rf.fact_key,
    rf.priority,
    rf.nhom
   FROM listings l
     JOIN required_facts rf ON rf.property_type = COALESCE(l.property_type, 'chua_ro'::property_type) AND (rf.deal IS NULL OR rf.deal = l.deal)
     LEFT JOIN listing_facts lf ON lf.listing_id = l.id AND lf.question = rf.fact_key
  WHERE lf.id IS NULL AND rf.nhom <> 'phu'::text AND NOT (rf.fact_key = 'ket_cau'::text AND l.floors IS NOT NULL OR (rf.fact_key = ANY (ARRAY['do_rong_hem'::text, 'do_rong_duong'::text])) AND (l.alley_width_m IS NOT NULL OR l.access_type IS NOT NULL) OR rf.fact_key = 'phap_ly'::text AND l.legal_status IS NOT NULL OR rf.fact_key = 'phap_ly'::text AND l.property_type = 'chung_cu'::property_type AND du_an_co_phap_ly(l.project_id) OR rf.fact_key = 'huong'::text AND l.direction IS NOT NULL OR rf.fact_key = 'so_phong_ngu'::text AND l.bedrooms IS NOT NULL OR rf.fact_key = 'so_wc'::text AND l.bathrooms IS NOT NULL OR rf.fact_key = 'tang'::text AND l.floor IS NOT NULL OR (rf.fact_key = ANY (ARRAY['dien_tich'::text, 'dien_tich_dat'::text, 'dien_tich_tim_tuong'::text])) AND l.area_m2 IS NOT NULL OR rf.fact_key = 'nam_xay'::text AND l.year_built IS NOT NULL OR rf.fact_key = 'noi_that'::text AND l.furnishing IS NOT NULL OR rf.fact_key = 'mat_tien'::text AND l.frontage_m IS NOT NULL OR rf.fact_key = 'no_hau'::text AND l.rear_width_m IS NOT NULL OR rf.fact_key = 'cach_mat_tien'::text AND l.distance_to_street_m IS NOT NULL OR rf.fact_key = 'can_goc'::text AND l.corner_lot IS NOT NULL OR rf.fact_key = 'thang_may'::text AND l.has_elevator IS NOT NULL OR rf.fact_key = 'thuong_luong'::text AND l.negotiable IS NOT NULL OR rf.fact_key = 'doanh_thu'::text AND l.rent_income_vnd IS NOT NULL OR rf.fact_key = 'quy_hoach'::text AND l.planning_status IS NOT NULL OR rf.fact_key = 'gia'::text AND l.price_vnd IS NOT NULL OR rf.fact_key = 'gap'::text AND l.gap IS NOT NULL OR rf.fact_key = 'phuong'::text AND l.ward IS NOT NULL OR rf.fact_key = 'du_an_ten'::text AND l.project_id IS NOT NULL OR rf.fact_key = 'vi_tri'::text AND (COALESCE(btrim(l.location_raw), ''::text) <> ''::text OR COALESCE(btrim(l.street), ''::text) <> ''::text OR l.project_id IS NOT NULL) OR rf.fact_key = 'tang_phu'::text AND COALESCE(l.floors_text, ''::text) ~ '(lửng|sân thượng|hầm|áp mái)'::text OR rf.fact_key = 'hinh_anh'::text AND (EXISTS ( SELECT 1
           FROM listing_media m
          WHERE m.listing_id = l.id)))
  ORDER BY l.id, rf.priority, rf.fact_key;

-- ─── (3) diem_tin: thân hàm 20261014d, chỉ đổi khối pháp lý ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.diem_tin(l listings)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  f        jsonb;
  co_anh   boolean;
  co_hem   boolean;
  co_mt    boolean;
  co_kc    boolean;
  co_pn    boolean;
  d_vi_tri int := 0;
  d_dt     int := 0;
  d_kc     int := 0;
  d_pl     int := 0;
  d_gia    int := 0;
  d_tn     int := 0;
  d_cta    int := 0;
  d_anh    int := 0;
  so_anh   int := 0;
  thieu    text[] := '{}';
  mo_ta    text := public.bo_dau(coalesce(l.description, ''));
  la_dat   boolean := l.property_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh');
  la_thue  boolean := l.deal = 'cho_thue' and not (l.property_type in ('dat', 'dat_nong_nghiep', 'dat_kinh_doanh'));
  tn_biet  boolean;
begin
  if l.id is null then return null; end if;
  select coalesce(jsonb_object_agg(x.question, x.answer), '{}'::jsonb) into f
    from (select distinct on (question) question, answer
            from public.listing_facts where listing_id = l.id
           order by question, created_at desc) x;
  select (select count(*) from public.listing_facts x
           where x.listing_id = l.id and x.question = 'hinh_anh')
       + (select count(*) from public.listing_media m where m.listing_id = l.id)
    into so_anh;
  co_anh := so_anh > 0;

  co_hem := l.alley_width_m is not null or l.access_type is not null
            or (f ? 'do_rong_hem') or (f ? 'do_rong_duong') or (f ? 'duong_vao') or (f ? 'duong_container')
            or l.property_type in ('chung_cu', 'phong_tro');
  d_vi_tri := (case when coalesce(btrim(l.location_raw), '') <> '' then 7 else 0 end)
            + (case when coalesce(btrim(l.ward), '') <> '' then 4 else 0 end)
            + (case when co_hem then 4 else 0 end);
  if not co_hem then thieu := array_append(thieu, case when la_dat or l.property_type = 'kho_xuong' then 'đường vào rộng mấy mét' else 'hẻm rộng mấy mét, xe hơi vào được không' end); end if;

  co_mt := l.frontage_m is not null or (f ? 'mat_tien')
           or l.property_type in ('chung_cu', 'phong_tro', 'toa_nha', 'kho_xuong', 'dat_nong_nghiep')
           or coalesce(f->>'dien_tich_dat', f->>'dien_tich', '') ~ '\d\s*[xX×]\s*\d';
  if l.area_m2 is not null then
    d_dt := 12 + (case when co_mt then 8 else 0 end);
    if not co_mt then thieu := array_append(thieu, 'chiều ngang mặt tiền'); end if;
  else
    thieu := array_append(thieu, 'diện tích');
  end if;

  if la_dat then
    d_kc := case when (f ? 'tho_cu') or l.planning_status is not null or (f ? 'quy_hoach') or (f ? 'thoi_han_su_dung') or (f ? 'len_tho_cu') then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, case l.property_type when 'dat_nong_nghiep' then 'quy hoạch, có lên thổ cư được không' when 'dat_kinh_doanh' then 'thời hạn sử dụng đất' else 'thổ cư bao nhiêu, quy hoạch ra sao' end); end if;
  elsif l.property_type = 'phong_tro' then
    d_kc := case when l.furnishing is not null or (f ? 'noi_that') then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, 'nội thất có gì'); end if;
  elsif l.property_type = 'mat_bang' then
    d_kc := case when l.floors is not null or (f ? 'ket_cau') or (f ? 'nganh_hang_phu_hop') then 15 else 0 end;
    if d_kc = 0 then thieu := array_append(thieu, 'mấy tầng, hợp ngành gì'); end if;
  elsif l.property_type = 'toa_nha' then
    d_kc := (case when (f ? 'so_phong') or l.floors is not null or (f ? 'ket_cau') then 8 else 0 end)
          + (case when (f ? 'doanh_thu') or l.rent_income_vnd is not null or (f ? 'ty_le_lap_day') then 7 else 0 end);
    if not ((f ? 'so_phong') or l.floors is not null or (f ? 'ket_cau')) then thieu := array_append(thieu, 'bao nhiêu phòng, mấy tầng'); end if;
    if not ((f ? 'doanh_thu') or l.rent_income_vnd is not null or (f ? 'ty_le_lap_day')) then thieu := array_append(thieu, 'doanh thu mỗi tháng, tỷ lệ lấp đầy'); end if;
  elsif l.property_type = 'kho_xuong' then
    d_kc := (case when (f ? 'chieu_cao') or (f ? 'ket_cau') then 8 else 0 end)
          + (case when (f ? 'tai_trong_san') or (f ? 'tram_bien_ap') then 7 else 0 end);
    if not ((f ? 'chieu_cao') or (f ? 'ket_cau')) then thieu := array_append(thieu, 'chiều cao thông thủy'); end if;
    if not ((f ? 'tai_trong_san') or (f ? 'tram_bien_ap')) then thieu := array_append(thieu, 'tải trọng sàn, trạm biến áp'); end if;
  else
    co_kc := l.floors is not null or coalesce(btrim(l.floors_text), '') <> ''
             or (f ? 'ket_cau') or l.floor is not null or (f ? 'tang')
             or l.property_type = 'nha_cap4'; -- 20261013b: nhà cấp 4 là nhà trệt
    co_pn := l.bedrooms is not null or (f ? 'so_phong_ngu');
    d_kc := (case when co_kc then 8 else 0 end) + (case when co_pn then 7 else 0 end);
    if not co_kc then thieu := array_append(thieu, 'mấy tầng'); end if;
    if not co_pn then thieu := array_append(thieu, 'mấy phòng ngủ'); end if;
  end if;

  -- 20261013c: tin cho thuê → điều kiện thuê thay cho sổ; tin bán → chữ "pháp lý (loại sổ, hoàn công)".
  if la_thue then
    if (f ? 'tien_coc') or (f ? 'thoi_han_thue') or (f ? 'phap_ly') or l.legal_status is not null or l.property_type = 'phong_tro' then d_pl := 10;
    else thieu := array_append(thieu, 'điều kiện thuê (cọc, thời hạn)'); end if;
  elsif l.legal_status is not null or (f ? 'phap_ly') or l.property_type = 'phong_tro'
        -- 20261014e: căn hộ thuộc dự án mà kho dự án đã có pháp lý → pháp lý theo dự án, không thiếu, không hỏi.
        or (l.property_type = 'chung_cu' and public.du_an_co_phap_ly(l.project_id)) then d_pl := 10;
  -- 20261014d: căn hộ không có hoàn công, đất không có hoàn công — chữ thiếu theo loại. 20261014e: căn hộ hỏi "đã ra sổ hồng hay còn HĐMB",
  -- không phải "sổ riêng hay chung" (chữ này đi thẳng vào câu lệnh model và model hỏi theo nó).
  else thieu := array_append(thieu, case when l.property_type = 'chung_cu' then 'pháp lý (đã ra sổ hồng hay còn hợp đồng mua bán)'
                                         when la_dat then 'pháp lý (loại sổ)'
                                         else 'pháp lý (loại sổ, hoàn công)' end); end if;

  if l.price_vnd is not null then d_gia := 10; else thieu := array_append(thieu, 'giá'); end if;

  -- 20260924g: nhà ĐANG cho thuê / kinh doanh thì tiềm năng sử dụng đã rõ — không đòi chủ nói thêm.
  tn_biet := l.rent_income_vnd is not null or (f ? 'doanh_thu') or (f ? 'han_hop_dong_thue')
             or exists (select 1 from public.listing_facts x
                         where x.listing_id = l.id
                           and public.bo_dau(coalesce(x.answer, '')) ~ '(dang cho thue|dang thue|dang kinh doanh|de kinh doanh|hop dong thue|khach thue|cho [a-z0-9 ]{1,30} thue)')
             or mo_ta ~ '(dang cho thue|dang thue|dang kinh doanh|hop dong thue|khach thue)';
  if f ? 'tiem_nang' or f ? 'muc_dich' or f ? 'nganh_hang_phu_hop' or tn_biet then d_tn := 10;
  elsif coalesce(l.floors, 0) >= 3 or coalesce(l.bedrooms, 0) >= 3
     or l.access_type = 'mat_tien' or coalesce(l.alley_width_m, 0) >= 4
     or l.property_type in ('chung_cu', 'mat_bang', 'phong_tro', 'biet_thu', 'toa_nha', 'kho_xuong', 'dat_kinh_doanh') or (f ? 'san_vuon')
     or mo_ta ~ '(kinh doanh|cho thue|chdv|dau tu|van phong|o ngay|buon ban|mo shop|mo quan)'
  then d_tn := 5; thieu := array_append(thieu, 'tiềm năng sử dụng (ở, cho thuê hay kinh doanh)');
  else thieu := array_append(thieu, 'tiềm năng sử dụng (ở, cho thuê hay kinh doanh)'); end if;

  if l.code is not null then d_cta := 10; end if;

  d_anh := case when so_anh >= 3 then 10 when so_anh = 2 then 7 when so_anh = 1 then 4 else 0 end;
  if so_anh = 0 then thieu := array_append(thieu, case
      when la_dat then 'vài tấm ảnh (lô đất, sổ, đường vào — ảnh nào cũng được)'
      when l.property_type = 'chung_cu' then 'vài tấm ảnh (căn hộ, sổ, view — ảnh nào cũng được)'
      when l.property_type = 'phong_tro' then 'vài tấm ảnh (phòng, lối vào — ảnh nào cũng được)'
      when l.property_type = 'kho_xuong' then 'vài tấm ảnh (kho, sổ, đường vào — ảnh nào cũng được)'
      else 'vài tấm ảnh (nhà, sổ, hẻm — ảnh nào cũng được)' end);
  elsif so_anh < 3 then thieu := array_append(thieu, format('thêm ảnh cho đủ 3 tấm (đang có %s)', so_anh)); end if;

  return jsonb_build_object(
    'diem', d_vi_tri + d_dt + d_kc + d_pl + d_gia + d_tn + d_cta + d_anh,
    'chi_tiet', jsonb_build_object(
      'vi_tri_hem', d_vi_tri, 'dien_tich', d_dt, 'ket_cau', d_kc, 'phap_ly', d_pl,
      'gia', d_gia, 'tiem_nang', d_tn, 'goi_hanh_dong', d_cta, 'anh', d_anh),
    'thieu', to_jsonb(thieu),
    'co_anh', co_anh,
    'so_anh', so_anh);
end $function$
;

-- ─── (1) thông tin dự án: phiếu theo người rao + tự chốt ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.project_fact_phieu (
  fact_id    bigint not null references public.project_facts(id) on delete cascade,
  seller_id  uuid   not null references public.sellers(id) on delete cascade,
  diem       int    not null default 0,
  created_at timestamptz not null default now(),
  primary key (fact_id, seller_id)
);
create index if not exists project_fact_phieu_seller_id_idx on public.project_fact_phieu (seller_id);
alter table public.project_fact_phieu enable row level security;
revoke all on public.project_fact_phieu from anon, authenticated;
drop policy if exists project_fact_phieu_admin_read on public.project_fact_phieu;
create policy project_fact_phieu_admin_read on public.project_fact_phieu for select to authenticated using (public.la_admin());
grant select on public.project_fact_phieu to authenticated;
comment on table public.project_fact_phieu is
  '[RỔ HÀNG] Phiếu xác nhận thông tin dự án: mỗi người rao một phiếu cho mỗi khoá của một dự án (đổi giá trị = chuyển phiếu), kèm điểm uy tín lúc bỏ phiếu. Đủ 5 người + trọng số uy tín thì `xet_dong_thuan_du_an` tự chốt vào `projects` (giống AOND, 20261014e).';
comment on column public.project_fact_phieu.diem is
  'Điểm uy tín người rao (`diem_nguoi_ban`) lúc bỏ phiếu, 0–100. Trọng số phiếu = greatest(diem, 10) / 100.';

-- Khoá kiểu DANH SÁCH: mỗi giá trị là một ý riêng, không chọi nhau.
create or replace function public.khoa_du_an_danh_sach(p_khoa text)
returns boolean language sql immutable set search_path = public as $$
  select p_khoa in ('tien_ich_gan', 'tien_ich', 'ha_tang', 'khu_compound')
$$;

-- Ghi giá trị đã chốt vào kho `projects` — cùng luật với `duyet_fact_du_an` (một chỗ, không chép hai nơi lệch nhau).
create or replace function public.ap_fact_du_an_vao_kho(p_id bigint, p_boi text)
returns boolean language plpgsql security definer set search_path = public as $$
declare f project_facts%rowtype;
begin
  select * into f from project_facts where id = p_id;
  if not found or f.project_id is null then return false; end if;
  if public.khoa_du_an_danh_sach(f.khoa) then
    update projects
       set amenities = (select jsonb_agg(distinct x)
                          from jsonb_array_elements_text(coalesce(amenities, '[]'::jsonb) || to_jsonb(array[f.gia_tri])) x),
           updated_at = now()
     where id = f.project_id;
  else
    update projects set specs = coalesce(specs, '{}'::jsonb) || jsonb_build_object(f.khoa, f.gia_tri), updated_at = now()
     where id = f.project_id;
  end if;
  update project_facts set trang_thai = 'da_duyet', duyet_at = now(), duyet_boi = p_boi where id = p_id;
  return true;
end $$;
revoke all on function public.ap_fact_du_an_vao_kho(bigint, text) from public, anon, authenticated;
grant execute on function public.ap_fact_du_an_vao_kho(bigint, text) to service_role;

-- AOND: chốt khi giá trị dẫn đầu có ≥ 5 người KHÁC NHAU và phe nói khác ≤ 1/3 (ở đây so bằng trọng số uy tín).
create or replace function public.xet_dong_thuan_du_an(p_fact_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f project_facts%rowtype;
  v_lead record;
  v_khac numeric;
  c_n constant int := 5;
begin
  select * into f from project_facts where id = p_fact_id;
  if not found or f.trang_thai = 'bo' then return jsonb_build_object('chot', false); end if;
  -- Nhóm cùng dự án + cùng khoá. Khoá danh sách: mỗi giá trị một nhóm riêng.
  with nhom as (
    select pf.id, pf.trang_thai, count(ph.seller_id)::int as n,
           coalesce(sum(greatest(ph.diem, 10)) / 100.0, 0) as w
      from project_facts pf
      left join project_fact_phieu ph on ph.fact_id = pf.id
     where pf.trang_thai <> 'bo'
       and pf.khoa = f.khoa
       and coalesce(pf.project_id::text, lower(btrim(pf.ten_du_an))) = coalesce(f.project_id::text, lower(btrim(f.ten_du_an)))
       and (not public.khoa_du_an_danh_sach(f.khoa) or pf.id = f.id)
     group by pf.id, pf.trang_thai
  )
  select n.*, (select coalesce(sum(o.w), 0) from nhom o where o.id <> n.id) as khac
    into v_lead
    from nhom n
   order by n.w desc, n.n desc, n.id
   limit 1;
  if v_lead is null then return jsonb_build_object('chot', false); end if;
  v_khac := v_lead.khac;
  if v_lead.n < c_n or v_khac > v_lead.w / 3 then
    return jsonb_build_object('chot', false, 'n', v_lead.n, 'w', round(v_lead.w, 2), 'khac', round(v_khac, 2));
  end if;
  if v_lead.trang_thai = 'cho_duyet' then
    if not public.ap_fact_du_an_vao_kho(v_lead.id, 'dong_thuan') then
      -- Chưa gắn dự án trong kho (chỉ có tên): đủ người rồi nhưng chưa có chỗ ghi — giữ hàng chờ.
      return jsonb_build_object('chot', false, 'n', v_lead.n, 'vi', 'chua gan du an trong kho');
    end if;
  end if;
  -- Phe thua (khoá đơn trị) → bỏ.
  if not public.khoa_du_an_danh_sach(f.khoa) then
    update project_facts pf set trang_thai = 'bo', duyet_at = now(), duyet_boi = 'dong_thuan'
     where pf.id <> v_lead.id and pf.trang_thai <> 'bo' and pf.khoa = f.khoa
       and coalesce(pf.project_id::text, lower(btrim(pf.ten_du_an))) = coalesce(f.project_id::text, lower(btrim(f.ten_du_an)));
  end if;
  return jsonb_build_object('chot', true, 'fact_id', v_lead.id, 'n', v_lead.n, 'w', round(v_lead.w, 2));
end $$;
revoke all on function public.xet_dong_thuan_du_an(bigint) from public, anon, authenticated;
grant execute on function public.xet_dong_thuan_du_an(bigint) to service_role;
comment on function public.xet_dong_thuan_du_an(bigint) is
  '[RỔ HÀNG] Tự chốt thông tin dự án (giống AOND projects.py): giá trị dẫn đầu (tổng trọng số uy tín cao nhất) có ≥ 5 người rao khác nhau và phe nói khác ≤ 1/3 trọng số → ghi vào projects, phe thua thành bo. Không duyệt tay (chủ dự án 14/10/2026).';

-- Ghi điều người rao kể về dự án = MỘT PHIẾU của người rao đó. Thân cũ (20260910h) + phiếu + xét chốt. Việc phụ: không bao giờ ném.
CREATE OR REPLACE FUNCTION public.ghi_fact_du_an(p_project_id uuid, p_khoa text, p_gia_tri text, p_nguon text DEFAULT 'seller_chat'::text, p_listing_id uuid DEFAULT NULL::uuid, p_conversation_id uuid DEFAULT NULL::uuid, p_ten_du_an text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; v_gt text := btrim(p_gia_tri); v_ten text := nullif(btrim(p_ten_du_an), ''); v_seller uuid; v_diem int := 0;
begin
  if coalesce(v_gt, '') = '' then return null; end if;
  if p_project_id is null and v_ten is null then return null; end if;
  -- Cùng ý đã có (không phân biệt hoa thường) → dùng dòng đó; chưa có thì thêm.
  select pf.id into v_id from project_facts pf
   where pf.trang_thai <> 'bo' and pf.khoa = p_khoa
     and coalesce(pf.project_id::text, lower(btrim(pf.ten_du_an))) = coalesce(p_project_id::text, lower(v_ten))
     and lower(btrim(pf.gia_tri)) = lower(v_gt)
   order by pf.id limit 1;
  if v_id is null then
    insert into project_facts (project_id, ten_du_an, khoa, gia_tri, nguon, listing_id, conversation_id)
    values (p_project_id, v_ten, p_khoa, v_gt, coalesce(p_nguon, 'seller_chat'), p_listing_id, p_conversation_id)
    on conflict do nothing
    returning id into v_id;
  end if;
  if v_id is null then return null; end if;

  -- Người bỏ phiếu: chủ tin (hoặc người bán của hội thoại).
  select l.seller_id into v_seller from listings l where l.id = p_listing_id;
  if v_seller is null and p_conversation_id is not null then
    select c.seller_id into v_seller from conversations c where c.id = p_conversation_id;
  end if;
  if v_seller is not null then
    begin
      v_diem := coalesce((public.diem_nguoi_ban(v_seller) ->> 'diem')::int, 0);
    exception when others then v_diem := 0;
    end;
    -- Một người một phiếu cho mỗi khoá đơn trị: nói giá trị khác thì phiếu chuyển sang giá trị mới.
    if not public.khoa_du_an_danh_sach(p_khoa) then
      delete from project_fact_phieu ph
       using project_facts pf
       where ph.fact_id = pf.id and ph.seller_id = v_seller and pf.id <> v_id and pf.khoa = p_khoa
         and coalesce(pf.project_id::text, lower(btrim(pf.ten_du_an))) = coalesce(p_project_id::text, lower(v_ten));
    end if;
    insert into project_fact_phieu (fact_id, seller_id, diem) values (v_id, v_seller, v_diem)
    on conflict (fact_id, seller_id) do update set diem = excluded.diem;
    perform public.xet_dong_thuan_du_an(v_id);
  end if;
  return v_id;
exception when others then
  return null;   -- việc phụ, không được làm hỏng lượt trả lời khách
end $function$
;
