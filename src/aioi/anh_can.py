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


def anh_can_gui_kem(khach: str, vai: str, reply: str, goi=_goi_anh_can, bo_nho: BoNhoAnhDaGui | None = None) -> list[str]:
    """Ảnh gửi kèm lượt này: chỉ khách MUA, chỉ các căn có link trong `reply`, ảnh công khai https."""
    if vai != "buyer":
        return []
    ma = ma_can_trong_loi(reply)
    if not ma:
        return []
    try:
        dong = goi(ma) or []
    except Exception as e:  # noqa: BLE001 — ảnh là phần thêm
        log.warning("listing_photos_v lỗi: %s", e)
        return []
    moi_can = max(1, min(TOI_DA_ANH_MOI_CAN, TOI_DA_ANH // len(ma)))   # 1 căn: 4 ảnh · 2 căn: 2 ảnh mỗi căn · 3 căn: 1 ảnh mỗi căn
    theo_can: dict[str, list[str]] = {}
    for d in dong:
        c, u = str(d.get("code") or "").upper(), d.get("url")
        if c in ma and isinstance(u, str) and u.startswith("https://"):
            ds = theo_can.setdefault(c, [])
            if u not in ds and len(ds) < moi_can:
                ds.append(u)
    bn = bo_nho or _bo_nho
    ra: list[str] = []
    for c in ma:
        if c in theo_can and bn.nen_gui(khach, f"can:{c}"):
            ra += theo_can[c]
    return ra[:TOI_DA_ANH]
