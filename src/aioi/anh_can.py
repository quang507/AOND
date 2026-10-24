"""Ảnh căn gửi kèm khi bot giới thiệu căn cho khách MUA (23/10/2026, docs/07 SRS-5.1zzzzzzz145).

Chủ dự án: "mỗi tin đưa ra 1–2 hình thì tốt nhỉ". Bot dán LINK trang căn trong lời giới thiệu (`mua.dong_can`), nên căn nào đã được NÓI tới chính là
căn có link trong câu trả lời — đọc mã căn từ link đó, không đoán từ danh sách căn tìm được (danh sách đó có thể chưa được nhắc tới). Ảnh lấy từ view
`listing_photos_v` (bucket công khai, tin đang hiện), tối đa 4 ảnh mỗi lượt (một căn: cả 4; nhiều căn: chia đều — SRS-5.1zzzzzzz160), mỗi (khách, căn) một lần trong 24 giờ.
Không có ảnh / lỗi mạng → không gửi, không làm hỏng lượt trả lời. Đường gửi là `photos` của `/chat-reply` (bridge tải về và gửi đính kèm, FR-143).
"""
from __future__ import annotations

import json
import logging
import re
import threading
import urllib.parse
import urllib.request

from .anh_du_an import BoNhoAnhDaGui, _thong_tin

log = logging.getLogger("aioi.anh_can")

TOI_DA_ANH_MOI_CAN = 4   # SRS-5.1zzzzzzz160: chỉ MỘT căn trong lượt thì được cả 4 ảnh (chủ dự án 23/10: "3 4 tấm ảnh"); nhiều căn chia đều
TOI_DA_ANH = 4
TOI_DA_CAN = 3
_LINK_CAN = re.compile(r"/nha-dat/([A-Za-z0-9][A-Za-z0-9-]{3,})")


def ma_can_trong_loi(reply: str) -> list[str]:
    """Mã căn theo thứ tự bot nhắc tới (link `…/nha-dat/<mã>`), bỏ trùng."""
    ra: list[str] = []
    for m in _LINK_CAN.finditer(reply or ""):
        ma = m.group(1).upper()
        if ma not in ra:
            ra.append(ma)
    return ra[:TOI_DA_CAN]


def _goi_anh_can(ma: list[str]) -> list[dict]:
    goc, khoa = _thong_tin()
    if not khoa or not ma:
        return []
    ds = ",".join(urllib.parse.quote(m, safe="") for m in ma)
    req = urllib.request.Request(
        f"{goc}/rest/v1/listing_photos_v?code=in.({ds})&select=code,url,is_cover,sort_order&order=is_cover.desc.nullslast,sort_order.asc",
        headers={"apikey": khoa, "Authorization": f"Bearer {khoa}"},
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


_bo_nho = BoNhoAnhDaGui()


class SoAnhDaGui:
    """(khách, căn) → số ảnh ĐÃ gửi (cả lúc giới thiệu lẫn lúc khách xin). Khách xin ảnh thì gửi tiếp các ảnh chưa gửi; gửi hết rồi thì quay lại từ
    đầu — khách xin lại ảnh vẫn nhận được (SRS-5.1zzzzzzz169), không bị chặn như lúc bot tự giới thiệu."""

    def __init__(self) -> None:
        self._n: dict[tuple[str, str], int] = {}
        self._khoa = threading.Lock()

    def lay(self, khach: str, ma: str) -> int:
        with self._khoa:
            return self._n.get((khach, ma), 0)

    def dat(self, khach: str, ma: str, n: int) -> None:
        with self._khoa:
            if len(self._n) > 5000:
                self._n.clear()
            self._n[(khach, ma)] = n


_so_gui = SoAnhDaGui()


def anh_can_gui_kem(khach: str, vai: str, reply: str, goi=_goi_anh_can, bo_nho: BoNhoAnhDaGui | None = None,
                    xin: list[str] | tuple[str, ...] = (), so_gui: SoAnhDaGui | None = None) -> list[str]:
    """Ảnh gửi kèm lượt này: chỉ khách MUA, ảnh công khai https. Căn có link trong `reply` (bot tự giới thiệu): mỗi (khách, căn) một lần / 24 giờ.
    Căn trong `xin` (khách XIN ảnh — lượt AI đọc, engine đã kiểm căn có thật): luôn gửi, bỏ chặn 24 giờ, gửi tiếp ảnh chưa gửi."""
    if vai != "buyer":
        return []
    xin = [str(c).strip().upper() for c in xin if c][:TOI_DA_CAN]
    ma = list(dict.fromkeys(xin + ma_can_trong_loi(reply)))[:TOI_DA_CAN]
    if not ma:
        return []
    try:
        dong = goi(ma) or []
    except Exception as e:  # noqa: BLE001 — ảnh là phần thêm
        log.warning("listing_photos_v lỗi: %s", e)
        return []
    moi_can = max(1, min(TOI_DA_ANH_MOI_CAN, TOI_DA_ANH // len(ma)))   # 1 căn: 4 ảnh · 2 căn: 2 ảnh mỗi căn · 3 căn: 1 ảnh mỗi căn
    tat_ca: dict[str, list[str]] = {}
    for d in dong:
        c, u = str(d.get("code") or "").upper(), d.get("url")
        if c in ma and isinstance(u, str) and u.startswith("https://"):
            ds = tat_ca.setdefault(c, [])
            if u not in ds:
                ds.append(u)
    bn, so = bo_nho or _bo_nho, so_gui or _so_gui
    ra: list[str] = []
    for c in ma:
        ds = tat_ca.get(c)
        if not ds:
            continue
        if c in xin:
            bd = so.lay(khach, c)
            bd = 0 if bd >= len(ds) else bd              # gửi hết rồi → quay lại từ đầu
            chon = ds[bd:bd + moi_can]
            so.dat(khach, c, bd + len(chon))
            bn.nen_gui(khach, f"can:{c}")                # tin tự giới thiệu sau đó không gửi trùng ngay
            ra += chon
        elif bn.nen_gui(khach, f"can:{c}"):
            chon = ds[:moi_can]
            so.dat(khach, c, len(chon))
            ra += chon
    return ra[:TOI_DA_ANH]
