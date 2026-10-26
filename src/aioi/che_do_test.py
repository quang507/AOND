"""Bảng giá model + quy đô cho `cli.py` (SRS-5.1zzzzzzz130 → SRS-5.1zzzzzzz195). Từ 26/10/2026 chủ dự án bỏ chế độ test `$$$$$` (tin phụ debug trên Zalo):
bên anh Luận không có, chỉ có `cli.py` in số liệu ra terminal. Còn lại ở đây DUY NHẤT bảng giá (chép từ `lib/gia-model.ts`, test so từng dòng) và hàm
quy token ra đô — `cli.py` dùng để in dòng `$extract` / `$chat` mỗi lượt."""
from __future__ import annotations

import re


# Bảng giá MỘT NGUỒN là lib/gia-model.ts (đô / 1 triệu chữ-máy). Chép lại ở đây vì VPS chỉ có src/aioi; tests/test_che_do_test.py so từng dòng
# với file đó và đỏ khi lệch. Khớp theo tiền tố ID model, cụ thể trước. (tiền tố, vào, ra, đọc-cache-nếu-khác-0,1×)
BANG_GIA: tuple[tuple[str, float, float, float | None], ...] = (
    (r"claude-haiku-5-5", 0.1, 0.5, None),
    (r"claude-haiku-4-5", 1, 5, None),
    (r"claude-sonnet-4-6", 3, 15, None),
    (r"claude-sonnet-4-5", 3, 15, None),
    (r"claude-sonnet-5-5", 2, 10, 0.1),
    (r"claude-sonnet-5", 2, 10, None),
    (r"claude-opus-5-5", 4, 20, 0.2),
    (r"claude-opus-4-8", 5, 25, None),
    (r"claude-opus-(5|4-[67])", 5, 25, None),
    (r"(Groq|Gemini):", 0, 0, None),
)
HE_SO_NAP_5M = 1.25   # ghi cache 5 phút = 1,25× giá vào (lõi Python, như HE_SO_NAP_5M ở gia-model.ts)
HE_SO_DOC = 0.1       # đọc cache = 0,1× giá vào


def gia_cua(model: str) -> tuple[float, float, float | None] | None:
    for mau, vao, ra, doc in BANG_GIA:
        if re.match("^" + mau, model or ""):
            return vao, ra, doc
    return None


def tien_usd(model: str, so: dict[str, int]) -> float | None:
    """Đô của token một model; None = chưa có giá (không đoán)."""
    g = gia_cua(model)
    if g is None:
        return None
    vao, ra, doc = g
    return (so.get("p_in", 0) * vao + so.get("p_out", 0) * ra + so.get("p_cache_write", 0) * vao * HE_SO_NAP_5M
            + so.get("p_cache_read", 0) * (doc if doc is not None else vao * HE_SO_DOC)) / 1_000_000


def _k(n: int) -> str:
    return f"{n / 1000:.1f}k" if n >= 1000 else str(n)


def dong_tien(token: dict[str, dict[str, int]] | None) -> str:
    """Một dòng "Tốn": đô + token vào / ra theo model. Không có lượt gọi AI nào → nói rõ, không đoán."""
    if not token:
        return "Tốn: $0 (không gọi AI)"
    tong, ro, phan = 0.0, True, []
    for model, so in sorted(token.items()):
        t = tien_usd(model, so)
        if t is None:
            ro = False
        else:
            tong += t
        phan.append(f"{model} vào {_k(so['p_in'])} ra {_k(so['p_out'])}" + ("" if t is not None else " chưa rõ giá"))
    return f"Tốn: ${tong:.4f}" + ("" if ro else "+") + " (" + " | ".join(phan) + ")"
