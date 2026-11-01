"""Cấu hình lõi production đọc thẳng từ `bot/bridge-zca/cai-vps.sh` — MỘT nguồn cho test (`tests/conftest.py`) và bộ chấm
(`scripts/cham-kich-ban.py`), SRS-5.1zzzzzzz313 / 316.

cai-vps ghi `.env` lõi bằng một dòng `printf 'AIOI_…=%s\\n…' "$BIEN" …`; giá trị là dòng gán `BIEN="…"` trong cùng tệp."""
from __future__ import annotations

import os
import re

CAI_VPS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bot", "bridge-zca", "cai-vps.sh")


def cong_tac_vps(duong: str = CAI_VPS, nhu: str = "khach") -> dict[str, str]:
    """Biến môi trường lõi mà cai-vps ghi vào `.env` với giá trị gán trong tệp. `nhu="khach"`: giá trị "thu" thành "tat" và model riêng của
    ID thử tắt — ID chấm / ID test là ID thử nên không đổi thì đường khách thật không được đo."""
    chu = open(duong, encoding="utf-8").read()
    dong = next(d for d in chu.splitlines() if d.strip().startswith("printf 'AIOI_"))
    khoa = re.findall(r"([A-Z_]+)=%s", dong)
    bien = re.findall(r'"\$([A-Z_]+)"', dong)
    gan = dict(re.findall(r'(?m)^\s*([A-Z_]+)="([^"]*)"', chu))
    env = {k: gan.get(b, "") for k, b in zip(khoa, bien)}
    if nhu == "khach":
        env = {k: ("tat" if v == "thu" else v) for k, v in env.items()}
        env["AIOI_CHAT_MODEL_THU"] = "tat"
    return env


def cong_tac(duong: str = CAI_VPS) -> dict[str, str]:
    """Chỉ các CÔNG TẮC (không tên model) — phần test offline cần giống production; model do đồ giả quyết."""
    return {k: v for k, v in cong_tac_vps(duong).items() if k.startswith("AIOI_") and "MODEL" not in k}
