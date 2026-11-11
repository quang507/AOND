"""Bỏ dấu tiếng Việt — MỘT hàm cho cả lõi (audit Đợt 6, SRS-5.1zzzzzzz321). Trước đây 9 bản viết tay, chỗ giữ hoa thường chỗ không, chỗ quên "đ"."""
from __future__ import annotations

import unicodedata


def bo_dau(s: str | None) -> str:
    """Bỏ dấu, "đ"→"d", chữ thường: `bo_dau("Đồng Nai ĐƯỜNG") == "dong nai duong"`."""
    s = unicodedata.normalize("NFD", (s or "").replace("đ", "d").replace("Đ", "D"))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


import re

TU_BDS_CO_DAU = {
    "bán", "thuê", "mua", "nhà", "đất", "căn hộ", "chung cư", "dự án", "biệt thự",
    "phòng", "kho", "xưởng", "tỷ", "triệu", "tỏi", "củ", "m2", "mét", "quận", "huyện",
    "phường", "xã", "đường", "giá", "lô", "mặt tiền", "hẻm", "sổ hồng", "sổ đỏ",
    "diện tích", "tầng", "lầu", "ký gửi", "gửi bán", "xem nhà", "hẹn xem", "giỏ hàng"
}

TU_BDS_KHONG_DAU = {
    "thue", "mua", "dat", "can ho", "chung cu", "du an", "biet thu",
    "phong", "kho", "xuong", "ty", "trieu", "toi", "cu", "m2", "met", "quan", "huyen",
    "phuong", "xa", "duong", "gia", "lo", "mat tien", "hem", "so hong", "so do",
    "dien tich", "tang", "lau", "ky gui", "gui ban", "xem nha", "hen xem", "gio hang"
}

TU_CHAO = (
    "em oi", "alo", "alo em", "alo bot", "alo ad", "chao em", "chao ban", "chao bot", "chao ad",
    "chao", "hi", "hello", "hi em", "hello em", "hi bot", "hello bot", "hi ad", "hello ad",
    "ad oi", "bot oi", "ban oi", "admin oi", "nha dat oi", "e oi",
    "co ai khong", "co ai o day khong", "co ai truc khong", "co ai online khong",
    "tu van giup", "tu van dum", "tu van ho", "cho hoi", "cho minh hoi",
    "cho em hoi", "cho anh hoi", "cho chi hoi", "em co do khong", "ad co do khong",
    "chao nha dat", "tu van", "ho tro"
)

DUOI_BO_QUA = {
    "nha", "nhe", "nhen", "nghen", "a", "da", "oi", "ko", "khong", "ne", "ha",
    "voi", "ti", "chut", "xiu", "minh", "ti nhe", "chut nhe", "ti nha", "chut nha",
    "chut a", "xiu a"
}


def la_tin_chao_hoi_thuan_tuy(noi_dung: str | None) -> bool:
    """Nhận diện tin chào hỏi thuần tuý không chứa thông tin BĐS (SRS-5.1zzzzzzz402).
    Dùng cho Fast-path: bỏ qua bóc tách 70.000 ký tự khi khách chỉ chào hỏi ("em ơi", "alo", "chào em"...)."""
    if not noi_dung:
        return False
    raw = str(noi_dung).strip().lower()
    if len(raw) > 70 or re.search(r"\d", raw):
        return False

    # Kiểm tra từ khoá BĐS có dấu trước
    for w in TU_BDS_CO_DAU:
        if re.search(r"\b" + re.escape(w) + r"\b", raw):
            return False

    s = bo_dau(raw)
    clean = re.sub(r"[^a-z0-9\s]", " ", s)
    words = clean.split()
    if not words or len(words) > 8:
        return False
    clean_str = " ".join(words)

    for w in TU_BDS_KHONG_DAU:
        if re.search(r"\b" + re.escape(w) + r"\b", clean_str):
            return False

    # Từ 'ban': nếu có 'ban' mà không phải chào bạn/bạn ơi -> coi là 'bán'
    if "ban" in words and not any(p in clean_str for p in ("chao ban", "ban oi", "giup ban", "voi ban", "hoi ban")):
        return False

    # Từ 'nha': nếu có 'nha' mà không phải ở cuối câu hoặc đi sau em/nhe/giup/chut/nha dat -> coi là 'nhà'
    if "nha" in words:
        if "nha dat" in clean_str:
            pass
        elif not (clean_str.endswith(" nha") or any(p in clean_str for p in ("em nha", "nhe nha", "giup nha", "chut nha", "nhi nha"))):
            return False

    # Khớp câu chào
    for c in TU_CHAO:
        if clean_str == c:
            return True
        if clean_str.startswith(c + " "):
            duoi = clean_str[len(c):].strip()
            if duoi in DUOI_BO_QUA or any(duoi.endswith(" " + d) or duoi == d for d in DUOI_BO_QUA):
                return True
        if clean_str.endswith(" " + c):
            dau = clean_str[:-len(c)].strip()
            if dau in ("xin", "da", "da xin", "em", "anh", "chi", "minh"):
                return True
    return False

