"""18/10/2026 (SRS-5.1zzzzzzz37): `save` từng đọc `li.prop.dien_tich` / `li.prop.gia` (không tồn tại) → AttributeError mỗi lượt
có tin, tin người bán không bao giờ vào `listings`. Bài này đỏ khi quay lại thuộc tính cũ, khi gửi `dang_rao` / chữ pháp lý thô
(CHECK của DB từ chối), hay khi PATCH ghi đè trạng thái admin đặt."""
from types import SimpleNamespace

from aioi.schema import Property
from aioi.supabase_store import SupabaseConversationStore, so_m2


class StoreGia(SupabaseConversationStore):
    def __init__(self, co_san: bool):
        super().__init__(url="https://x.invalid", key="khoa-gia")
        self.goi: list[tuple[str, str, object]] = []
        self.co_san = co_san

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        if endpoint.startswith("sellers?"):
            return [{"id": "s1", "name": "A"}]
        if endpoint.startswith("conversations?"):
            return [{"id": "c1"}]
        if endpoint.startswith("rpc/match_projects"):
            if "Grand Park" in data["p_text"]:   # tìm gần đúng ra toà con — không phải cùng dự án
                return [{"id": "p-glory", "name": "Glory Heights - Vinhomes Grand Park", "location_raw": "Phường Long Bình, Quận 9",
                         "ward": "Phường Long Bình", "district": "Quận 9"}]
            return [{"id": "p-sunrise", "name": "Sunrise City", "location_raw": "23 Nguyễn Hữu Thọ, Phường Tân Hưng, Quận 7",
                     "ward": None, "district": "Quận 7"}]
        if endpoint == "rpc/chuan_dia_ban":
            if "Tân Hưng" in data["p_text"]:
                return [{"phuong": "Phường Tân Hưng", "quan_cu": "Quận 7", "kieu": "moi"}]
            if "Long Bình" in data["p_text"]:
                return [{"phuong": "Phường Long Bình", "quan_cu": "Quận 9", "kieu": "moi"}]
            if "Phường 1" in data["p_text"]:
                return [{"phuong": "Phường Chợ Quán", "quan_cu": "Quận 5", "kieu": "cu"}]
            return [{"phuong": None, "quan_cu": "Quận 5" if "quận 5" in data["p_text"].lower() else None, "kieu": "chi_quan"}]
        if endpoint == "rpc/boc_thong_so":
            return {"legal_status": "so_hong_rieng"} if "riêng" in data["p_text"] else {}
        if endpoint.startswith("listings?seller_id"):
            return [{"id": "l1"}] if self.co_san else []
        return []


def _conv(fields):
    li = SimpleNamespace(prop=Property(loai_hinh="nha_pho", fields=fields), listing_id="abcdef123456", listing_proposed=True)
    return SimpleNamespace(user_key="zalo-thu-1", listings=[li])


def _ghi_tin(store):
    return [(m, e, d) for m, e, d in store.goi if e.startswith("listings") and m in ("POST", "PATCH")]


def test_tao_tin_moi_gui_dung_cot():
    st = StoreGia(co_san=False)
    st.save(_conv({"gia": "5 tỷ 2", "dien_tich": "50m2", "phap_ly": "sổ hồng riêng", "quan": "Quận 5", "duong": "Trần Hưng Đạo"}))
    [(m, e, d)] = _ghi_tin(st)
    assert (m, e) == ("POST", "listings")
    assert d["price_raw"] == "5 tỷ 2" and "price_vnd" not in d  # DB tính price_vnd bằng parse_vnd
    assert d["area_m2"] == 50.0
    assert d["legal_status"] == "so_hong_rieng"
    assert d["status"] == "cho_thong_tin"


def test_cap_nhat_khong_ghi_de_trang_thai_va_bo_phap_ly_la():
    st = StoreGia(co_san=True)
    st.save(_conv({"gia": "6 tỷ", "kich_thuoc": "4x15", "phap_ly": "đang chờ sổ"}))
    [(m, e, d)] = _ghi_tin(st)
    assert (m, e) == ("PATCH", "listings?id=eq.l1")
    assert "status" not in d and "legal_status" not in d
    assert d["area_m2"] == 60.0 and d["price_raw"] == "6 tỷ"


