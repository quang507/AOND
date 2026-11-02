"""SRS-5.1zzzzzzz207 (chủ dự án 26/10/2026: "sếp t đang rất chú trọng giọng văn, cố gắng lấy 100% của bên aond đi, cái nào cần gỡ bớt cho tự do
thì gỡ, nhưng phần bóc tách có vẻ bên đó làm dở hơn mình thì ko lấy"). Lượt chat người bán dùng prompt bản anh Luận (`luan8560/AOND` 207a145):
khen điểm mạnh trước rồi hỏi 1 ý, ~30 từ, xưng em gọi anh/chị — các luật giọng chồng chất của mình (khen theo lượt, mở lượt, tách ý, "Dạ hoài",
ví dụ đáp mẫu) gỡ. Đỏ khi prompt cũ quay lại. Từ Đợt 8 (SRS-5.1zzzzzzz319) lượt thu thập chỉ còn phiếu lượt (`build_phieu_luot`)."""
from aioi import prompts
from aioi.schema import Property

P = Property(loai_hinh="nha_pho", fields={"dia_chi": "12 Lê Lai, Quận 1", "duong": "Lê Lai"})


def test_luat_giong_cu_da_go():
    s = prompts.build_phieu_luot("Lan", P, "gia")
    for cu in ("KHEN NHIỀU HƠN, CÓ CƠ SỞ", "TÁCH Ý, HỎI NGẮN", "MỞ LƯỢT BẰNG LỜI KHEN", 'CẤM BỆNH "DẠ HOÀI"', "TỐI ĐA ~40 TỪ",
               "CẤM NHẠI LẠI LỜI KHÁCH", "GIỌNG SÔI NỔI ĐƯỢC PHÉP"):
        assert cu not in s, cu
    for ten in ("LUAT_KHEN", "LUAT_MO_LUOT", "LUAT_TACH_Y", "CONVERSATION_POLICY", "khoi_khen_theo_luot", "build_chat_system"):
        assert not hasattr(prompts, ten), ten


def test_phan_nghiep_vu_va_chong_bia_van_giu():
    s = prompts.build_phieu_luot("Lan", P, "gia")
    assert "Tối đa MỘT câu hỏi mỗi lượt" in s and "TỪ ĐIỂN TIẾNG LÓNG" in s
    assert "không bịa chi tiết" in s
    assert "NỘI DUNG CHỈ TỪ DỮ LIỆU CĂN" in prompts.AD_FORMAT and "15–25 từ" in prompts.AD_FORMAT
    nhap = prompts.build_listing_proposal_system("Lan", Property(loai_hinh="nha_pho", fields={"gia": "9 tỷ", "dia_chi": "12 Lê Lai"}))
    assert "VÍ DỤ MẪU CHUẨN" not in nhap and "Văn phong thân thiện, đậm chất địa phương Việt Nam." in nhap
