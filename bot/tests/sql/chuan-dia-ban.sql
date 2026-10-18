-- chuan-dia-ban.sql — chuan_dia_ban nhận cả hai kiểu địa bàn: trước gộp ("Phường 1, Quận 5") và sau gộp ("Phường Chợ Quán")
-- (20261018e, SRS-5.1zzzzzzz39). Dữ liệu mẫu dựng tay trong giao dịch, rollback cuối. Sai → raise exception.
begin;
set local client_min_messages = warning;
delete from phuong_cu; delete from wards; delete from quan_cu;
insert into quan_cu (ten) values ('Quận 1'), ('Quận 5'), ('Quận 11'), ('Quận Bình Thạnh'), ('Huyện Củ Chi'), ('Bình Dương');
insert into wards (ten, loai, ten_day_du, quan_cu, don_vi_2025, tinh_cu, nguon) values
  ('Chợ Quán', 'phuong', 'Phường Chợ Quán', 'Quận 5', '{}', 'TP.HCM', 'thu'), ('Chợ Lớn', 'phuong', 'Phường Chợ Lớn', 'Quận 5', '{}', 'TP.HCM', 'thu'),
  ('Sài Gòn', 'phuong', 'Phường Sài Gòn', 'Quận 1', '{}', 'TP.HCM', 'thu'), ('Bến Thành', 'phuong', 'Phường Bến Thành', 'Quận 1', '{}', 'TP.HCM', 'thu'),
  ('Bình Thới', 'phuong', 'Phường Bình Thới', 'Quận 11', '{}', 'TP.HCM', 'thu'), ('Phú Thọ', 'phuong', 'Phường Phú Thọ', 'Quận 11', '{}', 'TP.HCM', 'thu'),
  ('Bình Mỹ', 'xa', 'Xã Bình Mỹ', 'Huyện Củ Chi', '{}', 'TP.HCM', 'thu');
insert into phuong_cu (ten, loai, quan_cu, phuong_moi, toan_bo) values
  ('Phường 1', 'phuong', 'Quận 5', 'Chợ Quán', true), ('Phường 10', 'phuong', 'Quận 5', 'Chợ Lớn', true),
  ('Phường Bến Nghé', 'phuong', 'Quận 1', 'Sài Gòn', true), ('Phường Nguyễn Cư Trinh', 'phuong', 'Quận 1', 'Bến Thành', false),
  ('Phường 12', 'phuong', 'Quận 11', 'Bình Thới', false), ('Phường 12', 'phuong', 'Quận 11', 'Phú Thọ', false);
create temp table ca (ten text, co text, mong text) on commit drop;
create function pg_temp.kq(t text) returns text language sql as
  $$ select concat_ws(' | ', r.phuong, r.quan_cu, r.kieu) from public.chuan_dia_ban(t) r $$;
insert into ca values
  ('kiểu cũ: phường số + quận số', pg_temp.kq('123 Trần Hưng Đạo, Phường 1, Quận 5'), 'Phường Chợ Quán | Quận 5 | cu'),
  ('kiểu cũ viết tắt P.10 Q5', pg_temp.kq('hẻm 45 Nguyễn Trãi P.10 Q5'), 'Phường Chợ Lớn | Quận 5 | cu'),
  ('kiểu mới gọi tên, tự điền quận cũ', pg_temp.kq('nhà ở phường chợ quán'), 'Phường Chợ Quán | Quận 5 | moi'),
  ('phường cũ gọi tên, viết tắt p', pg_temp.kq('nha o p ben nghe q1'), 'Phường Sài Gòn | Quận 1 | cu'),
  ('phường cũ bị chia → mo_ho, không đoán', pg_temp.kq('Phường 12, Quận 11'), 'Quận 11 | mo_ho'),
  ('chỉ có quận', pg_temp.kq('bán nhà hẻm 4x15 quận 5'), 'Quận 5 | chi_quan'),
  ('quận gọi tên không có chữ quận', pg_temp.kq('hẻm xe hơi Bình Thạnh'), 'Quận Bình Thạnh | chi_quan'),
  ('xã + huyện', pg_temp.kq('xã Bình Mỹ huyện Củ Chi'), 'Xã Bình Mỹ | Huyện Củ Chi | moi'),
  -- Không được kích:
  ('tên đường trùng tên phường cũ (không có chữ phường)', pg_temp.kq('123 Nguyễn Cư Trinh, Q1'), 'Quận 1 | chi_quan'),
  ('đại lộ Bình Dương không phải địa bàn', pg_temp.kq('đại lộ Bình Dương'), 'khong'),
  ('phường số không có quận', pg_temp.kq('phường 5'), 'khong'),
  ('rỗng', pg_temp.kq(''), 'khong');
do $$ declare r record; n int := 0; begin
  for r in select * from ca loop
    if r.co is distinct from r.mong then raise warning 'SAI: % — có "%", mong "%"', r.ten, r.co, r.mong; n := n + 1; end if;
  end loop;
  if n > 0 then raise exception '% ca sai', n; end if;
end $$;
rollback;
