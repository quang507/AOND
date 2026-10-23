"""Báo khách mua khi có căn mới vừa nhu cầu (SRS-5.1zzzzzzz150, chủ dự án 23/10/2026: "lúc người ta tìm mua có cơ chế nhắc khi có căn mới
vừa tiêu chí ko, nhắn thẳng vào zalo" → "có… khung giờ 8–20 giờ… căn vượt ngân sách một chút báo luôn").

Lõi quét định kỳ (`server._vong_bao_can_moi`), KHÔNG qua trigger DB cũ `bao_tin_moi_khop` (đọc ô `area` / `budget` mà lõi Python không ghi — luôn
trượt — và tin nó đẻ ra không ai gửi vì edge function `nudge` đã gỡ). Mỗi lượt:
  1. chỉ chạy trong khung 8–20 giờ (giờ Việt Nam); ngoài khung thì để lượt sau, KHÔNG xếp hàng gửi sáng hôm sau (căn có thể đã bán);
  2. tin vừa lên kệ: `status = dang_ban`, tạo trong 7 ngày, cập nhật trong 36 giờ;
  3. khách: có hội thoại mua nhắn trong 30 ngày, không đang chờ người (`needs_human` / `human_hold`), có khu vực hoặc ngân sách;
  4. MỖI khách tối đa một tin / 24 giờ và MỘT căn / tin; một căn không báo hai lần cho một khách (sổ: `reminders` kind `match`);
  5. khớp cứng: bán / thuê, loại, khu vực, giá ≤ ngân sách × 1,15 — căn vượt ngân sách vẫn báo, nói rõ vượt khoảng bao nhiêu %.
Câu chữ do code ghép từ cột thật (không gọi AI, không tốn quota): câu mẫu `bao_can_moi` / `bao_can_moi_vuot` (chủ dự án sửa ở CRM)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Callable

from . import cau_mau
from .mua import SITE_URL, _TEN_LOAI, _q, co_tieu_chi

log = logging.getLogger(__name__)

GIO_BAT_DAU = 8        # giờ Việt Nam (UTC+7, không đổi giờ mùa hè)
GIO_KET_THUC = 20
TIN_MOI_TAO_NGAY = 7
TIN_MOI_CAP_NHAT_GIO = 36
KHACH_NHAN_TRONG_NGAY = 30
VAN_GIO = 24
TRAN_VUOT = 1.15
TOI_DA_KHACH_MOI_LUOT = 20

_O_NHU_CAU = ("loai_giao_dich", "loai_bds", "ngan_sach", "khu_vuc", "so_phong_ngu", "yeu_cau_xe_hoi")


def trong_khung_gio(bay_gio: datetime) -> bool:
    gio = (bay_gio.astimezone(timezone.utc) + timedelta(hours=7)).hour
    return GIO_BAT_DAU <= gio < GIO_KET_THUC


def nhu_cau_tu_ho_so(pref: dict[str, Any] | None) -> SimpleNamespace:
    """`buyers.preferences` (khoá lõi ghi) → đối tượng giống `BuyerLead` cho `co_tieu_chi` / `can_moi_khop`."""
    p = {k: v for k, v in (pref or {}).items() if v}
    thue = str(p.get("loai_giao_dich") or "").strip().lower() in ("thue", "thuê", "cho_thue")
    return SimpleNamespace(loai_giao_dich="thue" if thue else "mua", fields=p,
                           **{k: p.get(k) for k in _O_NHU_CAU if k != "loai_giao_dich"})


def mo_ta_can(c: dict) -> str:
    """Một cụm tả căn: loại, đường (không số nhà), phường, quận, diện tích, giá, phòng ngủ. Viết đủ chữ, không "P." "Q."."""
    vi_tri = ", ".join(str(c[k]) for k in ("street", "ward", "district") if c.get(k))
    phan = [_TEN_LOAI.get(str(c.get("property_type")), "bất động sản") + (f" {vi_tri}" if vi_tri else "")]
    if isinstance(c.get("area_m2"), (int, float)):
        phan.append(f"{c['area_m2']:g}m²")
    if c.get("price_raw"):
        phan.append(f"giá {c['price_raw']}")
    if c.get("bedrooms"):
        phan.append(f"{c['bedrooms']} phòng ngủ")
    return ", ".join(phan)


def viet_tin(c: dict, xung_ho: str = "unknown") -> str:
    """Tin báo một căn. `xung_ho`: khách tự xưng gì (engine) — "em" thì bot xưng "mình" và gọi khách "em"."""
    goi = {"anh": "anh", "chi": "chị", "em": "em"}.get(xung_ho, "anh/chị")
    toi = "mình" if xung_ho == "em" else "em"
    bien = {"toi": toi, "mo_ta": mo_ta_can(c), "link": f"{SITE_URL}/nha-dat/{c.get('code')}"}
    if c.get("_vuot_ngan_sach"):
        return cau_mau.cau("bao_can_moi_vuot", goi, pct=c["_vuot_ngan_sach"], **bien)
    return cau_mau.cau("bao_can_moi", goi, **bien)


def _iso(t: datetime) -> str:
    return t.astimezone(timezone.utc).isoformat()


def chay_mot_luot(kho: Any, gui: Callable[[str, str, str | None, dict], bool], xung_ho_cua: Callable[[str], str] | None = None,
                  bay_gio: datetime | None = None) -> list[dict]:
    """Một lượt quét. `gui(zalo_id, tin, ten, can)` gửi thật và trả True nếu bridge nhận; hụt thì lượt sau thử lại. Trả danh sách đã báo."""
    bay_gio = bay_gio or datetime.now(timezone.utc)
    if not (getattr(kho, "is_configured", False) and trong_khung_gio(bay_gio)):
        return []
    moi = kho._get("listings?status=eq.dang_ban"
                   f"&created_at=gte.{_q(_iso(bay_gio - timedelta(days=TIN_MOI_TAO_NGAY)))}"
                   f"&updated_at=gte.{_q(_iso(bay_gio - timedelta(hours=TIN_MOI_CAP_NHAT_GIO)))}&select=id&limit=50")
    ids = [r["id"] for r in moi if r.get("id")]
    if not ids:
        return []
    hoi = kho._get(f"conversations?buyer_id=not.is.null&needs_human=eq.false&human_hold=eq.false"
                   f"&last_message_at=gte.{_q(_iso(bay_gio - timedelta(days=KHACH_NHAN_TRONG_NGAY)))}"
                   f"&select=buyer_id&limit=200")
    bids = list(dict.fromkeys(r["buyer_id"] for r in hoi if r.get("buyer_id")))
    if not bids:
        return []
    lst = ",".join(_q(b) for b in bids)
    khach = kho._get(f"buyers?id=in.({lst})&zalo_user_id=not.is.null&select=id,name,zalo_user_id,preferences")
    da_bao = kho._get(f"reminders?kind=eq.match&buyer_id=in.({lst})"
                      f"&created_at=gte.{_q(_iso(bay_gio - timedelta(days=KHACH_NHAN_TRONG_NGAY)))}&select=buyer_id,listing_id,created_at")
    moc_van = bay_gio - timedelta(hours=VAN_GIO)
    ra: list[dict] = []
    for k in khach[:TOI_DA_KHACH_MOI_LUOT]:
        bid = k["id"]
        mine = [r for r in da_bao if r.get("buyer_id") == bid]
        if any(_den_luc(r.get("created_at")) > moc_van for r in mine):
            continue   # van 24 giờ: một khách một tin báo căn mỗi ngày
        da = {r.get("listing_id") for r in mine}
        lead = nhu_cau_tu_ho_so(k.get("preferences"))
        if not co_tieu_chi(lead):
            continue
        can = kho.can_moi_khop(lead, [i for i in ids if i not in da], TRAN_VUOT)
        if not can:
            continue
        c = can[0]
        tin = viet_tin(c, xung_ho_cua(k["zalo_user_id"]) if xung_ho_cua else "unknown")
        # Giữ chỗ TRƯỚC khi gửi: hai lượt chạy chồng nhau không báo đúp (khoá duy nhất khách + tin cho kind `match`). Gửi hụt thì xoá để thử lại.
        try:
            giu = kho._post("reminders", {"kind": "match", "buyer_id": bid, "listing_id": c["id"], "due_at": _iso(bay_gio),
                                          "status": "sent", "sent_at": _iso(bay_gio), "note": f"#{c.get('code')}", "noi_dung_gui": tin})
        except Exception as e:  # noqa: BLE001 — trùng khoá hoặc mạng: bỏ khách này, lượt sau xét lại
            log.info("bao_can_moi: không giữ chỗ được (%s) cho %s", type(e).__name__, bid)
            continue
        ok = False
        try:
            ok = gui(k["zalo_user_id"], tin, k.get("name"), c)
        except Exception as e:  # noqa: BLE001
            log.warning("bao_can_moi: gửi hụt (%s)", type(e).__name__)
        if not ok:
            if giu and giu[0].get("id"):
                try:
                    kho._request("DELETE", f"reminders?id=eq.{giu[0]['id']}")
                except Exception as e:  # noqa: BLE001
                    log.warning("bao_can_moi: không gỡ được dòng giữ chỗ (%s)", type(e).__name__)
            continue
        ra.append({"buyer_id": bid, "listing_id": c["id"], "code": c.get("code"), "vuot": c.get("_vuot_ngan_sach")})
        da_bao.append({"buyer_id": bid, "listing_id": c["id"], "created_at": _iso(bay_gio)})
    return ra


def _den_luc(s: Any) -> datetime:
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)
