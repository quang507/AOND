"""Số điện thoại Việt Nam — MỘT mẫu gốc cho mọi chỗ che / nhận SĐT trong lõi (audit Đợt 1, AU-01, SRS-5.1zzzzzzz317).

Trước đây có 6 bản regex, mỗi bản bắt một kiểu. Lưới che sổ đỏ chỉ bắt 10 số liền, nên "0900 000 123" lọt qua. Bản che tin gốc
`\\d[\\d .-]{7,}\\d` thì che cả giá "12.500.000.000". Nay mọi chỗ dựng từ các mảnh dưới đây. SQL `public.che_sdt` chép NGUYÊN chuỗi
`MAU_SDT` (bài `test_sdt_317` so chuỗi trong migration), và `bun run doi-chieu:sdt` chạy cả hai bản trên `bot/tests/luat/sdt.json`.

Viết sao cho Python `re` và Postgres ARE hiểu như nhau: dùng `[0-9]` thay `\\d` (vì `\\d` của Python bắt cả chữ số Unicode), dùng dấu ngăn
`[ .-]` thay `\\s`, và không có cờ."""
from __future__ import annotations

import re

NGAN = "[ .-]"                                    # một dấu ngăn giữa hai chữ số: cách, chấm, gạch
TRUOC = "(?<![0-9])(?<![0-9][.,])"                # không bắt từ giữa một con số ("12.500.000.000"); gạch không phải dấu của tiền nên
                                                  # "0900000123-0900000124" là hai số (SRS-5.1zzzzzzz317, review)
SAU = "(?![0-9])(?![.,][0-9])"                    # không cắt ngang một dãy số dài hơn
KHONG_PHAI_TIEN = "(?![0-9]{1,3}(?:[.,][0-9]{3}){2,}(?![0-9]))"   # nhóm 1–3 số rồi ≥ 2 nhóm ".000" là tiền ("84.500.000.000")
# Đầu số: "(+84)", "+84", "84" (được kèm số 0 thừa: "+84 0900…"), hoặc "0".
DAU = r"\(\+84\)[ .-]?0?|\+84[ .-]?0?|84[ .-]?0?|0"

# SĐT để CHE: đầu +84 / 84 / 0, rồi 9 số (di động) hoặc 10 số (bàn, 02x). Nhóm 2–4 là ba số đầu sau đầu số, để giữ dạng `0903xxxxxx`.
MAU_SDT = (TRUOC + KHONG_PHAI_TIEN + f"({DAU})" + f"{NGAN}?([1-9]){NGAN}?([0-9]){NGAN}?([0-9])(?:{NGAN}?[0-9]){{6,7}}" + SAU)
_SDT = re.compile(MAU_SDT)

# NHẬN DIỆN, không phải che. Đọc số khách gửi (`mua.tim_sdt`) và nhận dãy GIỐNG SĐT nhưng sai độ dài (`mua.giong_sdt_sai`, 7–13 số).
# Cùng ranh giới, đầu số và dấu ngăn với `MAU_SDT`, chỉ khác số chữ số.
SDT_DOC = re.compile(TRUOC + KHONG_PHAI_TIEN + f"(?:{DAU})" + f"(?:{NGAN}?[0-9]){{8,10}}" + SAU)
GIONG_SDT = re.compile(TRUOC + KHONG_PHAI_TIEN + f"(?:{DAU})" + f"(?:{NGAN}?[0-9]){{6,12}}" + SAU)


def che_sdt(text: str | None, thay: str | None = None) -> str:
    """Che mọi SĐT trong `text`. Mặc định giữ 4 số đầu theo quy ước `0903xxxxxx` của CLAUDE.md §5, đúng như SQL `public.che_sdt` trả.
    Truyền `thay` thì cả số được thay bằng chuỗi đó ("[đã ẩn]", "[số]"…)."""
    if not text:
        return text or ""
    if thay is not None:
        return _SDT.sub(lambda _m: thay, text)
    return _SDT.sub(lambda m: f"0{m.group(2)}{m.group(3)}{m.group(4)}xxxxxx", text)


# ── Số giấy tờ (CCCD / CMND) — cùng ranh giới với SĐT. Chỉ lõi Python dùng (SQL `che_sdt` không che giấy tờ). ──
# CCCD: 12 số, mở đầu bằng 0 (mã tỉnh 001–096), liền hoặc có dấu ngăn ("079 200 000 001"). Nhìn-sau chặn cả "<chữ/số>-" để đuôi UUID
# "…-9c33-000000000001" không bị che.
CCCD = re.compile("(?<![0-9])(?<![0-9A-Za-z][.,-])" + f"0(?:{NGAN}?[0-9]){{11}}" + SAU)   # không chặn dạng tiền: tiền không mở đầu 0, "079.200.000.004" là CCCD
# CMND 9 số trùng dạng giá viết trần ("850000000"), nên chỉ che khi đứng ngay sau chữ CMND / CCCD / chứng minh / căn cước.
CMND_CANH_CHU = re.compile(r"(?i)((?:cmnd|cccd|căn cước(?: công dân)?|chứng minh(?: nhân dân)?)\s*(?:số\s*)?[:：]?\s*)"
                           f"([0-9](?:{NGAN}?[0-9]){{8}})" + SAU)


def che_giay_to(text: str | None, thay: str) -> str:
    """Che số CCCD (12 số, liền hoặc có dấu ngăn) và CMND 9 số đứng sát chữ CMND / CCCD."""
    if not text:
        return text or ""
    text = CCCD.sub(lambda _m: thay, text)
    return CMND_CANH_CHU.sub(lambda m: m.group(1) + thay, text)


def che_so_ca_nhan(text: str | None, thay: str) -> str:
    """Che số giấy tờ rồi SĐT — cho chỗ ghi lời khách vào kho / tin nội bộ / văn bản nhúng (tin gốc, `supabase_store`). Giấy tờ che TRƯỚC để
    mẫu SĐT không ăn vào giữa một số CCCD có dấu ngăn."""
    return che_sdt(che_giay_to(text, thay), thay)
