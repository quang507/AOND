"""SRS-5.1zzzzzzz218 — chat anh Luận 26/10 (tin B5E485F8): bot sửa bản tin không theo ý chủ nhà. Gốc: lời dặn CÁCH VIẾT không có chỗ giữ (mỗi
lượt soạn lại từ "DỮ LIỆU BĐS"), lượt lập thao tác nhét câu nhờ vào ô tin (`hinh_anh` = "Em cho dùm anh 2-3 cái hình tượng…"), số trong
bản tin không bị soát (41,6m² = 5,2 × 8 model tự nhân), hai ô một ý (bàn giao tức thì nói hai lần), luật icon cứng. Mỗi bài đỏ khi tắt bản
sửa tương ứng; cách nói mới chưa từng bắn ghi "mới"."""
from aioi import prompts
from aioi.engine import (Conversation, Engine, Turn, _ban_tin_truoc, _do_giong_ban_tin, _gia_tri_la_cau, _so_khong_co_trong_tin,
                         BAN_TIN_GIONG_TOI_DA)
from aioi.llm.base import RANH_GIOI_CACHE
from aioi.prompts import TIEU_DE_YEU_CAU_VIET, YEU_CAU_VIET_TOI_DA, khoi_yeu_cau_viet
from aioi.schema import Property, _gop_y


class _Spy:
    """Provider giả: lời bot theo danh sách, ghi lại system của từng lần gọi."""

    def __init__(self, plan=None, loi=()):
        self.plan, self.loi, self.systems = plan or {"operations": []}, list(loi), []

    def extract(self, *a, **k):
        return dict(self.plan)

    def reply(self, system, messages, **k):
        self.systems.append(system)
        return self.loi.pop(0) if self.loi else "Vâng ạ."

    chat = reply


BAN_1 = ("📋 Bản tin cập nhật:\n\n🏡 Anh chị ơi, mặt tiền Hoàng Hoa Thám 3 tầng, 100m² sàn chỉ 12,5 tỷ!\n\nCô bác ơi, nhà ngang 5m dài 8m, đất "
         "34,5m², 3 tầng kiên cố. Giá 12,5 tỷ còn thương lượng.\n\n- 34,5m² đất · 100m² sàn\n- 12,5 tỷ\n\nNhắn Zalo cho em ngay nhé!")


def _conv(*loi_khach: str, truoc: str = "") -> Conversation:
    c = Engine(None).conversation("k-218")
    c.prop.loai_hinh = "nha_pho"
    for x in loi_khach:
        c.history.append(Turn("user", x, 0.0))
    if truoc:
        c.history.append(Turn("assistant", truoc, 0.0))
    return c


# ---------- E. giá trị ô là câu, không phải dữ liệu ----------

def test_cau_nho_bot_nguyen_cau_khong_thanh_gia_tri_o():
    cau = "Em cho dùm anh 2-3 cái hình tượng trong bản tin đi"
    assert _gia_tri_la_cau("hinh_anh", cau, cau)
    moi = "Em bỏ giúp anh cái chữ kiên cố trong tiêu đề ra nhé em"   # mới
    assert _gia_tri_la_cau("tieu_de", moi, moi)
    assert _gia_tri_la_cau("phap_ly", "Nhà này còn sổ không em?", "Nhà này còn sổ không em?")
    # cụm dữ liệu thật (ngắn, hoặc một phần câu) vẫn qua; địa chỉ dài bằng cả tin vẫn qua (ô ghép)
    assert _gia_tri_la_cau("tinh_trang_ban_giao", "đang cho thuê, bàn giao ngay", "Người ta thuê 1 năm nhưng anh bàn giao ngay") is None
    dc = "số 12 đường Hoàng Hoa Thám phường 6 quận Bình Thạnh thành phố Hồ Chí Minh"
    assert _gia_tri_la_cau("dia_chi", dc, dc) is None
    assert _gia_tri_la_cau("gia", "12,5 tỷ", "12,5 tỷ") is None


