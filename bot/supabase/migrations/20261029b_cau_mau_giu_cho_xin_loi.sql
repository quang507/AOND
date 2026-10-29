-- 20261029b_cau_mau_giu_cho_xin_loi — SRS-5.1zzzzzzz267 (soát lời hứa 29/10/2026): hai câu server gửi thẳng khách khi lượt trả lời hỏng
-- (`giu_cho`, `thu_lai_hong`) còn viết cứng "anh/chị" + "Em" và "của mình" (bot không gọi khách là "mình", SRS-5.1zzzzzzz230) — đợt SRS-254 sót.
-- Nay dùng {goi} / {toi}; server điền theo cách khách xưng. Dòng chủ dự án đã sửa tay ở CRM (cau <> mac_dinh) giữ nguyên.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('giu_cho', '{Toi} đang xem kỹ thông tin {goi} gửi, {goi} chờ {toi} một chút nhé, {toi} trả lời ngay ạ.', '{Toi} đang xem kỹ thông tin {goi} gửi, {goi} chờ {toi} một chút nhé, {toi} trả lời ngay ạ.', 'Lượt trả lời bị lỗi — giữ chỗ, bot tự làm lại sau 20 giây', 'SRS-5.1zzzzzzz82 · đánh giá UX 20/10; 29/10 gọi theo cách khách xưng (SRS-5.1zzzzzzz267)', 7),
  ('thu_lai_hong', '{Toi} xin lỗi {goi}, hệ thống bên {toi} đang chậm. {Toi} đã báo người phụ trách xem tin nhắn của {goi}, người phụ trách sẽ nhắn lại sớm ạ.', '{Toi} xin lỗi {goi}, hệ thống bên {toi} đang chậm. {Toi} đã báo người phụ trách xem tin nhắn của {goi}, người phụ trách sẽ nhắn lại sớm ạ.', 'Làm lại vẫn lỗi — xin lỗi và báo người phụ trách (server gọi `bao_can_nguoi`)', 'SRS-5.1zzzzzzz82; 29/10 bỏ "anh/chị" viết cứng và "của mình" (SRS-5.1zzzzzzz267)', 8)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
