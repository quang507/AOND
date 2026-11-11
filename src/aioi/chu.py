"""Bỏ dấu tiếng Việt — MỘT hàm cho cả lõi (audit Đợt 6, SRS-5.1zzzzzzz321). Trước đây 9 bản viết tay, chỗ giữ hoa thường chỗ không, chỗ quên "đ"."""
from __future__ import annotations

import unicodedata


def bo_dau(s: str | None) -> str:
    """Bỏ dấu, "đ"→"d", chữ thường: `bo_dau("Đồng Nai ĐƯỜNG") == "dong nai duong"`."""
    s = unicodedata.normalize("NFD", (s or "").replace("đ", "d").replace("Đ", "D"))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
