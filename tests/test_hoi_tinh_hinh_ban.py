"""21/10/2026 (SRS-5.1zzzzzzz116). Chủ nhà hay hỏi "có ai hỏi mua chưa em?" và "giá này cao không?". Bot cũ hiểu đây là người bán hỏi
nhưng không có số liệu → model dễ bịa "nhiều khách hỏi lắm" / tự nêu giá thị trường. AI đọc ý theo nghĩa (hoi_ve, code kiểm trích dẫn);
code đưa SỐ THẬT (interests / info_requests / viewings) cho model. Đỏ khi bỏ khối ưu tiên hoặc khi số không tới prompt."""
from aioi.engine import Listing
from aioi.supabase_store import SupabaseConversationStore
from tests.test_danh_gia_ai import _Kho, _eng


class _KhoSo(_Kho):
    def tinh_hinh_tin(self, conv):
        return {"quan_tam": 2, "hoi": 1, "hen_xem": 0}


def test_chu_hoi_co_khach_chua_doc_so_that(monkeypatch):
    eng, seen, ke, conv = _eng(monkeypatch, _KhoSo())
    ke["plan"] = {"operations": [], "hoi_ve": "tinh_hinh_ban", "hoi_ve_trich_dan": "có ai hỏi mua chưa"}
    eng.handle("u-sao", "căn của anh có ai hỏi mua chưa em")
    assert "CHỦ NHÀ HỎI TÌNH HÌNH BÁN" in seen[-1] and "2 khách bấm quan tâm, 1 câu hỏi" in seen[-1] and "0 lịch hẹn xem" in seen[-1]


def test_ai_khong_doc_ra_thi_khong_chen_khoi(monkeypatch):
    # SRS-5.1zzzzzzz281: "hỏi về" theo ý AI đọc — AI để trống thì không có khối (không còn kiểm cụm trích).
    eng, seen, ke, conv = _eng(monkeypatch, _KhoSo())
    ke["plan"] = {"operations": []}
    eng.handle("u-sao", "ok em cảm ơn")
    assert "CHỦ NHÀ HỎI TÌNH HÌNH BÁN" not in seen[-1]


def test_kho_khong_doc_duoc_thi_khong_doan(monkeypatch):
    eng, seen, ke, conv = _eng(monkeypatch, _Kho())          # kho không có tinh_hinh_tin
    ke["plan"] = {"operations": [], "hoi_ve": "tinh_hinh_ban", "hoi_ve_trich_dan": "bán tới đâu rồi"}
    eng.handle("u-sao", "nhà anh bán tới đâu rồi em")
    assert "CHƯA đọc được số liệu" in seen[-1]


def test_hoi_gia_thi_truong_khong_neu_so(monkeypatch):
    eng, seen, ke, conv = _eng(monkeypatch, _KhoSo())
    ke["plan"] = {"operations": [], "hoi_ve": "dinh_gia", "hoi_ve_trich_dan": "giá vậy cao không"}
    eng.handle("u-sao", "anh để giá vậy cao không em")
    assert "KHÔNG nêu con số giá thị trường" in seen[-1]


class _KhoDem(SupabaseConversationStore):
    def __init__(self):
        self.url, self.key, self.fallback, self.goi = "http://x", "k", None, []

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append(endpoint)
        return [{"listing_id": "x"}] * (3 if endpoint.startswith("interests") else 1)


def test_kho_dem_theo_tin_dang_noi():
    kho = _KhoDem()

    class C:
        active = Listing(listing_id="0f8fad5bd9cb469fa16570867728950e")
    so = kho.tinh_hinh_tin(C())
    assert so == {"quan_tam": 3, "hoi": 1, "hen_xem": 1}
    assert all("listing_id=eq.0f8fad5b-d9cb-469f-a165-70867728950e" in e for e in kho.goi)
    assert any("viewings" in e and "status=neq.cancelled" in e for e in kho.goi)
