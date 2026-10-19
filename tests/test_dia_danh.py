"""19/10/2026 (SRS-5.1zzzzzzz60): tra phường / quận / đường theo chữ rồi theo NGHĨA (vector), máy kiểm tên còn gần chữ khách.
Đỏ khi bỏ bước tra trong engine, khi vector "gần nghĩa" mà khác tên vẫn bị nhận (Tân Định → Tân Bình), hay khi lỗi mạng làm hỏng lượt."""
from aioi.dia_danh import TraDiaDanh, khoi_dia_danh, ten_gan, TU_CHUNG_PHUONG, TU_CHUNG_DUONG
from aioi.schema import Property


def _tra(chu=None, nghia=None, duong=None, bang=None, nhung_loi=False):
    goi = []

    def rpc(ten, payload):
        goi.append(ten)
        if ten == "tim_dia_danh":
            return (chu or {}).get(payload["p_ten"], [])
        if ten == "tim_duong":
            return (duong or {}).get(payload["p_ten"], [])
        if ten == "tim_dia_danh_theo_nghia":
            return nghia or []
        raise AssertionError(ten)

    def nhung(text):
        if nhung_loi:
            raise RuntimeError("Gemini embed 429")
        goi.append("nhung")
        return [0.0] * 768

    doc = (lambda bang_, ts: (bang or {}).get((ts["ten"].removeprefix("eq."), ts["quan_cu"].removeprefix("eq.")), []))
    return TraDiaDanh(rpc, doc, nhung), goi


PHUONG_CU_TAN_DINH = [
    {"loai": "phuong_cu", "ten": "Phường Tân Định", "phuong": "Phường Tân Định", "quan_cu": "Quận 1", "khoang_cach": 0},
    {"loai": "phuong_cu", "ten": "Phường Tân Định", "phuong": "Phường Hòa Lợi", "quan_cu": "Thành phố Bến Cát", "khoang_cach": 0},
    {"loai": "phuong_moi", "ten": "Tân Định", "phuong": "Phường Tân Định", "quan_cu": "Quận 1", "khoang_cach": 0},
]


def test_phuong_theo_chu_can_quan_khi_trung_ten():
    t, goi = _tra(chu={"tan dinh": PHUONG_CU_TAN_DINH})
    assert t.phuong("tan dinh", "Quận 1") == "Phường Tân Định"
    assert t.phuong("tan dinh") is None          # hai tỉnh cùng tên phường cũ → không đoán
    assert "nhung" not in goi                    # chữ ra rồi thì không tốn lượt Gemini


def test_phuong_theo_nghia_chi_nhan_ten_gan_chu_khach():
    nghia = [
        {"loai": "phuong_moi", "ten": "Chợ Quán", "phuong": "Phường Chợ Quán", "quan_cu": "Quận 5", "do_gan": 0.83},
        {"loai": "phuong_moi", "ten": "Chợ Lớn", "phuong": "Phường Chợ Lớn", "quan_cu": "Quận 5", "do_gan": 0.80},
    ]
    t, goi = _tra(nghia=nghia)
    assert t.phuong("phuong cho quanh", "Quận 5") == "Phường Chợ Quán"   # gõ sai một chữ, chữ không ra → nghĩa tìm, máy xác nhận
    assert "nhung" in goi
    # Gần nghĩa nhưng KHÁC tên: không nhận.
    t2, _ = _tra(nghia=[{"loai": "phuong_moi", "ten": "Bến Nghé", "phuong": "Phường Bến Nghé", "quan_cu": None, "do_gan": 0.9}])
    assert t2.phuong("bến thành") is None
    # Dưới ngưỡng nghĩa: không nhận dù tên gần.
    t3, _ = _tra(nghia=[{"loai": "phuong_moi", "ten": "Chợ Quán", "phuong": "Phường Chợ Quán", "quan_cu": "Quận 5", "do_gan": 0.3}])
    assert t3.phuong("cho quanh") is None


def test_duong_chu_khac_dau_thi_chac_va_phuong_theo_quan():
    duong = {"le van sy": [{"ten": "Lê Văn Sỹ", "khoang_cach": 0, "phuong": ["Phường Nhiêu Lộc", "Phường Phú Nhuận",
                                                                           "Phường Tân Sơn Hòa", "Phường Tân Sơn Nhất"]},
                           {"ten": "Lê Văn Sĩ", "khoang_cach": 1, "phuong": []}]}
    bang = {("Lê Văn Sỹ", "Quận 3"): [{"phuong": "Phường Nhiêu Lộc"}, {"phuong": "Phường Nhiêu Lộc"}]}
    t, _ = _tra(duong=duong, bang=bang)
    assert t.duong("le van sy", "Quận 3") == {"ten": "Lê Văn Sỹ", "chac": True, "phuong": ["Phường Nhiêu Lộc"]}
    d = t.duong("le van sy")
    assert d["chac"] and len(d["phuong"]) == 4


