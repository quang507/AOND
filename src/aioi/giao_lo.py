"""Ngã tư → phường cho người bán (18/10/2026, docs/07 SRS-5.1zzzzzzz43).

Chủ dự án: "bot sẽ biết bds … ở đường này gần đường kia". Khách tả vị trí bằng ngã tư ("nhà gần ngã tư Lê Văn Sỹ – Trần Huy Liệu")
thì AI bóc tách ghi ô `gan_nga_tu` = "Lê Văn Sỹ | Trần Huy Liệu" (đọc theo nghĩa, prompts.EXTRACTION_SYSTEM); ở đây chỉ TRA bảng
`giao_lo` (20261018f, OSM) bằng hai tên đó qua `giao_lo_cua`. Ngã tư nằm trong đúng MỘT phường → điền `phuong` (+ `quan` nếu trống),
khỏi hỏi lại khách; nhiều phường (đường cắt nhau ở hai nơi) hay không có → không điền gì, bot hỏi như thường.
Lỗi mạng / DB → không điền, không làm hỏng lượt trả lời.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.request

log = logging.getLogger("aioi.giao_lo")


def _thong_tin() -> tuple[str, str]:
    goc = os.environ.get("SUPABASE_URL", "https://rqxmmqmctpklqcmbfxuj.supabase.co").rstrip("/")
    if goc.endswith("/rest/v1"):
        goc = goc[: -len("/rest/v1")]
    return goc, os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def giao_lo_cua(duong1: str, duong2: str) -> list[dict]:
    """Các ngã tư của hai đường (rpc giao_lo_cua). Không có khoá / lỗi → []."""
    goc, khoa = _thong_tin()
    if not khoa:
        return []
    req = urllib.request.Request(
        f"{goc}/rest/v1/rpc/giao_lo_cua",
        data=json.dumps({"p_duong1": duong1, "p_duong2": duong2}).encode("utf-8"),
        headers={"apikey": khoa, "Authorization": f"Bearer {khoa}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            kq = json.loads(resp.read().decode("utf-8"))
    except Exception as e:  # noqa: BLE001 — tra ngã tư là phần thêm
        log.warning("giao_lo_cua lỗi: %s", e)
        return []
    return kq if isinstance(kq, list) else []


def dia_ban_tu_nga_tu(gan_nga_tu: str | None, tra=giao_lo_cua) -> dict[str, str] | None:
    """"A | B" (ô AI) → {"phuong", "quan"} khi ngã tư nằm trong đúng một phường; còn lại None."""
    ten = [t.strip() for t in str(gan_nga_tu or "").split("|") if t.strip()]
    if len(ten) != 2:
        return None
    dong = tra(ten[0], ten[1])
    phuong = {d.get("phuong") for d in dong if d.get("phuong")}
    if len(phuong) != 1:
        return None
    p = phuong.pop()
    quan = next((d.get("quan_cu") for d in dong if d.get("phuong") == p and d.get("quan_cu")), None)
    return {"phuong": p, **({"quan": quan} if quan else {})}
