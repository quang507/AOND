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


def test_code_chon_kieu_loi_moi_can_mot_kieu_khong_chep_cau_mau():
    # SRS-5.1zzzzzzz203: bắn thử thấy câu mời nhắn Zalo / lời mở "Anh chị cô bác ơi," bị chép ở 4–5/6 tin. Nay code chọn kiểu theo căn và
    # AD_FORMAT không còn câu mẫu hoàn chỉnh để chép.
    assert "Nhanh tay nhắn Zalo cho em ngay" not in A and "hốt mất" not in A
    assert 'Mở màn gọi "anh chị cô bác".' not in A
    P = prompts.Property
    cac_can = [P(loai_hinh="nha_pho", fields={"dia_chi": d, "duong": d, "gia": "9 tỷ"})
               for d in ("12 Lê Lợi", "Cao Lỗ", "Nguyễn Trãi", "Âu Cơ", "Lê Văn Sỹ", "Trần Văn Giàu", "Phạm Hùng", "Bùi Minh Trực")]
    kieu = {prompts.kieu_loi_tin_rao(p) for p in cac_can}
    assert len(kieu) >= 3                                                       # nhiều căn → nhiều kiểu, không cùng một lời
    p = cac_can[0]
    doi_gia = P(loai_hinh="nha_pho", fields={**p.fields, "gia": "8 tỷ"})
    assert prompts.kieu_loi_tin_rao(p) == prompts.kieu_loi_tin_rao(doi_gia)    # sửa giá không đổi giọng
    for q in cac_can:
        for s in (prompts.build_listing_proposal_system("Lan", q), prompts.build_fee_followup_system("Lan", q)):
            assert "KIỂU LỜI CỦA TIN NÀY" in s and "KHÔNG chép câu nào ở trên" in s
    mo, cta = prompts.KIEU_LOI_TIN_RAO[prompts.kieu_loi_tin_rao(p)]
    assert mo in prompts.khoi_kieu_loi_tin_rao(p) and cta in prompts.khoi_kieu_loi_tin_rao(p)


def test_cac_kieu_loi_khong_viet_san_cau_hoan_chinh():
    # Kiểu chỉ tả HƯỚNG; không chứa câu mời nguyên văn kiểu cũ (cùng lớp lỗi ví dụ bị chép, SRS-196).
    for mo, cta in prompts.KIEU_LOI_TIN_RAO:
        assert "nhắn Zalo cho em ngay" not in mo + cta and '"' not in mo + cta
    assert len({m for m, _ in prompts.KIEU_LOI_TIN_RAO}) == len(prompts.KIEU_LOI_TIN_RAO) >= 5
