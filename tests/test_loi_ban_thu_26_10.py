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


def test_o_vua_hoi_khach_chua_tra_loi_thi_dan_model_khong_hoi_lai():
    """Bắn thử 368 Cao Lỗ: lượt "1 trệt 3 lầu" hệ thống chọn hỏi pháp lý mà model vẫn hỏi lại diện tích sàn — lời dặn phải nói ô đó KHÔNG hỏi."""
    p = Property()
    p.loai_hinh = "nha_pho"
    s = prompts.build_chat_system("Th•ái", p, "phap_ly_hoan_cong", o_bo_qua="dien_tich_nha")
    dong = s.split(prompts.RANH_GIOI_CACHE, 1)[1]
    assert "KHÔNG hỏi lại ý đó" in dong and prompts.nhan_o("dien_tich_nha", p) in dong
    assert "KHÔNG hỏi lại ý đó" not in prompts.build_chat_system("Th•ái", p, "dien_tich_nha", o_bo_qua="dien_tich_nha")


def test_engine_truyen_o_luot_truoc_khi_doi_o():
    """Đường thật qua Engine.handle: lượt trước hỏi diện tích sàn, khách nói kết cấu (không trả lời sàn) → hệ thống đổi ô, system gửi model
    phải dặn KHÔNG hỏi lại diện tích sàn."""
    class _Bat:
        def __init__(self):
            self.he = []

        def extract(self, *a, **k):
            return {"operations": []}

        def reply(self, system, messages, **k):
            self.he.append(system)
            return "Nhà 1 trệt 3 lầu rộng rãi ạ. Nhà mình có sổ chưa anh?"

        chat = reply

    bat = _Bat()
    eng = Engine(bat)
    c = eng.conversation("k-208b")
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update({"dia_chi": "Cao Lỗ, Phường Chánh Hưng", "duong": "Cao Lỗ", "phuong": "Phường Chánh Hưng", "lo_gioi_hem": "mặt tiền",
                          "dien_tich_dat": "4,5x11", "ket_cau": "1 trệt 3 lầu"})
    c.o_vua_hoi, c.cum_vua_hoi = "dien_tich_nha", ["dien_tich_nha"]
    eng.handle("k-208b", "Nhà xây 1 trệt 3 lầu")
    dong = bat.he[0].split(prompts.RANH_GIOI_CACHE, 1)[1]
    assert c.o_vua_hoi != "dien_tich_nha"
    assert "KHÔNG hỏi lại ý đó" in dong and prompts.nhan_o("dien_tich_nha", c.prop) in dong


def test_dtcn_la_dat_va_quy_hoach_khong_phai_lo_gioi_hien_tai():
    """Chat thử 26/10 (Thống Nhất – Gò Vấp): "DT 4x18m – DTCN 71m²" bị ghi thành 71m² SÀN và "mặt tiền quy hoạch mở rộng 25m" thành đường đang rộng
    25m. Cả hai lượt bóc tách (lập thao tác + bóc tách phụ) và AD_FORMAT phải nói rõ hai luật — đỏ khi gỡ đoạn đó khỏi prompt."""
    import re
    nguon = open(prompts.__file__, encoding="utf-8").read()
    assert len(re.findall(r'"DTCN" / "dt công nhận" / "diện tích công nhận" = diện tích ĐẤT', nguon)) == 2
    assert len(re.findall(r"quy_hoach, KHÔNG\s+ghi vào lo_gioi_duong", nguon)) == 2
    assert "KHÔNG viết thành đường đang rộng 25m" in prompts.AD_FORMAT and "DTCN" in prompts.AD_FORMAT
