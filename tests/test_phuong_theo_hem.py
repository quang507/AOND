"""21/10/2026 (SRS-5.1zzzzzzz115). Chủ dự án: "họ nói 137/28 đường số 59 con bot có hiểu ko". Đường số 59 đi qua 7 phường nên bot chỉ
hỏi phường trống; kho hẻm (bảng duong, loai = hem) có hẻm 137 của Đường số 59 ở MỘT phường (An Hội Tây). Đỏ khi bot không dùng số hẻm
trong địa chỉ để gợi ý phường, hoặc lấy nhầm số nhà mặt tiền làm số hẻm."""
from aioi.dia_danh import TraDiaDanh, khoi_dia_danh, so_hem_cua

BAY_PHUONG = ["Phường An Hội Tây", "Phường An Khánh", "Phường Bình Dương", "Phường Bình Phú", "Phường Bình Trưng",
              "Phường Hiệp Bình", "Phường Tân Hưng"]
HEM = {("Đường số 59", "137"): [{"phuong": "Phường An Hội Tây", "quan_cu": "Quận Gò Vấp"}],
       ("Đường số 59", "200"): [{"phuong": "Phường An Hội Tây", "quan_cu": "Quận Gò Vấp"}, {"phuong": "Phường Tân Hưng", "quan_cu": "Quận Gò Vấp"}],
       ("Cách Mạng Tháng Tám", "285"): [{"phuong": "Phường Hòa Hưng", "quan_cu": "Quận 10"}],
       ("Quang Trung", "965"): [{"phuong": "Phường An Hội Tây", "quan_cu": "Quận Gò Vấp"}]}


def _tra(goi: list | None = None) -> TraDiaDanh:
    def rpc(ten, payload):
        if ten == "tim_duong":
            if payload["p_ten"].lower() in ("đường số 59", "duong so 59"):
                return [{"ten": "Đường số 59", "khoang_cach": 0, "phuong": BAY_PHUONG}]
            if payload["p_ten"].lower() == "quang trung":
                return [{"ten": "Quang Trung", "khoang_cach": 0, "phuong": BAY_PHUONG}]
            if payload["p_ten"].lower() == "cách mạng tháng tám":
                return [{"ten": "Cách Mạng Tháng Tám", "khoang_cach": 0, "phuong": BAY_PHUONG}]
        return []

    def doc(bang, ts):
        if goi is not None:
            goi.append((bang, ts))
        if bang != "duong" or ts.get("loai") != "eq.hem":
            return []
        me = ts["duong_me"].removeprefix("eq.")
        so = [x.strip('"') for x in ts["so_hem"].removeprefix("in.(").removesuffix(")").split(",")]
        return [r for s in so for r in HEM.get((me, s), [])]
    return TraDiaDanh(rpc, doc)


def test_so_hem_cua():
    assert so_hem_cua("137/28 Đường số 59") == ["137"]
    assert so_hem_cua("137/28/5 đường số 59") == ["137", "137/28"]
    assert so_hem_cua("hẻm 965 Quang Trung") == ["965"]
    assert so_hem_cua("Đường số 59, nhà 137/28") == ["137"]          # "số 59" không phải số hẻm
    assert so_hem_cua("285 Cách Mạng Tháng Tám") == []                 # số nhà mặt tiền
    assert so_hem_cua("Hem 12/3a Le Van Sy") == ["12", "12/3A"]
    assert so_hem_cua(None) == [] and so_hem_cua("đường số 59") == []


def test_137_28_duong_so_59_goi_y_an_hoi_tay():
    k = khoi_dia_danh(_tra(), {"duong": "đường số 59", "dia_chi": "137/28 đường số 59"}, "phuong")
    assert "Kho hẻm" in k and "Phường An Hội Tây" in k and "đúng không" in k
    assert "Phường Tân Hưng" not in k                                  # không kể cả 7 phường của đường


def test_mat_tien_khong_lay_phuong_cua_hem_cung_so():
    k = khoi_dia_danh(_tra(), {"duong": "Cách Mạng Tháng Tám", "dia_chi": "285 Cách Mạng Tháng Tám"}, None)
    assert "Hòa Hưng" not in k


def test_da_co_phuong_thi_thoi_va_khong_tra_kho():
    goi: list = []
    k = khoi_dia_danh(_tra(goi), {"duong": "đường số 59", "dia_chi": "137/28 đường số 59", "phuong": "Phường An Hội Tây"}, "gia")
    assert "Kho hẻm" not in k and not [g for g in goi if g[1].get("loai") == "eq.hem"]


def test_quan_khach_noi_loc_hem():
    k = khoi_dia_danh(_tra(), {"duong": "đường số 59", "dia_chi": "137/28 đường số 59", "quan": "Quận 7"}, None)
    assert "Phường An Hội Tây" not in k                                # hẻm 137 ở Gò Vấp, khách nói Quận 7 → không gợi ý


def test_ai_bo_chu_hem_van_tra_duoc_khi_can_trong_hem():
    """Bắn thử 21/10 (DC2): khách gõ "hẻm 965 Quang Trung", ô dia_chi AI ghi "965 Quang Trung" (mất chữ hẻm)."""
    k = khoi_dia_danh(_tra(), {"duong": "Quang Trung", "dia_chi": "965 Quang Trung", "lo_gioi_hem": "Nhà hẻm"}, "phuong")
    assert "Phường An Hội Tây" in k
    k = khoi_dia_danh(_tra(), {"duong": "Quang Trung", "dia_chi": "965 Quang Trung"}, "phuong")   # chưa biết hẻm hay mặt tiền
    assert "Kho hẻm" not in k
    assert so_hem_cua("đường số 59", "Đường số 59", la_hem=True) == []                       # số trong tên đường không phải hẻm


