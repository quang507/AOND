"""Local REPL to chat with the assistant family. Run: python cli.py

Works offline (mock provider) with no API key; set ANTHROPIC_API_KEY in .env for real
Claude replies. Type /quit to exit, /state to dump captured data + scores.
"""
from __future__ import annotations

import os
import sys
import time

# Vietnamese output needs UTF-8; Windows consoles default to cp1252.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    except (AttributeError, ValueError):  # pragma: no cover
        pass

# Dòng chi phí đã có `$extract` / `$chat` ở dưới; tắt log stderr cùng nội dung của sổ token (so_token) để khỏi in lặp trong terminal.
os.environ.setdefault("AIOI_LOG_COST", "0")

from aioi import che_do_test, so_token
from aioi.config import load_settings
from aioi.delivery import chunk_reply, typing_delay
from aioi.drive import make_folder_namer, make_resolver
from aioi.engine import Engine, SqliteConversationStore
from aioi.fetch import FetchError
from aioi.llm import build_provider
from aioi.projects import SqliteProjectStore
from aioi.kho_tep import LocalDirectoryMediaStore

USER = "demo-seller"

# Set AIOI_TYPING=0 to disable the paced "typing" delivery (e.g. for fast demos).
TYPING_ENABLED = os.getenv("AIOI_TYPING", "1") != "0"


def _emit_reply(name: str, reply: str) -> None:
    """Release the reply as Zalo-style bubbles, paced to feel like real typing. Every bubble is
    LEFT-ALIGNED (no indent) so multi-bubble replies are easy to read; the name prefix labels the
    first bubble only."""
    bubbles = chunk_reply(reply) or [reply]
    for i, bubble in enumerate(bubbles):
        if TYPING_ENABLED and i > 0:
            time.sleep(typing_delay(bubble))
        print(f"{name}> {bubble}" if i == 0 else bubble)


