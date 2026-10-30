"""Chat TAY với bot người bán trên máy mình bằng quota gói Claude Code (`claude -p`) — không tốn tiền API, không đụng Supabase / Zalo
(SRS-5.1zzzzzzz304). Cần: Python ≥ 3.10, `pip install -e .` trong thư mục repo, và Claude Code đã đăng nhập (lệnh `claude` chạy được).

  python scripts/chat-cli.py                         # viết lời Sonnet 5.5, bóc tách Haiku 5.5
  python scripts/chat-cli.py --chat claude-haiku-5-5 # viết lời Haiku để so
  python scripts/chat-cli.py --luu chat.db           # giữ cuộc chat giữa các lần chạy (mặc định DB tạm, thoát là mất)

Gõ tin như khách Zalo, Enter để gửi. Lệnh: /o = xem ô tin đã ghi · /moi = cuộc chat mới · /thoat = thoát.
Mỗi lượt in: lời bot, ô vừa ghi, số lần gọi model, giây, tiền QUY ĐỔI theo giá niêm yết (quota gói không trừ tiền thật).
"""
from __future__ import annotations

import argparse
import os
import sys
import tempfile
import time

GOC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(GOC, "src"))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")   # Windows: in được tiếng Việt / emoji
    sys.stdin.reconfigure(encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chat", default="claude-sonnet-5-5", help="model viết lời")
    ap.add_argument("--boc", default="claude-haiku-5-5", help="model bóc tách")
    ap.add_argument("--luu", default="", help="tệp SQLite giữ cuộc chat (mặc định tạm)")
    a = ap.parse_args()
    os.environ.update({"AIOI_LLM_PROVIDER": "claude_cli", "AIOI_CHAT_MODEL": a.chat, "AIOI_EXTRACT_MODEL": a.boc})
    for k, v in (("AIOI_SOAT_GON", "bat"), ("AIOI_FORM_BAN_GON", "bat"), ("AIOI_FORM_MUA_GON", "bat")):
        os.environ.setdefault(k, v)   # như VPS
    os.environ.pop("SUPABASE_SERVICE_ROLE_KEY", None)
    import logging
    logging.disable(logging.WARNING)
    from aioi.config import load_settings
    from aioi.engine import Engine, SqliteConversationStore
    from aioi.llm import build_provider

    p = build_provider(load_settings())
    tam = None if a.luu else tempfile.TemporaryDirectory(prefix="chat-cli-")
    eng = Engine(p, conversation_store=SqliteConversationStore(a.luu or os.path.join(tam.name, "chat.db")))
    key, so = "thu-tay", 0
    print(f"== chat tay · viết lời {a.chat} · bóc tách {a.boc} · /o xem ô · /moi chat mới · /thoat\n")
    while True:
        try:
            c = input("Khách> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not c:
            continue
        if c == "/thoat":
            break
        if c == "/moi":
            so += 1
            key = f"thu-tay-{so}"
            print("-- cuộc chat mới\n")
            continue
        if c == "/o":
            conv = eng.conversation(key)
            print(f"   loại: {conv.prop.loai_hinh or '—'} · cho thuê: {conv.prop.is_rental} · số căn: {len(conv.listings)}")
            for k, v in sorted(conv.prop.fields.items()):
                if v and not k.startswith("_"):
                    print(f"   {k}: {v}")
            print()
            continue
        lan, tien, giay = p.so_lan, p.tien_quy_doi, time.monotonic()
        try:
            r = eng.handle(key, c)
        except Exception as e:
            print(f"   [LỖI {type(e).__name__}: {e}]\n")
            continue
        print(f"Bot> {r.reply}\n   ô vừa ghi: {', '.join(r.captured) or '—'} · gọi model {p.so_lan - lan} lần · "
              f"{time.monotonic() - giay:.1f}s · quy đổi ${p.tien_quy_doi - tien:.4f}\n")
    print(f"== tổng {p.so_lan} lần gọi · ${p.tien_quy_doi:.4f} quy đổi (quota gói, không trừ tiền API)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
