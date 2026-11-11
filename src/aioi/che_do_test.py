"""Bảng giá model + quy đô (SRS-5.1zzzzzzz130 → 195), và tin phụ `$$$$$` "đã trích xuất" sau mỗi lượt (bật lại 28/10/2026, SRS-5.1zzzzzzz252).

26/10 chủ dự án bỏ chế độ test `$$$$$` (bên anh Luận không có); 28/10: "vẫn trong giai đoạn test có dòng $ đã trích xuất nữa đi". Nay là công tắc
CHUNG `AIOI_DONG_TRICH_XUAT` (một nguồn `bot/cau-hinh-loi.env`, "bat" / "tat") — áp mọi cuộc chat trong giai đoạn test, tắt một dòng khi chạy thật.
Tin phụ (khuôn bản anh Luận từ SRS-5.1zzzzzzz419: [đã trích xuất] · [bỏ] · [điểm | soạn nháp | hỏi tiếp] · [tốn]) ghép HOÀN TOÀN từ dữ liệu lõi đã ghi — không lượt AI nào viết nên không
bịa, không tốn thêm tiền; KHÔNG vào lịch sử hội thoại / CRM (chỉ nằm trong `replies`), gửi TRƯỚC lời bot (SRS-136). Lỗi → "" (không chặn lượt)."""
from __future__ import annotations

import logging
import os
import re
from typing import TYPE_CHECKING

from .prompts import FIELD_LABELS

if TYPE_CHECKING:  # tránh vòng nhập: engine nhập module này
    from .engine import Conversation

log = logging.getLogger("aioi.che_do_test")

DAU = "$$$$$"


def bat() -> bool:
    """Công tắc tin phụ "đã trích xuất" (SRS-5.1zzzzzzz252) — đọc mỗi lượt, đổi `.env` + khởi động lại lõi là áp."""
    return os.environ.get("AIOI_DONG_TRICH_XUAT", "").strip().lower() == "bat"


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
    s = " ".join(str(x or "").split())
    return s if len(s) <= n else s[: n - 1] + "…"


def _nhan(k: str) -> str:
    return _cat(FIELD_LABELS.get(k, k).split("(")[0].strip() or k, 40)


def _giong(a: object, b: object) -> bool:
    gon = lambda x: " ".join(str(x or "").lower().split())  # noqa: E731
    return gon(a) == gon(b)


def _o_vua_ghi(conv: "Conversation", captured: list[str]) -> list[str]:
    """Ô lượt này ghi, dạng `khoá=giá trị đã lưu` như bản anh Luận (SRS-5.1zzzzzzz419 — bản cũ in nhãn cắt ở "(" nên ra "nhà … → khong").
    Người mua: ô phiếu nhu cầu."""
    if conv.role == "buyer" and conv.buyer_lead is not None:
        bl = conv.buyer_lead
        gom = {"loai_giao_dich": bl.loai_giao_dich, "loai_bds": bl.loai_bds, "ngan_sach": bl.ngan_sach, "khu_vuc": bl.khu_vuc,
               **{k: v for k, v in dict(bl.fields).items() if not str(k).startswith("_")}}
        return [f"{k}={_cat(v, 40)}" for k, v in gom.items() if v and (not captured or k in captured)]
    khach = conv.prop.fields_khach()
    ra = [f"loai_hinh={conv.prop.loai_hinh}"] if "loai_hinh" in (captured or []) and conv.prop.loai_hinh else []
    return ra + [f"{k}={_cat(khach[k], 40)}" for k in captured if k != "loai_hinh" and khach.get(k) not in (None, "")]


def _da_bo(conv: "Conversation") -> list[str]:
    """Ô AI đề xuất mà code bỏ — trả lời "vì sao nó không nhớ"."""
    return [f"{k}={_cat(v, 30)} ({ly})" for k, v, _bc, ly in conv.bo_luot]


def chu_thich(conv: "Conversation", captured: list[str], next_field: str | None = None,
              token: dict[str, dict[str, int]] | None = None, diem: dict | None = None) -> str:
    """Tin phụ sau một lượt theo khuôn bản anh Luận (cli.py: `[đã trích xuất: …]` rồi `[điểm BĐS | uy tín | hạng | hoàn chỉnh]`), mỗi dòng
    một ngoặc vuông: trích xuất · bỏ (nếu có) · điểm + bản nháp + hỏi tiếp · tốn. `diem`: property_score, user_score, tier, completeness
    (cùng số TurnResult). Lỗi bất kỳ → "" (không chặn lượt)."""
    try:
        from .schema import FACET_LABEL
        ghi = _o_vua_ghi(conv, list(captured or []))
        dong = [f"{DAU} [đã trích xuất: " + (", ".join(ghi) if ghi else "không có ô mới") + "]"]
        bo = _da_bo(conv)
        if bo:
            dong.append("[bỏ: " + ", ".join(bo) + "]")
        phan: list[str] = []
        d = diem or {}
        if conv.role != "buyer" and d:
            phan.append(f"điểm BĐS {d.get('property_score', 0):.0f} | uy tín {d.get('user_score', 0):.0f} | hạng {d.get('tier', '?')} "
                        f"| hoàn chỉnh {d.get('completeness', 0):.0%}")
        if conv.role != "buyer":
            trong = conv.prop.facet_trong()
            phan.append("soạn nháp: đủ ✓" if conv.prop.summary_ready() else
                        "soạn nháp: chưa — " + (f"cần {', '.join(conv.prop.minimal_missing())}" if not conv.prop.can_publish()
                                                 else "trống " + ", ".join(FACET_LABEL.get(f, f).lower() for f in trong)))
        if next_field:
            phan.append(f"hỏi tiếp: {next_field}")
        if phan:
            dong.append("[" + " | ".join(phan) + "]")
        dong.append("[" + dong_tien(token).replace("Tốn: ", "tốn ", 1) + "]")
        return "\n".join(dong)
    except Exception as e:  # noqa: BLE001 — tin phụ chỉ để soi, không được làm hỏng lời trả lời khách
        log.warning("che_do_test.chu_thich lỗi: %s", e)
        return ""
