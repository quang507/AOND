"""29/10/2026 (SRS-5.1zzzzzzz285). Chủ dự án: "vào vai môi giới 20 năm review db ssot" → "tạo plan sửa các thứ bạn triển khai được đi … cứ làm đi".
Soát DB: (a) tin thật có ô `nam_xay: 2015`, `dien_tich_nha: 150` mà cột `year_built` / `built_area_m2` trống — bộ đọc chữ `boc_thong_so` không nhận
nhãn ô gửi sang; (b) `deals` khoá (listing_id, buyer_id) nulls not distinct → căn cho thuê chốt lần hai không ghi được (migration 20261029e);
lõi bỏ `on_conflict` theo khoá đã gỡ. Mỗi ca đỏ khi gỡ bản sửa."""
import pathlib

from aioi.supabase_store import cot_tu_o

GOC = pathlib.Path(__file__).parents[1]


def test_cot_doc_thang_tu_o_khi_dung_khuon():
    assert cot_tu_o({"nam_xay": "2015", "dien_tich_nha": "150"}) == {"year_built": 2015, "built_area_m2": 150}
    assert cot_tu_o({"nam_xay": "năm 2018", "dien_tich_nha": "250,5 m²"}) == {"year_built": 2018, "built_area_m2": 250.5}
    # không đúng khuôn → không đoán, để bộ đọc DB xét
    assert cot_tu_o({"nam_xay": "2015 sửa 2020", "dien_tich_nha": "xây kín đất"}) == {}
    assert cot_tu_o({"nam_xay": "1890", "dien_tich_nha": "3"}) == {}


def test_thong_so_gop_cot_tu_o_voi_bo_doc_db():
    from aioi.supabase_store import SupabaseConversationStore

    class _Kho(SupabaseConversationStore):
        def __init__(self):
            super().__init__(url="https://x.invalid", key="k")

        def _request(self, method, endpoint, data=None, prefer=None):
            return {"frontage_m": 4}

    kq = _Kho()._thong_so({"nam_xay": "2015", "dien_tich_nha": "150", "mat_tien": "4"}, "nha_pho")
    assert kq == {"frontage_m": 4, "year_built": 2015, "built_area_m2": 150}


def test_deal_khong_con_on_conflict_khoa_da_go():
    src = (GOC / "src/aioi/mua.py").read_text(encoding="utf-8")
    assert "deals?on_conflict=listing_id,buyer_id" not in src
    mig = (GOC / "bot/supabase/migrations/20261029e_deals_lich_su_gia.sql").read_text(encoding="utf-8")
    assert "drop constraint if exists deals_listing_buyer_key" in mig and "'doi_gia'" in mig
