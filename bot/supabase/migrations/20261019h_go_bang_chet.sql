-- 20261019h — gỡ ba bảng chết `boc_tach_bong`, `ratings_log`, `project_facts` (docs/07 SRS-5.1zzzzzzz69; chủ dự án 19/10/2026: "xoá 3
-- bảng chết đi"). Soát 19/10: cả ba 0 dòng, không khoá ngoại trỏ vào, không file nào trong repo đọc / ghi (lõi Python, web, bridge, edge
-- function). `boc_tach_bong` là sổ AI chạy bóng của bot TypeScript (gỡ 18/10); `ratings_log` chưa từng có người ghi; `project_facts`
-- (phiếu kiến thức dự án chờ duyệt) đã thay bằng `du_an_kien_thuc` — panel duyệt trên /admin gỡ ở SRS-5.1zzzzzzz65, nên view
-- `project_facts_cho_duyet` và hàm `duyet_fact_du_an` gỡ theo. Hàm xoá / khôi phục / dọn dữ liệu thử bỏ ba tên khỏi danh sách: thay chữ
-- trên định nghĩa đang chạy, mỗi lần thay phải trúng (không trúng → raise, cả migration huỷ).

do $$
declare
  r record;
  def text;
  cu text;
begin
  for r in select p.oid, p.proname from pg_proc p
            where p.pronamespace = 'public'::regnamespace and p.proname in ('admin_xoa_het_khach_va_ro_hang', 'admin_khoi_phuc_lan_xoa')
  loop
    def := pg_get_functiondef(r.oid);
    def := regexp_replace(def, $r$'(project_facts|ratings_log|boc_tach_bong)',\s*$r$, '', 'g');
    def := regexp_replace(def, $r$\n[ \t]*delete from (project_facts|ratings_log|boc_tach_bong) where true;[^\n]*$r$, '', 'g');
    if def ~ '\m(project_facts|ratings_log|boc_tach_bong)\M' then raise exception '%: thay chữ không trúng', r.proname; end if;
    execute def;
  end loop;

  select pg_get_functiondef(p.oid) into def from pg_proc p where p.oid = 'public.don_du_lieu_thu()'::regprocedure;
  cu := def;
  def := regexp_replace(def, $r$\n[ \t]*delete from project_facts\s+where listing_id in \(select id from _tin_thu\);\n[ \t]*get diagnostics v_pf = row_count;$r$, '');
  def := replace(def, 'v_khach int := 0; v_pf int := 0;', 'v_khach int := 0;');
  def := replace(def, ' · %s khách · %s fact dự án''', ' · %s khách''');
  def := replace(def, 'v_tin, v_tin_nhan, v_nguoi, v_khach, v_pf))', 'v_tin, v_tin_nhan, v_nguoi, v_khach))');
  def := replace(def, '''khach'', v_khach, ''fact_du_an'', v_pf)', '''khach'', v_khach)');
  if def = cu or def ~ '\m(project_facts|v_pf)\M' then raise exception 'don_du_lieu_thu: thay chữ không trúng'; end if;
  execute def;
end $$;

drop view public.project_facts_cho_duyet;
drop function if exists public.duyet_fact_du_an;
drop table public.project_facts;
drop table public.ratings_log;
drop table public.boc_tach_bong;

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'so')
              and p.prosrc ~ '\m(project_facts|ratings_log|boc_tach_bong|project_facts_cho_duyet)\M') then
    raise exception 'còn hàm nhắc bảng đã gỡ';
  end if;
end $$;
