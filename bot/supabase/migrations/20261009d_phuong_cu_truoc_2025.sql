-- 20261009d — Phường SỐ cũ gộp TRƯỚC 07/2025 → phường mới, có NGUỒN từng dòng (OPEN-60, chủ dự án chốt phương án (a) 09/10/2026).
--
-- Ca gốc (bắn production 09/10/2026): "MTKD đường Võ Văn Tần phường 6 quận 3 cũ" → cột phường trống, bot hỏi lại phường. Bảng
-- `phuong_cu` (20260930a) tách từ `wards.don_vi_cu` theo NQ 1685/2025, nên chỉ có tên phường ĐANG tồn tại lúc 07/2025; phường đã
-- gộp ở các đợt trước (2020, 2024) không có dòng. Khách vẫn gọi số cũ ("phường 6 quận 3", "p.7 q3", "phường 24 bình thạnh").
--
-- NGUỒN — văn bản GỐC (bản PDF có chữ ký số của Cổng TTĐT Chính phủ), đã đọc toàn văn từng điều khoản dưới đây:
--   · Nghị quyết 1111/NQ-UBTVQH14 ngày 09/12/2020 của Ủy ban Thường vụ Quốc hội "Về việc sắp xếp các đơn vị hành chính cấp
--     huyện, cấp xã và thành lập thành phố Thủ Đức thuộc Thành phố Hồ Chí Minh", hiệu lực 01/01/2021.
--     Trang: https://vanban.chinhphu.vn/default.aspx?pageid=27160&docid=202092
--     PDF:   https://datafiles.chinhphu.vn/cpp/files/vbpq/2020/12/1111.signed.pdf
--     Dùng Điều 2 khoản 1 (Quận 3), 2 (Quận 4), 3 (Quận 5), 4 (Quận 10), 5 (Phú Nhuận).
--   · Nghị quyết 1278/NQ-UBTVQH15 ngày 14/11/2024 của Ủy ban Thường vụ Quốc hội "Về việc sắp xếp đơn vị hành chính cấp xã của
--     Thành phố Hồ Chí Minh giai đoạn 2023 - 2025", hiệu lực 01/01/2025.
--     Trang: https://vanban.chinhphu.vn/?docid=211796&pageid=27160
--     PDF:   https://datafiles.chinhphu.vn/cpp/files/vbpq/2024/11/1278-15.signed.pdf
--     Dùng Điều 1 khoản 1 (Quận 3), 2 (Quận 4), 3 (Quận 5), 4 (Quận 6), 5 (Quận 8), 6 (Quận 10), 7 (Quận 11), 8 (Bình Thạnh),
--     9 (Gò Vấp), 10 (Phú Nhuận).
--
-- CÁCH DẪN: phường cũ → phường TRUNG GIAN (tên sau đợt gộp, ghi trong văn bản: "Nhập toàn bộ … của Phường 6 … vào …") → phường
-- MỚI 2025 lấy đúng theo dòng `phuong_cu` ĐÃ CÓ của phường trung gian (NQ 1685). Không đoán:
--   · trung gian đi trọn một phường mới (toan_bo = true) → phường cũ cũng true;
--   · trung gian bị chia năm 2025 (nhiều dòng false) → phường cũ mang ĐỦ các dòng đó, đều false — bot hỏi, không chọn một;
--   · phường cũ bị CHIA ("điều chỉnh một phần … vào X", phần còn lại "vào Y") → một dòng mỗi phường mới; về cùng MỘT phường mới
--     (Quận 6 Phường 5: phần → P2, còn lại → P9, cả hai trọn vào Bình Tây) thì true, khác nhau thì false.
-- Mỗi dòng có cột `nguon` = số NQ + Điều / khoản / điểm. Câu insert chỉ chèn dòng khi dòng trung gian (tên, quận cũ, phường mới)
-- có thật trong bảng — lệch thì không chèn, và khối kiểm cuối file báo lỗi. Bản code: ds-phuong.ts sinh lại bằng
-- `bun scripts/sinh-ds-phuong.mjs` (đọc migration này); bot/tests/phuong-cu-truoc-2025.mjs đỏ khi hai bên lệch.
--
-- KHÔNG thêm (không có trong hai văn bản trên — còn treo ở OPEN-60): Quận 4 P7/11/17 · Phú Nhuận P6 · Gò Vấp P2 · Bình Thạnh
-- P4/8/9/10/16/18/20/23 · Vũng Tàu P6. Không thêm các phường TÊN CHỮ của Thủ Đức ở NQ 1111 Điều 1 khoản 2 (An Khánh cũ trùng tên
-- phường mới An Khánh; Bình An trùng Phường Bình An của Dĩ An — tra theo tên không quận sẽ ra hai phường, làm hỏng dòng đang chạy).
--
-- Vector: dòng mới có `nhung` null → cron nhung-dia-danh-tick tự nhúng (chọn `where nhung is null`). RLS / quyền giữ như 20260930a
-- (RLS bật, anon / authenticated bị revoke, chỉ service_role).

