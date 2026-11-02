"""Revenue policy & seller classification (SRD §V, extended 2026-06-24).

A property in a project can be listed by several roles. The brokerage fee (collected
ONLY on a successful transaction) depends on the role, grouped owner-side vs broker-side:

- Owner-side (1% of closing price, or 3/4 of one month's rent):
    chu_nha    (homeowner — owns & resells their unit, thứ cấp)
    luot_song  (flipper — owns the HĐMB/contract, resells thứ cấp)
- Broker-side (0.5%, or 3/4 month rent):
    moi_gioi   (agent)
    san        (exchange / F1 distributor for the developer)
- Special:
    chu_dau_tu (developer) — primary sale; fee is a separate negotiated arrangement
                             (developers usually pay commission to floors/agents), NOT 1%/0.5%.
"""
from __future__ import annotations


from enum import Enum


class SellerRole(str, Enum):
    CHU_NHA = "chu_nha"          # chủ nhà (homeowner, secondary)
    LUOT_SONG = "luot_song"      # nhà đầu tư lướt sóng (flipper, owns HĐMB)
    MOI_GIOI = "moi_gioi"        # nhân viên môi giới (agent)
    SAN = "san"                  # sàn giao dịch (exchange / F1 distributor)
    CHU_DAU_TU = "chu_dau_tu"    # chủ đầu tư (developer — special fee)
    UNKNOWN = "unknown"


# Sale fee as a fraction of the final closing price, by role.
SALE_FEE_RATE: dict[SellerRole, float] = {
    SellerRole.CHU_NHA: 0.01,
    SellerRole.LUOT_SONG: 0.01,
    SellerRole.MOI_GIOI: 0.005,
    SellerRole.SAN: 0.005,
}
# Rental fee = 3/4 of one month's rent, for any non-special role.
RENTAL_FEE_MONTHS: float = 0.75