def main() -> None:
    settings = load_settings()
    provider = build_provider(settings)
    media_store = LocalDirectoryMediaStore("kho_tep_thu")   # chạy thử trên máy: tệp ghi ra thư mục, không lên Supabase
    engine = Engine(
        provider,
        resolver=make_resolver(settings.google_api_key),
        folder_namer=make_folder_namer(settings.google_api_key),
        project_store=SqliteProjectStore(settings.db_path),
        conversation_store=SqliteConversationStore(settings.db_path),
        media_store=media_store,
        max_photos_per_listing=settings.max_photos_per_listing,
    )

    print(f"AI Ơi Nhà Đất — chế độ: {settings.effective_provider}")
    # 19/10/2026 (anh Luận 84b0155 + 790cc18): bỏ /new, /switch, /sold, /status — mở căn mới, chuyển căn, đổi trạng thái đều đi
    # từ lời nhắn ("anh có căn nữa", "qua căn 42", "bán rồi", "cọc rồi"), như khách thật trên Zalo.
    print("Lệnh: /quit · /state · /listings · "
          "/import <file.csv> · /project <mô tả> · /link <url> · /seller <id> · /whoami.\n")

    # The ACTIVE seller identity. Each user_key is a separate seller (own basket, price_book,
    # history); the project registry is GLOBAL, so switching seller is how you test that shared
    # project knowledge is reused across sellers. `/seller <id>` switches; `/whoami` shows it.
    user = USER

    def _greet_if_new(u: str) -> None:
        # Greet a brand-new seller (no prior history) — introduce the assistant + seller-only
        # boundary. A returning seller (restored from DB) isn't re-greeted.
        if engine.is_new_conversation(u):
            _emit_reply(engine.conversation(u).assistant.name, engine.greeting(u))
            print()

    print(f"[seller hiện tại: {user}]")
    _greet_if_new(user)

    while True:
        try:
            text = input("Bạn> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not text:
            continue
        if text == "/quit":
            break
        if text == "/whoami":
            conv = engine.conversation(user)
            print(f"   [seller hiện tại: {user} | trợ lý: {conv.assistant.name} | "
                  f"rổ hàng: {len(conv.listings)} căn]\n")
            continue
        if text.startswith("/seller"):
            arg = text[len("/seller"):].strip()
            if not arg:
                print(f"   [seller hiện tại: {user} — dùng /seller <id> để đổi identity]\n")
                continue
            user = arg
            conv = engine.conversation(user)
            print(f"   [đã chuyển sang seller: {user} | rổ hàng: {len(conv.listings)} căn "
                  f"| kho dự án là CHUNG, dùng lại được]")
            _greet_if_new(user)
            continue
        if text == "/state":
            _dump_state(engine, user)
            continue
        if text == "/listings":
            conv = engine.conversation(user)
            print(f"--- Rổ hàng ({len(conv.listings)} căn) ---")
            for i, li in enumerate(conv.listings, 1):
                active = " ← đang nhập" if li.listing_id == conv.active_listing_id else ""
                print(f"  {i}. {li.label()}{active}")
            print()
            continue
        if text.startswith("/import "):
            arg = text[len("/import "):].strip().strip('"')
            try:
                if arg.startswith(("http://", "https://")):
                    print("   [đang tải bảng tính...]")
                    n = engine.import_from_url(user, arg)
                else:
                    with open(arg, encoding="utf-8-sig") as f:
                        n = engine.import_csv(user, f.read())
            except (OSError, FetchError) as e:
                print(f"   [không nhập được: {e}]\n")
                continue
            print(f"   [đã nhập {n} căn vào rổ hàng]\n")
            continue
        if text.startswith("/project "):
            proj = engine.register_project_from_text(text[len("/project "):].strip(), voter=user)
            if proj:
                print(f"   [đã đăng ký dự án: {proj.name} | tiện ích: "
                      f"{', '.join(proj.amenities) or '—'}]\n")
            else:
                print("   [không nhận diện được tên dự án]\n")
            continue

        # Pasted link(s) → AOND auto-detects (spreadsheet → import; photo/PDF → read).
        # Any words sent WITH the link (e.g. "tôi bán 2 căn Cosmo Gen 2 trong này") are kept
        # as a caption so the seller's intent isn't dropped (it scopes a price-list import).
        rest = text[6:].strip() if text.startswith("/link ") else text
        urls = [u for u in rest.split() if u.startswith(("http://", "https://"))]
        caption = " ".join(u for u in rest.split() if not u.startswith(("http://", "https://"))).strip()
        try:
            if len(urls) == 1:
                print("   [đang xử lý link...]")
                result = engine.handle_link(user, urls[0], caption=caption or None)
            elif urls:
                print(f"   [đang đọc {len(urls)} link...]")
                result = engine.handle_media_batch(user, urls, caption=caption or None)
            else:
                result = engine.handle(user, text)
        except Exception as e:  # one bad turn (API/network error) must NOT kill the session
            msg = str(e)
            if "credit balance is too low" in msg:
                print("   [⚠️ Hết credit Anthropic API. Nạp credit, hoặc chạy chế độ offline: "
                      "PowerShell → $env:AIOI_LLM_PROVIDER=\"mock\"; python cli.py]\n")
            else:
                print(f"   [⚠️ Lỗi khi xử lý tin nhắn — bỏ qua lượt này: {type(e).__name__}: {msg[:200]}]\n")
            continue
        _in_chi_phi()   # `$extract` rồi `$chat` — in TRƯỚC lời bot, ngắn gọn y như bản anh Luận
        _emit_reply(result.assistant_name, result.reply)
        if result.captured:
            print(f"   [đã trích xuất: {', '.join(result.captured)}]")
        print(
            f"   [điểm BĐS {result.property_score} | uy tín {result.user_score} "
            f"| hạng {result.tier} | hoàn chỉnh {result.completeness:.0%}]\n"
        )


def _in_chi_phi() -> None:
    """Mỗi mục đích gọi model của lượt vừa rồi một dòng: `[ $extract · haiku-4-5 · in=1940 cache_r=6439 out=199 · ~$0.0036]` (extract trước, chat sau;
    chỉ in ô cache khi khác 0; tên model bỏ tiền tố "claude-"). Không có gì để in (model giả / không gọi AI) thì im."""
    thu_tu = {"extract": 0, "chat": 1}
    for (nhan, model), so in sorted(so_token.tong_luot_theo_nhan().items(), key=lambda kv: (thu_tu.get(kv[0][0], 9), kv[0])):
        usd = che_do_test.tien_usd(model, so)
        cache = "".join(f" {k}={so[v]}" for k, v in (("cache_w", "p_cache_write"), ("cache_r", "p_cache_read")) if so[v])
        ten = model[len("claude-"):] if model.startswith("claude-") else model
        print(f"   [ ${nhan or 'goi'} · {ten} · in={so['p_in']}{cache} out={so['p_out']} · "
              + (f"~${usd:.4f}" if usd is not None else "chưa rõ giá") + "]")


def _dump_state(engine: Engine, user: str) -> None:
    """Everything AOND has BÓC TÁCH (extracted) for this seller — cùng nội dung lệnh /state trên Zalo (`aioi.lenh_zalo.trang_thai`, SRS-5.1zzzzzzz211)."""
    from aioi.lenh_zalo import DAU_DEBUG, trang_thai
    print()
    for b in trang_thai(engine, user):
        print(b[len(DAU_DEBUG):])
    print()


if __name__ == "__main__":
    sys.exit(main())