def test_engine_bo_o_la_cau_va_ghi_so_bo_luot():
    cau = "Em cho dùm anh 2-3 cái hình tượng trong bản tin đi"
    c = _conv(cau)
    c.loi_khach_luot = cau
    assert Engine._gia_tri_ghi(c, "hinh_anh", cau, {"hinh_anh": cau}) is None
    assert c.bo_luot and "nguyên cả câu" in c.bo_luot[-1][3]


# ---------- A. sổ yêu cầu cách viết ----------

def test_planner_doc_yeu_cau_viet_chi_giu_cum_trong_tin_khach():
    from tests.test_duyet_ban_nhap import _eng
    import pytest
    mp = pytest.MonkeyPatch()
    try:
        plan = {"operations": [], "yeu_cau_viet": ["đừng đem lên tiêu đề nhấn mạnh", "viết ngắn thôi"]}
        eng, _, seen, conv = _eng(plan, mp)
        conv.listing_proposed = True
        eng.handle("u-duyet", "Sao mỗi lần anh nói gì em lại đem lên tiêu đề nhấn mạnh, đừng đem lên tiêu đề nhấn mạnh nữa")
        assert conv.y_luot.get("yeu_cau_viet") == ["đừng đem lên tiêu đề nhấn mạnh"]   # "viết ngắn thôi" không có trong tin → bỏ
        assert conv.prop.fields.get("_yeu_cau_viet") == "đừng đem lên tiêu đề nhấn mạnh"
        he = [s for s in seen if TIEU_DE_YEU_CAU_VIET in s]
        assert he, "khối yêu cầu phải vào prompt soạn tin"
        s = he[0]
        assert s.index(RANH_GIOI_CACHE) < s.index(TIEU_DE_YEU_CAU_VIET) < s.index("DỮ LIỆU BĐS")   # sau dấu cache, trước dữ liệu căn
        assert "Khách VỪA nói lượt này" in s and "_yeu_cau_viet" not in s   # tên ô hệ thống không lộ ra như dữ liệu
    finally:
        mp.undo()


def test_dang_di_kem_loi_dan_sua_thi_chua_phai_duyet():
    from tests.test_duyet_ban_nhap import _eng
    import pytest
    mp = pytest.MonkeyPatch()
    try:
        plan = {"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": "đăng đi", "yeu_cau_viet": ["thêm vài icon cho vui"]}
        eng, kho, seen, conv = _eng(plan, mp)
        conv.listing_proposed = True
        eng.handle("u-duyet", "đăng đi nhưng thêm vài icon cho vui em")   # mới
        assert conv.duyet_luot == "khong_dong_y" and kho.duyet != [True]
    finally:
        mp.undo()


def test_so_yeu_cau_cong_don_toi_da():
    p = Property()
    for i in range(YEU_CAU_VIET_TOI_DA + 3):
        Engine._nho_yeu_cau_viet(p, [f"yêu cầu {i}"])
    ds = p.fields["_yeu_cau_viet"].split(" | ")
    assert len(ds) == YEU_CAU_VIET_TOI_DA and ds[-1] == f"yêu cầu {YEU_CAU_VIET_TOI_DA + 2}"
    Engine._nho_yeu_cau_viet(p, [ds[-1]])   # trùng không thêm
    assert p.fields["_yeu_cau_viet"].split(" | ") == ds
    assert khoi_yeu_cau_viet(Property()) == ""
    assert "- yêu cầu 3" in khoi_yeu_cau_viet(p) and "Khách VỪA nói" not in khoi_yeu_cau_viet(p)
    assert "KHÔNG phải dữ liệu căn" in khoi_yeu_cau_viet(p)


def test_khong_ra_ban_tin_sau_loi_dan_thi_goi_lai():
    spy = _Spy(loi=[BAN_1])
    eng = Engine(spy)
    c = eng.conversation("k-218b")
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update({"gia": "12,5 tỷ", "dien_tich_dat": "34,5m2", "dien_tich_nha": "100m2", "kich_thuoc": "5x8", "so_tang": "3"})
    c.listing_proposed = True
    c.history.append(Turn("user", "mặt tiền 5m xứng đáng để nói đó em", 0.0))
    c.y_luot = {"yeu_cau_viet": ["mặt tiền 5m xứng đáng để nói"]}
    ra = eng._soat_hinh_thuc(c, "SYS", "Anh nói đúng ạ, mặt tiền 5m rất đáng giá, em sẽ đưa lên nổi bật trong tin.")
    assert ra == BAN_1 and len(spy.systems) == 1 and "KHÔNG gửi bản tin cập nhật" in spy.systems[0]


