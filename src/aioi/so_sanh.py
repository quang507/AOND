"""LQC mảng So sánh cạnh tranh (SRS-5.1zzzzzzz428, chủ dự án 12/11/2026 "Làm mảng So sánh"; đặc tả `docs/lqc-listing-quality-controller.md` mục 4).

Nguồn DUY NHẤT là RPC `can_dang_rao_gan` (migration 20261112b): căn cùng loại + cùng giao dịch đang rao trong bán kính, căn đã cọc / chốt gần
đó (180 ngày), dải đơn giá các căn đang rao. Không trả số nhà / người bán / mô tả. Tin thử (`seed_thu`) chỉ tính cho ID thử.

Luật lời (chủ dự án chưa quyết 4.5 — bot phía bán được nhận xét giá tới đâu): chỉ đưa DỮ KIỆN, không nói giá chủ cao / thấp / nên tăng / nên
giảm. Không có dòng giao dịch thật thì không có câu "tháng trước em bán…", "hôm qua em cọc…" (4.3 · 4.4)."""
from __future__ import annotations

import logging
from typing import Any

from .phap_ly import tien
from .web import link_tin

log = logging.getLogger(__name__)

BAN_KINH_M = 3000
TOI_DA_CAN = 3
TOI_THIEU_CAN = 2          # dưới số này không gửi chủ danh sách so sánh (một căn chưa nói lên gì)
TOI_THIEU_DON_GIA = 3      # dải đơn giá từ tin gần thay bảng ước lượng cứng khi đủ mẫu (4.5)
LOI_VAO = {"mat_tien": "mặt tiền", "hem_xe_hoi": "hẻm xe hơi", "hem_xe_may": "hẻm xe máy", "hem": "hẻm"}


def can_gan(kho: Any, listing_id: str | None, gom_thu: bool = False) -> dict:
    """Kết quả `can_dang_rao_gan` cho tin; hụt / chưa có toạ độ → rỗng."""
    rong = {"dang_rao": [], "da_giao_dich": [], "don_gia": {"n": 0}}
    if not listing_id or not getattr(kho, "is_configured", False):
        return rong
    try:
        kq = kho._request("POST", "rpc/can_dang_rao_gan", {"p_listing_id": str(listing_id), "p_ban_kinh_m": BAN_KINH_M,
                                                           "p_toi_da": TOI_DA_CAN, "p_gom_thu": bool(gom_thu)})
    except Exception as e:  # noqa: BLE001
        log.warning("so_sanh: tra căn gần hụt (%s)", type(e).__name__)
        return rong
    return kq if isinstance(kq, dict) else rong


def _kc(m: Any) -> str:
    try:
        m = float(m)
    except (TypeError, ValueError):
        return ""
    return f"cách khoảng {max(50, round(m / 50) * 50)} m" if m < 1000 else f"cách khoảng {m / 1000:.1f} km".replace(".", ",")


def dong_can(c: dict, giao_dich: bool = False) -> str:
    """Một dòng dữ kiện về một căn gần (không số nhà)."""
    phan = [f"#{c.get('code')}", ", ".join(x for x in (c.get("street"), c.get("ward")) if x)]
    if c.get("access_type") in LOI_VAO:
        phan.append(LOI_VAO[c["access_type"]])
    if c.get("floors"):
        phan.append(f"{c['floors']} tầng")
    if c.get("area_m2"):
        phan.append(f"{float(c['area_m2']):g} m²")
    if c.get("price_vnd"):
        dg = f" (khoảng {round(c['price_per_m2_vnd'] / 1_000_000)} triệu/m²)" if c.get("price_per_m2_vnd") else ""
        phan.append(("giá rao lúc đó " if giao_dich else "rao ") + tien(c["price_vnd"]) + dg)
    if giao_dich:
        phan.append("ĐÃ CỌC" if c.get("status") == "da_coc" else "ĐÃ CHỐT")
    phan.append(_kc(c.get("m")))
    return " · ".join(x for x in phan if x) + f" — {link_tin(c.get('code'))}"


def du_de_gui(kq: dict) -> bool:
    return len(kq.get("dang_rao") or []) >= TOI_THIEU_CAN


def khoi_gui_so_sanh(kq: dict) -> str:
    """Khối lượt sau đăng (cụm `so_sanh`): gửi chủ 2–3 căn cùng loại đang rao gần để tham khảo — dữ kiện, không phán giá."""
    dong = "\n".join(f"- {dong_can(c)}" for c in kq.get("dang_rao") or [])
    gd = "\n".join(f"- {dong_can(c, True)}" for c in kq.get("da_giao_dich") or [])
    return ("\n\n=== GỬI THAM KHẢO LƯỢT NÀY (tin đã lên web — căn cùng loại đang rao gần nhà chủ, hệ thống tra kho tin): ===\n"
            "Việc lượt này: sau lời đáp, xuống một dòng trống rồi nói em gửi anh/chị tham khảo vài căn cùng loại đang rao quanh khu, chép NGUYÊN "
            f"các dòng dưới (giữ link):\n{dong}\n"
            + (f"Căn gần đó đã có giao dịch (chỉ được nói đúng như dòng này):\n{gd}\n" if gd else "")
            + "LUẬT: chỉ đưa dữ kiện. KHÔNG nói giá chủ cao / thấp / hợp lý, KHÔNG khuyên tăng / giảm giá, KHÔNG nói căn nào đẹp hơn. Căn khác lối vào "
            "(mặt tiền / hẻm) hay khác diện tích thì không so thẳng đơn giá. "
            + ("KHÔNG nói đã bán / đã cọc căn nào. " if not gd else "")
            + "Không cần câu hỏi; có thể kết bằng \"anh/chị muốn em tìm thêm căn nào thì nhắn em\".\n")


def dong_don_gia_gan(kq: dict) -> str:
    """Dải đơn giá từ tin đang rao gần cho công cụ định giá (4.5) — "" khi chưa đủ mẫu."""
    dg = kq.get("don_gia") or {}
    if int(dg.get("n") or 0) < TOI_THIEU_DON_GIA or not dg.get("min") or not dg.get("max"):
        return ""
    tr = lambda v: round(float(v) / 1_000_000)  # noqa: E731
    return (f"- Đơn giá các căn CÙNG LOẠI ĐANG RAO trong bán kính {BAN_KINH_M // 1000} km ({dg['n']} căn, giá rao — chưa phải giá giao dịch): "
            f"{tr(dg['min'])} – {tr(dg['max'])} triệu/m², trung vị khoảng {tr(dg['trung_vi'])} triệu/m². Số này ưu tiên hơn bảng ước lượng "
            "theo vùng.\n")
