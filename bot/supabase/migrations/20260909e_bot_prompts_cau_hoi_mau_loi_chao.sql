-- 20260909e — bot_prompts thêm cau_hoi_mau (JSON) và loi_chao (09/09/2026)
--
-- Chủ dự án: "thêm cau_hoi_mau vào bot_prompts" để sửa câu hỏi mẫu ở Dashboard;
-- lời chào khách mới có "anh Thu ở Sài Gòn theo tới khi bán/thuê/mua được nhà".
-- Nội dung sinh TỰ ĐỘNG từ _shared/prompts.ts (CAU_HOI_MAU_TEXT, LOI_CHAO) —
-- md5 hai bên phải khớp (TS-KYGUI-16). Sửa câu thì sửa ở Dashboard, hoặc sửa
-- prompts.ts rồi sinh lại file này (không sửa tay SQL).
insert into public.bot_prompts (key, content) values
  ('cau_hoi_mau', $mau${
  "loai_bds": "Nhà mình là nhà phố, chung cư hay đất vậy {ac}?",
  "phuong": "Nhà mình thuộc phường mấy {ac}?",
  "vi_tri": "Nhà mình ở đường nào, số mấy hay hẻm nào {ac}?",
  "danh_gia": "{Ac} thấy em nói chuyện có giống người thật không, có làm mất thời gian {ac} không ạ?\nNếu chấm cách em chăm sóc thì {ac} cho em mấy điểm trên 10 ạ?",
  "gia": "{Ac} muốn thu về tầm bao nhiêu ạ?",
  "dien_tich": "Diện tích trên sổ bao nhiêu, ngang dài thế nào {ac}?",
  "dien_tich_dat": "Diện tích đất trên sổ bao nhiêu, ngang dài thế nào {ac}?",
  "dien_tich_tim_tuong": "Căn hộ mình bao nhiêu m2 tim tường {ac}?",
  "tho_cu": "Trong đó thổ cư được bao nhiêu m2 {ac}?",
  "mat_tien": "Ngang mặt tiền mấy mét {ac}?",
  "do_rong_hem": "Hẻm trước nhà rộng mấy mét, ô tô vào được không {ac}?",
  "do_rong_duong": "Đường trước đất rộng mấy mét {ac}?",
  "ket_cau": "Nhà mình xây mấy tầng rồi {ac}?",
  "so_phong_ngu": "Tổng cộng bao nhiêu phòng ngủ {ac}?",
  "tang": "Căn hộ mình ở tầng mấy {ac}?",
  "phap_ly": "Sổ hồng mình là sổ riêng chưa, hoàn công đủ chưa {ac}?",
  "hinh_anh": "{Ac} chụp giúp em ảnh sổ, mặt tiền và hẻm qua Zalo nha?",
  "hien_trang": "Nhà hiện còn ở tốt hay cần sửa lại {ac}?",
  "noi_that": "Nội thất để lại những gì {ac}?",
  "phi_quan_ly": "Phí quản lý mỗi tháng tầm bao nhiêu {ac}?",
  "gia_dien_nuoc": "Điện nước tính sao {ac}?",
  "gio_giac": "Giờ giấc ra vào có tự do không {ac}?",
  "nganh_hang_phu_hop": "Mặt bằng hợp buôn bán ngành gì {ac}?",
  "thoi_han_thue": "Mình muốn cho thuê tối thiểu bao lâu {ac}?",
  "san_vuon": "Sân vườn rộng chừng nào {ac}?",
  "huong": "Nhà mình quay hướng nào {ac}?",
  "quy_hoach": "Nhà có dính quy hoạch hay lộ giới gì không {ac}?",
  "nam_xay": "Nhà xây năm nào {ac}?"
}$mau$),
  ('loi_chao', $mau$Dạ em chào anh/chị, em là Thái bên AI Ơi Nhà Đất ạ. Anh/chị đang muốn mua, thuê hay đang có nhà cần bán/cho thuê ạ?
Bên em có anh Thu phụ trách khu vực Sài Gòn, sẽ theo anh/chị tới khi bán được, cho thuê được hay mua được nhà nha.$mau$)
on conflict (key) do update set content = excluded.content, updated_at = now();
