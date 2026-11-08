"""Khoá chung chặng nội bộ bridge ↔ lõi (SRS-5.1zzzzzzz400, audit N3 + C5, 08/11/2026).

"Chỉ nghe 127.0.0.1" không phải ranh giới tin cậy trên máy 146 (dashboard công khai, OpenWA, Radar, nhiều user Windows): tiến trình nào
trên máy cũng gọi được `/chat-reply`, `/reset/{id}` của lõi và `/send` của bridge. Hai phía cùng đọc `AIOI_NOI_BO_KEY` (lõi: `.env` của
lõi; bridge: `bot/bridge-zca/.env`) và gửi / kiểm header `x-noi-bo-key`, so hằng thời gian.

Thiếu khoá thì TỪ CHỐI (503), không lặng lẽ mở như `BRIDGE_SECRET` thời đầu — quên đặt khoá phải lộ ngay chứ không chạy trần.
"""
from __future__ import annotations

import hmac
import os

TEN_HEADER = "x-noi-bo-key"
ENV = "AIOI_NOI_BO_KEY"


def khoa() -> str:
    return os.environ.get(ENV, "").strip()


def dau_gui() -> dict[str, str]:
    """Header kèm mọi request lõi gửi bridge (`/send`). Không có khoá thì không gửi gì — bridge sẽ từ chối và log rõ."""
    k = khoa()
    return {TEN_HEADER: k} if k else {}


def kiem(gia_tri: str | None) -> int:
    """0 = qua; 503 = lõi chưa đặt khoá; 401 = thiếu / sai khoá."""
    k = khoa()
    if not k:
        return 503
    if not gia_tri or not hmac.compare_digest(gia_tri.strip().encode("utf-8"), k.encode("utf-8")):
        return 401
    return 0
