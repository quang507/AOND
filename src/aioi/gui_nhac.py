"""Lõi gửi nhắc cho KHÁCH do trigger DB tạo — SRS-5.1zzzzzzz216 (27/10/2026).

Trigger DB đẻ bốn loại nhắc mà từ 18/10 (gỡ edge function `nudge`, SRS-5.1zzzzzzz31) KHÔNG còn ai gửi — `escalation-feed` chỉ kéo
`escalation` / `report` (tin nội bộ cho admin / chủ nhà) và dòng có `noi_dung_gui` soạn sẵn:
- `followup` — chủ nhà / admin trả lời câu khách mua hỏi (`info_request_bao_lai_khach`), hoặc admin chốt lịch xem (`#mã: ok giờ`, có
  `viewing_id`); bot từng nói "có trả lời em báo lại khách ngay" mà khách không bao giờ nhận.
- `sold` — căn khách đã quan tâm chuyển sang đã chốt (`bao_can_da_chot`).
- `feedback` — 4 giờ sau giờ hẹn xem (`reminders_hen_hoi_cam_nhan`).
- `admin_reply` — admin gõ ở ô gửi tin trên /admin/tin-nhan (`admin_gui_tin`, migration 20261027c); chữ nằm ở `note`, lõi gửi
  nguyên văn và bot nhường sân 30 phút (cùng cơ chế `human_note` của bridge).

Chủ dự án 27/10: "sửa 1 … lõi python tự gửi". Câu chữ là câu mẫu (`cau_mau`: bao_tra_loi_chu_nha / bao_lich_da_chot / bao_can_da_ban /
hoi_cam_nhan_sau_xem) code điền từ cột THẬT (`info_requests.answer`, `viewings.time_text`, `listings.code`), không gọi model. Ba loại tự
động chỉ đi trong khung 8–20 giờ (cùng `bao_can_moi`); tin admin gửi ngay. Gửi hụt: đếm `attempts`, hẹn `next_retry_at`, quá
`ATTEMPTS_TOI_DA` thì `dead` kèm `last_error`. KHÔNG ghi `noi_dung_gui` khi còn pending — escalation-feed cũng kéo dòng có cột đó
(nhánh `soanSan`), ghi sớm là hai bên cùng gửi."""
from __future__ import annotations

import logging
import urllib.parse
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from . import cau_mau
from .bao_can_moi import trong_khung_gio
from .mua import TRANG_THAI_HIEN, XIN_THEM_ANH
from .web import link_tin
from .xung_ho import goi_toi

log = logging.getLogger(__name__)

KIND_LOI = ("followup", "sold", "feedback", "admin_reply", "len_web")
KIND_TU_DONG = ("followup", "sold", "feedback", "len_web")   # chỉ 8–20 giờ; `admin_reply` là người thật nói, gửi ngay
# SRS-5.1zzzzzzz254: `len_web` — chủ nhà đã duyệt tin mà lúc đó tin chưa hiển thị; lõi chờ tới khi tin `dang_ban` rồi nhắn chủ nhà kèm link.
CHO_LEN_WEB_PHUT = 10
CHO_LEN_WEB_TOI_DA = timedelta(days=7)
ATTEMPTS_TOI_DA = 5
TOI_DA_MOT_LUOT = 10


def _q(s: str) -> str:
    return urllib.parse.quote(str(s), safe="")


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat()


def _gio_hen(v: dict | None) -> str:
    """Giờ hẹn người đọc được: khách nói sao ghi vậy (`time_text`), không có thì `slot` đổi sang giờ Việt Nam."""
    if not v:
        return "giờ đã hẹn"
    if v.get("time_text"):
        return str(v["time_text"]).strip()
    slot = v.get("slot")
    if slot:
        try:
            t = datetime.fromisoformat(str(slot).replace("Z", "+00:00")).astimezone(timezone(timedelta(hours=7)))
            return t.strftime("%H:%M ngày %d/%m")
        except ValueError:
            pass
    return "giờ đã hẹn"


def _ma_can(kho: Any, listing_id: str | None, viewing: dict | None = None) -> str:
    if viewing and viewing.get("listing_code"):
        return str(viewing["listing_code"])
    if not listing_id:
        return "?"
    try:
        rows = kho._get(f"listings?id=eq.{_q(listing_id)}&select=code")
    except Exception as e:  # noqa: BLE001
        log.warning("gui_nhac: đọc mã căn lỗi (%s)", type(e).__name__)
        return "?"
    return str(rows[0].get("code") or "?") if rows else "?"


