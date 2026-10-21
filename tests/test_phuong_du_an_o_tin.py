"""21/10/2026 (SRS-5.1zzzzzzz93). Bắn thử KB5 / KB2: căn trong dự án đã có trong kho, khách không nói phường — kho chỉ điền cột `ward`
lúc lưu, ô `phuong` của bot vẫn trống nên bot hỏi phường mãi và không ra bản nháp. Kèm: "MT 20m" bị giữ vì kích thước lô nằm ở ô diện
tích đất ("4 x 11m") chứ không ở ô kích thước."""
from aioi.engine import Engine as E
from aioi.supabase_store import SupabaseConversationStore
from tests.test_duyet_ban_nhap import _Kho, _eng
from tests.test_tieu_de_co_gia import _SpyLan


class _KhoDuAn(_Kho):
    def __init__(self, phuong):
        super().__init__()
        self.phuong, self.goi = phuong, 0

    def phuong_theo_du_an(self, fields):
        self.goi += 1
        return self.phuong


def _voi_kho(kho, monkeypatch, phuong=None):
    eng, _, _, conv = _eng({"operations": []}, monkeypatch)
    eng._convstore = kho
    conv.prop.fields.pop("phuong", None)
    if phuong:
        conv.prop.fields["phuong"] = phuong
    conv.prop.fields["du_an"] = "Nyah Phú Định"
    return eng, conv


def test_phuong_du_an_vao_o_tin(monkeypatch):
    kho = _KhoDuAn("Phường Phú Định")
    eng, conv = _voi_kho(kho, monkeypatch)
    eng.handle("u-duyet", "giá 6,95 tỷ")
    assert conv.prop.fields["phuong"] == "Phường Phú Định"


def test_phuong_khach_noi_khong_bi_de_va_tra_hong_thi_hoi_nhu_cu(monkeypatch):
    kho = _KhoDuAn("Phường Phú Định")
    eng, conv = _voi_kho(kho, monkeypatch, phuong="Phường Bình Đông")
    eng.handle("u-duyet", "giá 6,95 tỷ")
    assert conv.prop.fields["phuong"] == "Phường Bình Đông" and kho.goi == 0

    class _KhoHong(_KhoDuAn):
        def phuong_theo_du_an(self, fields):
            raise RuntimeError("mạng")
    eng2, conv2 = _voi_kho(_KhoHong(None), monkeypatch)
    eng2.handle("u-duyet", "giá 6,95 tỷ")
    assert not conv2.prop.fields.get("phuong")


def test_kho_tra_phuong_du_an_cot_chuan_truoc():
    kho = SupabaseConversationStore.__new__(SupabaseConversationStore)
    kho._du_an = lambda f: {"id": "p1", "ward": "Phường Phú Định", "district": "Quận 8",
                            "location_raw": "58A Trương Đình Hội, Phường Phú Định (Phường 16, Quận 8 cũ)"}
    kho._chuan_dia_ban = lambda chu: ((None, "Quận 8") if "Phường 16" in chu else ("Phường Phú Định", "Quận 8"))
    assert kho.phuong_theo_du_an({"du_an": "Nyah"}) == "Phường Phú Định"
    kho._du_an = lambda f: None
    assert kho.phuong_theo_du_an({"du_an": "Không có"}) is None


def test_mat_tien_so_voi_lo_o_dien_tich_dat():
    eng = E(_SpyLan({"operations": []}, []))
    conv = eng.conversation("mt1")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields["dien_tich_dat"] = "4 x 11m"
    assert "mat_tien" not in E._mot_cum_mot_o(conv, {"mat_tien": "20m"})
    assert E._mot_cum_mot_o(conv, {"mat_tien": "4m"}) == {"mat_tien": "4m"}
    conv.prop.fields["dien_tich_dat"] = "44m2"   # không có hai chiều → không đủ cơ sở bỏ
    assert E._mot_cum_mot_o(conv, {"mat_tien": "20m"}) == {"mat_tien": "20m"}
