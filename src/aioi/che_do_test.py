"""Chế độ test (SRS-5.1zzzzzzz130). Chủ dự án 22/10/2026: gõ `$$$$$` rồi "mỗi tin nhắn đều có 1 tin `$$$$$` … đã trích xuất thông tin gì, đã hiểu gì",
"từ tin nhắn đầu luôn, viết từ code"; sau đó: "gõ $$$$$ lúc chào thì mới vào chế độ test, xóa hết data cũ, không cần thông báo". Gõ `$$$$$` xoá
phiên + bật chế độ cho người đó, bot IM (không trả lời lệnh); từ tin kế tiếp, sau MỖI lượt bot trả lời, server gửi thêm MỘT tin phụ bắt đầu bằng `$$$$$`, ghép HOÀN TOÀN từ dữ liệu lõi đã ghi (ô tin, cờ lượt AI đã đọc và code đã kiểm trích dẫn) — không có lượt AI nào viết tin này nên
không bịa được và không tốn thêm tiền.

Tin phụ KHÔNG vào lịch sử hội thoại, kho tin nhắn CRM hay `_ban_tin_da_trinh` (chỉ nằm trong `replies` của phản hồi), nên model không đọc lại nó.
Mọi hàm ở đây chỉ ĐỌC `Conversation`, không ghi gì; lỗi thì trả "" — tin phụ không bao giờ làm hỏng lượt trả lời khách."""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

from .prompts import FIELD_LABELS

if TYPE_CHECKING:  # tránh vòng nhập: engine nhập module này
    from .engine import Conversation

log = logging.getLogger("aioi.che_do_test")

DAU = "$$$$$"


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


def _cat(x: object, n: int = 70) -> str:
    t = " ".join(str(x if x is not None else "").split())
    return t if len(t) <= n else t[:n].rstrip() + "…"


def _nhan(k: str) -> str:
    """Nhãn ngắn của ô: phần trước dấu ngoặc của nhãn hỏi khách ("phường / xã (cũ hay mới…)" → "phường / xã"); không có nhãn → tên ô."""
    return _cat(FIELD_LABELS.get(k, k).split("(")[0].strip() or k, 40)


def _giong(a: object, b: object) -> bool:
    gon = lambda x: " ".join(str(x or "").lower().split())  # noqa: E731
    return gon(a) == gon(b)


def _o_vua_ghi(conv: "Conversation", captured: list[str]) -> list[str]:
    """Ô lượt này ghi, mỗi ô một đoạn ngắn: `nhãn "cụm khách nói" → "giá trị chuẩn" (đổi từ "cũ")`. Người mua: ô phiếu."""
    ra: list[str] = []
    if conv.role == "buyer" and conv.buyer_lead is not None:
        bl = conv.buyer_lead
        gom = {"loai_giao_dich": bl.loai_giao_dich, "loai_bds": bl.loai_bds, "ngan_sach": bl.ngan_sach, "khu_vuc": bl.khu_vuc, **dict(bl.fields)}
        for k, v in gom.items():
            if v and (not captured or k in captured):
                ra.append(f"{_nhan(k)} \"{_cat(v, 40)}\"")
        return ra
    khach = conv.prop.fields_khach()
    cung_can = conv.truoc_id == conv.active_listing_id
    for k in captured:
        if k not in khach or khach[k] in (None, ""):
            continue
        trich = conv.bc_luot.get(k)
        dong = f"{_nhan(k)} \"{_cat(trich or khach[k], 40)}\""
        if trich and not _giong(trich, khach[k]):
            dong += f" → \"{_cat(khach[k], 40)}\""
        cu = conv.truoc_luot.get(k) if cung_can else None
        if cu and not _giong(cu, khach[k]):
            dong += f" (đổi từ \"{_cat(cu, 30)}\")"
        ra.append(dong)
    return ra


def _da_bo(conv: "Conversation") -> list[str]:
    """Ô AI đề xuất mà code bỏ — trả lời "vì sao nó không nhớ"."""
    return [f"{_nhan(k)} \"{_cat(v, 30)}\" vì {ly}" for k, v, _bc, ly in conv.bo_luot]


def chu_thich(conv: "Conversation", captured: list[str], next_field: str | None = None,
              token: dict[str, dict[str, int]] | None = None) -> str:
    """Tin phụ sau một lượt, tối đa 4 dòng: Ghi · Bỏ (nếu có) · Thiếu / hỏi tiếp · Tốn. Lỗi bất kỳ → "" (không chặn lượt)."""
    try:
        ghi = _o_vua_ghi(conv, list(captured or []))
        dong = [f"{DAU} Ghi: " + (" · ".join(ghi) if ghi else "không có ô mới")]
        bo = _da_bo(conv)
        if bo:
            dong.append("Bỏ: " + " · ".join(bo))
        phan: list[str] = []
        if conv.role != "buyer":
            thieu = conv.prop.missing_fields()
            phan.append("Thiếu: " + (", ".join(_nhan(x) for x in thieu[:5]) or "không") + (" …" if len(thieu) > 5 else "")
                        + ("" if conv.prop.summary_ready() else " (chưa đủ soạn nháp)"))
        if next_field:
            phan.append(f"Hỏi tiếp: {_nhan(next_field)}")
        ngoai = conv.y_luot.get("ngoai_vung") or (conv.prop.fields.get("_ngoai_vung") if conv.role != "buyer" else None)
        if ngoai:
            phan.append(f"NGOÀI vùng: {_cat(ngoai, 30)}")
        if phan:
            dong.append(" · ".join(phan))
        dong.append(dong_tien(token))
        return "\n".join(dong)
    except Exception as e:  # noqa: BLE001 — tin phụ chỉ để soi, không được làm hỏng lời trả lời khách
        log.warning("che_do_test.chu_thich lỗi: %s", e)
        return ""
