"""Gợi ý khoảng thương lượng giá (SRS-5.1zzzzzzz394, 06/11/2026; sửa 08/11/2026).

Biên độ dưới đây là số ƯỚC LƯỢNG cứng theo loại hình, chưa đo từ giao dịch — công cụ trả số liệu "tham khảo" cho model viết lời.
Sửa 08/11:
- Nhận đúng slug loại hình (`can_ho`, `chung_cu`, `officetel`, `mat_tien`, `mat_bang`, `dat_tho_cu`…). Bản 06/11 dò "can ho" có dấu
  cách nên `can_ho` / `mat_tien` đều rơi về nhà phố.
- Có nhánh NGƯỜI BÁN (`nguoi_hoi="ban"`): biên độ khách mua thường trả để chủ nhà tính phần chừa thương lượng. Bản 06/11 bỏ qua tham số
  này, đưa người bán đúng bài "ép giá chủ nhà".
- Hai phía đều là khách của AOND nên không có "đòn bẩy ép giá"; chỉ có khoảng thường gặp và yếu tố làm khoảng rộng / hẹp.
"""
from __future__ import annotations

from .phap_ly import tien

# Biên độ thương lượng thường gặp (% giá rao): (thấp, cao)
_BIEN_DO: dict[str, tuple[str, float, float, str]] = {
    "can_ho": ("căn hộ", 0.5, 2.5, "giá chung cư khá minh bạch theo tầng / block nên khoảng hẹp"),
    "nha_pho": ("nhà phố / nhà hẻm", 1.0, 4.0, "rộng hơn căn hộ; tuỳ hẻm, hiện trạng, chủ có cần tiền gấp"),
    "mat_tien": ("nhà mặt tiền / mặt bằng", 1.0, 3.0, "thường xoay quanh dòng tiền cho thuê và điều kiện thanh toán"),
    "dat_nen": ("đất nền / thổ cư", 1.5, 5.0, "biến động nhất; người mua tiền mặt công chứng nhanh thường được khoảng sâu hơn"),
}

_SLUG: dict[str, str] = {
    "can_ho": "can_ho", "chung_cu": "can_ho", "officetel": "can_ho", "penthouse": "can_ho",
    "nha_pho": "nha_pho", "nha_cap_4": "nha_pho", "biet_thu": "nha_pho",
    "mat_tien": "mat_tien", "mat_bang": "mat_tien", "shophouse_du_an": "mat_tien",
    "dat": "dat_nen", "dat_tho_cu": "dat_nen", "dat_nen": "dat_nen", "dat_du_an": "dat_nen",
}


def _loai(loai_hinh: str) -> str:
    return _SLUG.get((loai_hinh or "").strip().lower(), "nha_pho")


def goi_y_khoang_gia_dam_phan(
    gia_rao_vnd: int,
    loai_hinh: str = "nha_pho",
    khu_vuc: str = "",
    nguoi_hoi: str = "mua",
) -> str:
    """Kết quả công cụ `goi_y_dam_phan`: khoảng thương lượng tham khảo theo phía hỏi."""
    if gia_rao_vnd <= 0:
        return "Cần giá rao (đồng, lớn hơn 0) để tính khoảng thương lượng."
    ten, thap, cao, ghi_chu = _BIEN_DO[_loai(loai_hinh)]
    gia_cao = round(gia_rao_vnd * (1 - thap / 100))
    gia_thap = round(gia_rao_vnd * (1 - cao / 100))
    noi = f" · {khu_vuc}" if khu_vuc else ""
    dong = [
        f"=== KHOẢNG THƯƠNG LƯỢNG THAM KHẢO ({ten}{noi}) — số ước lượng, chưa phải dữ liệu giao dịch ===",
        f"- Giá rao {tien(gia_rao_vnd)}; thường thương lượng {thap:g}–{cao:g}% → khoảng {tien(gia_thap)} – {tien(gia_cao)}",
        f"- Ghi chú: {ghi_chu}",
    ]
    if nguoi_hoi == "ban":
        dong.append("- Phía người bán: đây là mức khách mua hay trả xuống; chủ nhà muốn thu về X thì có thể rao cao hơn X trong khoảng này. "
                    "Giá rao vẫn do chủ nhà quyết.")
    else:
        dong.append("- Phía người mua: nói đây là khoảng thường gặp, không hứa chủ nhà sẽ bớt. Yếu tố hay giúp thương lượng: thanh toán "
                    "nhanh, ít điều kiện, hiện trạng cần sửa (nêu thật).")
    return "\n".join(dong) + "\n"
