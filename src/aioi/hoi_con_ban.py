"""Hỏi chủ nhà căn còn bán / còn cho thuê — SRS-5.1zzzzzzz295 (29/10/2026, chủ dự án chốt bước 3 chuỗi tiền: "3 20 ngày").

Chống hàng ảo: tin đang hiển thị (`dang_ban` / `dang_quan_tam`) mà mốc xác nhận gần nhất (`listings.xac_nhan_con_ban_at`, chưa có thì
`chu_duyet_at` / `created_at`) cũ hơn 20 ngày → MỘT tin hỏi chủ nhà, gộp mọi căn tới hạn của cùng người bán (tối đa `TOI_DA_CAN_MOT_TIN`).
Ai cần hỏi: rpc `tin_can_hoi_con_ban` (migration 20261029g) — bỏ rổ mẫu, ID thử, hội thoại người thật đang giữ, căn đã hỏi trong 20 ngày.
Câu mẫu cố định `hoi_con_ban`, không gọi model. Chỉ 8–20 giờ (cùng `bao_can_moi`). Giữ chỗ trước, gửi sau (khuôn `giu_ket_noi`): mỗi căn một
dòng `reminders` kind `con_ban` pending → gửi → `sent`; bridge hụt → `cancelled` (lượt sau hỏi lại).
Chủ đáp "còn" → lượt đọc ý ghi `con_ban` → `SupabaseConversationStore.xac_nhan_con_ban`; chủ báo bán / cọc / dừng → đường đổi trạng thái có sẵn.
Chủ không đáp: 20 ngày sau hỏi lại; CHƯA tự ẩn tin (chưa có quyết định của chủ dự án)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from . import cau_mau
from .bao_can_moi import trong_khung_gio
from .xung_ho import goi_toi

log = logging.getLogger(__name__)

SO_NGAY = 20
TOI_DA_MOT_LUOT = 30
TOI_DA_CAN_MOT_TIN = 3
NOTE = "hoi_con_ban: hỏi chủ nhà căn còn bán / còn cho thuê (20 ngày chưa xác nhận)"


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat()


def can_hoi(kho: Any) -> list[dict]:
    """Các căn tới hạn hỏi (mỗi dòng một căn, xếp theo người bán); rpc chưa có / lỗi mạng → [] kèm cảnh báo."""
    try:
        kq = kho._request("POST", "rpc/tin_can_hoi_con_ban", data={"p_ngay": SO_NGAY, "p_limit": TOI_DA_MOT_LUOT})
    except Exception as e:  # noqa: BLE001
        log.warning("hoi_con_ban: rpc tin_can_hoi_con_ban lỗi (%s)", type(e).__name__)
        return []
    return kq if isinstance(kq, list) else []


def ten_can(r: dict) -> str:
    """Tên căn người bán nhận ra: đường + quận; không có thì mã tin."""
    cho = ", ".join(x for x in (r.get("street"), r.get("district")) if x)
    return f"căn {cho}" if cho else f"căn #{r.get('code') or '?'}"


def chu_can(dong: list[dict]) -> tuple[str, str]:
    """({can}, {con}) điền câu mẫu cho các căn của MỘT người bán."""
    ten = [ten_can(r) for r in dong]
    can = ten[0] if len(ten) == 1 else "các căn " + "; ".join(t.removeprefix("căn ") for t in ten)
    loai = {r.get("deal") for r in dong}
    con = "còn cho thuê" if loai == {"cho_thue"} else ("còn bán" if loai <= {"ban", None} else "còn bán / còn cho thuê")
    return can, con


def chay_mot_luot(kho: Any, gui: Callable[[str, str], bool], xung_ho_cua: Callable[[str], Any] | None = None,
                  ghi_lich_su: Callable[[str, str, str, str | None, str], None] | None = None,
                  bay_gio: datetime | None = None) -> list[dict]:
    """Một lượt quét. `gui(zalo_id, chữ)` → True khi bridge nhận. Trả danh sách người bán đã hỏi."""
    bay_gio = bay_gio or datetime.now(timezone.utc)
    if not getattr(kho, "is_configured", False) or not trong_khung_gio(bay_gio):
        return []
    nhom: dict[str, list[dict]] = {}
    for r in can_hoi(kho):
        if r.get("seller_id") and r.get("zalo_user_id"):
            nhom.setdefault(str(r["seller_id"]), []).append(r)
    ra: list[dict] = []
    for sid, dong in nhom.items():
        dong = dong[:TOI_DA_CAN_MOT_TIN]
        zalo = dong[0]["zalo_user_id"]
        xh = xung_ho_cua(zalo) if xung_ho_cua else "unknown"
        xh, ten_tro_ly = (xh if isinstance(xh, tuple) else (xh, None))
        goi, toi = goi_toi(xh, ten_tro_ly)
        can, con = chu_can(dong)
        chu = cau_mau.cau("hoi_con_ban", goi, toi=toi, can=can, con=con)
        try:
            cho = kho._post("reminders", [{"kind": "con_ban", "seller_id": sid, "listing_id": r.get("listing_id"), "due_at": _iso(bay_gio),
                                           "note": NOTE, "status": "pending"} for r in dong])
        except Exception as e:  # noqa: BLE001 — giữ chỗ hụt: bỏ người bán này lượt này
            log.warning("hoi_con_ban: giữ chỗ hụt (%s)", type(e).__name__)
            continue
        ids = [c.get("id") for c in (cho or []) if c.get("id")]
        ok = False
        try:
            ok = bool(gui(zalo, chu))
        except Exception as e:  # noqa: BLE001
            log.warning("hoi_con_ban: bridge hụt (%s)", type(e).__name__)
        if ids:
            du = ({"status": "sent", "sent_at": _iso(bay_gio), "noi_dung_gui": chu} if ok
                  else {"status": "cancelled", "last_error": "bridge không nhận"})
            try:
                kho._patch(f"reminders?id=in.({','.join(ids)})", du)
            except Exception as e:  # noqa: BLE001
                log.warning("hoi_con_ban: đóng chỗ giữ hụt (%s)", type(e).__name__)
        if not ok:
            continue
        if ghi_lich_su:
            try:
                ghi_lich_su(zalo, chu, "seller", dong[0].get("ten"), "bot")
            except Exception as e:  # noqa: BLE001
                log.warning("hoi_con_ban: ghi lịch sử hụt (%s)", type(e).__name__)
        ra.append({"seller_id": sid, "so_can": len(dong)})
    return ra
