-- 20261126f_cau_mau_bo_tra_cuu_chua_co — SRS-5.1zzzzzzz551 (chủ dự án 26/11/2026: "bật hết").
-- FDA tra cứu ngay trong lượt; đường hẹn "em xem rồi nhắn lại" của BOA đã gỡ (`hoi_sau_dang._tra_loi_tra_cuu`) nên câu mẫu
-- `tra_cuu_chua_co` (BOA hết lượt thử mà không tra ra dữ kiện) không còn đường nào gửi; khoá đã gỡ khỏi `src/aioi/cau_mau.py`.
begin;

delete from public.cau_mau where khoa = 'tra_cuu_chua_co';

commit;
