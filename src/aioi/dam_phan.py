"""Module Gợi Ý Khoảng Giá Đàm Phán & Chiến Lược Chốt Cọc (SRS-5.1zzzzzzz394, 06/11/2026).

Tinh hoa MOSO:
- Tính toán biên độ thương lượng phổ biến (Bargaining Range) theo từng loại hình BĐS tại TP.HCM.
- Cung cấp khung 3 mức giá thực chiến: Giá chào -> Giá mở đàm phán (Bid mở màn) -> Giá mục tiêu chốt cọc.
- Cung cấp đòn bẩy tâm lý và chiến thuật đàm phán giúp khách mua tiết kiệm hàng chục đến hàng trăm triệu,
  hoặc giúp người bán giữ giá tài sản hợp lý.
"""
from __future__ import annotations

import re
from typing import Any

from .thue_phi import _dinh_dang_gia_ty, _dinh_dang_tien

# Biên độ thương lượng trung bình theo loại hình tại thị trường TP.HCM
_BIEN_DO_THUONG_LUONG: dict[str, dict[str, Any]] = {
    "can_ho": {
        "ten": "Căn hộ chung cư thứ cấp",
        "bot_loc_pct": 0.5,      # Bớt lộc: 0.5% (20 - 50 triệu)
        "muc_tieu_pct": 2.0,     # Mức tiêu chuẩn: 1.5% - 2.5%
        "mo_man_pct": 4.5,       # Mở màn ép giá: 3.5% - 5%
        "luu_y": "Chung cư có mặt bằng giá minh bạch theo tầng và block. Nếu căn có sổ hồng sẵn và giá đã hợp lý thì biên độ thương lượng thường từ 30 - 80 triệu (bớt lộc)."
    },
    "nha_pho": {
        "ten": "Nhà phố / Nhà hẻm dân cư",
        "bot_loc_pct": 1.0,      # Bớt lộc: 1% (~50 - 100 triệu)
        "muc_tieu_pct": 3.5,     # Mức tiêu chuẩn: 3% - 4%
        "mo_man_pct": 6.5,       # Mở màn ép giá: 5% - 8%
        "luu_y": "Nhà trong hẻm có biên độ đàm phán rộng hơn căn hộ, phụ thuộc vào độ rộng hẻm, phong thủy (đâm đường, tóp hậu) và độ thiện chí cần tiền của chủ nhà."
    },
    "mat_tien": {
        "ten": "Nhà mặt tiền / Mặt bằng kinh doanh",
        "bot_loc_pct": 0.8,
        "muc_tieu_pct": 2.5,
        "mo_man_pct": 5.0,
        "luu_y": "Nhà mặt tiền giá trị lớn. Thường đàm phán dựa trên dòng tiền cho thuê hiện hữu và điều kiện thanh toán (thanh toán nhanh hoặc giữ lại tiền chờ sang tên)."
    },
    "dat_nen": {
        "ten": "Đất nền / Đất thổ cư",
        "bot_loc_pct": 1.5,
        "muc_tieu_pct": 4.5,
        "mo_man_pct": 8.0,
        "luu_y": "Đất nền có tính biến động cao nhất. Trong giai đoạn thị trường tích lũy, các lô đất nền vùng ven có thể thương lượng sâu từ 5% đến 8% nếu người mua có tiền mặt sẵn sàng công chứng ngay."
    },
}


def _phan_loai_loai_hinh(loai_hinh: str) -> str:
    s = loai_hinh.lower().strip()
    if any(k in s for k in ("chung cư", "can ho", "căn hộ", "condo", "apartment")):
        return "can_ho"
    if any(k in s for k in ("mặt tiền", "mat tien", "kinh doanh", "shophouse")):
        return "mat_tien"
    if any(k in s for k in ("đất", "dat", "thổ cư", "tho cu", "nền", "nen")):
        return "dat_nen"
    return "nha_pho"


