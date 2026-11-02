"""19/10/2026 (SRS-5.1zzzzzzz60): tra phường / quận / đường theo chữ rồi theo NGHĨA (vector), máy kiểm tên còn gần chữ khách.
Đỏ khi bỏ bước tra trong engine, khi vector "gần nghĩa" mà khác tên vẫn bị nhận (Tân Định → Tân Bình), hay khi lỗi mạng làm hỏng lượt."""
from aioi.dia_danh import TraDiaDanh, bo_dau, khoi_dia_danh, ten_gan, TU_CHUNG_PHUONG, TU_CHUNG_DUONG
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
    # SRS-5.1zzzzzzz359: bỏ dòng "Kho đường … khi hỏi phường, kể các phường này cho khách chọn" — khối không còn đưa danh sách phường để hỏi.
    duong = {"Lê Văn Sỹ": [{"ten": "Lê Văn Sỹ", "khoang_cach": 0, "phuong": ["Phường Nhiêu Lộc", "Phường Phú Nhuận"]}]}
    t, _ = _tra(duong=duong)
    for o in ("phuong", "gia"):
        k = khoi_dia_danh(t, {"duong": "Lê Văn Sỹ"}, o)
        assert "Phường Nhiêu Lộc" not in k and "kể các phường" not in k
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


# --- 19/10/2026 (SRS-5.1zzzzzzz61) → SRS-5.1zzzzzzz366 (chủ dự án 02/11: "không hỏi lại tên đường nữa, tự áp tên vào"): "trần ninh trọng" →
# kho có Trần Bình Trọng → hệ thống ghi luôn tên kho, khối địa danh không còn câu hỏi xác nhận ---

TBT = {"trần ninh trọng": [{"ten": "Trần Bình Trọng", "khoang_cach": 1, "phuong": ["Phường Chợ Quán", "Phường Bàn Cờ"]}],
       "Trần Bình Trọng": [{"ten": "Trần Bình Trọng", "khoang_cach": 0, "phuong": ["Phường Chợ Quán", "Phường Bàn Cờ"]}]}


def test_ten_duong_go_sai_khong_hoi_xac_nhan():
    t, _ = _tra(duong=TBT)
    f = {"duong": "trần ninh trọng", "quan": "Quận 5"}
    for cau_ke in ("gia", "dien_tich_dat", None, "phuong"):
        k = khoi_dia_danh(t, f, cau_ke)
        assert "Trần Bình Trọng" not in k and "TRƯỚC" not in k, cau_ke


def test_tra_duong_nho_ket_qua_khoi_goi_lai_moi_luot():
    t, goi = _tra(duong=TBT)
    for _ in range(4):
        t.duong("trần ninh trọng", "Quận 5")
    assert goi.count("tim_duong") == 1


def test_engine_ap_ten_kho_khi_go_sai_khong_hoi(monkeypatch):
    """SRS-5.1zzzzzzz366: bản SRS-61 hỏi "có phải đường Trần Bình Trọng" rồi chờ khách gật — nay code ghi luôn tên kho (cả trong dia_chi)."""
    from aioi.engine import Engine
    from tests.test_engine import _engine

    t, _ = _tra(duong=TBT)
    e = _engine()
    e._dia_danh = t
    he_thong: list[str] = []
    goc_extract, goc_chat = e._provider.extract, e._provider.chat
    monkeypatch.setattr(e._provider, "extract", lambda system, *a, **k: (he_thong.append(system), goc_extract(system, *a, **k))[1])
    monkeypatch.setattr(e._provider, "chat", lambda system, *a, **k: (he_thong.append(system), goc_chat(system, *a, **k))[1])
    monkeypatch.setattr(Engine, "_ap_dung_ke_hoach", lambda self, conv, plan: (conv.prop.update(
        {"loai_hinh": "nha_pho", "dia_chi": "12 trần ninh trọng", "duong": "trần ninh trọng", "quan": "Quận 5"}), []))
    e.handle("u-tbt", "bán nhà 12 trần ninh trọng q5")
    f = e.conversation("u-tbt").prop.fields
    assert (f["duong"], f["dia_chi"]) == ("Trần Bình Trọng", "12 Trần Bình Trọng")
    assert not any("TÊN ĐƯỜNG CHƯA KHỚP KHO" in s or "hỏi khéo xác nhận" in s for s in he_thong)


def test_engine_thay_ten_duong_khac_dau_trong_dia_chi(monkeypatch):
    from aioi.engine import Engine
    from tests.test_engine import _engine

    t, _ = _tra(duong={"le van sy": [{"ten": "Lê Văn Sỹ", "khoang_cach": 0, "phuong": ["Phường Nhiêu Lộc"]}]})
    e = _engine()
    e._dia_danh = t
    monkeypatch.setattr(Engine, "_ap_dung_ke_hoach", lambda self, conv, plan: (conv.prop.update(
        {"loai_hinh": "nha_pho", "dia_chi": "12 le van sy", "duong": "le van sy"}), []))
    e.handle("u-lvs", "nhà 12 le van sy")
    f = e.conversation("u-lvs").prop.fields
    assert (f["duong"], f["dia_chi"]) == ("Lê Văn Sỹ", "12 Lê Văn Sỹ")


