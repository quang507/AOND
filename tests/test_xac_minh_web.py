"""19/10/2026 (SRS-5.1zzzzzzz65): thông số tin trên web từ MỘT nguồn — ô lõi Python bóc (`listings.boc_tach`) — thay cho
`listing_facts` (chỉ bot TypeScript đã gỡ ghi, nên tin mới lên web không có bảng thông số). Đỏ khi save() thôi điền cột thông số,
khi gửi ô địa chỉ / giá sang bộ đọc thông số, hay khi danh sách trắng của web có ô lõi không có / ô không được in ra web."""
import re
from pathlib import Path
from types import SimpleNamespace

from aioi.prompts import FIELD_LABELS
from aioi.schema import Property
from aioi.supabase_store import SupabaseConversationStore

GOC = Path(__file__).resolve().parents[1]
CAM_IN_RA_WEB = {"dia_chi", "duong", "phuong", "quan", "gan_nga_tu", "gia", "ly_do_ban", "ma_so_can", "du_an", "hinh_anh"}


def test_danh_sach_trang_web_khop_o_cua_loi():
    ts = (GOC / "lib" / "thong-tin-xac-minh.ts").read_text(encoding="utf-8")
    khoa = re.findall(r'\["([a-z_]+)", "', ts)
    assert len(khoa) >= 30
    assert not [k for k in khoa if k not in FIELD_LABELS]
    assert not set(khoa) & CAM_IN_RA_WEB


def test_trang_tin_khong_doc_listing_facts():
    trang = (GOC / "app" / "nha-dat" / "[code]" / "page.tsx").read_text(encoding="utf-8")
    assert 'from("listing_facts")' not in trang and "dongXacMinh" in trang


class StoreGia(SupabaseConversationStore):
    def __init__(self):
        super().__init__(url="https://x.invalid", key="khoa-gia")
        self.goi = []

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        if endpoint.startswith("sellers?"):
            return [{"id": "s1", "name": "A"}]
        if endpoint.startswith("conversations?"):
            return [{"id": "c1"}]
        if endpoint == "rpc/chuan_dia_ban":
            return [{"phuong": None, "quan_cu": None}]
        if endpoint == "rpc/boc_thong_so":
            if "kích thước" in data["p_text"]:
                return {"frontage_m": 4, "length_m": 15, "floors": 3, "floors_text": "trệt + 2 lầu", "bedrooms": 4,
                        "legal_status": "so_hong_rieng", "rent_income_vnd": 1}
            return {}
        return []


def _conv(fields):
    li = SimpleNamespace(prop=Property(loai_hinh="nha_pho", fields=fields), listing_id="abcdef123456", listing_proposed=True)
    return SimpleNamespace(user_key="zalo-thu-1", listings=[li])


def test_save_dien_cot_thong_so_tu_o_da_boc():
    st = StoreGia()
    f = {"dia_chi": "391/34 Trần Hưng Đạo", "gia": "5 tỷ", "kich_thuoc": "4x15", "ket_cau": "1 trệt 2 lầu", "so_phong_ngu": "4"}
    st.save(_conv(f))
    st.save(_conv(f))
    goi_ts = [d for m, e, d in st.goi if e == "rpc/boc_thong_so"]
    assert len(goi_ts) == 1                                        # nhớ theo chữ: lượt sau không gọi lại
    chu = goi_ts[0]["p_text"]
    assert "391/34" not in chu and "5 tỷ" not in chu               # ô địa chỉ / giá không phải thông số
    assert goi_ts[0]["p_type"] == "nha_pho"
    tin = [d for m, e, d in st.goi if m == "POST" and e == "listings"][0]
    assert (tin["frontage_m"], tin["length_m"], tin["floors"], tin["bedrooms"]) == (4, 15, 3, 4)
    assert "rent_income_vnd" not in tin and "legal_status" not in tin   # pháp lý đi `_ma_phap_ly`, tiền thuê không từ đây
