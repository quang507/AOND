-- 20261027a_cau_mau_xung_theo_ten — Bot không còn xưng "mình" với khách xưng "em"; xưng anh / chị (khách xưng em) hoặc cô / chú (khách xưng
-- cháu) theo tên trợ lý (SRS-5.1zzzzzzz214, chủ dự án 27/10/2026: "người ta xưng em thì mình xưng anh hoặc chị tùy tên, xưng cháu thì cô hoặc
-- chú"). Năm biến thể `_em` chuyển sang chỗ giữ chữ {goi} (em / cháu) + {toi} / {Toi} (bot tự xưng, code điền). Cùng cách 20261025c: dòng chưa ai
-- sửa (cau = mac_dinh) chuyển sang câu mới; dòng chủ dự án đã sửa tay giữ nguyên.
insert into public.cau_mau (khoa, cau, mac_dinh, dung_o, nguon, thu_tu) values
  ('nhac_ban_nhap_em', '{Toi} gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn {toi} hỗ trợ nhé!', '{Toi} gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn {toi} hỗ trợ nhé!', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý)', 'SRS-5.1zzzzzzz101 · 214', 4),
  ('xin_cham_sao_em', '{Goi} chấm giúp {toi} 1–5 sao cho lần hỗ trợ này nha, để {toi} làm tốt hơn nhé.', '{Goi} chấm giúp {toi} 1–5 sao cho lần hỗ trợ này nha, để {toi} làm tốt hơn nhé.', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý)', 'SRS-5.1zzzzzzz104 · 214', 6),
  ('mo_dau_nhap_em', '📋 {Toi} sẽ rao như vầy nhé {goi}:', '📋 {Toi} sẽ rao như vầy nhé {goi}:', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý) — phải bắt đầu 📋, kết thúc ":"', 'SRS-5.1zzzzzzz76 · 214', 13),
  ('hoi_ban_nhap_em', '{Goi} muốn sửa chỗ nào, hay {toi} đăng luôn nhé?', '{Goi} muốn sửa chỗ nào, hay {toi} đăng luôn nhé?', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý)', 'Kịch bản người bán; 26/10 bỏ câu dẫn dắt (SRS-5.1zzzzzzz212); 27/10 bot xưng theo tên (SRS-5.1zzzzzzz214)', 15),
  ('nhac_xin_anh_em', 'Khi nào tiện {goi} chụp gửi {toi} vài tấm ảnh thực tế nhé, để tin đăng nổi bật và hút khách hơn nè.', 'Khi nào tiện {goi} chụp gửi {toi} vài tấm ảnh thực tế nhé, để tin đăng nổi bật và hút khách hơn nè.', 'Như trên, khi khách xưng "em" / "cháu" ({goi} = em / cháu, {toi} = anh / chị / cô / chú theo tên trợ lý)', 'SRS-5.1zzzzzzz73 · 214', 31)
on conflict (khoa) do update set
  cau = case when public.cau_mau.cau = public.cau_mau.mac_dinh then excluded.cau else public.cau_mau.cau end,
  mac_dinh = excluded.mac_dinh, dung_o = excluded.dung_o, nguon = excluded.nguon, thu_tu = excluded.thu_tu;