def test_duong_trung_ten_bo_dau_khach_go_dung_dau_thi_nhan():
    """SRS-5.1zzzzzzz270 (chat 29/10): "Mã Lò" (Bình Tân, hai phường) và "Mã Lộ" (Quận 1) cùng khoảng cách 0 khi bỏ dấu → trước đây None, bot
    không kể được phường mà hỏi trống. Khách gõ đúng dấu thì nhận đúng tên; gõ không dấu vẫn không đoán."""
    ml = [{"ten": "Mã Lò", "khoang_cach": 0, "phuong": ["Phường Bình Hưng Hòa", "Phường Bình Trị Đông"]},
          {"ten": "Mã Lộ", "khoang_cach": 0, "phuong": ["Phường Tân Định"]}]
    t, _ = _tra(duong={"Mã Lò": ml, "mã lộ": ml, "ma lo": ml})
    assert t.duong("Mã Lò") == {"ten": "Mã Lò", "chac": True, "phuong": ["Phường Bình Hưng Hòa", "Phường Bình Trị Đông"]}
    assert t.duong("mã lộ")["ten"] == "Mã Lộ"
    assert t.duong("ma lo") is None


def test_ten_duong_khop_nhieu_duong_khong_hoi_khach_chon():
    """SRS-5.1zzzzzzz271 → SRS-5.1zzzzzzz366: "ma lo" khớp ngang nhau Mã Lò (Bình Tân) và Mã Lộ (Quận 1), chưa biết khu → không hỏi khách
    chọn (chủ dự án 02/11: "không hỏi lại tên đường nữa"); `ung_vien_duong` vẫn ra hai tên để ô duong giữ chữ khách. Cách nói "mã lo"."""
    ml = [{"ten": "Mã Lò", "khoang_cach": 0, "quan_cu": ["Quận Bình Tân"], "phuong": ["Phường Bình Hưng Hòa", "Phường Bình Trị Đông"]},
          {"ten": "Mã Lộ", "khoang_cach": 0, "quan_cu": ["Quận 1"], "phuong": ["Phường Tân Định"]},
          {"ten": "Ba Tơ", "khoang_cach": 2, "quan_cu": ["Quận 8"], "phuong": ["Phường Bình Đông"]}]
    for go in ("ma lo", "mã lo"):
        t, _ = _tra(duong={go: ml})
        assert t.ung_vien_duong(go) == ["Mã Lò (Quận Bình Tân)", "Mã Lộ (Quận 1)"]
        k = khoi_dia_danh(t, {"duong": go}, "phuong")
        assert "Mã Lò" not in k and "Mã Lộ" not in k and "NHIỀU" not in k


def test_tin_cho_phuong_ma_ten_duong_nhap_nhang_thi_hoi_duong_truoc():
    """SRS-5.1zzzzzzz271 (căn Mã Lò) → SRS-5.1zzzzzzz359: cổng web không hỏi gì về phường nữa (SRS-366: cũng không hỏi tên đường)."""
    from aioi.prompts import khoi_trang_thai_web
    uv = ["Mã Lò (Quận Bình Tân)", "Mã Lộ (Quận 1)"]
    k = khoi_trang_thai_web({"len_web": False, "thieu": ["phuong"], "goi_y_phuong": [], "phuong_da_hoi": True, "duong_nhap_nhang": uv})[0]
    assert "Mã Lò" not in k and "KHÔNG hỏi khách phường" in k


def test_khach_noi_quan_thi_chon_duong_cung_quan():
    """SRS-5.1zzzzzzz273: "ma lo" + quận Bình Tân → Mã Lò; quận 1 → Mã Lộ."""
    ml = [{"ten": "Mã Lò", "khoang_cach": 0, "quan_cu": ["Quận Bình Tân"], "phuong": ["Phường Bình Hưng Hòa", "Phường Bình Trị Đông"]},
          {"ten": "Mã Lộ", "khoang_cach": 0, "quan_cu": ["Quận 1"], "phuong": ["Phường Tân Định"]}]
    t, _ = _tra(duong={"ma lo": ml})
    assert t.duong("ma lo", "Quận Bình Tân")["ten"] == "Mã Lò"
    assert t.duong("ma lo", "Quận 1")["ten"] == "Mã Lộ"
    assert t.ung_vien_duong("ma lo", "Quận Bình Tân") == []


def test_o_duong_giu_chu_khach_go_khi_ten_khop_nhieu_duong():
    """SRS-5.1zzzzzzz273 (bắn thử J 29/10): khách gõ "ma lo", AI ghi "Mã Lò" (tự thêm dấu) → ô giữ "ma lo" để bot hỏi Mã Lò hay Mã Lộ.
    Tên không nhập nhằng ("tran hung dao" → AI "Trần Hưng Đạo") giữ giá trị AI. Cách nói mới: "Ma Lo" viết hoa."""
    from tests.test_engine import _engine
    from aioi.engine import Conversation
    from aioi.assistants import assign_assistant
    ml = [{"ten": "Mã Lò", "khoang_cach": 0, "quan_cu": ["Quận Bình Tân"], "phuong": []},
          {"ten": "Mã Lộ", "khoang_cach": 0, "quan_cu": ["Quận 1"], "phuong": []}]
    thd = [{"ten": "Trần Hưng Đạo", "khoang_cach": 0, "quan_cu": ["Quận 5"], "phuong": []}]
    t, _ = _tra(duong={"ma lo": ml, "Ma Lo": ml, "tran hung dao": thd})
    e = _engine()
    e._dia_danh = t
    conv = Conversation(user_key="u-ml", assistant=assign_assistant("u-ml"))
    for go in ("ban nha duong ma lo 12 ty", "ban nha duong Ma Lo 12 ty"):
        conv.loi_khach_luot = go
        assert bo_dau(e._duong_chu_khach(conv, "Mã Lò")) == "ma lo" and e._duong_chu_khach(conv, "Mã Lò") != "Mã Lò"
    conv.loi_khach_luot = "ban nha duong tran hung dao"
    assert e._duong_chu_khach(conv, "Trần Hưng Đạo") == "Trần Hưng Đạo"
    conv.loi_khach_luot = "bán nhà đường Mã Lò"
    assert e._duong_chu_khach(conv, "Mã Lò") == "Mã Lò"
