"""Cấu hình lõi production đọc từ `bot/cau-hinh-loi.env` — nguồn cho bộ chấm
(`scripts/cham-kich-ban.py`; bộ pytest dùng chung đã gỡ 13/11/2026, SRS-5.1zzzzzzz469), SRS-5.1zzzzzzz313 / 316.

SRS-5.1zzzzzzz401: bỏ VPS — trước đây đọc dòng `printf 'AIOI_…'` + dòng gán `BIEN="…"` trong `bot/bridge-zca/cai-vps.sh` (nay ở
`bot/bridge-zca/archive/`). Tệp mới là `KHOA=giatri` thuần, cùng tên biến với `.env` lõi trên máy 146."""
from __future__ import annotations

import os
import re

TEP_CAU_HINH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bot", "cau-hinh-loi.env")


def doc_tep(duong: str = TEP_CAU_HINH) -> dict[str, str]:
    """Các dòng `KHOA=giatri` (bỏ dòng trống / chú thích `#`), giữ nguyên giá trị như lõi đọc từ `.env`."""
    env: dict[str, str] = {}
    for dong in open(duong, encoding="utf-8").read().splitlines():
        m = re.match(r"^\s*([A-Z][A-Z0-9_]*)=(.*)$", dong)
        if m:
            env[m.group(1)] = m.group(2).strip()
    return env


def cong_tac_vps(duong: str = TEP_CAU_HINH, nhu: str = "khach") -> dict[str, str]:
    """Biến môi trường lõi production. `nhu="khach"`: giá trị "thu" thành "tat" và model riêng của ID thử tắt — ID chấm / ID test là ID
    thử nên không đổi thì đường khách thật không được đo. (Tên hàm giữ từ thời VPS để khỏi đổi mọi chỗ gọi.)"""
    env = doc_tep(duong)
    if nhu == "khach":
        env = {k: ("tat" if v == "thu" else v) for k, v in env.items()}
        env["AIOI_CHAT_MODEL_THU"] = "tat"
    return env


def cong_tac(duong: str = TEP_CAU_HINH) -> dict[str, str]:
    """Chỉ các CÔNG TẮC (không tên model) — phần test offline cần giống production; model do đồ giả quyết."""
    return {k: v for k, v in cong_tac_vps(duong).items() if k.startswith("AIOI_") and "MODEL" not in k}
