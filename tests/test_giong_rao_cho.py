"""26/10/2026 (SRS-5.1zzzzzzz201; chủ dự án: "lấy bên anh Luận qua" — anh Luận push 26/10 ba commit c768f25 / 4aac437 / 207a145): tin rao
theo giọng rao chợ — mô tả nói thẳng với đám đông, "anh chị" ở đỉnh cảm xúc, khối 4 là câu mời nhắn Zalo gắn FOMO, và MỖI TIN MỘT VẺ
(ví dụ trong prompt chỉ minh hoạ, cấm chép y nguyên). Lớp lỗi: ví dụ đặt sẵn trong prompt bị model chép nên mọi tin giống hệt nhau
(cùng lớp SRS-5.1zzzzzzz196). Đỏ khi bỏ khối CTA, khối ĐA DẠNG hay luật xưng hô đám đông."""
from aioi import prompts

A = prompts.AD_FORMAT


def test_co_khoi_mo_chot_nhan_zalo_va_khong_hoi():
    assert "4) CÂU MỜI CHỐT" in A and "NHẮN TIN / liên hệ Zalo" in A and "FOMO" in A
    assert "KHÔNG phải câu hỏi lấy lệ" in A
    assert "KHÔNG khẳng định sự kiện không có trong dữ liệu" in A      # không bịa "đã có người đặt cọc", "căn cuối cùng"


def test_moi_tin_mot_ve_cam_chep_cau_mau():
    assert "MỖI TIN MỘT VẺ" in A and "không có hai tin nào trùng từng chữ" in A   # Q8 (SRS-5.1zzzzzzz336): không còn câu mẫu để "cấm chép"


def test_tin_cong_khai_noi_voi_dam_dong_khong_noi_rieng_voi_chu_nha():
    assert "TIN RAO CÔNG KHAI" in A and 'KHÔNG xưng hô 1 người' in A
    assert 'ĐẶT "ANH CHỊ" CÓ CHỦ ĐÍCH' in A


def test_mo_ta_viet_ro_khong_viet_tat_va_giu_luat_that():
    assert 'KHÔNG "MT"' in A and 'KHÔNG "PN"' in A
    assert "KHÔNG bịa độ gấp" in A and "NỘI DUNG CHỈ TỪ DỮ LIỆU CĂN" in A      # luật chống bịa của mình không bị đè (SRS-207)


def test_ban_nhap_va_ban_sua_deu_dung_mot_nguon():
    P = prompts.Property(loai_hinh="nha_pho", fields={"gia": "5 tỷ", "dia_chi": "12 Lê Lợi", "duong": "Lê Lợi"})
    for s in (prompts.build_listing_proposal_system("Lan", P), prompts.build_fee_followup_system("Lan", P)):
        assert "4) CÂU MỜI CHỐT" in s


def test_cam_khoe_khan_hiem_va_chep_loi_khen_cua_bot():
    # Bắn thử 26/10 (ban-thu-luan): tin viết "mặt tiền đẹp như thế này không phải lúc nào cũng có sẵn" và chép "xe hơi đi lại thoải mái"
    # từ câu bot tự khen trong chat. Cùng lớp: lời khen / so sánh không có trong dữ liệu lọt vào tin.
    # SRS-207: danh sách chữ khoe khan hiếm của mình bỏ theo bản anh Luận ("Chỉ hối/khan hiếm khi ĐÚNG sự thật"); lời bot khen trong chat
    # vẫn không phải dữ liệu.
    assert "khan hiếm khi ĐÚNG sự thật" in A and "từng HỎI hay từng KHEN" in A and "không phải dữ liệu" in A


def test_cau_moi_zalo_ta_cach_viet_khong_cau_mau_moi_tin_mot_ve():
    # SRS-5.1zzzzzzz205 (26/10: câu mẫu + "đừng chép y nguyên" theo anh Luận) → Q8 (chủ dự án 02/11, SRS-5.1zzzzzzz336): BỎ câu minh hoạ hoàn
    # chỉnh ("Bà con ơi…", câu mời chốt mẫu), giữ giọng rao chợ bằng cách TẢ cách viết — câu mẫu vẫn bị chép dù có luật cấm chép.
    for cau in ("Nhanh tay nhắn Zalo cho em ngay", "tiền vô liền tay", "hốt mất", '"Bà con ơi,"', '"Anh chị ơi,"', '"anh chị cô bác"'):
        assert cau not in A, cau
    assert "KHÔNG đưa câu mẫu nào" in A and "lời gọi đám đông người mua" in A and "FOMO" in A
    assert not hasattr(prompts, "KIEU_LOI_TIN_RAO") and "KIỂU LỜI CỦA TIN NÀY" not in prompts.build_listing_proposal_system(
        "Lan", prompts.Property(loai_hinh="nha_pho", fields={"gia": "9 tỷ", "dia_chi": "12 Lê Lợi"}))


def test_cam_goi_nguoi_doc_la_ban():
    assert 'KHÔNG "bạn"' in A      # bắn thử 26/10: "Bạn đang tìm nhà phố ở Q.8…" trong tin rao


def test_loi_chot_hua_lien_he_khi_co_khach_quan_tam_theo_anh_luan():
    from aioi.schema import Property
    p = Property(loai_hinh="nha_pho", fields={"gia": "9 tỷ", "dia_chi": "12 Lê Lợi", "duong": "Lê Lợi"})
    s = prompts.build_phieu_luot("Lan", p, None)   # Đợt 8 (SRS-5.1zzzzzzz319): phiếu lượt
    # SRS-5.1zzzzzzz267: vẫn chốt có lời hứa như anh Luận, nhưng chỉ hứa điều có đường làm thật (câu hỏi → chủ nhà, lịch xem → người phụ trách)
    assert "có khách hỏi hay hẹn xem bên em báo ngay" in s and "không hứa gọi điện hay hạn bán" in s and "không gạ rao căn" in s
