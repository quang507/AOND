-- phuong-tai-diem.sql — `phuong_tai_diem(lat, lng)` gắn toạ độ vào phường MỚI theo đa giác (SRS-5.1zzzzzzz360).
-- Chạy trên DB thật (SQL Editor / MCP execute_sql) sau khi áp 20261103b; TỰ CUỘN LẠI bằng `raise exception`. Mọi dòng phải `OK`.
-- Đa giác ở đây là HÌNH GIẢ (ô vuông, chữ L, có lỗ, nhiều mảnh) gắn cho hai phường có thật trong `wards` — kiểm phép điểm-trong-đa-giác,
-- không kiểm dữ liệu ranh giới. Dòng cuối in ĐỘ PHỦ thật: bao nhiêu phường đã có đa giác (trước khi nạp: 0).
do $$
declare
  o text := ''; a text; b text; a_day text; b_day text; r text; phu text;
begin
  select ten, ten_day_du into a, a_day from wards order by ten limit 1;
  select ten, ten_day_du into b, b_day from wards order by ten offset 1 limit 1;
  select format('%s / %s phường có đa giác', (select count(*) from ranh_gioi_phuong), (select count(*) from wards)) into phu;

  -- A: chữ L lõm (ô 10.70–10.80 × 106.60–106.70 bỏ góc trên phải) có một lỗ vuông nhỏ.
  insert into ranh_gioi_phuong (ten, vong, min_lat, max_lat, min_lng, max_lng, nguon, giay_phep) values (a,
    '{"type":"Polygon","coordinates":[[[106.60,10.70],[106.70,10.70],[106.70,10.75],[106.65,10.75],[106.65,10.80],[106.60,10.80],[106.60,10.70]],
      [[106.61,10.71],[106.62,10.71],[106.62,10.72],[106.61,10.72],[106.61,10.71]]]}'::jsonb,
    10.70, 10.80, 106.60, 106.70, 'hình giả — bài kiểm', 'không');
  -- B: hai mảnh rời (MultiPolygon), mảnh thứ hai nằm ở góc khuyết của A.
  insert into ranh_gioi_phuong (ten, vong, min_lat, max_lat, min_lng, max_lng, nguon, giay_phep) values (b,
    '{"type":"MultiPolygon","coordinates":[[[[106.80,10.90],[106.82,10.90],[106.82,10.92],[106.80,10.92],[106.80,10.90]]],
      [[[106.67,10.77],[106.69,10.77],[106.69,10.79],[106.67,10.79],[106.67,10.77]]]]}'::jsonb,
    10.77, 10.92, 106.67, 106.82, 'hình giả — bài kiểm', 'không');

  r := phuong_tai_diem(10.73, 106.63);  o := o || case when r = a_day then 'OK' else 'HONG' end || ' [trong]than-chu-L ';
  r := phuong_tai_diem(10.78, 106.62);  o := o || case when r = a_day then 'OK' else 'HONG' end || ' [trong]canh-dung-chu-L ';
  r := phuong_tai_diem(10.715, 106.615); o := o || case when r is null then 'OK' else 'HONG' end || ' [lo]diem-trong-lo ';
  r := phuong_tai_diem(10.78, 106.68);  o := o || case when r = b_day then 'OK' else 'HONG' end || ' [lom]goc-khuyet-thuoc-B ';
  r := phuong_tai_diem(10.76, 106.665); o := o || case when r is null then 'OK' else 'HONG' end || ' [lom]goc-khuyet-ngoai-B ';
  r := phuong_tai_diem(10.91, 106.81);  o := o || case when r = b_day then 'OK' else 'HONG' end || ' [nhieu-manh]manh-1 ';
  r := phuong_tai_diem(10.50, 106.50);  o := o || case when r is null then 'OK' else 'HONG' end || ' [ngoai]xa ';
  r := phuong_tai_diem(null, 106.63);   o := o || case when r is null then 'OK' else 'HONG' end || ' [null] ';
  raise exception 'KQ: % | ĐỘ PHỦ THẬT: %', o, phu;
end $$;
