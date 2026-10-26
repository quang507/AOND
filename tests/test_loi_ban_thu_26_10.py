"""SRS-5.1zzzzzzz208 — năm lỗi từ lần bắn thử ban-thu-ban 26/10 (run 366) trên giọng bản anh Luận, chủ dự án: "mấy cái này mới lỗi thôi" (bình giá
và khoe khan hiếm thì chấp nhận được). Đỏ khi tắt bản sửa: câu ghi nhận lọt, tin rao bịa tiện ích / tình trạng nhà, in tên khối, hỏi lại giá ngay
lượt sau khi khách lờ, gợi ý số giá khi hỏi lại."""
from aioi import prompts
from aioi.engine import Conversation, Engine, Turn, _chi_tiet_khong_co_du_lieu, _mo_dau_ghi_nhan, _nhan_khoi_trong_tin
from aioi.schema import Property


def test_cau_ghi_nhan_that_tu_ban_thu_deu_bi_bat():
    for c in ("Em ghi nhận rồi ạ, lô đất 5x20m full thổ cư có sổ riêng là pháp lý rất chắc chắn anh/chị.",
              "Em ghi nhận thêm sổ hồng và nội thất đầy đủ cho căn nhà mình rồi ạ. Em cập nhật lại bản tin cho anh/chị:\n\n📋 Bản tin cập nhật: x",
              "Em ghi thêm diện tích sàn 170m² rồi ạ. 📋 Bản tin cập nhật:",
              "Em lưu phường 9 Quận 11 rồi anh/chị.",
              "Em lên thông tin địa chỉ Cao Lỗ, Phường Chánh Hưng cho anh/chị rồi ạ.",
              "Em đã lưu số nhà 110 vào tin ạ."):                       # cách nói mới chưa bắn
        assert _mo_dau_ghi_nhan(c), c
    for c in ("Em sửa giá còn 24 tỷ cho chị rồi ạ.", "Em cập nhật thêm cọc 2 tháng vào bản tin cho anh/chị rồi ạ.",
              "Em biết đường Âu Cơ ạ.", "Có sổ riêng là điểm cộng rất lớn."):
        assert not _mo_dau_ghi_nhan(c), c


def _conv(*loi_khach: str) -> Conversation:
    c = Engine(None).conversation("k-208")
    for x in loi_khach:
        c.history.append(Turn("user", x, 0.0))
    return c


BAN_TIN = ("📋 Em sẽ rao như vầy nhé anh chị:\n\nAnh chị ơi, bán nhà mặt tiền Cao Lỗ, giá 8,5 tỷ!\n\nNhà mặt tiền Cao Lỗ, ra vô chợ búa, trường học "
           "gần gần đó. Chủ ở lâu nên nhà được giữ gìn kỹ, sạch sẽ và chắc chắn.\n\nGạch đầu dòng:\n- 4,5x11m\n- 8,5 tỷ\n\nNhắn Zalo cho em ngay!\n\n"
           "Anh/chị thấy bản tin này hấp dẫn chưa ạ?")


def test_tin_rao_bia_tien_ich_va_tinh_trang_nha_bi_bat():
    c = _conv("Nhà đường Cao Lỗ, mặt tiền", "nhà mình ở lâu rồi, sổ riêng", "giá 8,5 tỷ")
    assert set(_chi_tiet_khong_co_du_lieu(BAN_TIN, c)) == {"chợ búa", "trường học", "giữ gìn", "sạch sẽ"}


def test_khach_tu_noi_tien_ich_thi_khong_bat():
    c = _conv("Nhà mặt tiền Cao Lỗ gần chợ, gần trường học", "nhà mới sơn sạch sẽ, giữ gìn kỹ", "giá 8,5 tỷ")
    assert _chi_tiet_khong_co_du_lieu(BAN_TIN.replace("chợ búa", "gần chợ"), c) == []
    assert _chi_tiet_khong_co_du_lieu("Nhà gần siêu thị, giá 5 tỷ.", c) == []          # không phải bản tin 📋 → không soát


def test_ten_khoi_trong_tin_bi_bat():
    assert _nhan_khoi_trong_tin(BAN_TIN) == ["gạch đầu dòng"]
    assert _nhan_khoi_trong_tin("📋 Bản tin cập nhật: Bán nhà\n\nMô tả: nhà đẹp") == ["mô tả"]
    assert _nhan_khoi_trong_tin("📋 Em sẽ rao như vầy nhé:\n\nBán nhà\n\n- 4x16m\n- 25 triệu/tháng") == []


def test_khach_lo_cau_gia_thi_luot_sau_hoi_y_khac_truoc():
    eng = Engine(None)
    c = eng.conversation("k-208-gia")
    c.active.prop = Property(loai_hinh="nha_pho", fields={"dia_chi": "Cao Lỗ, Quận 8", "duong": "Cao Lỗ"})
    c.cum_vua_hoi = ["gia"]
    c.o_vua_hoi = "gia"
    missing = c.prop.missing_fields()
    assert missing[0] == "gia"
    o = eng._o_hoi_ke(c, missing)
    assert o != "gia" and c.lo.get("gia") == 1
    # lượt sau khách vẫn chưa nói giá mà còn ý khác → giá vẫn chờ cuối, không hỏi lại ngay
    c.cum_vua_hoi = [o]
    assert eng._o_hoi_ke(c, c.prop.missing_fields()) != "gia"


def test_hoi_lai_khong_goi_y_con_so_va_khong_hoi_lai_dieu_da_noi():
    s = prompts.build_chat_system("Lan", Property(loai_hinh="nha_pho"), "gia", hoi_lai=True)
    assert "KHÔNG đưa số gợi ý" in s
    assert "KHÔNG hỏi lại để xác nhận" in s and "bảng giá" in s
    assert "KHÔNG in tên khối" in prompts.AD_FORMAT and "giữ gìn kỹ" in prompts.AD_FORMAT
