"""Công cụ tính Thuế & Phí chuyển nhượng nhà đất (SRS-5.1zzzzzzz388, 06/11/2026; sửa 08/11/2026).

Một nguồn số: tỷ lệ thuế TNCN, lệ phí trước bạ và biểu phí công chứng (TT 257/2016) nằm ở `phap_ly` (`TY_LE_TNCN`, `TY_LE_TRUOC_BA`,
`phi_cong_chung`) — bản 06/11 chép lại biểu công chứng riêng và sai hai bậc trên 10 tỷ (0,02 % thay vì 0,03 %; trên 100 tỷ 23,2 triệu thay
vì 32,2 triệu). Công cụ trả SỐ LIỆU cho model viết lời, không trả câu gửi khách viết sẵn.
"""
from __future__ import annotations

from . import phap_ly

# Lệ phí thẩm định hồ sơ đăng bộ sang tên — tuỳ địa phương, ước tính
LE_PHI_DANG_BO_THAM_KHAO = 2_000_000


def tinh_thue_phi_chuyen_nhuong(gia_vnd: int, can_duy_nhat: bool = False) -> dict[str, int]:
    """Thuế, lệ phí, phí công chứng khi chuyển nhượng (đồng). gia_vnd ≤ 0 → mọi khoản 0."""
    if gia_vnd <= 0:
        return dict.fromkeys(("gia_vnd", "thue_tncn", "le_phi_truoc_ba", "phi_cong_chung", "phi_dang_bo",
                              "tong_ben_ban", "tong_ben_mua", "tong_chi_phi"), 0)
    p = phap_ly.tinh_phi(gia_vnd)
    thue_tncn = 0 if can_duy_nhat else p["tncn"]
    tong_ben_mua = p["truoc_ba"] + p["cong_chung"] + LE_PHI_DANG_BO_THAM_KHAO
    return {
        "gia_vnd": gia_vnd,
        "thue_tncn": thue_tncn,
        "le_phi_truoc_ba": p["truoc_ba"],
        "phi_cong_chung": p["cong_chung"],
        "phi_dang_bo": LE_PHI_DANG_BO_THAM_KHAO,
        "tong_ben_ban": thue_tncn,
        "tong_ben_mua": tong_ben_mua,
        "tong_chi_phi": thue_tncn + tong_ben_mua,
    }


def dinh_dang_thue_phi_chat(gia_vnd: int, can_duy_nhat: bool = False) -> str:
    """Kết quả công cụ `tinh_thue_phi` — số liệu để model viết lời (số tham khảo, hai bên có thể thoả thuận lại ai chịu khoản nào)."""
    kq = tinh_thue_phi_chuyen_nhuong(gia_vnd, can_duy_nhat=can_duy_nhat)
    t = phap_ly.tien
    tncn = ("0 (khách nói là nhà đất duy nhất — được miễn nếu đủ điều kiện, cơ quan thuế xét)" if can_duy_nhat
            else f"{t(kq['thue_tncn'])} ({phap_ly.TY_LE_TNCN:.0%} giá chuyển nhượng)")
    return (
        f"=== THUẾ PHÍ SANG TÊN (tham khảo) — giá {t(gia_vnd)} ===\n"
        f"- Bên bán: thuế TNCN {tncn}\n"
        f"- Bên mua: lệ phí trước bạ {t(kq['le_phi_truoc_ba'])} ({phap_ly.TY_LE_TRUOC_BA:.1%}) · phí công chứng {t(kq['phi_cong_chung'])} "
        f"(TT 257/2016) · đăng bộ khoảng {t(kq['phi_dang_bo'])} (tuỳ địa phương)\n"
        f"- Tổng ước tính: {t(kq['tong_chi_phi'])}\n"
        "- Phân chia trên theo thông lệ; hai bên có thể thoả thuận lại trong hợp đồng cọc. Số chính thức theo cơ quan thuế / văn phòng công chứng.\n"
    )
