-- du-an-dong-thuan.sql — thông tin dự án tự chốt theo đồng thuận người rao + điểm uy tín, căn hộ dự án có pháp lý không bị hỏi pháp lý
-- (20261014e, SRS-5.1zzzzzzz19). Luật AOND (`projects.py`): một người rao một phiếu mỗi khoá, chốt khi giá trị dẫn đầu có ≥ N người khác
-- nhau và phe nói khác ≤ 1/3; chủ dự án đặt N = 5 và thêm trọng số điểm uy tín. Ca gốc: chủ dự án 14/10 "giờ ko duyệt tay".
begin;
set local client_min_messages = warning;
create or replace function auth.role() returns text language sql as $$ select 'service_role'::text $$;
set local session_replication_role = replica;
-- Điểm uy tín giả cho bài này (bản thật tính từ tin + phản hồi): đọc bảng tạm.
create temp table _diem (seller_id uuid primary key, diem int) on commit drop;
create or replace function public.diem_nguoi_ban(p_seller_id uuid) returns jsonb language sql stable as
  $$ select jsonb_build_object('diem', diem) from _diem where seller_id = p_seller_id $$;

insert into projects (id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Conic Thu SQL');
insert into projects (id, name, legal_status) values ('00000000-0000-0000-0000-0000000000a2', 'Sky Thu SQL', 'Sổ hồng lâu dài');
-- 10 người rao: 1..6 điểm 60 (Bạc), 7..8 điểm 95 (Vàng), 9..10 điểm 5 (mới); mỗi người một tin.
insert into sellers (id, zalo_user_id, seller_type)
select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'thu-sql-da' || i, 'ccrb' from generate_series(1, 10) i;
insert into _diem select ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, case when i <= 6 then 60 when i <= 8 then 95 else 5 end
  from generate_series(1, 10) i;
insert into listings (id, code, seller_id, deal, status, property_type)
select ('10000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'BDS-THU-SQL-DA' || i,
       ('00000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'ban', 'cho_thong_tin', 'chung_cu'
  from generate_series(1, 10) i;

create function pg_temp.phieu(i int, khoa text, gt text) returns bigint language sql as $$
  select public.ghi_fact_du_an('00000000-0000-0000-0000-0000000000a1', khoa, gt, 'seller_chat',
                               ('10000000-0000-0000-0000-0000000001' || lpad(i::text, 2, '0'))::uuid, null, null) $$;
create function pg_temp.spec(k text) returns text language sql as $$
  select specs ->> k from projects where id = '00000000-0000-0000-0000-0000000000a1' $$;

-- DT-01..03: 4 người cùng ý chưa chốt; một người nói lại (khác hoa thường) không thêm phiếu; người thứ 5 → tự chốt vào kho.
select pg_temp.phieu(i, 'phi_quan_ly', '12 nghìn/m2') from generate_series(1, 4) i;
do $$ begin if pg_temp.spec('phi_quan_ly') is not null then raise exception 'SAI DT-01: 4 người đã chốt'; end if; end $$;
select pg_temp.phieu(1, 'phi_quan_ly', '12 Nghìn/m2');
do $$ begin
  if (select count(*) from project_fact_phieu ph join project_facts pf on pf.id = ph.fact_id where pf.khoa = 'phi_quan_ly') <> 4
     or (select count(*) from project_facts where khoa = 'phi_quan_ly') <> 1 then raise exception 'SAI DT-02: nói lại thêm phiếu / thêm dòng'; end if;
end $$;
select pg_temp.phieu(5, 'phi_quan_ly', '12 nghìn/m2');
do $$ begin
  if pg_temp.spec('phi_quan_ly') is distinct from '12 nghìn/m2'
     or (select duyet_boi from project_facts where khoa = 'phi_quan_ly') is distinct from 'dong_thuan' then
    raise exception 'SAI DT-03: người thứ 5 không chốt, specs = %', pg_temp.spec('phi_quan_ly'); end if;
end $$;

-- DT-04/05: 2 Vàng nói "năm 2021" trước, 5 Bạc nói "năm 2020" → phe khác 1,9 > 3,0/3 chưa chốt; một Vàng đổi ý → phiếu chuyển, chốt 2020.
select pg_temp.phieu(i, 'nam_xay', 'năm 2021') from generate_series(7, 8) i;
select pg_temp.phieu(i, 'nam_xay', 'năm 2020') from generate_series(1, 5) i;
do $$ begin if pg_temp.spec('nam_xay') is not null then raise exception 'SAI DT-04: phe khác mạnh mà vẫn chốt'; end if; end $$;
select pg_temp.phieu(8, 'nam_xay', 'năm 2020');
do $$ begin
  if pg_temp.spec('nam_xay') is distinct from 'năm 2020'
     or (select trang_thai from project_facts where khoa = 'nam_xay' and gia_tri = 'năm 2021') <> 'bo'
     or exists (select 1 from project_fact_phieu ph join project_facts pf on pf.id = ph.fact_id
                 where pf.gia_tri = 'năm 2021' and ph.seller_id = '00000000-0000-0000-0000-000000000108') then
    raise exception 'SAI DT-05: đổi ý không chuyển phiếu / không chốt'; end if;
end $$;

-- DT-06: tiện ích là danh sách — hai ý đủ người đều vào amenities, không ý nào bị bỏ.
select pg_temp.phieu(i, 'tien_ich_gan', 'hồ bơi') from generate_series(1, 5) i;
select pg_temp.phieu(i, 'tien_ich_gan', 'phòng gym') from generate_series(4, 8) i;
do $$ begin
  if not (select amenities from projects where id = '00000000-0000-0000-0000-0000000000a1') @> '["hồ bơi", "phòng gym"]'::jsonb
     or exists (select 1 from project_facts where khoa = 'tien_ich_gan' and trang_thai = 'bo') then
    raise exception 'SAI DT-06: tiện ích chọi nhau'; end if;
end $$;

-- DT-07 (uy tín đổi kết quả): 2 người điểm 5 nói "không có thang máy" trước, 5 Bạc nói "có 2 thang máy" → đếm đầu người không chốt
-- (2 > 5/3), theo uy tín 0,2 ≤ 1,0 → chốt.
select pg_temp.phieu(i, 'thang_may', 'không có thang máy') from generate_series(9, 10) i;
select pg_temp.phieu(i, 'thang_may', 'có 2 thang máy') from generate_series(1, 5) i;
do $$ begin if pg_temp.spec('thang_may') is distinct from 'có 2 thang máy' then raise exception 'SAI DT-07: uy tín không tính'; end if; end $$;

-- DT-08..10: pháp lý dự án. Sky có legal_status; Conic chưa có → sau khi so_huu chốt bằng đồng thuận thì có.
do $$ begin
  if not du_an_co_phap_ly('00000000-0000-0000-0000-0000000000a2') or du_an_co_phap_ly('00000000-0000-0000-0000-0000000000a1')
     or du_an_co_phap_ly(null) then raise exception 'SAI DT-08: du_an_co_phap_ly'; end if;
end $$;
-- schema.sql không mang dữ liệu bảng `required_facts` → thêm đúng dòng pháp lý căn hộ cho bài này.
insert into required_facts (property_type, fact_key, priority, nhom, deal)
select 'chung_cu', 'phap_ly', 16, 'co_ban', 'ban' where not exists (select 1 from required_facts where property_type = 'chung_cu' and fact_key = 'phap_ly');
update listings set project_id = '00000000-0000-0000-0000-0000000000a2' where code = 'BDS-THU-SQL-DA9';
do $$ begin
  if exists (select 1 from listing_missing_facts m join listings l on l.id = m.listing_id where l.code = 'BDS-THU-SQL-DA9' and m.fact_key = 'phap_ly')
     or not exists (select 1 from listing_missing_facts m join listings l on l.id = m.listing_id where l.code = 'BDS-THU-SQL-DA10' and m.fact_key = 'phap_ly')
  then raise exception 'SAI DT-09: căn hộ dự án có pháp lý vẫn bị hỏi, hoặc căn không dự án không bị hỏi'; end if;
  if (diem_tin((select l from listings l where l.code = 'BDS-THU-SQL-DA9')) -> 'thieu') ? 'pháp lý (đã ra sổ hồng hay còn hợp đồng mua bán)'
     or not ((diem_tin((select l from listings l where l.code = 'BDS-THU-SQL-DA10')) -> 'thieu') ? 'pháp lý (đã ra sổ hồng hay còn hợp đồng mua bán)')
  then raise exception 'SAI DT-10: diem_tin pháp lý căn hộ'; end if;
end $$;
rollback;
