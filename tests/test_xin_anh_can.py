"""SRS-5.1zzzzzzz169 (chủ dự án 24/10/2026: "Khách xin lại ảnh trong 24 giờ: bot không gửi lại, chỉ nhắc ảnh đã gửi ở trên… người mua hỏi ảnh cũng đưa
cho họ dc"). Gốc: ảnh chỉ đi kèm khi lời bot DÁN LINK căn, mỗi (khách, căn) một lần / 24 giờ — khách chủ động xin ảnh thì không có đường nào gửi. Nay AI đọc
"xin_anh" theo nghĩa (code kiểm cụm trích trong tin khách), engine trả mã căn ở `TurnResult.xin_anh`, `anh_can_gui_kem(xin=…)` gửi bỏ chặn 24 giờ.
Đỏ khi: bỏ `xin` khỏi `anh_can_gui_kem`, khi `xin_anh` không vào `TurnResult`, khi căn chưa có ảnh mà vẫn dặn "gửi ảnh", hoặc khi không có căn mà vẫn hứa."""
from aioi.anh_can import SoAnhDaGui, anh_can_gui_kem
from aioi.anh_du_an import BoNhoAnhDaGui
from tests.test_viec_mua import CAN, KHACH_MUA, KhoGia, _engine

KHO_ANH = [{"code": "ABCD1234", "url": f"https://x/{i}.jpg"} for i in range(6)]
LINK = "https://aioinhadat.vercel.app/nha-dat/ABCD1234"


def _goi(dong):
    return lambda ma: [d for d in dong if d["code"] in ma]


def test_xin_lai_trong_24_gio_van_gui_va_gui_tiep_anh_chua_gui():
    bn, so = BoNhoAnhDaGui(), SoAnhDaGui()
    kw = dict(goi=_goi(KHO_ANH), bo_nho=bn, so_gui=so)
    dau = anh_can_gui_kem("k1", "buyer", f"xem {LINK}", **kw)                       # bot tự giới thiệu: 4 ảnh đầu
    assert dau == [f"https://x/{i}.jpg" for i in range(4)]
    assert anh_can_gui_kem("k1", "buyer", f"xem {LINK}", **kw) == []               # tự giới thiệu lại: vẫn chặn 24 giờ (giữ nguyên)
    xin1 = anh_can_gui_kem("k1", "buyer", "dạ em gửi ảnh nha", xin=["abcd1234"], **kw)   # khách XIN (lời không cần link)
    assert xin1 == ["https://x/4.jpg", "https://x/5.jpg"]                          # gửi tiếp ảnh chưa gửi
    xin2 = anh_can_gui_kem("k1", "buyer", "dạ", xin=["ABCD1234"], **kw)
    assert xin2 == [f"https://x/{i}.jpg" for i in range(4)]                        # gửi hết rồi → quay lại từ đầu, không im
    assert anh_can_gui_kem("k1", "seller", "dạ", xin=["ABCD1234"], **kw) == []     # chỉ khách mua
    assert anh_can_gui_kem("k1", "buyer", "dạ", xin=["KHONGCO"], **kw) == []       # căn không có ảnh → không gửi, không ném


def test_xin_va_link_cung_can_khong_gui_hai_lan():
    kw = dict(goi=_goi(KHO_ANH), bo_nho=BoNhoAnhDaGui(), so_gui=SoAnhDaGui())
    ra = anh_can_gui_kem("k2", "buyer", f"ảnh đây {LINK}", xin=["ABCD1234"], **kw)
    assert len(ra) == 4 and len(set(ra)) == 4


class KhoAnh(KhoGia):
    """KhoGia + view ảnh: `anh` ảnh cho căn ABCD1234."""

    def __init__(self, anh, **kw):
        super().__init__(**kw)
        self._anh = anh

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "GET" and endpoint.startswith("listing_photos_v"):
            return [{"code": "ABCD1234"} for _ in range(self._anh)]
        return super()._request(method, endpoint, data, prefer)


def _xin(kho, mua):
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": mua})
    r = eng.handle("mua-anh", "cho anh xem ảnh căn đó với em")
    return r, ai


def test_khach_xin_anh_engine_tra_ma_can_va_dan_model_gui_anh():
    r, ai = _xin(KhoAnh(4), {"ma_can": ["ABCD1234"], "xin_anh": True, "trich_dan": "cho anh xem ảnh"})
    assert r.xin_anh == ["ABCD1234"]
    assert any("gửi ảnh #ABCD1234 NGAY SAU tin này" in s and "KHÔNG nói \"đã gửi ở trên\"" in s for s in ai.system)


def test_xin_anh_khong_ghi_ma_lay_tu_link_bot_vua_nhac():
    kho = KhoAnh(3)
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"xin_anh": True, "trich_dan": "cho anh xem ảnh"}})
    eng.handle("mua-anh", "Em tìm nhà phố quận 5 tầm 5 tỷ")                        # lượt 1: bot giới thiệu căn kèm link (khối CĂN ĐANG RAO)
    eng._provider.chat = lambda system, messages, max_tokens=256: f"Em gửi anh căn này nha {LINK}"   # type: ignore[method-assign]
    eng.handle("mua-anh", "Em tìm nhà phố quận 5 tầm 5 tỷ nữa")                    # bot dán link ở lời gần nhất
    r = eng.handle("mua-anh", "cho anh xem ảnh với")
    assert r.xin_anh == ["ABCD1234"]


def test_can_chua_co_anh_noi_that_khong_hua():
    r, ai = _xin(KhoAnh(0), {"ma_can": ["ABCD1234"], "xin_anh": True, "trich_dan": "cho anh xem ảnh"})
    assert r.xin_anh == []
    assert any("CHƯA có ảnh nào trên hệ thống" in s and "KHÔNG hứa gửi ảnh" in s for s in ai.system)


def test_khong_biet_can_nao_thi_hoi_lai():
    kho = KhoAnh(4)
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"xin_anh": True, "trich_dan": "cho anh xem ảnh"}})
    r = eng.handle("mua-anh-2", "cho anh xem ảnh với")                              # chưa có link bot nhắc, không có mã
    assert r.xin_anh == []
    assert any("chưa rõ căn nào" in s for s in ai.system)


def test_cum_trich_khong_co_trong_tin_khach_thi_bo():
    r, _ = _xin(KhoAnh(4), {"ma_can": ["ABCD1234"], "xin_anh": True, "trich_dan": "xin gửi hình thật nhiều"})
    assert r.xin_anh == []                                                          # AI bịa cụm trích → bỏ, như mọi việc mua khác
    assert CAN["code"] == "ABCD1234"
