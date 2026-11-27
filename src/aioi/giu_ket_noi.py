"""Tin chống Zalo xoá kết nối — SRS-5.1zzzzzzz238 (28/10/2026, chủ dự án: "làm lại tin chống xoá kết nối").

FR-63 / RSK-01: khách im ≥ 6 ngày (trước mốc 7 ngày INS-03) thì gửi MỘT tin nhờ khách nhắn lại một chữ. Bản TypeScript ở edge function
`nudge` (gỡ 18/10, SRS-5.1zzzzzzz31) chỉ làm cho khách mua; lõi Python làm cho cả khách mua lẫn người bán, theo vai của tin khách gần
nhất. Câu là câu mẫu cố định (`cau_mau`: giu_ket_noi_mua / giu_ket_noi_ban), không gọi model — model hỏng vẫn cứu được kết nối.

Ai cần nhắn: rpc `khach_can_giu_ket_noi` (migration 20261028c) — hội thoại có tin khách cuối nằm trong 6–7 ngày, chưa có tin giữ kết nối
(`reminders` kind `reengage`, note bắt đầu `giu_ket_noi`, trạng thái pending / sent) sau tin khách đó, không phải ID thử, người thật không
đang giữ khách, khách mua chưa tắt báo. Chỉ gửi 8–21 giờ Việt Nam (cùng `bao_can_moi`). Giữ chỗ trước, gửi sau: chèn dòng pending → gửi →
`sent`; bridge hụt → `cancelled` (lượt sau còn trong cửa sổ 7 ngày thì thử lại).
Luật 7 ngày là của Zalo OA (INS-03); với Zalo cá nhân qua zca-js CHƯA kiểm Zalo có ngắt kết nối như vậy không — chủ dự án vẫn yêu cầu gửi."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from . import cau_mau
from .bao_can_moi import trong_khung_gio
from .xung_ho import goi_toi

log = logging.getLogger(__name__)

TOI_DA_MOT_LUOT = 10
NOTE = "giu_ket_noi: nhắc giữ kết nối Zalo trước mốc 7 ngày (FR-63, im ≥ 6 ngày)"


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat()


def can_nhan(kho: Any) -> list[dict]:
    """Danh sách khách cần tin giữ kết nối; rpc chưa có (migration chưa áp) / lỗi mạng → [] kèm cảnh báo."""
    try:
        # đọc rộng hơn trần gửi: dòng bị bỏ qua (vai chưa rõ, LQC chặn) không có nhắc nên lượt nào cũng quay lại — không được chiếm chỗ người bán
        kq = kho._request("POST", "rpc/khach_can_giu_ket_noi", data={"p_limit": 5 * TOI_DA_MOT_LUOT})
    except Exception as e:  # noqa: BLE001
        log.warning("giu_ket_noi: rpc khach_can_giu_ket_noi lỗi (%s)", type(e).__name__)
        return []
    return kq if isinstance(kq, list) else []


def chay_mot_luot(kho: Any, gui: Callable[[str, str], bool], xung_ho_cua: Callable[[str], Any] | None = None,
                  ghi_lich_su: Callable[[str, str, str, str | None, str], None] | None = None,
                  bay_gio: datetime | None = None, lqc_chan: Callable[[str, str], str | None] | None = None,
                  vai_cua: Callable[[str], str | None] | None = None) -> list[dict]:
    """Một lượt quét. `gui(zalo_id, chữ)` → True khi bridge nhận. Trả danh sách khách đã nhắn."""
    bay_gio = bay_gio or datetime.now(timezone.utc)
    if not getattr(kho, "is_configured", False) or not trong_khung_gio(bay_gio):
        return []
    ra: list[dict] = []
    for r in can_nhan(kho):
        if len(ra) >= TOI_DA_MOT_LUOT:
            break
        zalo, vai = r.get("zalo_user_id"), ("seller" if r.get("vai") == "seller" else "buyer")
        if zalo and vai_cua is not None:   # SRS-5.1zzzzzzz555 (audit chat Zalo P1-16): vai theo hội thoại lõi; None (chưa rõ / phía mua tắt) → không gửi
            try:
                vai = vai_cua(zalo)
            except Exception as e:  # noqa: BLE001 — đọc hội thoại hụt: bỏ khách này, không bỏ cả lượt
                log.warning("giu_ket_noi: đọc vai hụt (%s)", type(e).__name__)
                continue
        if not zalo or not vai:
            continue
        if lqc_chan and lqc_chan(zalo, "giu_ket_noi"):   # SRS-5.1zzzzzzz475: luật chung LQC — nay cho MỌI vai
            continue
        xh = xung_ho_cua(zalo) if xung_ho_cua else "unknown"
        xh, ten_tro_ly = (xh if isinstance(xh, tuple) else (xh, None))
        goi, toi = goi_toi(xh, ten_tro_ly)
        chu = cau_mau.cau("giu_ket_noi_ban" if vai == "seller" else "giu_ket_noi_mua", goi, toi=toi)
        try:
            # cả hai id của hội thoại — rpc chống trùng khớp theo id có mặt (bản trước một id null → mỗi lượt quét gửi lại)
            cho = kho._post("reminders", {"kind": "reengage", "buyer_id": r.get("buyer_id"), "seller_id": r.get("seller_id"),
                                          "due_at": _iso(bay_gio), "note": NOTE, "status": "pending"})
        except Exception as e:  # noqa: BLE001 — trùng chỗ giữ (lượt khác đang gửi) hay lỗi mạng: bỏ lượt này
            log.warning("giu_ket_noi: giữ chỗ hụt (%s)", type(e).__name__)
            continue
        id_cho = cho[0].get("id") if cho else None
        ok = False
        try:
            ok = bool(gui(zalo, chu))
        except Exception as e:  # noqa: BLE001
            log.warning("giu_ket_noi: bridge hụt (%s)", type(e).__name__)
        if id_cho:
            du = {"status": "sent", "sent_at": _iso(bay_gio)} if ok else {"status": "cancelled", "last_error": "bridge không nhận"}
            try:
                kho._patch(f"reminders?id=eq.{id_cho}", du)
            except Exception as e:  # noqa: BLE001
                log.warning("giu_ket_noi: đóng chỗ giữ hụt (%s)", type(e).__name__)
        if not ok:
            continue
        if ghi_lich_su:
            try:
                ghi_lich_su(zalo, chu, vai, r.get("ten"), "bot")
            except Exception as e:  # noqa: BLE001
                log.warning("giu_ket_noi: ghi lịch sử hụt (%s)", type(e).__name__)
        ra.append({"zalo": zalo, "vai": vai})
    return ra
