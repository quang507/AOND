"""Ảnh dự án cho khách hỏi mua (18/10/2026, docs/07 SRS-5.1zzzzzzz36).

Chủ dự án: "người hỏi mua thì bot tự gửi ảnh". Khách nhắc TÊN một dự án trong kho → trả ≤ 5 đường dẫn ảnh
(`projects.images`, ảnh thư viện mogi do `scripts/thu-du-an.mjs` nạp) để bridge Zalo gửi kèm (`photos`, FR-143).

Khớp tên bằng `match_projects(p_text)` trên Supabase — luật khớp tên dự án đang dùng ở web, không phải vector: gửi ảnh nhầm
dự án tệ hơn không gửi, còn vector "gần nghĩa" thì luôn trả về một dự án nào đó. Vector dự án (đã có tên trong văn bản nhúng)
vẫn để cho câu tìm theo nghĩa.

Mỗi khách nhận ảnh một dự án tối đa một lần trong `NHAC_LAI_SAU` giây (bộ nhớ trong tiến trình, khởi động lại thì quên —
chấp nhận được: tệ nhất là khách thấy lại ảnh một lần). Lỗi mạng / DB → không gửi ảnh, không làm hỏng lượt trả lời.
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
import unicodedata
import urllib.request
from dataclasses import dataclass, field

log = logging.getLogger("aioi.anh_du_an")

TOI_DA_ANH = 5
NHAC_LAI_SAU = 24 * 3600


@dataclass
class AnhDuAn:
    ten: str
    anh: list[str]


def _thong_tin() -> tuple[str, str]:
    goc = os.environ.get("SUPABASE_URL", "https://rqxmmqmctpklqcmbfxuj.supabase.co").rstrip("/")
    if goc.endswith("/rest/v1"):
        goc = goc[: -len("/rest/v1")]
    return goc, os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def _goi_match_projects(cau: str) -> list[dict]:
    goc, khoa = _thong_tin()
    if not khoa:
        return []
    req = urllib.request.Request(
        f"{goc}/rest/v1/rpc/match_projects?select=name,images",
        data=json.dumps({"p_text": cau}).encode("utf-8"),
        headers={"apikey": khoa, "Authorization": f"Bearer {khoa}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _loc_anh(images: object) -> list[str]:
    if not isinstance(images, list):
        return []
    ra: list[str] = []
    for x in images:
        u = x if isinstance(x, str) else (x.get("url") if isinstance(x, dict) else None)
        if isinstance(u, str) and u.startswith("https://") and u not in ra:
            ra.append(u)
    return ra[:TOI_DA_ANH]


def _lien(s: str) -> str:
    """Bỏ dấu, chữ thường, chỉ giữ a-z0-9 (giống `bo_dau` + regexp của match_projects)."""
    s = unicodedata.normalize("NFD", s.replace("đ", "d").replace("Đ", "D"))
    return re.sub(r"[^a-z0-9]+", "", "".join(c for c in s if not unicodedata.combining(c)).lower())


def tim_anh_du_an(cau: str, goi=_goi_match_projects) -> AnhDuAn | None:
    """Dự án khớp tên trong câu khách VÀ có ảnh; không khớp / lỗi → None.

    match_projects trả ≤ 2 dòng. Hai dòng nghĩa là câu khách chỉ chạm một phần tên ("Vinhomes Grand Park" → The Beverly - …,
    The Origami - …): khi đó chỉ gửi dự án có TRỌN tên nằm trong câu, không thì thôi — gửi ảnh nhầm dự án tệ hơn không gửi."""
    if not cau or len(cau.strip()) < 4:
        return None
    try:
        dong = [d for d in (goi(cau) or []) if d.get("name")]
    except Exception as e:  # noqa: BLE001 — ảnh là phần thêm, không được làm hỏng lượt trả lời
        log.warning("match_projects lỗi: %s", e)
        return None
    if len(dong) > 1:
        lien = _lien(cau)
        dong = [d for d in dong if _lien(str(d["name"])) and _lien(str(d["name"])) in lien]
    for d in dong:
        anh = _loc_anh(d.get("images"))
        if anh:
            return AnhDuAn(ten=str(d["name"]), anh=anh)
    return None


@dataclass
class BoNhoAnhDaGui:
    """(khách, dự án) → lúc gửi; chặn gửi lại cùng bộ ảnh mỗi lượt khách nhắc tên."""

    nhac_lai_sau: float = NHAC_LAI_SAU
    _da_gui: dict[tuple[str, str], float] = field(default_factory=dict)
    _khoa: threading.Lock = field(default_factory=threading.Lock)

    def nen_gui(self, khach: str, du_an: str, bay_gio: float | None = None) -> bool:
        t = time.time() if bay_gio is None else bay_gio
        k = (khach, du_an)
        with self._khoa:
            truoc = self._da_gui.get(k)
            if truoc is not None and t - truoc < self.nhac_lai_sau:
                return False
            self._da_gui[k] = t
            return True


_bo_nho = BoNhoAnhDaGui()


def anh_gui_kem(khach: str, vai: str, cau: str, tim=tim_anh_du_an, bo_nho: BoNhoAnhDaGui | None = None) -> list[str]:
    """Ảnh gửi kèm lượt này: chỉ khi khách KHÔNG phải người bán (người bán nhắc dự án của chính họ)."""
    if vai == "seller":
        return []
    kq = tim(cau)
    if kq is None:
        return []
    if not (bo_nho or _bo_nho).nen_gui(khach, kq.ten):
        return []
    return kq.anh
