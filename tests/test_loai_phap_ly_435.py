"""SRS-5.1zzzzzzz435 — loại giấy tờ MỘT nguồn (`schema.LOAI_PHAP_LY`): mã AI đọc = mã cột `legal_status`, câu hỏi theo sau theo loại giấy,
bản tin viết đúng loại giấy; tra xã tỉnh khác không nhận tên trùng phường TP.HCM (bắn thử production 12/11/2026)."""
import pytest

from aioi.dia_danh import tra_xa
from aioi.prompts import SU_THAT_CAN, khoi_su_that_can
from aioi.schema import LOAI_PHAP_LY, MA_PHAP_LY_AI, Property
from aioi.supabase_store import ma_phap_ly, o_tu_cot


def _can(tt, **them):
    p = Property(loai_hinh="nha_pho")
    p.fields.update({"_phap_ly_trang_thai": tt, **them})
    return p


def test_enum_ai_lay_tu_bang():
    enum = next(v for k, v, _ in SU_THAT_CAN if k == "phap_ly_trang_thai")
    assert tuple(enum) == MA_PHAP_LY_AI and set(LOAI_PHAP_LY) <= set(enum)


@pytest.mark.parametrize("tt,cau", [
    ("so_hong_chung", "dong_y_ban"), ("uy_quyen", "dong_y_ban"), ("hdmb", "du_kien_ra_so"), ("dang_lam", "du_kien_ra_so"),
    ("chua_co", "du_kien_ra_so"), ("dat_thue", "thoi_han_su_dung"), ("giay_tay", "so_goc"), ("so_hong", "dung_ten_so"),
    ("mo_ho", "loai_giay"), ("so_hong_rieng", None),
])
def test_cau_hoi_theo_loai_giay(tt, cau):
    assert _can(tt).o_phap_ly_hoi_ngay() == cau


def test_so_dang_lam_nha_pho_cung_hoi_khi_nao_co_so():
    # bản trước chỉ căn dự án mới hỏi ngày ra sổ
    assert _can("dang_lam").o_phap_ly_hoi_ngay() == "du_kien_ra_so"


def test_o_da_co_hoac_da_hoi_thi_thoi():
    assert _can("dat_thue", thoi_han_su_dung="thuê tới 2058").o_phap_ly_hoi_ngay() is None
    assert _can("so_hong_chung", _pl_da_hoi="dong_y_ban").o_phap_ly_hoi_ngay() is None
    assert _can("so_hong_rieng", _hoan_cong="chua_hoan_cong").o_phap_ly_hoi_ngay() == "du_kien_hoan_cong"


def test_cot_legal_status_la_ma_ai_doc():
    for ma in LOAI_PHAP_LY:
        assert ma_phap_ly({"_phap_ly_trang_thai": ma}) == ma
    assert ma_phap_ly({"_phap_ly_trang_thai": "mo_ho"}) is None and ma_phap_ly({}) is None
    assert o_tu_cot({"legal_status": "dat_thue"}, "kho_xuong")["_phap_ly_trang_thai"] == "dat_thue"


def test_ban_tin_viet_dung_loai_giay():
    k = khoi_su_that_can({"_phap_ly_trang_thai": "so_hong_chung"}, True)
    assert LOAI_PHAP_LY["so_hong_chung"].ban_tin in k
    assert "đất thuê" in khoi_su_that_can({"_phap_ly_trang_thai": "dat_thue"}, True)


def test_xin_anh_so_chi_khi_co_so():
    assert "anh_so" in _can("so_hong_chung").hoi_phap_ly_sau_dang()
    assert "anh_so" not in _can("dat_thue").hoi_phap_ly_sau_dang()


def test_ten_trung_phuong_tphcm_khong_nhan_la_tinh_khac():
    kho = [{"ten_day_du": "Phường Long Bình", "ten": "Long Bình", "loai": "phuong", "tinh": "Đồng Nai", "tinh_cu": "Đồng Nai", "don_vi_cu": []},
           {"ten_day_du": "Phường Long Bình", "ten": "Long Bình", "loai": "phuong", "tinh": "TP.HCM"},
           {"ten_day_du": "Phường Tân Biên", "ten": "Tân Biên", "loai": "phuong", "tinh": "Đồng Nai", "tinh_cu": "Đồng Nai", "don_vi_cu": []}]
    assert tra_xa(kho, "Phường Long Bình") is None
    assert tra_xa(kho, "phường Tân Biên")["tinh"] == "Đồng Nai"
