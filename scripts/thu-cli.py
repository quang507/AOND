"""Chạy kịch bản chat người bán trên máy mình bằng `claude -p` (quota gói Claude Code) — so model viết lời / bóc tách mà không tốn tiền API
(SRS-5.1zzzzzzz300). KHÔNG đụng Supabase / Zalo: DB tạm, không lưu gì lên kho thật.

  python scripts/thu-cli.py                                  # kịch bản "hht" (chat anh Luận 26/10), viết lời Sonnet 5.5, bóc tách Haiku 5.5
  python scripts/thu-cli.py --chat claude-haiku-5-5          # viết lời bằng Haiku để so
  python scripts/thu-cli.py --kich-ban dat --so-luot 3       # kịch bản khác / chỉ chạy vài lượt đầu

In mỗi lượt: lời bot, ô đã ghi, số lần gọi model, giây, tiền QUY ĐỔI theo giá niêm yết (CLI báo — quota gói không trừ tiền thật).
"""
from __future__ import annotations

import argparse
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

KICH_BAN = {
    # bot/tests/ban-thu-ban.sh kịch bản 9 (chat anh Luận 26/10, SRS-5.1zzzzzzz218)
    "hht": ["Anh cần bán nhà mặt tiền đường Hoàng Hoa Thám, Bình Thạnh", "Phường Gia Định", "ngang 5,2m dài 8m, đất 34,5m2",
            "3 tầng kiên cố, sổ hồng hoàn công rồi", "giá 12,5 tỷ thương lượng nhẹ", "Em rao lại xem",
            "Người ta thuê 1 năm nhưng mà anh có thể bàn giao tức thì mà em",
            "Xin lỗi em anh cũng nhầm căn nhà này mặt tiền có 5 m thôi"],
    # bot/tests/ban-thu-ban.sh kịch bản đất
    "dat": ["bán lô đất thổ cư đường Trần Văn Giàu huyện Bình Chánh", "ngang 5 dài 20, full thổ cư, sổ riêng",
            "đường trước đất rộng 8m, giá 3 tỷ"],
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kich-ban", default="hht", choices=sorted(KICH_BAN))
    ap.add_argument("--chat", default="claude-sonnet-5-5", help="model viết lời")
    ap.add_argument("--boc", default="claude-haiku-5-5", help="model bóc tách")
    ap.add_argument("--so-luot", type=int, default=0, help="chỉ chạy N lượt đầu (0 = hết)")
    a = ap.parse_args()

    os.environ.update({"AIOI_LLM_PROVIDER": "claude_cli", "AIOI_CHAT_MODEL": a.chat, "AIOI_EXTRACT_MODEL": a.boc,
                       "AIOI_SOAT_GON": os.environ.get("AIOI_SOAT_GON", "bat")})
    os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)   # không ghi sổ token / kho thật
    from aioi.config import load_settings
    from aioi.engine import Engine, SqliteConversationStore
    from aioi.llm import build_provider

    settings = load_settings()
    provider = build_provider(settings)
    with tempfile.TemporaryDirectory(prefix="thu-cli-") as d:
        eng = Engine(provider, conversation_store=SqliteConversationStore(os.path.join(d, "thu.db")))
        cau = KICH_BAN[a.kich_ban][: a.so_luot or None]
        print(f"== kịch bản {a.kich_ban} · viết lời {a.chat} · bóc tách {a.boc} · {len(cau)} lượt\n")
        for i, c in enumerate(cau, 1):
            lan, tien, giay = provider.so_lan, provider.tien_quy_doi, time.monotonic()
            r = eng.handle("thu-cli", c)
            conv = eng.conversation("thu-cli")
            o = sorted(k for k, v in conv.prop.fields.items() if not k.startswith("_") and v)
            print(f">> [{i}] {c}\n<< {r.reply}\n   ô: {', '.join(o)}\n   gọi model {provider.so_lan - lan} lần · "
                  f"{time.monotonic() - giay:.1f}s · quy đổi ${provider.tien_quy_doi - tien:.4f}\n")
        print(f"== tổng: {provider.so_lan} lần gọi · ${provider.tien_quy_doi:.4f} quy đổi (quota gói, không trừ tiền API)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
