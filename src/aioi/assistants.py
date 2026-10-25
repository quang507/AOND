"""Đại gia đình Trợ lý ảo — the virtual-assistant name family.

Names are formed from a Vietnamese initial consonant + the suffix "•ai", giving a
friendly, local-feeling roster (b•ai, c•ai, t•ai, m•ai, ...). Each assistant is
assigned deterministically so the same user/property keeps the same persona, and
two roles are reserved for the buyer-side / seller-side bot-to-bot flow.
"""
from __future__ import annotations

from dataclasses import dataclass

# Kho 13 tên dạng "phụ âm • vần ai" — chấm giữa tách phụ âm đầu khỏi vần; thêm hay bớt dấu vẫn là từ có nghĩa
# (SRS-5.1zzzzzzz183, chủ dự án 25/10/2026: "Ph•ái L•ài Ho•ài dc 3 cái này nữa, tên vẫn có cái chấm giữa").
# Chỉ thêm tên chủ dự án duyệt; các tên người thật đời đầu (Thảo, Hương, Linh, Tuấn…) đã gỡ ở SRS-5.1zzzzzzz182.
ASSISTANT_NAMES: list[str] = [
    "Th•ái", "M•ai", "H•ải", "L•ai", "Kh•ải", "T•ài", "Đ•ại", "Đ•ài", "Nh•ài", "Gi•ai",
    "Ph•ái", "L•ài", "Ho•ài",
]

# Tên mặc định đại diện cho nhánh Người bán và Người mua
SELLER_ASSISTANT = "Th•ái"   # phụ trách Người bán (tiếp nhận, làm giàu dữ liệu)
BUYER_ASSISTANT = "M•ai"     # phụ trách Người mua (lọc khách, hẹn lịch)


@dataclass(frozen=True)
class Assistant:
    name: str
    role: str  # "seller" | "buyer"


def assign_assistant(key: str, role: str = "seller") -> Assistant:
    """Pick a stable assistant persona for a conversation key (e.g. user id).

    The buyer side is always M•ai and the seller side defaults to T•ai, matching the
    bot-to-bot handoff in the SRD. Other personas rotate by a hash of the key so the
    roster feels varied without being random per-message.
    """
    if role == "buyer":
        return Assistant(BUYER_ASSISTANT, "buyer")

    # Seller side: stable per key, but spread across the roster.
    idx = sum(ord(c) for c in key) % len(ASSISTANT_NAMES)
    name = ASSISTANT_NAMES[idx]
    return Assistant(name, "seller")