def test_so_m2():
    assert so_m2({"dien_tich_dat": "72,5 m2"}) == 72.5
    assert so_m2({"dien_tich": "khoảng"}) is None
    assert so_m2({}) is None


def test_dia_ban_ca_hai_kieu_va_location_raw():
    st = StoreGia(co_san=False)
    st.save(_conv({"gia": "5 tỷ", "dia_chi": "123 Trần Hưng Đạo, Phường 1, Quận 5"}))
    [(_, _, d)] = _ghi_tin(st)
    assert (d["ward"], d["district"]) == ("Phường Chợ Quán", "Quận 5")
    assert d["location_raw"] == "123 Trần Hưng Đạo, Phường 1, Quận 5"
    st = StoreGia(co_san=False)
    st.save(_conv({"gia": "5 tỷ", "dia_chi": "hẻm Quận 5"}))
    [(_, _, d)] = _ghi_tin(st)
    assert "ward" not in d and d["district"] == "Quận 5"  # chỉ có quận: không bịa phường


def test_can_ho_lay_phuong_theo_du_an():
    st = StoreGia(co_san=False)
    st.save(_conv({"gia": "3 tỷ", "du_an": "Sunrise City"}))
    [(_, _, d)] = _ghi_tin(st)
    assert (d["ward"], d["district"]) == ("Phường Tân Hưng", "Quận 7")


def test_so_m2_dat_truoc_va_tinh_ngang_x_dai():
    # Bắn thử 19/10 (SRS-5.1zzzzzzz73): dien_tich_dat "4,5x11" ra 4,5 m²; dien_tich = sàn 170 thành diện tích đất.
    assert so_m2({"dien_tich_dat": "4,5x11", "dien_tich": "170m2"}) == 49.5
    assert so_m2({"dien_tich": "60m2", "dien_tich_dat": "49,5m2"}) == 49.5


def test_tin_trong_du_an_gan_project_id_khi_ten_khop_ro():
    """SRS-5.1zzzzzzz86 (bắn thử 20/10): căn LakeView City / Masteri Thảo Điền trùng tên kho mà project_id không bao giờ được ghi —
    trang dự án không thấy tin. Đỏ trên code cũ (không có cột project_id trong payload)."""
    st = StoreGia(co_san=False)
    st.save(_conv({"gia": "3 tỷ", "du_an": "sunrise city"}))
    [(_, _, d)] = _ghi_tin(st)
    assert d["project_id"] == "p-sunrise" and d["ward"] == "Phường Tân Hưng" and "unit_code" not in d


def test_ma_can_nguoi_ban_ghi_vao_tin_noi_kho_chung():
    """SRS-5.1zzzzzzz249: mã căn là dữ liệu riêng của tin (`listings.unit_code`) nối dự án bằng project_id — trước bản này cột luôn trống."""
    st = StoreGia(co_san=False)
    st.save(_conv({"gia": "3 tỷ", "du_an": "sunrise city", "ma_so_can": "A-12.05"}))
    [(_, _, d)] = _ghi_tin(st)
    assert d["project_id"] == "p-sunrise" and d["unit_code"] == "A-12.05"


def test_ten_gan_dung_khong_gan_du_an_khac_va_khong_lay_phuong_cua_no():
    """Bản cũ lấy phường từ dòng ĐẦU của match_projects (tìm gần đúng): "Vinhomes Grand Park" → toà Glory Heights, gán phường của
    toà đó. Nay không khớp rõ thì không gắn dự án, không lấy phường của dự án khác."""
    st = StoreGia(co_san=False)
    st.save(_conv({"gia": "3 tỷ", "du_an": "Vinhomes Grand Park"}))
    [(_, _, d)] = _ghi_tin(st)
    assert "project_id" not in d and "ward" not in d


def test_cung_ten_du_an():
    from aioi.supabase_store import cung_ten_du_an as c
    assert c("LakeView City", "Lakeview city") and c("Sala Thủ Thiêm", "Khu đô thị Sala Thủ Thiêm") and c("ĐÔNG HƯNG", "Đông Hưng")
    assert not c("Vinhomes Grand Park", "Glory Heights - Vinhomes Grand Park") and not c("Sala", "Khu đô thị Sala Thủ Thiêm")
    assert not c("", None) and not c("Sunrise City", "Khu Căn Hộ Sunrise")