class _Model:
    """Model giả: lần lượt trả các lời đã định, ghi lại system mỗi lượt."""
    def __init__(self, loi):
        self.loi, self.systems = list(loi), []

    def extract(self, *a, **k):
        return {"operations": []}

    def reply(self, system, messages, **k):
        self.systems.append(system)
        return self.loi.pop(0) if self.loi else "Nhà mình thuộc phường nào vậy chị?"

    chat = reply


def _lam(monkeypatch, loi, them=None, dia_chi="200/5 đường số 59"):
    """Mặc định hẻm 200 nằm ở HAI phường: hẻm chỉ một phường thì hệ thống tự ghi phường, không hỏi (SRS-5.1zzzzzzz236)."""
    from aioi.engine import Engine
    f = {"loai_hinh": "nha_pho", "dia_chi": dia_chi, "duong": "đường số 59", "gia": "6 tỷ 2", **(them or {})}
    monkeypatch.setattr(Engine, "_ap_dung_ke_hoach", lambda self, conv, plan: (conv.prop.update(f), []))
    if "phuong" not in f:   # lượt này hệ thống chọn hỏi phường — khối kho hẻm chỉ vào lượt hỏi phường (SRS-5.1zzzzzzz228)
        def _hoi_phuong(conv, missing):
            conv.o_vua_hoi, conv.cum_vua_hoi = "phuong", ["phuong"]
            return "phuong"
        monkeypatch.setattr(Engine, "_o_hoi_ke", staticmethod(_hoi_phuong))
    m = _Model(loi)
    e = Engine(m)
    e._dia_danh = _tra()
    r = e.handle("hem1", "Chị bán nhà 137/28 đường số 59, 4x15m, 1 trệt 2 lầu, giá 6 tỷ 2")
    m.e = e
    return m, r


def test_loi_hoi_phuong_trong_thi_goi_lai_model(monkeypatch):
    """Bắn thử 21/10 (DC1): khối "Kho hẻm" đã vào prompt, Haiku vẫn hỏi trống "Nhà mình thuộc phường nào" → gọi lại một lần."""
    m, r = _lam(monkeypatch, ["Em ghi rồi chị. Nhà mình thuộc phường nào vậy chị?",
                              "Em ghi rồi chị. Nhà mình ở An Hội Tây hay Tân Hưng vậy chị?"])
    assert "Kho hẻm" in m.systems[0]
    assert len(m.systems) == 2 and "VIẾT LẠI LƯỢT NÀY" in m.systems[1] and "An Hội Tây" in m.systems[1]
    assert "An Hội Tây" in r.reply


def test_loi_da_nhac_phuong_thi_khong_goi_lai(monkeypatch):
    m, _ = _lam(monkeypatch, ["Nhà mình ở phường An Hội Tây hay Tân Hưng vậy chị?"])
    assert len(m.systems) == 1


def test_hem_mot_phuong_thi_tu_ghi_khong_hoi(monkeypatch):
    """SRS-5.1zzzzzzz236 (chủ dự án 28/10: "đưa ... hẻm cụ thể thì nó search phường trước, nếu search không được mới hỏi"): kho hẻm chỉ có MỘT
    phường → ghi vào ô, đánh dấu hệ thống, báo khách một câu; không còn khối "Kho hẻm" hỏi xác nhận. Đỏ khi gỡ `_phuong_tu_dia_chi`."""
    m, r = _lam(monkeypatch, ["Nhà mình thuộc Phường An Hội Tây nha chị, sai thì chị báo em. Nhà mình mấy phòng ngủ vậy chị?"],
                dia_chi="137/28 đường số 59")
    assert "Kho hẻm" not in m.systems[0] and "PHƯỜNG HỆ THỐNG VỪA TRA" in m.systems[0]
    f = m.e.conversation("hem1").prop.fields
    assert f["phuong"] == "Phường An Hội Tây" and f["_phuong_he_thong"] == "hem"


def test_da_co_phuong_khong_soat(monkeypatch):
    m, _ = _lam(monkeypatch, ["Nhà mình mấy phòng ngủ vậy chị?"], {"phuong": "Phường An Hội Tây"})
    assert len(m.systems) == 1


def test_kho_hem_chi_vao_luot_hoi_phuong():
    """SRS-5.1zzzzzzz228 (ban-thu-srd 27/10: "có phải Phường Chợ Quán không" lặp 5 lượt — khối kho hẻm kèm sẵn câu hỏi nằm trong prompt mọi
    lượt, cả sau khi admin đã được báo tra phường). Lượt hỏi ô khác / lượt sau bản nháp không có khối này. Đỏ khi bỏ điều kiện."""
    f = {"duong": "đường số 59", "dia_chi": "137/28 đường số 59"}
    assert "Kho hẻm" in khoi_dia_danh(_tra(), f, "phuong")
    assert "Kho hẻm" not in khoi_dia_danh(_tra(), f, "gia") and "Kho hẻm" not in khoi_dia_danh(_tra(), f, None)
