"""Mức phí gốc (`revenue.SALE_FEE_RATE`, `RENTAL_FEE_MONTHS`) — một nguồn cho `prompts.muc_phi`. `quote_fee` / `nmg_eligibility` (chỉ test gọi)
đã xoá ở audit Đợt 6; con số phí kiểm thêm ở `test_phi_mot_nguon_275.py`."""
from aioi.revenue import RENTAL_FEE_MONTHS, SALE_FEE_RATE, SellerRole


def test_muc_phi_goc_theo_vai():
    assert SALE_FEE_RATE[SellerRole.CHU_NHA] == SALE_FEE_RATE[SellerRole.LUOT_SONG] == 0.01
    assert SALE_FEE_RATE[SellerRole.MOI_GIOI] == SALE_FEE_RATE[SellerRole.SAN] == 0.005
    assert SellerRole.CHU_DAU_TU not in SALE_FEE_RATE and SellerRole.UNKNOWN not in SALE_FEE_RATE   # thoả thuận riêng / chưa rõ: không bịa số
    assert RENTAL_FEE_MONTHS == 0.75
