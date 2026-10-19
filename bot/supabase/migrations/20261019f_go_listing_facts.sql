-- 20261019f — gỡ bảng `listing_facts` và 36 hàm không còn ai gọi (docs/07 SRS-5.1zzzzzzz66; chủ dự án 19/10/2026: "listing_facts
-- listings.boc_tach khác nhau hả, cho làm 1 dc ko", "làm hết đi").
-- `listing_facts` chỉ bot TypeScript (đã gỡ 18/10) ghi; lõi Python ghi ô vào `listings.boc_tach`. Bảng đang 0 dòng. Các hàm còn
-- sống từng đọc nó (điểm tin, JSON chia nhóm, văn bản nhúng vector, nở hậu, soát dữ liệu) nay đọc `boc_tach` qua MỘT hàm
-- `o_boc_tach()` — trước bản này chúng đọc một bảng rỗng, tức điểm tin / JSON admin / vector không thấy ô nào lõi Python bóc.
-- Sửa bằng cách thay chữ ngay trên định nghĩa ĐANG CHẠY (DB là bản thật — CLAUDE.md §6), mỗi lần thay phải trúng (không trúng →
-- raise, cả migration huỷ). Hàm gỡ: không hàm / view / trigger / policy / lịch cron nào gọi, và không file nào trong repo gọi
-- (soát 19/10/2026: src/, app/, lib/, components/, bot/, scripts/, .github/).

create or replace function public.o_boc_tach(p jsonb)
returns jsonb
language sql
immutable
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(jsonb_object_agg(e.key, e.value #>> '{}'), '{}'::jsonb)
    from jsonb_each(coalesce(p, '{}'::jsonb)) e
   where e.key !~ '^_' and jsonb_typeof(e.value) in ('string', 'number', 'boolean')
     and coalesce(btrim(e.value #>> '{}'), '') <> '';
$$;
comment on function public.o_boc_tach(jsonb) is
  '[RỔ HÀNG] Ô lõi Python bóc trong listings.boc_tach → {khoá: chữ}, bỏ khoá nội bộ (_…) và ô trống. Thay bảng listing_facts đã gỡ (20261019f).';

do $$
declare
  r record;
  cu text;
  def text;
  a int;
  b int;
begin
  -- Thay một đoạn, đòi trúng. pg_temp không giữ qua lệnh nên viết thẳng từng lần.
  -- diem_tin(l): ô từ boc_tach, ảnh chỉ đếm listing_media (bảng fact cũ có ô hinh_anh = URL ảnh chat).
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.oid = 'public.diem_tin(listings)'::regprocedure;
  cu := def;
  def := regexp_replace(def,
    $r$select coalesce\(jsonb_object_agg\(x\.question, x\.answer\), '\{\}'::jsonb\) into f\s+from \(select distinct on \(question\) question, answer\s+from public\.listing_facts where listing_id = l\.id\s+order by question, created_at desc\) x;$r$,
    $s$f := public.o_boc_tach(l.boc_tach);$s$);
  def := regexp_replace(def,
    $r$select \(select count\(\*\) from public\.listing_facts x\s+where x\.listing_id = l\.id and x\.question = 'hinh_anh'\)\s+\+ \(select count\(\*\) from public\.listing_media m where m\.listing_id = l\.id\)\s+into so_anh;$r$,
    $s$select count(*) from public.listing_media m where m.listing_id = l.id into so_anh;$s$);
  def := regexp_replace(def,
    $r$from public\.listing_facts x\s+where x\.listing_id = l\.id\s+and public\.bo_dau\(coalesce\(x\.answer, ''\)\)$r$,
    $s$from jsonb_each_text(f) x where public.bo_dau(coalesce(x.value, ''))$s$);
  if def ~ 'listing_facts' or def = cu then raise exception 'diem_tin: thay chữ không trúng'; end if;
  execute def;

  -- boc_tach_nhom(l): JSON chia nhóm cho /admin đọc ô boc_tach.
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.oid = 'public.boc_tach_nhom(listings)'::regprocedure;
  def := regexp_replace(def,
    $r$select coalesce\(jsonb_object_agg\(x\.question, x\.answer\), '\{\}'::jsonb\) into f\s+from \(select distinct on \(question\) question, answer\s+from public\.listing_facts\s+where listing_id = l\.id and question not in \([^)]*\)\s+order by question, created_at desc\) x;$r$,
    $s$f := public.o_boc_tach(bt);$s$);
  def := regexp_replace(def,
    $r$select coalesce\(jsonb_agg\(answer order by created_at\), '\[\]'::jsonb\) into bs\s+from public\.listing_facts where listing_id = l\.id and question = 'bo_sung';$r$,
    $s$bs := '[]'::jsonb;$s$);
  def := regexp_replace(def,
    $r$select coalesce\(jsonb_agg\(answer order by created_at\), '\[\]'::jsonb\) into url_chat\s+from public\.listing_facts where listing_id = l\.id and question = 'hinh_anh';$r$,
    $s$url_chat := '[]'::jsonb;$s$);
  if def ~ 'listing_facts' then raise exception 'boc_tach_nhom: thay chữ không trúng'; end if;
  execute def;

  -- van_ban_nhung: ô chữ tự do vào vector đọc từ boc_tach; ô đã có cột (hay địa chỉ đã in ở location_raw) thì bỏ, như bản cũ.
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.oid = 'public.van_ban_nhung(uuid)'::regprocedure;
  def := regexp_replace(def,
    $r$\(select string_agg\(public\.nhan_fact\(f\.question\) \|\| ': ' \|\| f\.answer, '\. ' order by f\.question, f\.dau\)\s+from \(select question, answer, min\(created_at\) as dau\s+from public\.listing_facts\s+where listing_id = l\.id and coalesce\(btrim\(answer\), ''\) <> ''\s+and question not in \(([^)]*)\)\s+group by question, answer\) f\)$r$,
    $s$(select string_agg(public.nhan_fact(f.key) || ': ' || f.value, '. ' order by f.key)
       from jsonb_each_text(public.o_boc_tach(l.boc_tach)) f
      where f.key not in (\1,
                  'loai_hinh', 'dia_chi', 'du_an', 'ma_so_can', 'gan_nga_tu', 'dien_tich_nha', 'kich_thuoc', 'lo_gioi_hem',
                  'phap_ly_hoan_cong', 'phap_ly_so_do', 'phap_ly_so_hong', 'tang_toa'))$s$);
  if def ~ 'listing_facts' then raise exception 'van_ban_nhung: thay chữ không trúng'; end if;
  execute def;

  -- listings_chuan_hoa_cot: nở hậu không tính hình thang khi chủ đã nói diện tích bằng m² — ô diện tích nay ở boc_tach.
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.oid = 'public.listings_chuan_hoa_cot()'::regprocedure;
  def := regexp_replace(def,
    $r$select 1 from public\.listing_facts f\s+where f\.listing_id = new\.id and f\.question in \('dien_tich', 'dien_tich_dat'\)\s+and public\.bo_dau\(coalesce\(f\.answer, ''\)\) ~ ('[^']*')\s+and public\.bo_dau\(coalesce\(f\.answer, ''\)\) !~ ('[^']*')$r$,
    $s$select 1 from jsonb_each_text(public.o_boc_tach(new.boc_tach)) f
        where f.key in ('dien_tich', 'dien_tich_dat')
          and public.bo_dau(coalesce(f.value, '')) ~ \1
          and public.bo_dau(coalesce(f.value, '')) !~ \2$s$);
  if def ~ '\mlisting_facts\M' then raise exception 'listings_chuan_hoa_cot: thay chữ không trúng'; end if;
  execute def;

  -- soat_du_lieu_tin: ô của tin thật đọc từ boc_tach; thêm khoá lõi Python (phap_ly_*, dia_chi, tang_toa) cạnh khoá cũ.
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.oid = 'public.soat_du_lieu_tin()'::regprocedure;
  def := regexp_replace(def,
    $r$fact_moi as \(\s+select distinct on \(f\.listing_id, f\.question\) f\.listing_id, f\.question, f\.answer\s+from listing_facts f join tin on tin\.id = f\.listing_id\s+order by f\.listing_id, f\.question, f\.created_at desc\s+\)$r$,
    $s$fact_moi as (
    select tin.id as listing_id, f.key as question, f.value as answer
      from tin join listings l on l.id = tin.id, jsonb_each_text(public.o_boc_tach(l.boc_tach)) f
  )$s$);
  def := replace(def, $s$f.question in ('phap_ly', 'phi_quan_ly', 'ket_cau', 'vi_tri', 'huong', 'noi_that', 'tang')$s$,
                      $s$f.question in ('phap_ly', 'phap_ly_hoan_cong', 'phap_ly_so_hong', 'phap_ly_so_do', 'phi_quan_ly', 'ket_cau',
                          'vi_tri', 'dia_chi', 'huong', 'noi_that', 'tang', 'tang_toa')$s$);
  def := replace(def, $s$f.question in ('ket_cau', 'phap_ly', 'huong', 'vi_tri')$s$,
                      $s$f.question in ('ket_cau', 'phap_ly', 'phap_ly_hoan_cong', 'huong', 'vi_tri', 'dia_chi')$s$);
  if def ~ 'listing_facts' or def !~ 'tang_toa' or def !~ 'phap_ly_hoan_cong'', ''huong' then
    raise exception 'soat_du_lieu_tin: thay chữ không trúng';
  end if;
  execute def;

  -- soat_db_cong_khai: phép 1 soi policy `anon_read_listing_facts` — bảng và policy gỡ, phép gỡ theo.
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.oid = 'public.soat_db_cong_khai()'::regprocedure;
  a := position('  -- ── 1. POLICY' in def);
  b := position('having count(*) > 0;' in substr(def, a));
  if a = 0 or b = 0 then raise exception 'soat_db_cong_khai: không thấy phép 1'; end if;
  def := substr(def, 1, a - 1)
      || E'  -- ── 1. (gỡ 19/10/2026, 20261019f) Phép soát policy chặn khoá của bảng fact cũ — bảng và policy đã gỡ.\n'
      || substr(def, a + b - 1 + length('having count(*) > 0;'));
  if def ~ 'listing_facts' then raise exception 'soat_db_cong_khai: còn chữ bảng cũ'; end if;
  execute def;

  -- Xoá / khôi phục / dọn dữ liệu thử: bỏ bảng khỏi danh sách.
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('admin_xoa_het_khach_va_ro_hang', 'admin_khoi_phuc_lan_xoa', 'don_du_lieu_thu')
  loop
    def := pg_get_functiondef(r.oid);
    def := replace(def, $s$'messages', 'listing_facts', $s$, $s$'messages', $s$);
    def := regexp_replace(def, $r$\n[ \t]*delete from listing_facts\s[^\n]*$r$, '', 'g');
    if def ~ 'listing_facts' then raise exception '%: thay chữ không trúng', r.proname; end if;
    execute def;
  end loop;
end $$;

-- View câu còn thiếu theo required_facts: chỉ bot TypeScript đọc. Không view / hàm nào khác dựa vào nó.
drop view public.listing_missing_facts;
-- Bảng: policy + 6 trigger đi theo. Không có khoá ngoại nào trỏ vào nó.
drop table public.listing_facts;

-- Tên hàm là duy nhất (không có bản chồng) nên drop không cần chữ ký.
-- Trigger của bảng vừa gỡ.
drop function if exists public.listing_facts_sync_cols;
drop function if exists public.listing_facts_soat_phuong;
drop function if exists public.listing_facts_sync_deal;
drop function if exists public.listing_facts_sync_gap;
drop function if exists public.trg_fact_vao_boc_tach;
drop function if exists public.trg_vi_tri_vao_cot;
-- Không ai gọi (bot TypeScript / lịch cũ đã gỡ).
drop function if exists public.ap_fact_du_an_vao_kho;
drop function if exists public.bao_hong_nhac;
drop function if exists public.bo_dem_nhac_treo;
drop function if exists public.cat_truoc_phu_dinh;
drop function if exists public.chuan_hoa_lai_gia;
drop function if exists public.co_moc;
drop function if exists public.con_duoc_rao;
drop function if exists public.duong_gan_duong;
drop function if exists public.ghi_boc_tach;
drop function if exists public.ghi_danh_gia;
drop function if exists public.ghi_fact_listing;
drop function if exists public.giao_lo_gan;
drop function if exists public.hang_cua_nguoi_ban;
drop function if exists public.info_request_timeout_tick;
drop function if exists public.listings_try_publish;
drop function if exists public.merge_buyer_prefs;
drop function if exists public.mo_ho_so_nguoi_ban;
drop function if exists public.mo_viec_can_nguoi_that;
drop function if exists public.ngu_canh_tin;
drop function if exists public.nguoi_noi_bo;
drop function if exists public.nha_viec_nhac;
drop function if exists public.nhan_viec_nhac;
drop function if exists public.phuong_giao_hai_duong;
drop function if exists public.stale_listing_tick;
drop function if exists public.tao_followup;
drop function if exists public.them_nhan_tin;
drop function if exists public.tim_hem;
-- Chỉ các hàm trên gọi.
drop function if exists public.ap_thong_so;
drop function if exists public.bac_nguon;
drop function if exists public.dia_danh_gan;
drop function if exists public.doc_co_khong;
drop function if exists public.doc_gap;
drop function if exists public.guess_property_type_answer;
drop function if exists public.khoa_du_an_danh_sach;
drop function if exists public.lan_thu_ke;
drop function if exists public.loc_thong_so_theo_khoa;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public', 'so') and p.prosrc ~ '\m(listing_facts|listing_missing_facts)\M') then
    raise exception 'còn hàm nhắc bảng / view đã gỡ';
  end if;
end $$;
