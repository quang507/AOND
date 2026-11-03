"""Message delivery pacing — split a long reply into Zalo-style message bubbles.

We never truncate the model's reply. But a long reply dumped as one giant message
reads badly on chat. Instead we split it into a sequence of shorter messages and let
the sender release them one at a time with a small "typing" delay, like a real person.

This module is pure (no I/O): `chunk_reply` decides the bubbles, `typing_delay` says
how long to pause before each. The actual sleeping/sending lives in the caller (the CLI
now, the Zalo adapter later), so the pacing is identical everywhere and easy to test.
"""
from __future__ import annotations

import re

# A comfortable single Zalo bubble. Shorter replies are sent whole; longer ones split.
DEFAULT_MAX_CHARS = 100   # SRS-5.1zzzzzzz136 (22/10: "nhắn dài thì tách ra"): 160 → 100, câu khen dài và câu hỏi thành hai tin

# SRS-5.1zzzzzzz145: không cắt sau chữ viết tắt địa chỉ ("P. An Nhơn" bị cắt thành hai bong bóng "…Quang Trung, P." / "An Nhơn…", chat thử 23/10).
_SENTENCE_BREAK = re.compile(r"(?<!\bP\.)(?<!\bQ\.)(?<!\bTP\.)(?<!\bTp\.)(?<!\bTT\.)(?<=[.!?…])\s+")


def _is_formatted_post(text: str) -> bool:
    """A listing AD / structured post — has the 📋 draft marker, a bullet list or a '---' divider. These must be
    delivered as ONE message so their blank lines and bullet layout survive; splitting them into
    bubbles (and dropping the blank lines between bubbles) is what made ads unreadable
    (anh Luận ffd3684, 19/10/2026)."""
    # Bản nháp 📋 (dấu bot tự đặt ở dòng mở, SRS-5.1zzzzzzz121): bản tin không có gạch đầu dòng (model viết đoạn liền, vd tin nhà phố
    # "Kết cấu … Hướng …") vẫn phải đi MỘT tin nhắn — trước đây chỉ nhận bản có gạch nên bản không gạch bị tách năm bong bóng.
    if "📋" in text:
        return True
    # Khối mã ``` (lệnh `json` của tester, SRS-5.1zzzzzzz141): cắt giữa khối là hỏng cú pháp — đi MỘT tin.
    if "```" in text:
        return True
    for raw in text.split("\n"):
        s = raw.strip()
        if s.startswith(("- ", "• ", "* ", "– ")) or s in ("---", "***", "___"):
            return True
    return False


def tach_ban_tin(reply: str) -> tuple[str, str, str]:
    """Lượt có bản tin 📋 → (câu chat trước 📋, nguyên khối bản tin từ 📋, câu chốt sau bản tin). Không có 📋 → (cả lời, "", "").
    Chỉ cắt theo bố cục, không đọc ý (SRS-5.1zzzzzzz219): câu chốt = đoạn cuối đứng SAU câu mời nhắn Zalo (khối 4 của AD_FORMAT) hoặc
    có "?", không phải dòng gạch đầu. Một nguồn cho lưới soát phần chat (`engine._phan_chat_quanh_ban_tin`) và tách tin gửi Zalo
    (SRS-5.1zzzzzzz373: chủ dự án 03/11 "câu này tách ra")."""
    reply = reply or ""
    if "📋" not in reply:
        return reply.strip(), "", ""
    truoc, sau = reply.split("📋", 1)
    doan = [d.strip() for d in re.split(r"\n\s*\n", sau) if d.strip()]
    zalo = [i for i, d in enumerate(doan) if "zalo" in d.lower()]
    cuoi = doan[-1] if doan else ""
    la_chot = len(doan) >= 2 and not cuoi.lstrip().startswith("-") and ("?" in cuoi or bool(zalo and zalo[-1] < len(doan) - 1))
    than = sau.rstrip()
    if la_chot:
        than = than[:than.rfind(cuoi)].rstrip()
    return truoc.strip(), ("📋" + than).strip(), cuoi if la_chot else ""


def tach_tin_ban_tin(reply: str) -> list[str]:
    """Bong bóng Zalo cho lượt có bản tin: câu chat trước, bản tin NGUYÊN KHỐI, câu chốt — ba tin riêng (phần chat vẫn qua `chunk_reply`)."""
    truoc, ban, chot = tach_ban_tin(reply)
    if not ban:
        return [truoc] if truoc else []
    return [*(chunk_reply(truoc) if truoc else []), ban, *(chunk_reply(chot) if chot else [])]


def chunk_reply(reply: str, *, max_chars: int = DEFAULT_MAX_CHARS) -> list[str]:
    """Split a reply into sequential message bubbles for paced delivery.

    - A short, single-line reply stays as ONE bubble.
    - A FORMATTED POST (an ad: bullets / '---' dividers) stays WHOLE — one bubble — so its blank
      lines and layout are preserved (never fragment a formatted listing ad).
    - Otherwise: blank lines are paragraph breaks → always start a new bubble.
    - Consecutive short lines are grouped up to ~max_chars (so a bulleted listing
      doesn't explode into dozens of tiny bubbles).
    - A single line longer than max_chars is split on sentence boundaries (never
      mid-word — we don't truncate).
    """
    text = reply.strip()
    if not text:
        return []
    if len(text) <= max_chars and "\n" not in text:
        return [text]
    if _is_formatted_post(text):
        return [text]

    chunks: list[str] = []
    buf: list[str] = []
    buf_len = 0

    def flush() -> None:
        nonlocal buf, buf_len
        if buf:
            chunks.append("\n".join(buf).strip())
            buf = []
            buf_len = 0

    def add_unit(unit: str) -> None:
        nonlocal buf_len
        if buf and buf_len + len(unit) + 1 > max_chars:
            flush()
        buf.append(unit)
        buf_len += len(unit) + 1

    for raw in text.split("\n"):
        line = raw.rstrip()
        if line == "":
            flush()
            continue
        if len(line) <= max_chars:
            add_unit(line)
        else:
            # Over-long line: break into sentences and let them group by size.
            flush()
            for sentence in _SENTENCE_BREAK.split(line):
                add_unit(sentence)
            flush()
    flush()
    return [c for c in chunks if c]


def typing_delay(
    chunk: str,
    *,
    chars_per_second: float = 25.0,
    min_delay: float = 0.3,
    max_delay: float = 2.0,
) -> float:
    """Seconds to 'type' a bubble before sending it, clamped to a sane range.

    Proportional to length so short lines feel snappy and long ones get a real pause
    for the reader. Tune the bounds (or set chars_per_second high) to speed it up.
    """
    seconds = len(chunk) / chars_per_second
    return max(min_delay, min(seconds, max_delay))
