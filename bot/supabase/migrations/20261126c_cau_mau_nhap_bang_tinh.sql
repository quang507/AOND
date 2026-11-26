-- 20261126c_cau_mau_nhap_bang_tinh — SRS-5.1zzzzzzz546 (rà lại): câu `nhap_bang_tinh` của 20261126b kết bằng câu hỏi nên vòng nhắc 5 phút
-- (`followup.cau_hoi_cuoi_cua_bot`) coi là câu đang chờ khách đáp và nhắc lại — đổi về câu kể. Dòng chưa ai sửa (cau = mac_dinh) mới nhận câu mới.
begin;

update public.cau_mau set cau = case when cau = mac_dinh then 'Em nhập xong {n} căn từ bảng tính rồi. {Goi} xem giúp em có sót căn nào thì báo em nha.' else cau end, mac_dinh = 'Em nhập xong {n} căn từ bảng tính rồi. {Goi} xem giúp em có sót căn nào thì báo em nha.'
where khoa = 'nhap_bang_tinh';

commit;
