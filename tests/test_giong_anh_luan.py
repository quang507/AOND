"""SRS-5.1zzzzzzz207 (chủ dự án 26/10/2026: "sếp t đang rất chú trọng giọng văn, cố gắng lấy 100% của bên aond đi, cái nào cần gỡ bớt cho tự do
thì gỡ, nhưng phần bóc tách có vẻ bên đó làm dở hơn mình thì ko lấy"). Lượt chat người bán dùng prompt bản anh Luận (`luan8560/AOND` 207a145):
khen điểm mạnh trước rồi hỏi 1 ý, ~30 từ, xưng em gọi anh/chị — các luật giọng chồng chất của mình (khen theo lượt, mở lượt, tách ý, "Dạ hoài",
ví dụ đáp mẫu) gỡ. Đỏ khi prompt cũ quay lại."""
from aioi import prompts
from aioi.schema import Property

P = Property(loai_hinh="nha_pho", fields={"dia_chi": "12 Lê Lai, Quận 1", "duong": "Lê Lai"})


def test_chat_nguoi_ban_dung_khuon_anh_luan():
    s = prompts.build_chat_system("Lan", P, "gia")
    for dong in (
        "trả lời NGẮN, khoảng 30 từ — khen vài từ rồi hỏi đúng 1 thông tin.",
        "Mỗi lượt hỏi thì chỉ hỏi TỐI ĐA 1 thông tin. Khen ngợi điểm mạnh của BĐS trước khi hỏi. KHÔNG bắt khách điền form.",
        # SRS-5.1zzzzzzz215: dòng xưng hô cứng của anh Luận nhường cho khối QUY TẮC XƯNG HÔ theo lượt (khách xưng em → bot xưng anh / chị, SRS-214)
        "Ngắn gọn, thân thiện, đậm chất địa phương Việt Nam. Xưng hô theo khối QUY TẮC XƯNG HÔ ở cuối (mặc định xưng \"em\", gọi \"anh/chị\").",
        "Hãy khen ngợi điểm mạnh của BĐS trước, rồi hỏi đúng 1 thông tin này một cách tự nhiên.",
    ):
        assert dong in s, dong


def test_luat_giong_cu_da_go():
    s = prompts.build_chat_system("Lan", P, "gia")
    for cu in ("KHEN NHIỀU HƠN, CÓ CƠ SỞ", "TÁCH Ý, HỎI NGẮN", "MỞ LƯỢT BẰNG LỜI KHEN", 'CẤM BỆNH "DẠ HOÀI"', "TỐI ĐA ~40 TỪ",
               "CẤM NHẠI LẠI LỜI KHÁCH", "GIỌNG SÔI NỔI ĐƯỢC PHÉP"):
        assert cu not in s, cu
    for ten in ("LUAT_KHEN", "LUAT_MO_LUOT", "LUAT_TACH_Y", "CONVERSATION_POLICY", "khoi_khen_theo_luot"):
        assert not hasattr(prompts, ten), ten


def test_phan_nghiep_vu_va_chong_bia_van_giu():
    s = prompts.build_chat_system("Lan", P, "gia")
    assert "KHÔNG tự hỏi ý khác" in s and "ĐỦ cấp hành chính" in s and "TỪ ĐIỂN TIẾNG LÓNG" in s
    assert "KHÔNG bịa ngoài hai nguồn đó" in s
    assert "NỘI DUNG CHỈ TỪ DỮ LIỆU CĂN" in prompts.AD_FORMAT and "15–25 từ" in prompts.AD_FORMAT
    nhap = prompts.build_listing_proposal_system("Lan", Property(loai_hinh="nha_pho", fields={"gia": "9 tỷ", "dia_chi": "12 Lê Lai"}))
    assert "VÍ DỤ MẪU CHUẨN" not in nhap and "Văn phong thân thiện, đậm chất địa phương Việt Nam." in nhap
