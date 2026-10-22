"""Đọc sticker Zalo theo NGHĨA (SRS-5.1zzzzzzz122, 22/10/2026).

Chủ dự án gửi sticker thỏ vẫy tay "HI!" — bot chỉ thấy chuỗi "[khách gửi sticker]" nên đáp "Em nhận được sticker của anh rồi ạ" rồi hỏi
tiếp câu đang dở, không biết khách đang CHÀO ("hello này nó biết là sticker thôi à, ko biết là hello à" → "thì dùng gemini đi"). Bridge
(zca-js `getStickersDetail`) gửi kèm link ảnh sticker + nhãn chữ của Zalo; ở đây một lượt đọc ảnh rẻ (Gemini trước, Claude sau cùng) trả
`y_nghia` (một trong vài loại) + mô tả ngắn. Code chỉ NỐI chữ: AI đọc nghĩa, không có luật từ khoá nào đoán sticker.

Sticker KHÔNG BAO GIỜ là đồng ý / ghi vào tin (SRS-5.1zzzzzzz22): dù AI đọc ra "đồng ý", chữ đưa vào hội thoại vẫn mang dấu
"[khách gửi sticker", engine nhận dấu đó bằng `la_sticker` (tiền tố, không so nguyên chuỗi). Chỉ `chao` đổi thành lời chào "hello" — cùng
đường làm mới phiên như khách gõ "hello" (quyết định chủ dự án 20/10).
"""
from __future__ import annotations

import logging
import re
from typing import Any

from .fetch import FetchError, fetch_media

log = logging.getLogger(__name__)

STICKER_TRUNG_TINH = "[khách gửi sticker]"      # bridge gán khi chưa đọc được nghĩa (zca-js không cho sắc thái)
DAU_STICKER = "[khách gửi sticker"              # mọi dạng chữ về sticker đều mở bằng tiền tố này
CHAO_NHU_GO = "hello"                           # sticker chào → như khách gõ lời chào (đường làm mới phiên cũ)

Y_NGHIA = ("chao", "cam_on", "tam_biet", "dong_y", "vui", "buon_gian", "khac")

SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "y_nghia": {"type": "string", "enum": list(Y_NGHIA),
                    "description": "Sticker này thể hiện điều gì: chao (vẫy tay / chữ hi, hello, chào), cam_on, tam_biet, dong_y (ok, gật, "
                                   "tim, like), vui, buon_gian (khóc, giận, thất vọng), khac."},
        "mo_ta": {"type": "string", "description": "Tối đa 12 từ tiếng Việt: hình gì + chữ in trên nhãn (nếu có). Chỉ điều NHÌN THẤY."},
    },
    "required": ["y_nghia", "mo_ta"],
}

_HUONG_DAN = ("Đây là một STICKER (nhãn dán) khách gửi trong chat Zalo với trợ lý bất động sản. Cho biết sticker thể hiện điều gì "
              "(y_nghia) và mô tả ngắn điều nhìn thấy: hình gì, chữ in trên nhãn. Không đoán chuyện nhà đất, không thêm điều không thấy.")


def la_sticker(chu: str) -> bool:
    """Lời khách là dấu sticker của bridge / của bước đọc này (cả "[khách gửi sticker]" lẫn "[khách gửi sticker: …]")."""
    return (chu or "").strip().startswith(DAU_STICKER)


def _sach(mo_ta: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[\[\]\n\r]", " ", mo_ta or "")).strip()[:90]


def ra_van_ban(kq: dict[str, Any] | None) -> str:
    """Kết quả đọc → chữ đưa vào hội thoại. Thiếu / hỏng → chuỗi trung tính cũ."""
    if not isinstance(kq, dict):
        return STICKER_TRUNG_TINH
    y, mo_ta = str(kq.get("y_nghia") or ""), _sach(str(kq.get("mo_ta") or ""))
    if y == "chao":
        return CHAO_NHU_GO
    if y not in Y_NGHIA or not mo_ta:
        return STICKER_TRUNG_TINH
    return f"{DAU_STICKER}: {mo_ta}]"


def doc_sticker(provider: Any, url: str, nhan: str = "") -> str:
    """Tải ảnh sticker (rào SSRF của `fetch_media`) → một lượt đọc ảnh → chữ cho hội thoại. Lỗi nào cũng trả chuỗi trung tính — sticker
    không được làm hỏng lượt chat."""
    try:
        anh = fetch_media(url, max_bytes=2 * 1024 * 1024, timeout=6)
        if not anh.media_type.startswith("image/"):
            return STICKER_TRUNG_TINH
        doc = getattr(provider, "extract_media_re", None) or provider.extract_media     # Gemini trước nếu có, không thì đường chính
        huong_dan = _HUONG_DAN + (f" Nhãn chữ Zalo gắn cho sticker: \"{_sach(nhan)}\"." if _sach(nhan) else "")
        return ra_van_ban(doc([(anh.data, anh.media_type)], huong_dan, SCHEMA))
    except FetchError as e:
        log.warning("sticker: không tải được ảnh (%s)", type(e).__name__)
    except Exception as e:  # noqa: BLE001 — không để sticker làm hỏng lượt
        log.warning("sticker: đọc hỏng (%s)", type(e).__name__)
    return STICKER_TRUNG_TINH
