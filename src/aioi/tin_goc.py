"""Tin nhắn GỐC của người bán, gom theo từng căn để nhúng vector (SRS-5.1zzzzzzz142). Chủ dự án 22/10/2026: "lưu tin nhắn gốc của người ta nhắn
để sau dễ tìm hơn", "lưu luôn vào trường, không cần sửa làm chuẩn", "không thêm cột". Chữ giữ NGUYÊN VĂN (không viết lại, không chuẩn hoá); chỉ
bỏ lượt không có thông tin (ngắn, lệnh, dấu `[Khách gửi …]`) và che số điện thoại — che SĐT là bắt buộc (repo công khai, §5), không phải chuẩn hoá.
Lưu ở `listing_noi_bo.du_lieu->'tin_goc'` (bảng chỉ admin đọc, KHÔNG phải `listings.boc_tach` vì cột đó đọc công khai); `van_ban_nhung` nối vào văn bản
nhúng. Hàm thuần — không I/O, tính lại từ lịch sử mỗi lần lưu nên ghi lặp không đẻ trùng."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

MIN_CHU = 20            # ngắn hơn thì là "ok", "ừ", "dạ em" — không mang thông tin về căn
TOI_DA_CHU = 3000       # trần văn bản nhúng của phần này (`van_ban_nhung` cũng cắt 3000); giữ các tin MỚI nhất
_SDT = re.compile(r"\d[\d .-]{7,}\d")
_LENH = {"json", "/json", "xem json", "check json", "thong tin", "thong_tin"}
_VN = timezone(timedelta(hours=7))


def la_tin_co_thong_tin(text: str) -> bool:
    t = (text or "").strip()
    if len(t) < MIN_CHU or t.startswith(("$$$$$", "[")) or t.lower() in _LENH:
        return False
    return any(c.isalpha() for c in t)


def gom_tin_goc(turns: Iterable[Any], bat_dau: int, ket_thuc: int, *, toi_da: int = TOI_DA_CHU) -> str:
    """Lượt `user` có thông tin trong `turns[bat_dau:ket_thuc]` (đúng khoảng của MỘT căn), mỗi lượt một dòng "dd/mm: nguyên văn", SĐT che.
    Quá `toi_da` chữ thì bỏ lượt CŨ nhất trước. Không có lượt nào → ""."""
    dong: list[str] = []
    for t in list(turns)[bat_dau:ket_thuc]:
        if getattr(t, "role", None) != "user" or not la_tin_co_thong_tin(getattr(t, "content", "")):
            continue
        ngay = datetime.fromtimestamp(float(getattr(t, "at", 0) or 0), _VN).strftime("%d/%m")
        dong.append(f"{ngay}: {_SDT.sub('[số]', ' '.join(t.content.split()))}")
    giu: list[str] = []
    tong = 0
    for d in reversed(dong):
        if giu and tong + len(d) + 1 > toi_da:
            break
        giu.append(d[:toi_da])
        tong += len(d) + 1
    return "\n".join(reversed(giu))
