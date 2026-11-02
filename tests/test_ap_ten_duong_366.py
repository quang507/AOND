"""SRS-5.1zzzzzzz366 — quyết định chủ dự án 02/11 (nguyên văn): "không hỏi lại tên đường nữa, tự áp tên vào".

Bản trước: tên khách gõ lệch 1–2 chữ / không dấu → bot hỏi "có phải đường X không" (SRS-61), khớp nhiều đường → hỏi "Mã Lò hay Mã Lộ"
(SRS-271). Nay: kho ra MỘT tên trong khu khách nói → ghi luôn tên kho; nhiều tên ngang nhau → chọn theo quận đã biết; không ra / đường
quận khác (SRS-362) → giữ chữ khách. Không lượt nào hỏi xác nhận tên đường; khách CHƯA nói đường thì vẫn hỏi địa chỉ (hỏi ô thiếu).
Đỏ khi `_chuan_dia_danh` quay về chỉ áp tên khác dấu, khi bỏ tra lại lúc khách mới nói quận, hay khi khối địa danh dặn hỏi lại."""
from aioi.dia_danh import TraDiaDanh, khoi_dia_danh
from aioi.engine import Engine
from aioi.schema import Property
from tests.test_engine import _engine

HTP = [{"ten": "Huỳnh Tấn Phát", "khoang_cach": 1, "quan_cu": ["Quận 7"], "phuong": ["Phường Tân Thuận"]}]
ML = [{"ten": "Mã Lò", "khoang_cach": 0, "quan_cu": ["Quận Bình Tân"], "phuong": ["Phường Bình Hưng Hòa", "Phường Bình Trị Đông"]},
      {"ten": "Mã Lộ", "khoang_cach": 0, "quan_cu": ["Quận 1"], "phuong": ["Phường Tân Định"]}]
QDB = [{"ten": "Quách Đình Bảo", "khoang_cach": 1, "quan_cu": ["Quận Tân Phú"], "phuong": []}]


def _tra(duong: dict) -> TraDiaDanh:
    def rpc(ten, p):
        if ten == "tim_duong":
            return duong.get(p["p_ten"].lower(), [])
        return []
    return TraDiaDanh(rpc, lambda bang, ts: [])


def _chay(monkeypatch, duong: dict, *luot: dict) -> tuple[dict, list[str]]:
    """Mỗi lượt AI ghi các ô cho sẵn; trả ô tin cuối và mọi prompt hệ thống đã gửi model."""
    e = _engine()
    e._dia_danh = _tra(duong)
    he_thong: list[str] = []
    goc_extract, goc_chat = e._provider.extract, e._provider.chat
    monkeypatch.setattr(e._provider, "extract", lambda system, *a, **k: (he_thong.append(system), goc_extract(system, *a, **k))[1])
    monkeypatch.setattr(e._provider, "chat", lambda system, *a, **k: (he_thong.append(system), goc_chat(system, *a, **k))[1])
    for o in luot:
        monkeypatch.setattr(Engine, "_ap_dung_ke_hoach", lambda self, conv, plan, o=o: (conv.prop.update(o), []))
        e.handle("u-366", "tin khách")
    return e.conversation("u-366").prop.fields, he_thong


def _khong_hoi_duong(he_thong: list[str]) -> bool:
    return not any(("có phải đường" in s or "hỏi khéo xác nhận" in s or "TÊN ĐƯỜNG CHƯA KHỚP KHO" in s or "khớp NHIỀU đường" in s)
                   for s in he_thong)


def test_khong_dau_sai_mot_chu_ap_ten_kho_khong_hoi(monkeypatch):
    # cách nói mới: thiếu dấu + sai một chữ ("huynh tan phap" → Huỳnh Tấn Phát), khách đã nói quận
    f, he_thong = _chay(monkeypatch, {"huynh tan phap": HTP},
                        {"loai_hinh": "nha_pho", "dia_chi": "25 huynh tan phap", "duong": "huynh tan phap", "quan": "Quận 7"})
    assert (f["duong"], f["dia_chi"]) == ("Huỳnh Tấn Phát", "25 Huỳnh Tấn Phát")
    assert _khong_hoi_duong(he_thong)


def test_nhieu_ten_ngang_nhau_chon_theo_quan_da_biet(monkeypatch):
    f, he_thong = _chay(monkeypatch, {"ma lo": ML}, {"loai_hinh": "nha_pho", "duong": "ma lo", "quan": "Quận Bình Tân"})
    assert f["duong"] == "Mã Lò"
    assert _khong_hoi_duong(he_thong)


def test_chua_biet_khu_thi_giu_chu_khach_quan_noi_sau_thi_ap(monkeypatch):
    e_f, he_thong = _chay(monkeypatch, {"ma lo": ML}, {"loai_hinh": "nha_pho", "duong": "ma lo"})
    assert e_f["duong"] == "ma lo" and _khong_hoi_duong(he_thong)            # hai tên ngang nhau, chưa biết khu: không đoán, không hỏi
    f, he_thong = _chay(monkeypatch, {"ma lo": ML}, {"loai_hinh": "nha_pho", "duong": "ma lo"}, {"quan": "Quận Bình Tân"})
    assert f["duong"] == "Mã Lò" and _khong_hoi_duong(he_thong)              # lượt sau khách nói quận → tra lại, áp tên


def test_khong_ra_ten_hoac_duong_quan_khac_thi_giu_chu_khach(monkeypatch):
    f, he_thong = _chay(monkeypatch, {}, {"loai_hinh": "nha_pho", "duong": "hem cay da"})
    assert f["duong"] == "hem cay da" and _khong_hoi_duong(he_thong)
    # SRS-362: khách nói Bình Chánh, kho chỉ có một tên gần ở Tân Phú → không áp đường quận khác
    f, he_thong = _chay(monkeypatch, {"quach dieu": QDB}, {"loai_hinh": "nha_pho", "duong": "quach dieu", "quan": "Huyện Bình Chánh"})
    assert f["duong"] == "quach dieu" and _khong_hoi_duong(he_thong)


def test_khoi_dia_danh_khong_con_dong_hoi_ten_duong():
    for duong, f in (({"huynh tan phap": HTP}, {"duong": "huynh tan phap", "quan": "Quận 7"}), ({"ma lo": ML}, {"duong": "ma lo"})):
        for o in (None, "gia", "dia_chi"):
            k = khoi_dia_danh(_tra(duong), f, o)
            assert "Huỳnh Tấn Phát" not in k and "Mã Lò" not in k and "hỏi" not in k.lower(), (f, o)


def test_chua_noi_duong_van_hoi_dia_chi():
    p = Property()
    p.update({"loai_hinh": "nha_pho", "gia": "3 tỷ"})
    assert "dia_chi" in p.missing_fields()