alter table public.phuong_cu add column if not exists nguon text;
comment on column public.phuong_cu.nguon is
  'Văn bản gốc của dòng (20261009d): số nghị quyết + Điều / khoản / điểm. Dòng 20260930a: NQ 1685/NQ-UBTVQH15 (qua wards.don_vi_cu).';

update public.phuong_cu set nguon = 'NQ 1685/NQ-UBTVQH15 (qua wards.don_vi_cu)' where nguon is null;

insert into public.phuong_cu (ten, loai, quan_cu, phuong_moi, toan_bo, nguon, lat, lng)
select v.ten, 'phuong', v.quan_cu, v.phuong_moi, v.toan_bo, v.nguon, w.lat, w.lng
  from (values
-- (tên cũ, quận cũ, phường trung gian, phường mới 2025, toàn bộ, nguồn) — dẫn xuất ghi ở đầu file.
  ('Phường 6', 'Quận 3', 'Phường Võ Thị Sáu', 'Xuân Hòa', true, 'NQ 1111/NQ-UBTVQH14 Điều 2 khoản 1 điểm a'),
  ('Phường 7', 'Quận 3', 'Phường Võ Thị Sáu', 'Xuân Hòa', true, 'NQ 1111/NQ-UBTVQH14 Điều 2 khoản 1 điểm a'),
  ('Phường 8', 'Quận 3', 'Phường Võ Thị Sáu', 'Xuân Hòa', true, 'NQ 1111/NQ-UBTVQH14 Điều 2 khoản 1 điểm a'),
  ('Phường 10', 'Quận 3', 'Phường 9', 'Nhiêu Lộc', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 1 điểm a'),
  ('Phường 13', 'Quận 3', 'Phường 12', 'Nhiêu Lộc', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 1 điểm b'),
  ('Phường 5', 'Quận 4', 'Phường 2', 'Khánh Hội', false, 'NQ 1111/NQ-UBTVQH14 Điều 2 khoản 2 điểm a'),
  ('Phường 5', 'Quận 4', 'Phường 2', 'Vĩnh Hội', false, 'NQ 1111/NQ-UBTVQH14 Điều 2 khoản 2 điểm a'),
  ('Phường 12', 'Quận 4', 'Phường 13', 'Xóm Chiếu', true, 'NQ 1111/NQ-UBTVQH14 Điều 2 khoản 2 điểm b'),
  ('Phường 6', 'Quận 4', 'Phường 9', 'Khánh Hội', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 2 điểm a'),
  ('Phường 10', 'Quận 4', 'Phường 8', 'Khánh Hội', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 2 điểm b'),
  ('Phường 14', 'Quận 4', 'Phường 15', 'Khánh Hội', false, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 2 điểm c'),
  ('Phường 14', 'Quận 4', 'Phường 15', 'Xóm Chiếu', false, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 2 điểm c'),
  ('Phường 15', 'Quận 5', 'Phường 12', 'Chợ Lớn', true, 'NQ 1111/NQ-UBTVQH14 Điều 2 khoản 3 điểm a'),
  ('Phường 3', 'Quận 5', 'Phường 2', 'Chợ Quán', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 3 điểm a'),
  ('Phường 6', 'Quận 5', 'Phường 5', 'An Đông', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 3 điểm b'),
  ('Phường 8', 'Quận 5', 'Phường 7', 'An Đông', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 3 điểm c'),
  ('Phường 10', 'Quận 5', 'Phường 11', 'Chợ Lớn', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 3 điểm d'),
  ('Phường 3', 'Quận 6', 'Phường 1', 'Bình Tiên', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 4 điểm a'),
  ('Phường 4', 'Quận 6', 'Phường 1', 'Bình Tiên', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 4 điểm a'),
  ('Phường 6', 'Quận 6', 'Phường 2', 'Bình Tây', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 4 điểm b'),
  ('Phường 5', 'Quận 6', 'Phường 2 + Phường 9', 'Bình Tây', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 4 điểm b, c'),
  ('Phường 1', 'Quận 8', 'Phường Rạch Ông', 'Chánh Hưng', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 5 điểm a'),
  ('Phường 2', 'Quận 8', 'Phường Rạch Ông', 'Chánh Hưng', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 5 điểm a'),
  ('Phường 3', 'Quận 8', 'Phường Rạch Ông', 'Chánh Hưng', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 5 điểm a'),
  ('Phường 8', 'Quận 8', 'Phường Hưng Phú', 'Chánh Hưng', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 5 điểm b'),
  ('Phường 9', 'Quận 8', 'Phường Hưng Phú', 'Chánh Hưng', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 5 điểm b'),
  ('Phường 10', 'Quận 8', 'Phường Hưng Phú', 'Chánh Hưng', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 5 điểm b'),
  ('Phường 11', 'Quận 8', 'Phường Xóm Củi', 'Phú Định', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 5 điểm c'),
  ('Phường 12', 'Quận 8', 'Phường Xóm Củi', 'Phú Định', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 5 điểm c'),
  ('Phường 13', 'Quận 8', 'Phường Xóm Củi', 'Phú Định', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 5 điểm c'),
  ('Phường 3', 'Quận 10', 'Phường 2', 'Vườn Lài', true, 'NQ 1111/NQ-UBTVQH14 Điều 2 khoản 4 điểm a'),
  ('Phường 7', 'Quận 10', 'Phường 6', 'Diên Hồng', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 6 điểm a'),
  ('Phường 5', 'Quận 10', 'Phường 8', 'Diên Hồng', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 6 điểm b'),
  ('Phường 11', 'Quận 10', 'Phường 10', 'Vườn Lài', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 6 điểm c'),
  ('Phường 2', 'Quận 11', 'Phường 1', 'Minh Phụng', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 7 điểm a'),
  ('Phường 4', 'Quận 11', 'Phường 7', 'Minh Phụng', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 7 điểm b'),
  ('Phường 6', 'Quận 11', 'Phường 7', 'Minh Phụng', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 7 điểm b'),
  ('Phường 12', 'Quận 11', 'Phường 8', 'Bình Thới', false, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 7 điểm c'),
  ('Phường 12', 'Quận 11', 'Phường 8', 'Phú Thọ', false, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 7 điểm c'),
  ('Phường 9', 'Quận 11', 'Phường 10', 'Bình Thới', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 7 điểm d'),
  ('Phường 13', 'Quận 11', 'Phường 11', 'Phú Thọ', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 7 điểm đ'),
  ('Phường 3', 'Quận Bình Thạnh', 'Phường 1', 'Gia Định', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 8 điểm a'),
  ('Phường 6', 'Quận Bình Thạnh', 'Phường 5', 'Bình Lợi Trung', false, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 8 điểm b, c'),
  ('Phường 6', 'Quận Bình Thạnh', 'Phường 7', 'Gia Định', false, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 8 điểm b, c'),
  ('Phường 15', 'Quận Bình Thạnh', 'Phường 2', 'Gia Định', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 8 điểm e'),
  ('Phường 21', 'Quận Bình Thạnh', 'Phường 19', 'Thạnh Mỹ Tây', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 8 điểm g'),
  ('Phường 24', 'Quận Bình Thạnh', 'Phường 14', 'Bình Thạnh', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 8 điểm h'),
  ('Phường 4', 'Quận Gò Vấp', 'Phường 1', 'Hạnh Thông', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 9 điểm a'),
  ('Phường 7', 'Quận Gò Vấp', 'Phường 1', 'Hạnh Thông', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 9 điểm a'),
  ('Phường 9', 'Quận Gò Vấp', 'Phường 8', 'Thông Tây Hội', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 9 điểm b'),
  ('Phường 13', 'Quận Gò Vấp', 'Phường 14', 'An Hội Tây', false, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 9 điểm c, d'),
  ('Phường 13', 'Quận Gò Vấp', 'Phường 15', 'An Hội Đông', false, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 9 điểm c, d'),
  ('Phường 12', 'Quận Phú Nhuận', 'Phường 11', 'Phú Nhuận', true, 'NQ 1111/NQ-UBTVQH14 Điều 2 khoản 5 điểm a'),
  ('Phường 14', 'Quận Phú Nhuận', 'Phường 13', 'Phú Nhuận', true, 'NQ 1111/NQ-UBTVQH14 Điều 2 khoản 5 điểm b'),
  ('Phường 3', 'Quận Phú Nhuận', 'Phường 4', 'Đức Nhuận', true, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 10 điểm a'),
  ('Phường 17', 'Quận Phú Nhuận', 'Phường 15', 'Cầu Kiệu', false, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 10 điểm b'),
  ('Phường 17', 'Quận Phú Nhuận', 'Phường 15', 'Phú Nhuận', false, 'NQ 1278/NQ-UBTVQH15 Điều 1 khoản 10 điểm b')
  ) as v(ten, quan_cu, trung_gian, phuong_moi, toan_bo, nguon)
  join public.wards w on w.ten = v.phuong_moi
 where exists (select 1 from public.phuong_cu p
                where p.quan_cu = v.quan_cu and p.phuong_moi = v.phuong_moi
                  and p.ten = any (string_to_array(v.trung_gian, ' + ')))
on conflict (ten, quan_cu, phuong_moi) do nothing;

-- Kiểm: đủ 57 dòng có nguồn NQ 1111 / NQ 1278, và không dòng nào thiếu nguồn.
do $kiem$
declare n int; thieu int;
begin
  select count(*) into n from public.phuong_cu where nguon like 'NQ 1111/%' or nguon like 'NQ 1278/%';
  select count(*) into thieu from public.phuong_cu where nguon is null;
  if n <> 57 or thieu > 0 then
    raise exception '20261009d: % dòng NQ 1111/1278 (cần 57), % dòng thiếu nguồn — dòng trung gian lệch bảng phuong_cu?', n, thieu;
  end if;
end $kiem$;
