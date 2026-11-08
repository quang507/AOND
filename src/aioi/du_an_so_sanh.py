"""So sánh hai dự án trong kho (SRS-5.1zzzzzzz394, 06/11/2026; sửa 08/11/2026).

Đặt dữ kiện hai dự án cạnh nhau bằng CÙNG hàm `du_an_mua.dong_du_an` mà công cụ tra dự án dùng — chỉ ô có dữ liệu thật, giá niêm yết
đọc đúng là TỔNG giá (`price_min` / `price_max` là giá căn, không phải đơn giá m²). Bản 06/11 chia `price_min` cho 1 triệu rồi ghi
"triệu/m²", và tự điền "Chủ đầu tư uy tín", "Sổ hồng lâu dài / HĐMB", "Đã bàn giao", "Quy mô tiêu chuẩn", bốn tiện ích mẫu khi kho trống.
Dự án không có trong kho → nói thẳng là không có, model không được tả từ trí nhớ.
"""
from __future__ import annotations

from typing import Any

from .du_an_mua import dong_du_an


def _tra(engine: Any, ten: str) -> dict[str, Any] | None:
    kho = getattr(engine, "_convstore", None)
    if not ten or kho is None or getattr(kho, "tra_du_an", None) is None:
        return None
    nghia = getattr(getattr(engine, "_dia_danh", None), "du_an_theo_nghia", None)
    try:
        kq = kho.tra_du_an(ten, theo_nghia=nghia) if nghia else kho.tra_du_an(ten)
    except Exception:  # noqa: BLE001 — tra lỗi thì coi như không có, nói thật
        return None
    du_an = kq.get("du_an") if isinstance(kq, dict) else None
    return du_an if kq.get("khop") in ("ro", "gan") and isinstance(du_an, dict) else None


def so_sanh_hai_du_an(engine: Any, conv: Any, ten_du_an_1: str, ten_du_an_2: str) -> str:
    """Kết quả công cụ `so_sanh_du_an`: dữ kiện kho của hai dự án đặt cạnh nhau."""
    dong = [f"=== SO SÁNH ĐỐI ĐẦU DỰ ÁN: {ten_du_an_1.strip()} vs {ten_du_an_2.strip()} (dữ kiện trong kho) ==="]
    for ten in (ten_du_an_1.strip(), ten_du_an_2.strip()):
        d = _tra(engine, ten)
        dong.append("")
        if d is None:
            dong.append(f"[{ten}] KHÔNG có trong kho — không tả dự án này từ trí nhớ; nói thật là chưa có dữ liệu.")
            continue
        dong.append(f"[{d.get('name') or ten}]")
        dong += dong_du_an(d) or ["- Kho chưa có dữ kiện nào ngoài tên."]
    dong += ["", "- Chỉ so trên các ô cả hai cùng có; ô một bên thiếu thì nói là chưa có dữ liệu, không đoán. Không kết luận dự án nào "
             "'tốt hơn' — nêu khác biệt để khách tự chọn theo nhu cầu (ở thật / cho thuê)."]
    return "\n".join(dong) + "\n"