def test_duong_theo_nghia_khong_chac_va_bo_ung_vien_khong_phai_duong():
    nghia = [
        {"loai": "duong", "ten": "Nguyễn Tri Phương", "phuong": "Phường Chợ Lớn", "quan_cu": "Quận 5", "do_gan": 0.8},
        {"loai": "phuong_moi", "ten": "Nguyễn Tri Phương", "phuong": "x", "quan_cu": "Quận 5", "do_gan": 0.95},
    ]
    t, _ = _tra(nghia=nghia)
    d = t.duong("nguyen tri phuongg", "Quận 5")
    assert d == {"ten": "Nguyễn Tri Phương", "chac": False, "phuong": ["Phường Chợ Lớn"]}


def test_loi_mang_hay_gemini_het_han_muc_thi_tra_none():
    def rpc(ten, payload):
        raise OSError("mạng đứt")
    t = TraDiaDanh(rpc, None, lambda s: [0.0] * 768)
    assert t.phuong("tân định", "Quận 1") is None and t.duong("lê văn sỹ") is None and t.quan("q5") is None
    t2, _ = _tra(nhung_loi=True)
    assert t2.phuong("cho quanh") is None


def test_ten_gan():
    assert ten_gan("phuong cho quanh", "Chợ Quán", TU_CHUNG_PHUONG)
    assert not ten_gan("Phường 1", "Phường 11", TU_CHUNG_PHUONG)        # chữ số phải y hệt
    assert not ten_gan("bến thành", "Bến Nghé", TU_CHUNG_PHUONG)
    assert ten_gan("đường le van sy", "Lê Văn Sỹ", TU_CHUNG_DUONG)


def test_khoi_prompt_ke_phuong_cho_khach_chon():
    duong = {"Lê Văn Sỹ": [{"ten": "Lê Văn Sỹ", "khoang_cach": 0, "phuong": ["Phường Nhiêu Lộc", "Phường Phú Nhuận"]}]}
    t, _ = _tra(duong=duong)
    k = khoi_dia_danh(t, {"duong": "Lê Văn Sỹ"}, "phuong")
    assert "Phường Nhiêu Lộc, Phường Phú Nhuận" in k and "KHÔNG phải khách nói" in k
    assert khoi_dia_danh(t, {"duong": "Lê Văn Sỹ"}, "gia") == ""
    assert khoi_dia_danh(None, {"duong": "Lê Văn Sỹ"}, "phuong") == ""


def test_engine_chuan_hoa_phuong_va_duong_khi_vua_bat(monkeypatch):
    from aioi.engine import Engine
    from tests.test_engine import _engine

    t, _ = _tra(chu={"tan dinh": PHUONG_CU_TAN_DINH, "q1": [{"loai": "quan_cu", "ten": "Quận 1", "khoang_cach": 0}]},
                duong={"hai ba trung": [{"ten": "Hai Bà Trưng", "khoang_cach": 0, "phuong": ["Phường Tân Định"]}]})
    e = _engine()
    e._dia_danh = t
    monkeypatch.setattr(Engine, "_ap_dung_ke_hoach", lambda self, conv, plan: (conv.prop.update(
        {"loai_hinh": "nha_pho", "dia_chi": "12 hai ba trung", "duong": "hai ba trung", "phuong": "tan dinh", "quan": "q1"}),
        []))
    e.handle("u-dia-danh", "nhà 12 hai ba trung phường tan dinh q1")
    f = e.conversation("u-dia-danh").prop.fields
    assert (f.get("quan"), f.get("phuong"), f.get("duong")) == ("Quận 1", "Phường Tân Định", "Hai Bà Trưng")


def test_engine_khong_co_tra_thi_giu_chu_khach(monkeypatch):
    from aioi.engine import Engine
    from tests.test_engine import _engine

    e = _engine()
    monkeypatch.setattr(Engine, "_ap_dung_ke_hoach", lambda self, conv, plan: (conv.prop.update(
        {"loai_hinh": "nha_pho", "duong": "hai ba trung", "phuong": "tan dinh"}), []))
    e.handle("u-dia-danh-2", "nhà hai ba trung tan dinh")
    f = e.conversation("u-dia-danh-2").prop.fields
    assert (f.get("phuong"), f.get("duong")) == ("tan dinh", "hai ba trung")
    assert Property().fields == {}
