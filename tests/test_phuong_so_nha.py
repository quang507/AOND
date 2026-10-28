"""28/10/2026 (SRS-5.1zzzzzzz236). Chủ dự án: "khi mà người ta đưa địa chỉ cụ thể hoặc hẻm cụ thể thì nó search phường trước bằng nominatim,
nếu search không được mới hỏi". Đo cùng ngày: Nominatim ra ĐÚNG số nhà thì phường đúng; chỉ ra mức đường thì có lúc sai phường (125 Bình Long,
Bình Tân → Phú Thọ Hòa). Đỏ khi nhận kết quả không đúng số nhà / không đúng đường / phường ngoài kho đường, hoặc khi gỡ bước tra."""
from aioi.dia_danh import TraDiaDanh

BINH_LONG = ["Phường Bình Hưng Hòa", "Phường Bình Trị Đông", "Phường Tân Sơn Nhì"]


def _kq(so=None, duong="Bình Long", suburb="Phường Bình Trị Đông"):
    a = {"road": duong, "suburb": suburb}
    if so:
        a["house_number"] = so
    return {"address": a}


def _tra(nomi, goi=None, loi=False):
    def rpc(ten, payload):
        if goi is not None:
            goi.append((ten, payload))
        if ten == "tra_nominatim":
            if loi:
                raise TimeoutError("hết giờ")
            return nomi
        if ten == "tim_duong" and payload["p_ten"].lower() in ("bình long", "binh long"):
            return [{"ten": "Bình Long", "khoang_cach": 0, "phuong": BINH_LONG}]
        if ten == "tim_dia_danh" and payload["p_ten"].startswith("Phường "):
            return [{"loai": "phuong_moi", "ten": payload["p_ten"], "phuong": payload["p_ten"], "khoang_cach": 0}]
        return []
    return TraDiaDanh(rpc, lambda bang, ts: [])


def test_dung_so_nha_dung_duong_thi_nhan():
    goi: list = []
    assert _tra([_kq("125")], goi).phuong_theo_so_nha("125 Bình Long", "Bình Long", "Quận Bình Tân") == "Phường Bình Trị Đông"
    q = [p for t, p in goi if t == "tra_nominatim"][0]
    assert q["p_q"].startswith("125 Bình Long") and q["p_chi_tiet"] is True


def test_muc_duong_hoac_so_khac_thi_bo():
    assert _tra([_kq()]).phuong_theo_so_nha("125 Bình Long", "Bình Long") is None          # chỉ mức đường
    assert _tra([_kq("127")]).phuong_theo_so_nha("125 Bình Long", "Bình Long") is None     # số nhà khác
    assert _tra([_kq("125", duong="Bình Long Nối Dài 2")]).phuong_theo_so_nha("125 Bình Long", "Bình Long") is None


def test_phuong_ngoai_kho_duong_thi_bo():
    """Đường Bình Long không đi qua Phú Thọ Hòa trong kho → bản đồ ra phường đó là trùng số nhà ở chỗ khác, bỏ."""
    assert _tra([_kq("125", suburb="Phường Phú Thọ Hòa")]).phuong_theo_so_nha("125 Bình Long", "Bình Long") is None


def test_khong_so_nha_thi_khong_goi_ban_do():
    goi: list = []
    assert _tra([_kq("125")], goi).phuong_theo_so_nha("đường Bình Long", "Bình Long") is None
    assert not [g for g in goi if g[0] == "tra_nominatim"]


def test_nho_ket_qua_va_loi_mang_khong_nho():
    goi: list = []
    t = _tra([_kq("125")], goi)
    t.phuong_theo_so_nha("125 Bình Long", "Bình Long")
    t.phuong_theo_so_nha("125 binh long", "Bình Long")
    assert len([g for g in goi if g[0] == "tra_nominatim"]) == 1
    goi2: list = []
    t2 = _tra([], goi2, loi=True)
    assert t2.phuong_theo_so_nha("125 Bình Long", "Bình Long") is None
    t2.phuong_theo_so_nha("125 Bình Long", "Bình Long")
    assert len([g for g in goi2 if g[0] == "tra_nominatim"]) == 2


class _Model:
    def __init__(self, loi):
        self.loi, self.systems = list(loi), []

    def extract(self, *a, **k):
        return {"operations": []}

    def reply(self, system, messages, **k):
        self.systems.append(system)
        return self.loi.pop(0) if self.loi else "Nhà mình mấy phòng ngủ vậy anh?"

    chat = reply


def _lam(monkeypatch, nomi, f):
    from aioi.engine import Engine
    monkeypatch.setattr(Engine, "_ap_dung_ke_hoach", lambda self, conv, plan: (conv.prop.update(f), []))
    m = _Model(["Nhà mình thuộc Phường Bình Trị Đông nha anh, sai thì anh báo em. Nhà mình mấy phòng ngủ vậy anh?"])
    e = Engine(m)
    e._dia_danh = _tra(nomi)
    e.handle("sonha1", "Anh bán nhà 125 Bình Long, 4x15m, giá 6 tỷ")
    return m, e.conversation("sonha1").prop.fields


def test_engine_ghi_phuong_he_thong_va_bao_khach(monkeypatch):
    m, f = _lam(monkeypatch, [_kq("125")], {"loai_hinh": "nha_pho", "dia_chi": "125 Bình Long", "duong": "Bình Long", "gia": "6 tỷ"})
    assert f["phuong"] == "Phường Bình Trị Đông" and f["_phuong_he_thong"] == "so_nha" and f["_phuong_tra_dc"] == "125 Bình Long"
    assert "PHƯỜNG HỆ THỐNG VỪA TRA" in m.systems[0]


def test_engine_khong_ra_thi_khong_ghi(monkeypatch):
    m, f = _lam(monkeypatch, [_kq()], {"loai_hinh": "nha_pho", "dia_chi": "125 Bình Long", "duong": "Bình Long", "gia": "6 tỷ"})
    assert "phuong" not in f and "PHƯỜNG HỆ THỐNG VỪA TRA" not in m.systems[0]


def test_khach_doi_dia_chi_thi_go_phuong_he_thong():
    from aioi.engine import Engine
    e = Engine(_Model([]))
    e._dia_danh = _tra([])
    conv = e.conversation("sonha2")
    conv.prop.update({"dia_chi": "300 Bình Long", "duong": "Bình Long"})
    conv.prop.fields.update({"phuong": "Phường Bình Trị Đông", "_phuong_he_thong": "so_nha", "_phuong_tra_dc": "125 Bình Long"})
    e._phuong_tu_dia_chi(conv, [])
    assert "phuong" not in conv.prop.fields and conv.prop.fields["_phuong_tra_dc"] == "300 Bình Long"


def test_khach_tu_noi_phuong_thi_giu():
    from aioi.engine import Engine
    e = Engine(_Model([]))
    e._dia_danh = _tra([])
    conv = e.conversation("sonha3")
    conv.prop.fields.update({"dia_chi": "300 Bình Long", "duong": "Bình Long", "phuong": "Phường Tân Sơn Nhì",
                             "_phuong_he_thong": "so_nha", "_phuong_tra_dc": "125 Bình Long"})
    e._phuong_tu_dia_chi(conv, ["phuong"])
    assert conv.prop.fields["phuong"] == "Phường Tân Sơn Nhì" and "_phuong_he_thong" not in conv.prop.fields