def test_ban_tin_y_nguyen_sau_loi_dan_thi_goi_lai_khac_thi_khong():
    truoc = BAN_1
    gan_nhu_cu = BAN_1.replace("Nhắn Zalo cho em ngay nhé!", "Nhắn Zalo cho em ngay nha!")
    assert _do_giong_ban_tin(gan_nhu_cu, truoc) >= BAN_TIN_GIONG_TOI_DA
    khac = BAN_1.replace("mặt tiền Hoàng Hoa Thám 3 tầng, 100m² sàn chỉ 12,5 tỷ", "mặt tiền 5m Hoàng Hoa Thám, 3 tầng kiên cố, chỉ 12,5 tỷ")
    assert _do_giong_ban_tin(khac, truoc) < BAN_TIN_GIONG_TOI_DA
    for loi, goi_lai in ((gan_nhu_cu, True), (khac, False)):
        spy = _Spy(loi=[khac])
        eng = Engine(spy)
        c = eng.conversation("k-218c")
        c.prop.loai_hinh = "nha_pho"
        c.prop.fields.update({"gia": "12,5 tỷ", "dien_tich_dat": "34,5m2", "dien_tich_nha": "100m2", "kich_thuoc": "5x8", "so_tang": "3",
                              "mat_tien": "5m"})
        c.listing_proposed = True
        c.history.append(Turn("assistant", truoc, 0.0))
        c.history.append(Turn("user", "đưa mặt tiền 5m lên tiêu đề giúp anh", 0.0))   # mới
        c.y_luot = {"yeu_cau_viet": ["đưa mặt tiền 5m lên tiêu đề"]}
        eng._soat_hinh_thuc(c, "SYS", loi)
        assert (len(spy.systems) == 1) is goi_lai, loi[:40]
        if goi_lai:
            assert "Y NGUYÊN bản trước" in spy.systems[0]
    assert _ban_tin_truoc(_conv("x")) == ""


def test_khong_dan_gi_thi_khong_goi_lai():
    spy = _Spy()
    eng = Engine(spy)
    c = eng.conversation("k-218d")
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update({"gia": "12,5 tỷ", "dien_tich_dat": "34,5m2", "dien_tich_nha": "100m2", "kich_thuoc": "5x8", "so_tang": "3",
                          "mat_tien": "5m"})   # có mặt tiền thật — lưới hẻm / mặt tiền (SRS-155) không kích
    c.listing_proposed = True
    c.history.append(Turn("assistant", BAN_1, 0.0))
    c.history.append(Turn("user", "ok", 0.0))
    assert eng._soat_hinh_thuc(c, "SYS", BAN_1) == BAN_1 and not spy.systems


# ---------- B. số trong bản tin phải là số chủ nhà nói ----------

def test_so_tu_nhan_ra_trong_ban_tin_bi_bat():
    c = _conv("nhà ngang 5,2m dài 8m, đất 34,5m2, 3 tầng, giá 12,5 tỷ")
    c.prop.fields.update({"kich_thuoc": "5,2x8", "dien_tich_dat": "34,5m2", "gia": "12,5 tỷ", "so_tang": "3"})
    tin = "📋 Bản tin cập nhật:\n\nNhà ngang 5,2m, dài 8m, diện tích đất 41,6m², 3 tầng, giá 12,5 tỷ.\n\n- 41,6m² đất"
    assert _so_khong_co_trong_tin(tin, c) == ["41,6m²", "41,6m²"]
    c2 = _conv("đất 4x10, giá 6 tỷ")   # mới: khách chỉ nói kích thước, bot in diện tích tự nhân
    c2.prop.fields.update({"kich_thuoc": "4x10", "gia": "6 tỷ"})
    assert _so_khong_co_trong_tin("📋 Đất 40m² chỉ 6 tỷ, ngang 4m", c2) == ["40m²"]