def soan_tin(kho: Any, r: dict, goi: str, toi: str) -> str | None:
    """Chữ gửi khách cho một dòng nhắc; None = không có gì để gửi (dòng chuyển `dead`). Chỉ điền từ cột thật."""
    kind = r.get("kind")
    if kind == "admin_reply":
        chu = (r.get("note") or "").strip()
        return chu or None
    if kind == "followup":
        if r.get("viewing_id"):
            v = kho._get(f"viewings?id=eq.{_q(r['viewing_id'])}&select=time_text,slot,listing_code")
            v0 = v[0] if v else None
            return cau_mau.cau("bao_lich_da_chot", goi, toi=toi, ma=_ma_can(kho, r.get("listing_id"), v0), gio=_gio_hen(v0))
        if not (r.get("buyer_id") and r.get("listing_id")):
            return None
        ir = kho._get(f"info_requests?buyer_id=eq.{_q(r['buyer_id'])}&listing_id=eq.{_q(r['listing_id'])}&status=eq.answered"
                      "&select=question,answer&order=answered_at.desc.nullslast&limit=1")
        if not ir or not (ir[0].get("answer") or "").strip():
            return None
        if (ir[0].get("question") or "").strip() == XIN_THEM_ANH:   # SRS-5.1zzzzzzz254: chủ nhà gửi thêm ảnh khách xin
            ma = _ma_can(kho, r.get("listing_id"))
            return cau_mau.cau("bao_them_anh", goi, toi=toi, ma=ma, url=link_tin(ma if ma != "?" else None))
        return cau_mau.cau("bao_tra_loi_chu_nha", goi, toi=toi, ma=_ma_can(kho, r.get("listing_id")),
                           cau_hoi=(ir[0].get("question") or "").strip()[:200], tra_loi=ir[0]["answer"].strip()[:600])
    if kind == "sold":
        return cau_mau.cau("bao_can_da_ban", goi, toi=toi, ma=_ma_can(kho, r.get("listing_id")))
    if kind == "feedback":
        return cau_mau.cau("hoi_cam_nhan_sau_xem", goi, toi=toi, ma=_ma_can(kho, r.get("listing_id")))
    if kind == "len_web":
        ma = _ma_can(kho, r.get("listing_id"))
        return cau_mau.cau("bao_tin_len_web", goi, toi=toi, url=link_tin(ma)) if ma != "?" else None
    return None


def _cho_len_web(kho: Any, r: dict, bay_gio: datetime) -> bool:
    """Nhắc `len_web` mà tin CHƯA hiển thị → hẹn xét lại sau CHO_LEN_WEB_PHUT phút (không đếm là gửi hụt); chờ quá CHO_LEN_WEB_TOI_DA thì
    `dead`. True = chưa tới lúc gửi."""
    if r.get("kind") != "len_web":
        return False
    tin = kho._get(f"listings?id=eq.{_q(r.get('listing_id') or '')}&select=status") if r.get("listing_id") else []
    if tin and tin[0].get("status") in TRANG_THAI_HIEN:   # SRS-5.1zzzzzzz259: cùng bộ trạng thái web hiện
        return False
    try:
        tao = datetime.fromisoformat(str(r.get("created_at") or "").replace("Z", "+00:00"))
    except ValueError:
        tao = bay_gio
    if not tin or bay_gio - tao > CHO_LEN_WEB_TOI_DA:
        _ket(kho, r, "dead", bay_gio, loi="tin chưa hiển thị sau 7 ngày" if tin else "không thấy tin")
        return True
    kho._patch(f"reminders?id=eq.{_q(r['id'])}", {"next_retry_at": _iso(bay_gio + timedelta(minutes=CHO_LEN_WEB_PHUT))})
    return True


def _nguoi_nhan(kho: Any, r: dict) -> tuple[str | None, str | None, str]:
    """(zalo_user_id, tên, vai) — khách mua trước (nhắc về việc của khách mua), không có thì chủ nhà (admin nhắn chủ nhà)."""
    if r.get("buyer_id"):
        b = kho._get(f"buyers?id=eq.{_q(r['buyer_id'])}&select=name,zalo_user_id")
        if b:
            return b[0].get("zalo_user_id"), b[0].get("name"), "buyer"
    if r.get("seller_id"):
        s = kho._get(f"sellers?id=eq.{_q(r['seller_id'])}&select=name,zalo_user_id")
        if s:
            return s[0].get("zalo_user_id"), s[0].get("name"), "seller"
    return None, None, "buyer"


