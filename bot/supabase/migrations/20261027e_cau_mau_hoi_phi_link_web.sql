-- 20261027e_cau_mau_hoi_phi_link_web — Câu mẫu hỏi phí không viết tay tên miền (SRS-5.1zzzzzzz220). Chat 27/10: chủ nhà được mời "vào
-- aioinhadat.com để theo dõi tin rao" trong khi tên miền đó chưa trỏ về web (trả lỗi / trang đỗ) — tin đang bán trên aioinhadat.vercel.app và
-- có trên bản đồ, chủ nhà vẫn "không thấy trên tin". Nay `{web}` do lõi điền: link trang tin của chủ nhà (`web.link_tin`), mặc định
-- `AIOI_SITE_URL`. Cùng cách 20261026f: dòng chưa ai sửa (cau = mac_dinh) chuyển sang câu mới; dòng chủ dự án đã sửa tay giữ nguyên.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('hoi_phi', '{Goi} có thể vào {web} để theo dõi tin rao ạ. {Goi} biết phí môi giới bên em chưa ạ?', '{Goi} có thể vào {web} để theo dõi tin rao ạ. {Goi} biết phí môi giới bên em chưa ạ?', 'Ngay sau câu duyệt tin — tin nhắn thứ hai, câu hỏi phí (bot nói theo tinh thần câu này). {web} = link trang tin, lõi điền', 'SRS-5.1zzzzzzz81 / 98 · bản anh Luận + câu tester 21/10; 27/10 link web một nguồn (SRS-5.1zzzzzzz220)', 2)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon;