def test_so_khach_noi_o_moi_dang_deu_qua():
    c = _conv("đất 34.5m2", "100m2", "giá 12 tỷ 500")
    c.prop.fields.update({"dien_tich_dat": "34.5m2", "dien_tich_nha": "100m2", "gia": "12500000000", "so_tang": "3", "mat_tien": "5m"})
    tin = "📋 Bản tin: 34,5m² đất · 100m² sàn, ngang 5m, 3 tầng, chỉ 12,5 tỷ (12500 triệu)"
    assert _so_khong_co_trong_tin(tin, c) == []


def test_loi_chat_thuong_phia_ban_khong_bi_soat_so():
    spy = _Spy()
    eng = Engine(spy)
    c = eng.conversation("k-218e")
    c.prop.loai_hinh = "nha_pho"
    c.history.append(Turn("user", "nhà 3 tầng", 0.0))
    loi = "Nhà 3 tầng là điểm mạnh đó anh. Giá anh mong muốn tầm bao nhiêu ạ?"
    assert eng._soat_hinh_thuc(c, "SYS", loi) == loi and not spy.systems


# ---------- C. bàn giao tức thì không thành hai ô ----------

def test_thoi_gian_ban_giao_gop_vao_hien_trang_nha_pho():
    p = Property(loai_hinh="nha_pho")
    p.update({"thoi_gian_ban_giao": "bàn giao tức thì", "tinh_trang_ban_giao": "đang có người thuê 1 năm, bàn giao tức thì"})
    assert "thoi_gian_ban_giao" not in p.fields
    assert p.fields["tinh_trang_ban_giao"] == "đang có người thuê 1 năm, bàn giao tức thì"
    p.update({"thoi_gian_ban_giao": "giao nhà ngay sau công chứng"})   # mới: ý mới → nối, không đè
    assert p.fields["tinh_trang_ban_giao"] == "đang có người thuê 1 năm, bàn giao tức thì · giao nhà ngay sau công chứng"
    assert p._has("thoi_gian_ban_giao")
    assert _gop_y("", "x") == "x" and _gop_y("Bàn Giao tức thì", "bàn giao tức thì") == "Bàn Giao tức thì"


def test_du_an_van_giu_o_thoi_gian_ban_giao_rieng():
    p = Property(loai_hinh="du_an")
    p.update({"thoi_gian_ban_giao": "quý 4/2027"})
    assert p.fields.get("thoi_gian_ban_giao") == "quý 4/2027" and "tinh_trang_ban_giao" not in p.fields


# ---------- D. icon theo ý chủ nhà ----------

def test_luat_icon_co_ngoai_le_theo_chu_nha():
    assert "chủ nhà XIN thêm / bớt icon" in prompts.AD_FORMAT and "tối đa 6 icon" in prompts.AD_FORMAT
    assert "yeu_cau_viet" in prompts.OPERATIONS_SYSTEM if hasattr(prompts, "OPERATIONS_SYSTEM") else True


def test_planner_schema_co_yeu_cau_viet():
    sch = prompts.operations_schema()
    props = sch.get("properties") or sch.get("schema", {}).get("properties") or {}
    assert props["yeu_cau_viet"]["type"] == "array"


# ---------- gốc phụ: ảnh gửi sau một chữ rời ----------

def test_chu_roi_khong_thanh_cau_hoi_treo_cho_luot_doc_anh():
    assert Engine._pending_seller_question(_conv("Icon")) == ""
    assert Engine._pending_seller_question(_conv("Em sẽ rao sao?")) == "Em sẽ rao sao?"
    assert Engine._pending_seller_question(_conv("đường nội bộ rộng bao nhiêu")) == "đường nội bộ rộng bao nhiêu"
    assert Engine._pending_seller_question(_conv("[khách gửi sticker]")) == ""
