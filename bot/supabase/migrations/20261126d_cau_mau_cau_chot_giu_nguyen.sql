-- 20261126d_cau_mau_cau_chot_giu_nguyen — SRS-5.1zzzzzzz546 (chủ dự án 26/11/2026 sau khi lên: năm câu đã chốt "cho nói" — giữ nguyên lời,
-- kể cả "hỗ trợ" / "ạ"). Trả lại câu trước 20261126b cho hoi_phi, nhac_ban_nhap(_em), xin_cham_sao(_em); duyet_tin, bao_phi chưa từng đổi.
-- Dòng chưa ai sửa (cau = mac_dinh) mới nhận câu.
begin;

update public.cau_mau set cau = case when cau = mac_dinh then '{Goi} có thể vào {web} để theo dõi tin rao ạ. {Goi} biết phí môi giới bên em chưa ạ?' else cau end, mac_dinh = '{Goi} có thể vào {web} để theo dõi tin rao ạ. {Goi} biết phí môi giới bên em chưa ạ?' where khoa = 'hoi_phi';
update public.cau_mau set cau = case when cau = mac_dinh then 'Em gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn em hỗ trợ ạ!' else cau end, mac_dinh = 'Em gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn em hỗ trợ ạ!' where khoa = 'nhac_ban_nhap';
update public.cau_mau set cau = case when cau = mac_dinh then '{Toi} gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn {toi} hỗ trợ nhé!' else cau end, mac_dinh = '{Toi} gửi {goi} bản nháp tin đăng, {goi} cần chỉnh sửa thêm nhắn {toi} hỗ trợ nhé!' where khoa = 'nhac_ban_nhap_em';
update public.cau_mau set cau = case when cau = mac_dinh then '{Goi} chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ.' else cau end, mac_dinh = '{Goi} chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ.' where khoa = 'xin_cham_sao';
update public.cau_mau set cau = case when cau = mac_dinh then '{Goi} chấm giúp {toi} 1–5 sao cho lần hỗ trợ này nha, để {toi} làm tốt hơn nhé.' else cau end, mac_dinh = '{Goi} chấm giúp {toi} 1–5 sao cho lần hỗ trợ này nha, để {toi} làm tốt hơn nhé.' where khoa = 'xin_cham_sao_em';

commit;