def _ket(kho: Any, r: dict, status: str, bay_gio: datetime, loi: str | None = None, noi_dung: str | None = None) -> None:
    du: dict[str, Any] = {"status": status}
    if status == "sent":
        du["sent_at"] = _iso(bay_gio)
        if noi_dung:
            du["noi_dung_gui"] = noi_dung
    if loi:
        du["last_error"] = loi[:300]
    kho._patch(f"reminders?id=eq.{_q(r['id'])}", du)


def _hut(kho: Any, r: dict, bay_gio: datetime, loi: str) -> None:
    """Gửi hụt: đếm lần, hẹn thử lại (5 phút × số lần), quá trần thì `dead` — không bao giờ gửi đúp vì dòng vẫn pending tới khi bridge nhận."""
    lan = int(r.get("attempts") or 0) + 1
    if lan >= ATTEMPTS_TOI_DA:
        _ket(kho, r, "dead", bay_gio, loi=f"hụt {lan} lần: {loi}")
        return
    kho._patch(f"reminders?id=eq.{_q(r['id'])}",
               {"attempts": lan, "next_retry_at": _iso(bay_gio + timedelta(minutes=5 * lan)), "last_error": loi[:300]})


def chay_mot_luot(kho: Any, gui: Callable[[str, str], bool], xung_ho_cua: Callable[[str], Any] | None = None,
                  ghi_lich_su: Callable[[str, str, str, str | None, str], None] | None = None,
                  bay_gio: datetime | None = None) -> list[dict]:
    """Một lượt quét. `gui(zalo_id, chữ)` gửi thật qua bridge, True khi bridge nhận. `xung_ho_cua(zalo_id)` → cách khách xưng (hoặc
    (cách xưng, tên trợ lý)). `ghi_lich_su(zalo_id, chữ, vai, tên khách, sender)` ghi vào lịch sử lõi + CRM (`sender` = "bot" / "human").
    Trả danh sách dòng đã gửi."""
    bay_gio = bay_gio or datetime.now(timezone.utc)
    if not getattr(kho, "is_configured", False):
        return []
    now = _iso(bay_gio)
    rows = kho._get(f"reminders?status=eq.pending&kind=in.({','.join(KIND_LOI)})&due_at=lte.{_q(now)}"
                    f"&or=(next_retry_at.is.null,next_retry_at.lte.{_q(now)})"
                    "&select=id,kind,note,buyer_id,seller_id,listing_id,viewing_id,attempts,created_at&order=due_at.asc"
                    f"&limit={TOI_DA_MOT_LUOT}")
    trong_gio = trong_khung_gio(bay_gio)
    ra: list[dict] = []
    for r in rows:
        if r.get("kind") in KIND_TU_DONG and not trong_gio:
            continue   # để pending, lượt sau trong khung giờ mới gửi
        try:
            if _cho_len_web(kho, r, bay_gio):
                continue
            zalo, ten, vai = _nguoi_nhan(kho, r)
            if not zalo:
                _ket(kho, r, "dead", bay_gio, loi="người nhận không có Zalo")
                continue
            xh = xung_ho_cua(zalo) if xung_ho_cua else "unknown"
            xh, ten_tro_ly = (xh if isinstance(xh, tuple) else (xh, None))
            goi, toi = goi_toi(xh, ten_tro_ly)
            chu = soan_tin(kho, r, goi, toi)
            if not chu:
                _ket(kho, r, "dead", bay_gio, loi="không có nội dung để gửi (thiếu câu trả lời / mã căn)")
                continue
        except Exception as e:  # noqa: BLE001 — một dòng hỏng không chặn dòng khác; lượt sau xét lại
            log.warning("gui_nhac: soạn tin %s lỗi (%s)", r.get("id"), type(e).__name__)
            continue
        ok = False
        try:
            ok = bool(gui(zalo, chu))
        except Exception as e:  # noqa: BLE001
            log.warning("gui_nhac: bridge hụt (%s)", type(e).__name__)
            _hut(kho, r, bay_gio, f"{type(e).__name__}: {e}")
            continue
        if not ok:
            _hut(kho, r, bay_gio, "bridge không nhận")
            continue
        _ket(kho, r, "sent", bay_gio, noi_dung=chu)
        if ghi_lich_su:
            try:
                ghi_lich_su(zalo, chu, vai, ten, "human" if r.get("kind") == "admin_reply" else "bot")
            except Exception as e:  # noqa: BLE001
                log.warning("gui_nhac: ghi lịch sử hụt (%s)", type(e).__name__)
        ra.append({"id": r.get("id"), "kind": r.get("kind"), "zalo": zalo})
    return ra
