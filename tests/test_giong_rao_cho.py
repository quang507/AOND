"""26/10/2026 (SRS-5.1zzzzzzz201; chủ dự án: "lấy bên anh Luận qua" — anh Luận push 26/10 ba commit c768f25 / 4aac437 / 207a145): tin rao
theo giọng rao chợ — mô tả nói thẳng với đám đông, "anh chị" ở đỉnh cảm xúc, khối 4 là câu mời nhắn Zalo gắn FOMO, và MỖI TIN MỘT VẺ
(ví dụ trong prompt chỉ minh hoạ, cấm chép y nguyên). Lớp lỗi: ví dụ đặt sẵn trong prompt bị model chép nên mọi tin giống hệt nhau
(cùng lớp SRS-5.1zzzzzzz196). Đỏ khi bỏ khối CTA, khối ĐA DẠNG hay luật xưng hô đám đông."""
from aioi import prompts

A = prompts.AD_FORMAT


def test_co_khoi_mo_chot_nhan_zalo_va_khong_hoi():
    assert "4) CÂU MỜI CHỐT" in A and "NHẮN TIN Zalo" in A and "FOMO" in A
    assert 'KHÔNG dùng dấu "?"' in A
    assert "KHÔNG khẳng định sự kiện không có trong dữ liệu" in A      # không bịa "đã có người đặt cọc", "căn cuối cùng"


def test_moi_tin_mot_ve_cam_chep_cau_mau():
    assert "MỖI TIN MỘT VẺ" in A and "TUYỆT ĐỐI KHÔNG chép y nguyên" in A


def test_tin_cong_khai_noi_voi_dam_dong_khong_noi_rieng_voi_chu_nha():
    assert "TIN RAO CÔNG KHAI" in A and 'KHÔNG xưng hô như nói riêng một người' in A
    assert 'ĐẶT "ANH CHỊ" CÓ CHỦ ĐÍCH' in A


def test_mo_ta_viet_ro_khong_viet_tat_va_giu_luat_that():
    assert 'KHÔNG "MT", "PN"' in A
    assert "chủ nói bán gấp thì mới được nói gấp" in A and "NỘI DUNG CHỈ TỪ DỮ LIỆU CĂN" in A      # luật thật của mình không bị đè
    assert "KHÔNG dùng dấu **" in A


def test_ban_nhap_va_ban_sua_deu_dung_mot_nguon():
    P = prompts.Property(loai_hinh="nha_pho", fields={"gia": "5 tỷ", "dia_chi": "12 Lê Lợi", "duong": "Lê Lợi"})
    for s in (prompts.build_listing_proposal_system("Lan", P), prompts.build_fee_followup_system("Lan", P)):
        assert "4) CÂU MỜI CHỐT" in s


def test_cam_khoe_khan_hiem_va_chep_loi_khen_cua_bot():
    # Bắn thử 26/10 (ban-thu-luan): tin viết "mặt tiền đẹp như thế này không phải lúc nào cũng có sẵn" và chép "xe hơi đi lại thoải mái"
    # từ câu bot tự khen trong chat. Cùng lớp: lời khen / so sánh không có trong dữ liệu lọt vào tin.
    assert '"không phải lúc nào cũng có"' in A and '"không nhiều đâu"' in A and "so sánh thị trường không kiểm được" in A
    assert "xe hơi đi lại thoải mái" in A and "KHÔNG được viết" in A
    assert "KHÔNG mở màn bằng" in A            # tiêu đề và mô tả không mở trùng một câu
