"""SRS-5.1zzzzzzz181 (chủ dự án 25/10/2026: "nối project_id cho tin rao… có cần hỏi lại ko" → "đồng ý"). Ca gốc: chat chị N. 20/10 — "Khu nhà phố
NYAL" ở 198 Trương Đình Hội, kho có "Ny'ah Phú Định" ở 58A Trương Đình Hội; tên khác nên `_du_an` không gắn `project_id` (đúng, không đoán).
Nay kho có ĐÚNG MỘT dự án cùng đường thì bot hỏi xác nhận MỘT lần, khách gật mới ghi `du_an` (rồi `_du_an` gắn `project_id` khi lưu)."""
from aioi.supabase_store import SupabaseConversationStore
from tests.test_duyet_ban_nhap import _Kho, _eng

NYAH = {"id": "p1", "name": "Ny'ah Phú Định", "ward": "Phường Phú Định", "district": "Quận 8",
        "location_raw": "58A Trương Đình Hội và đường 156 An Dương Vương, Phường Phú Định"}


def _kho_that(dong, du_an_khop=None):
    kho = SupabaseConversationStore.__new__(SupabaseConversationStore)
    kho.da_hoi = []
    kho._du_an = lambda f: du_an_khop

    def _get(ep):
        kho.da_hoi.append(ep)
        return list(dong)
    kho._get = _get
    return kho


def test_dung_mot_du_an_cung_duong_thi_goi_y():
    kho = _kho_that([NYAH])
    d = kho.du_an_goi_y({"duong": "Trương Đình Hội", "phuong": "Phường Phú Định"})
    assert d and d["name"] == "Ny'ah Phú Định"
    assert "Tr%C6%B0%C6%A1ng" in kho.da_hoi[0] and "ilike" in kho.da_hoi[0]


def test_nhieu_du_an_hoac_khac_phuong_hoac_da_khop_ten_thi_khong_hoi():
    f = {"duong": "Trương Đình Hội", "phuong": "Phường Phú Định"}
    assert _kho_that([NYAH, {**NYAH, "id": "p2", "name": "Dự án khác"}]).du_an_goi_y(f) is None
    assert _kho_that([{**NYAH, "ward": "Phường Chánh Hưng"}]).du_an_goi_y(f) is None
    assert _kho_that([NYAH], du_an_khop={"id": "p1"}).du_an_goi_y(f) is None
    assert _kho_that([]).du_an_goi_y(f) is None
    assert _kho_that([NYAH]).du_an_goi_y({"duong": "Hồ"}) is None   # tên đường quá ngắn: khớp bừa
    # phường kho / phường khách chưa biết một bên → không loại
    assert _kho_that([{**NYAH, "ward": None}]).du_an_goi_y(f)


class _KhoGoiY(_Kho):
    def __init__(self, d):
        super().__init__()
        self.d, self.goi = d, 0

    def du_an_goi_y(self, fields):
        self.goi += 1
        return self.d


def _tin_chua_xong(eng, conv):
    conv.prop.fields.update({"duong": "Trương Đình Hội", "dia_chi": "198 Trương Đình Hội"})
    for k in ("gia", "ket_cau", "dien_tich_nha", "dien_tich_dat"):
        conv.prop.fields.pop(k, None)


def test_hoi_mot_lan_roi_khach_gat_thi_ai_duoc_dan_ghi_du_an(monkeypatch):
    eng, _, seen, conv = _eng({"operations": []}, monkeypatch)
    eng._convstore = kho = _KhoGoiY(NYAH)
    _tin_chua_xong(eng, conv)
    ops: list[str] = []
    monkeypatch.setattr(eng._provider, "extract", lambda system, messages, schema: ops.append(system) or {"operations": []}, raising=False)

    eng.handle("u-duyet", "nhà ngay Trương Đình Hội")
    assert 'dự án "Ny\'ah Phú Định"' in seen[-1] and "đúng không ạ" in seen[-1]
    assert "BOT VỪA HỎI căn này có thuộc dự án" not in ops[-1]
    assert conv.prop.fields["_goi_y_du_an"] == "Ny'ah Phú Định"

    eng.handle("u-duyet", "đúng rồi em")
    assert 'du_an = "Ny\'ah Phú Định"' in ops[-1]
    assert "DỰ ÁN GỢI Ý" not in seen[-1]                      # không hỏi lại
    assert conv.prop.fields["_goi_y_du_an"].endswith("|xong")

    eng.handle("u-duyet", "giá 5 tỷ")
    assert "BOT VỪA HỎI căn này có thuộc dự án" not in ops[-1]   # dặn đúng một lượt
    assert kho.goi == 1                                       # đã hỏi thì không tra kho nữa


def test_khong_co_goi_y_thi_khong_hoi(monkeypatch):
    eng, _, seen, conv = _eng({"operations": []}, monkeypatch)
    eng._convstore = _KhoGoiY(None)
    _tin_chua_xong(eng, conv)
    eng.handle("u-duyet", "nhà ngay Trương Đình Hội")
    assert "DỰ ÁN GỢI Ý" not in seen[-1] and not conv.prop.fields.get("_goi_y_du_an")


def _kho_that_day_du(dong, match=()):
    kho = SupabaseConversationStore.__new__(SupabaseConversationStore)
    kho._du_an_nho = {}
    kho._get = lambda ep: list(dong)
    kho._request = lambda method, ep, data=None, prefer=None: list(match)
    return kho


def test_ten_gan_giong_va_cung_duong_thi_gan_thang_khong_hoi():
    from aioi.supabase_store import ten_gan_giong_du_an
    assert ten_gan_giong_du_an("Khu nhà phố NYAL", "Ny'ah Phú Định")
    assert ten_gan_giong_du_an("Nyah Phú Định", "Ny'ah Phú Định")
    assert not ten_gan_giong_du_an("Sunrise City", "Ny'ah Phú Định")
    assert not ten_gan_giong_du_an("Khu nhà phố", "Ny'ah Phú Định")      # chỉ còn từ chung → không đủ
    f = {"du_an": "Khu nhà phố NYAL", "duong": "Trương Đình Hội", "phuong": "Phường Phú Định"}
    kho = _kho_that_day_du([NYAH])
    assert kho._du_an(f) == NYAH and kho.du_an_goi_y(f) is None          # đã gắn thẳng → không hỏi nữa


def test_ten_khac_han_hoac_hai_du_an_cung_duong_thi_khong_gan_thang():
    f = {"du_an": "Sunrise City", "duong": "Trương Đình Hội", "phuong": "Phường Phú Định"}
    kho = _kho_that_day_du([NYAH])
    assert kho._du_an(f) is None                                          # tên khác hẳn: không gắn, chỉ được hỏi
    assert kho.du_an_goi_y(f)["name"] == "Ny'ah Phú Định"
    f2 = {**f, "du_an": "Khu nhà phố NYAL"}
    kho2 = _kho_that_day_du([NYAH, {**NYAH, "id": "p2", "name": "Nyal Garden"}])
    assert kho2._du_an(f2) is None                                        # hai dự án cùng khớp → không đoán