def goi_y_khoang_gia_dam_phan(
    gia_rao_vnd: int,
    loai_hinh: str = "nha_pho",
    khu_vuc: str = "",
    nguoi_hoi: str = "mua",
) -> str:
    """Tính toán và trả về gợi ý chiến lược đàm phán giá chi tiết."""
    if gia_rao_vnd <= 0:
        return "Cần cung cấp giá rao hợp lệ (lớn hơn 0) để tính khoảng giá đàm phán."

    lh_key = _phan_loai_loai_hinh(loai_hinh)
    bd = _BIEN_DO_THUONG_LUONG[lh_key]

    # Tính toán các bước giá
    gia_bot_loc = round(gia_rao_vnd * (1 - bd["bot_loc_pct"] / 100))
    gia_muc_tieu = round(gia_rao_vnd * (1 - bd["muc_tieu_pct"] / 100))
    gia_mo_man = round(gia_rao_vnd * (1 - bd["mo_man_pct"] / 100))

    giam_mo_man = gia_rao_vnd - gia_mo_man
    giam_muc_tieu = gia_rao_vnd - gia_muc_tieu
    giam_bot_loc = gia_rao_vnd - gia_bot_loc

    dong = [
        f"🤝 CHIẾN LƯỢC ĐÀM PHÁN GIÁ & GỢI Ý KHOẢNG GIÁ THƯƠNG LƯỢNG",
        f"• Loại hình: {bd['ten']} | Giá chủ nhà đang chào: {_dinh_dang_gia_ty(gia_rao_vnd)}",
    ]
    if khu_vuc:
        dong.append(f"• Khu vực khảo sát: {khu_vuc}")

    dong.extend([
        "",
        "🎯 3 MỨC GIÁ THAM CHIẾU ĐỂ MỞ CUỘC ĐÀM PHÁN:",
        f"  1. Mức Mở Màn Thử Thách (Bid mở đầu): {_dinh_dang_gia_ty(gia_mo_man)} (Giảm ~{_dinh_dang_tien(giam_mo_man)}, -{bd['mo_man_pct']}%)",
        "     -> Dùng để thăm dò độ thiện chí và mức độ cần tiền của chủ nhà; chuẩn bị tâm lý chủ nhà sẽ phản hồi chê thấp.",
        f"  2. Mức Mục Tiêu Khả Thi (Target Price): {_dinh_dang_gia_ty(gia_muc_tieu)} (Giảm ~{_dinh_dang_tien(giam_muc_tieu)}, -{bd['muc_tieu_pct']}%)",
        "     -> Đây là 'điểm ngọt' (sweet spot) dễ chốt cọc nhất, vừa túi tiền người mua và chủ nhà cảm thấy được tôn trọng.",
        f"  3. Mức Bớt Lộc May Mắn (Floor Price): {_dinh_dang_gia_ty(gia_bot_loc)} (Giảm ~{_dinh_dang_tien(giam_bot_loc)}, -{bd['bot_loc_pct']}%)",
        "     -> Dành cho căn đẹp hiếm có, chủ nhà cứng giá; xin bớt một khoản chi phí làm sổ / sửa chữa phong thủy.",
        "",
        "⚡ 3 ĐÒN BẨY ĐÀM PHÁN THỰC CHIẾN TẠI TP.HCM:",
        "  • Đòn bẩy 1 — Sức mạnh Tiền Mặt & Tốc Độ: 'Nếu anh/chị đồng ý giá này, em cọc ngay 100-200 triệu hôm nay và công chứng trong 7 ngày'. Chủ nhà luôn thích khách cọc nhanh hơn khách vay ngân hàng chờ 2-3 tuần.",
        "  • Đòn bẩy 2 — Gói gọn Thuế Phí: Đề xuất người mua chịu toàn bộ lệ phí trước bạ và phí công chứng để chủ nhà thu về trọn vẹn số tiền Net trong tay.",
        "  • Đòn bẩy 3 — Chỉ ra Chi phí Cải tạo: Xem kỹ hiện trạng (thấm chân tường, sơn cũ, thiết bị vệ sinh) và liệt kê chi phí ước tính cần hoàn thiện để xin chủ bớt thẳng vào giá bán.",
    ])

    return "\n".join(dong)
