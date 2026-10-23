"""FastAPI app — Webhook and Bridge endpoint for AI Ơi Nhà Đất (AOND).
Serves:
  - GET  /health: health check
  - POST /message: native AOND API
  - POST /chat-reply: full compatibility endpoint with Zalo Bridge (zca-js) from Nhadat.cc
  - POST /trigger-followup/{user_key}: test/trigger immediate inactivity follow-up
Run: uvicorn aioi.server:app --reload --port 8000
"""
from __future__ import annotations

import logging
import re
import threading
import time
from datetime import datetime, timezone

from fastapi import FastAPI
from pydantic import BaseModel

from . import cau_mau
from .anh_du_an import anh_gui_kem
from .anh_can import anh_can_gui_kem
from .config import load_settings
from .delivery import chunk_reply, typing_delay
from .sticker import STICKER_TRUNG_TINH, doc_sticker
from .drive import khoa_drive, make_folder_namer, make_resolver
from .dia_danh import TraDiaDanh
from .giao_lo import dia_ban_tu_nga_tu
from .han_muc import HanMuc
from .engine import Engine, SqliteConversationStore
from .followup import followup_manager
from .llm import build_provider
from .projects import SqliteProjectStore, SupabaseProjectStore
from .kho_anh import SupabaseMediaStore
from .kho_tep import LocalDirectoryMediaStore, MediaStore
from .so_token import SoToken
from .supabase_sync import sync_to_supabase_async
from .voice import is_audio_file, transcribe_voice_url

log = logging.getLogger("aioi.server")
_co_khoa_drive = False  # /health báo có khoá Drive hay không (không bao giờ in giá trị khoá)


def _kho_du_an(settings):
    """Kiến thức dự án: Supabase (bảng du_an_kien_thuc) khi có service_role; lần đầu chép từ SQLite cũ trên VPS sang."""
    sqlite = SqliteProjectStore(settings.db_path)
    if not settings.supabase_service_role_key:
        return sqlite
    kho = SupabaseProjectStore(settings.supabase_url, settings.supabase_service_role_key)
    try:
        kho._khoa()   # bảng có, mạng tới được
    except Exception as e:  # noqa: BLE001 — bảng chưa có / mạng lỗi: chạy tiếp bằng SQLite, không câm bot
        log.warning("Kho dự án Supabase chưa dùng được (%s) — dùng SQLite", e)
        return sqlite

    # Chép phần còn thiếu từ SQLite chạy NỀN: lượt chép đầu 19/10 chạy ngay lúc khởi động (hàng nghìn dự án, ~3 dự án / giây)
    # nên lõi không trả lời /health trong nhiều phút, cai-vps báo hỏng và bot im suốt lúc đó.
    def _chep() -> None:
        try:
            n = kho.chep_tu(sqlite)
            if n:
                log.info("Đã chép %s dự án từ SQLite sang du_an_kien_thuc", n)
        except Exception as e:  # noqa: BLE001
            log.warning("Chép dự án sang Supabase dừng giữa chừng (%s) — lần khởi động sau chép tiếp", e)

    import threading
    threading.Thread(target=_chep, daemon=True).start()
    return kho


def _init_engine() -> Engine:
    settings = load_settings()
    provider = build_provider(settings)

    # Ảnh / tài liệu: Supabase Storage khi có service_role (bản chạy thật — web đọc listing_media); không có thì thư mục trên
    # máy cho chạy thử. SharePoint đã bỏ (SRS-5.1zzzzzzz56).
    media_store: MediaStore
    if settings.supabase_service_role_key:
        media_store = SupabaseMediaStore(settings.supabase_url, settings.supabase_service_role_key)
    else:
        media_store = LocalDirectoryMediaStore("kho_tep_thu")

    sqlite_store = SqliteConversationStore(settings.db_path)
    if settings.supabase_service_role_key:
        from .supabase_store import SupabaseConversationStore
        conv_store = SupabaseConversationStore(
            url=settings.supabase_url,
            key=settings.supabase_service_role_key,
            fallback_store=sqlite_store,
        )
        log.info("Initialized SupabaseConversationStore (Single Source of Truth) at %s", settings.supabase_url)
        cau_mau.dang_ky(conv_store.cau_mau_tu_kho)   # câu mẫu chủ dự án sửa ở CRM (SRS-5.1zzzzzzz106)
    else:
        conv_store = sqlite_store
        log.info("Initialized local SqliteConversationStore at %s", settings.db_path)

    global _co_khoa_drive
    khoa = khoa_drive(settings.google_api_key, settings.supabase_url, settings.supabase_service_role_key)
    _co_khoa_drive = bool(khoa)
    return Engine(
        provider,
        resolver=make_resolver(khoa),
        folder_namer=make_folder_namer(khoa),
        project_store=_kho_du_an(settings),
        conversation_store=conv_store,
        media_store=media_store,
        max_photos_per_listing=settings.max_photos_per_listing,
        nga_tu_resolver=dia_ban_tu_nga_tu,
        dia_danh=TraDiaDanh.tu_cau_hinh(settings.supabase_url, settings.supabase_service_role_key, settings.gemini_api_keys),
    )


_settings = load_settings()
_engine = _init_engine()
# Sổ lỗi cho sự cố ngoài lượt gọi model (SRS-5.1zzzzzzz76: tin thoại không chép được chỉ nằm ở journal, CRM không thấy).
_so_loi = SoToken.tu_cau_hinh(_settings.supabase_url, _settings.supabase_service_role_key)
# Trần lượt trả lời mỗi người + cả ngày (SRS-5.1zzzzzzz53) — chặn TRƯỚC mọi lượt gọi model / Whisper.
_han_muc = HanMuc.tu_cau_hinh(_settings.supabase_url, _settings.supabase_service_role_key)

app = FastAPI(title="AI Ơi Nhà Đất (AOND) API", version="0.2.0")


class IncomingMessage(BaseModel):
    user_key: str        # Zalo user id (sender)
    text: str = ""       # message text (or links / commands)
    audio_url: str | None = None


class Reply(BaseModel):
    assistant_name: str
    reply: str
    captured: list[str]
    next_field: str | None
    property_score: float
    user_score: float
    tier: str
    completeness: float


# Zalo Bridge zca-js compatible models
class ZaloBridgePayload(BaseModel):
    external_user_id: str = ""
    sender_name: str | None = None
    user_name: str | None = None
    text: str = ""
    image_urls: list[str] = []
    image_url: str | None = None
    file_url: str | None = None
    file_name: str | None = None
    sticker_url: str | None = None      # link ảnh sticker (bridge, zca-js getStickersDetail) — SRS-5.1zzzzzzz122
    sticker_text: str | None = None     # nhãn chữ Zalo gắn cho sticker (có thể trống)
    msg_id: str | None = None
    channel: str | None = None
    mark_sent: str | None = None
    sent_bubbles: int | None = None
    done: bool | None = None


class ZaloBridgeResponse(BaseModel):
    reply: str
    replies: list[str]
    nhip_go: list[int]
    assistant_name: str
    captured: list[str]
    next_field: str | None
    property_score: float
    user_score: float
    tier: str
    completeness: float
    # Ảnh dự án khách vừa nhắc tên (anh_du_an.py) — bridge tải về và gửi sau các bong bóng chữ (FR-143).
    photos: list[str] = []
    # ms từng khâu của lượt (lap_thao_tac / tra_loi / ghi_kho / con_lai / tong) — chỉ con số, để đo chỗ chậm (SRS-5.1zzzzzzz86).
    thoi_gian_ms: dict[str, int] = {}


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "provider": _settings.effective_provider,
        "chat_model": _settings.chat_model,
        "stt": "groq-whisper" if _settings.groq_api_key else "disabled",
        "drive": "api-key" if _co_khoa_drive else "khong-khoa",
        "dia_danh": ("tat" if not _settings.supabase_service_role_key else "chu+nghia" if _settings.gemini_api_keys else "chu"),
    }


@app.post("/message", response_model=Reply)
def message(msg: IncomingMessage) -> Reply:
    if not _han_muc.cho_phep(msg.user_key):
        return Reply(assistant_name="", reply="", captured=[], next_field=None, property_score=0.0,
                     user_score=0.0, tier="", completeness=0.0)
    incoming_text = msg.text or ""
    if msg.audio_url and is_audio_file(msg.audio_url):
        log.info("Voice note received at /message from %s", msg.user_key)
        transcribed = transcribe_voice_url(
            msg.audio_url,
            groq_api_key=_settings.groq_api_key,
            model=_settings.groq_whisper_model,
        )
        if transcribed:
            incoming_text = f"[Tin nhắn thoại của khách]: \"{transcribed}\""
        else:
            incoming_text = "[Khách gửi tin nhắn thoại nhưng âm thanh bị rè hoặc không nghe rõ tiếng]"

    with _engine.khoa_luot(msg.user_key):   # SRS-5.1zzzzzzz84
        r = _engine.handle(msg.user_key, incoming_text)
    cleaned_reply = r.reply.replace("**", "")

    # Cancel previous follow-up timer for this user and schedule a new 5-minute inactivity follow-up
    followup_manager.cancel_followup(msg.user_key)
    if r.role == "seller" and r.completeness < 1.0:
        followup_manager.schedule_followup(
            user_key=msg.user_key,
            engine=_engine,
            role=r.role,
        )

    sync_to_supabase_async(
        external_user_id=msg.user_key,
        incoming_text=incoming_text,
        bot_reply=cleaned_reply,
        role=r.role,
    )
    return Reply(
        assistant_name=r.assistant_name,
        reply=cleaned_reply,
        captured=r.captured,
        next_field=r.next_field,
        property_score=r.property_score,
        user_score=r.user_score,
        tier=r.tier,
        completeness=r.completeness,
    )


# Lượt hỏng (SRS-5.1zzzzzzz82): câu giữ chỗ không đổ lỗi cho mạng, không bắt khách gõ lại; luồng nền thử lại sau THU_LAI_SAU giây.
# Câu mặc định; câu đang dùng đọc qua cau_mau (chủ dự án sửa ở CRM, SRS-5.1zzzzzzz106).
CAU_GIU_CHO = cau_mau.MAC_DINH["giu_cho"][0]
CAU_THU_LAI_HONG = cau_mau.MAC_DINH["thu_lai_hong"][0]
THU_LAI_SAU = 20


def _gui_bridge(user_key: str, text: str) -> None:
    """Gửi một tin chủ động qua bridge (cùng cổng /send bộ nhắc 5 phút dùng)."""
    import json
    import urllib.request
    from .followup import BRIDGE_SEND_URL
    req = urllib.request.Request(BRIDGE_SEND_URL, data=json.dumps({"threadId": user_key, "message": text}).encode("utf-8"),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10):
        pass


_CAU_DAN_THUA = re.compile(r"(?is)(?:^|(?<=\n))\s*Còn\s+(?:một|1)\s+điểm\s+em\s+cần\s+nắm\s+thêm\s*[:：]\s*")


def _thu_lai_nen(user_key: str, lam, moc: int, sau_hong: int, ten: str | None) -> None:
    """Thử lại lượt hỏng ở luồng nền. Khách đã nhắn tin mới trong lúc chờ (lịch sử dài hơn lúc hỏng) thì thôi — lượt mới đã đọc cả tin
    cũ. Trước khi chạy lại, cắt lịch sử về mốc trước lượt hỏng để tin khách không bị ghi hai lần. Vẫn hỏng → xin lỗi + báo người."""
    def chay() -> None:
        time.sleep(THU_LAI_SAU)
        try:
            with _engine.khoa_luot(user_key):   # SRS-5.1zzzzzzz84: không chạy chồng lên lượt khách vừa nhắn
                conv = _engine.conversation(user_key)
                if len(conv.history) != sau_hong:
                    return
                del conv.history[moc:]
                r = lam()
            loi = r.reply.replace("**", "").strip()
            _gui_bridge(user_key, loi)
            sync_to_supabase_async(external_user_id=user_key, incoming_text="", bot_reply=loi, role=r.role, user_name=ten)
        except Exception as e:  # noqa: BLE001
            _so_loi.ghi_loi("chat-reply thu lai", f"thử lại vẫn hỏng: {type(e).__name__}: {e}"[:200])
            try:
                _gui_bridge(user_key, cau_mau.cau("thu_lai_hong"))
            except Exception as e2:  # noqa: BLE001
                _so_loi.ghi_loi("chat-reply thu lai", f"gửi lời xin lỗi qua bridge hỏng: {type(e2).__name__}"[:200])
            sync_to_supabase_async(external_user_id=user_key, incoming_text="", bot_reply=cau_mau.cau("thu_lai_hong"), user_name=ten)
            _bao_can_nguoi_nen(user_key, "(hệ thống: lượt trả lời hỏng hai lần)", ten, "seller")

    threading.Thread(target=chay, daemon=True).start()


def _bao_can_nguoi_nen(user_key: str, trich: str, ten: str | None, role: str) -> None:
    bao = getattr(_engine._convstore, "bao_can_nguoi", None)
    if bao is None:
        return

    def chay() -> None:
        try:
            if not bao(user_key, trich, ten, role):
                _so_loi.ghi_loi("bao can nguoi", "không tìm / tạo được hội thoại để bật cờ cần người")
        except Exception as e:  # noqa: BLE001 — khách đã được trả lời; lỗi báo admin phải nằm trong sổ, không im
            _so_loi.ghi_loi("bao can nguoi", f"{type(e).__name__}: {e}"[:200])

    threading.Thread(target=chay, daemon=True).start()


def _ghi_danh_gia_nen(user_key: str, xin: bool, danh_gia: tuple[int, str] | None, ten: str | None, role: str) -> None:
    kho = _engine._convstore
    if getattr(kho, "ghi_danh_gia", None) is None:
        return

    def chay() -> None:
        try:
            if danh_gia:
                kho.ghi_danh_gia(user_key, danh_gia[0], danh_gia[1], ten, role)
            if xin:
                kho.ghi_xin_danh_gia(user_key, role, ten)
        except Exception as e:  # noqa: BLE001 — khách đã được trả lời; lỗi ghi điểm phải nằm trong sổ, không im
            _so_loi.ghi_loi("danh gia ai", f"{type(e).__name__}: {e}"[:200])

    threading.Thread(target=chay, daemon=True).start()


# Tin chữ xếp hàng chờ lượt của từng khách (SRS-5.1zzzzzzz91). Bridge đã gom tin gõ liền trong 2,5 s, nhưng khách nhắn tiếp LÚC BOT
# CÒN SOẠN thì mỗi tin chờ khoá lượt rồi chạy thành một lượt riêng — chat tester 20/10: 3 tin trong 18 giây → 3 bản tin trong 20 giây.
# Nay lượt nào giữ khoá thì gom MỌI tin chữ đang chờ của khách đó vào một lượt; tin đã được gom thì không chạy lượt nữa.
_cho_khoa = threading.Lock()
_cho_tin: dict[str, list[tuple[int, str]]] = {}
_cho_so = 0


def _xep_cho(uk: str, text: str) -> int:
    global _cho_so
    with _cho_khoa:
        _cho_so += 1
        _cho_tin.setdefault(uk, []).append((_cho_so, text))
        return _cho_so


def _lay_cho(uk: str, so: int) -> list[str] | None:
    """Trong khoá lượt: mọi tin chữ đang chờ của khách, theo thứ tự đến. Tin `so` đã được lượt trước gom → None."""
    with _cho_khoa:
        ds = _cho_tin.get(uk) or []
        if all(n != so for n, _ in ds):
            return None
        _cho_tin.pop(uk, None)
        return [t for _, t in ds]


@app.post("/chat-reply", response_model=ZaloBridgeResponse)
def chat_reply(payload: ZaloBridgePayload) -> ZaloBridgeResponse:
    t_vao = time.perf_counter()   # SRS-5.1zzzzzzz96: tổng thời gian máy chủ (gồm chờ khoá lượt, đọc ảnh / tin thoại, sau lượt)
    if payload.mark_sent:
        return ZaloBridgeResponse(
            reply="ok",
            replies=[],
            nhip_go=[],
            assistant_name="",
            captured=[],
            next_field=None,
            property_score=0.0,
            user_score=0.0,
            tier="",
            completeness=0.0,
        )

    # Vượt trần người / ngày → bot im (bridge không gửi gì khi replies rỗng), không gọi model lẫn Whisper.
    if not _han_muc.cho_phep(payload.external_user_id):
        return ZaloBridgeResponse(reply="", replies=[], nhip_go=[], assistant_name="", captured=[], next_field=None,
                                  property_score=0.0, user_score=0.0, tier="", completeness=0.0)

    nhan_luc = datetime.now(timezone.utc).isoformat()   # giờ lõi nhận tin — CRM đo thời gian bot trả lời (SRS-5.1zzzzzzz82)
    zalo_name = payload.sender_name or payload.user_name

    # Admin đang giữ hội thoại (nút "giữ" trên /admin/tin-nhan) → bot im, chỉ ghi lời khách vào CRM cho admin đọc (SRS-5.1zzzzzzz82).
    giu = getattr(_engine._convstore, "dang_giu_hoi_thoai", None)
    if giu is not None and giu(payload.external_user_id):
        followup_manager.cancel_followup(payload.external_user_id)
        sync_to_supabase_async(external_user_id=payload.external_user_id, incoming_text=(payload.text or "").strip()
                               or "[Khách gửi tin nhắn]", bot_reply="", zalo_msg_id=payload.msg_id, user_name=zalo_name,
                               nhan_luc=nhan_luc)
        return ZaloBridgeResponse(reply="", replies=[], nhip_go=[], assistant_name="", captured=[], next_field=None,
                                  property_score=0.0, user_score=0.0, tier="", completeness=0.0)

    # 1. Check if incoming file/message is a voice note
    audio_url = None
    if payload.file_url and is_audio_file(payload.file_url, payload.file_name):
        audio_url = payload.file_url
    elif "[Khách gửi tin nhắn thoại" in payload.text and payload.file_url:
        audio_url = payload.file_url

    # 2. Separate image URLs from audio URLs
    media_urls = []
    if payload.image_urls:
        for u in payload.image_urls:
            if u and isinstance(u, str) and u.strip() and u.strip() not in media_urls:
                if not is_audio_file(u):
                    media_urls.append(u.strip())
                elif not audio_url:
                    audio_url = u.strip()

    if payload.image_url and payload.image_url.strip() and payload.image_url.strip() not in media_urls:
        if not is_audio_file(payload.image_url):
            media_urls.append(payload.image_url.strip())
        elif not audio_url:
            audio_url = payload.image_url.strip()

    if payload.file_url and payload.file_url.strip() and payload.file_url.strip() not in media_urls and not audio_url:
        # Non-audio file (e.g. PDF / DOCX)
        media_urls.append(payload.file_url.strip())

    incoming_text = payload.text.strip() if payload.text else ""

    # 3. Handle Voice Note transcription via Groq Whisper API
    if audio_url or "[Khách gửi tin nhắn thoại" in incoming_text:
        if audio_url:
            log.info("Voice note detected from %s: %s", payload.external_user_id, audio_url)
            transcribed = transcribe_voice_url(
                audio_url,
                groq_api_key=_settings.groq_api_key,
                model=_settings.groq_whisper_model,
            )
            if transcribed:
                log.info("Voice note transcribed for %s: '%s'", payload.external_user_id, transcribed)
                incoming_text = f"[Tin nhắn thoại của khách]: \"{transcribed}\""
            else:
                log.warning("Voice note transcription failed for %s", payload.external_user_id)
                incoming_text = "[Khách gửi tin nhắn thoại nhưng âm thanh bị rè hoặc không nghe rõ tiếng]"
                _so_loi.ghi_loi("stt tin thoai", "không chép được tin thoại ra chữ"
                                + ("" if _settings.groq_api_key else " (chưa có GROQ_API_KEY)"))
        else:
            incoming_text = "[Khách gửi tin nhắn thoại nhưng không tìm thấy file ghi âm]"
            _so_loi.ghi_loi("stt tin thoai", "bridge báo tin thoại nhưng không kèm link ghi âm")

    # 3b. Sticker: một lượt đọc ảnh rẻ (Gemini trước) cho biết khách CHÀO / cảm ơn / … — thay chuỗi trung tính của bridge (SRS-5.1zzzzzzz122).
    if payload.sticker_url and STICKER_TRUNG_TINH in incoming_text:
        incoming_text = incoming_text.replace(
            STICKER_TRUNG_TINH, doc_sticker(_engine._provider, payload.sticker_url, payload.sticker_text or ""), 1)

    # 4. Dispatch to Engine
    uk = payload.external_user_id
    if media_urls:
        caption = incoming_text or None
        lam = lambda: _engine.handle_media_batch(uk, media_urls, caption=caption)  # noqa: E731
        if not incoming_text:
            incoming_text = f"[Khách gửi {len(media_urls)} tệp tin/ảnh: {', '.join(media_urls)}]"
    else:
        incoming_text = incoming_text or "[Khách gửi tin nhắn]"
        lam = lambda: _engine.handle(uk, incoming_text)  # noqa: E731
        so_cho = _xep_cho(uk, incoming_text)
    # SRS-5.1zzzzzzz82: lượt hỏng (API quá tải / mạng / model trả rỗng) trước đây ra 500 → bridge không gửi gì, khách bị bỏ lơ
    # (sổ lỗi "bridge xử lý tin gom"), hoặc nhận "kết nối mạng gián đoạn, nhắn lại giúp em". Nay: câu giữ chỗ + tự thử lại nền.
    # SRS-5.1zzzzzzz84: một khách — một lượt một lúc (Engine.khoa_luot); tin nhắn tới lúc bot còn soạn thì chờ lượt trước xong.
    t_khoa = time.perf_counter()
    with _engine.khoa_luot(uk):
        cho_luot = int((time.perf_counter() - t_khoa) * 1000)
        if not media_urls:
            gom = _lay_cho(uk, so_cho)
            if gom is None:   # tin này đã nằm trong lượt trước — chỉ ghi lời khách vào CRM, không trả lời riêng
                sync_to_supabase_async(external_user_id=uk, incoming_text=incoming_text, bot_reply="",
                                       zalo_msg_id=payload.msg_id, role=_engine.conversation(uk).role, user_name=zalo_name,
                                       nhan_luc=nhan_luc)
                return ZaloBridgeResponse(reply="", replies=[], nhip_go=[], assistant_name="", captured=[], next_field=None,
                                          property_score=0.0, user_score=0.0, tier="", completeness=0.0)
            if len(gom) > 1:
                log.info("gom %d tin chờ thành một lượt", len(gom))
                van_gom = "\n".join(gom)
                lam = lambda: _engine.handle(uk, van_gom)  # noqa: E731
        moc = len(_engine.conversation(uk).history)
        t0 = time.perf_counter()
        try:
            r = lam()
            loi_luot = None
        except Exception as e:  # noqa: BLE001
            loi_luot, sau_hong = e, len(_engine.conversation(uk).history)
        tong = int((time.perf_counter() - t0) * 1000)
        thoi_gian = dict(getattr(_engine.conversation(uk), "do_luot", {}) or {})
    thoi_gian["con_lai"] = max(0, tong - sum(thoi_gian.values()))
    thoi_gian["tong"] = tong
    thoi_gian["cho_luot"] = cho_luot          # chờ lượt trước của cùng khách xong (khoa_luot)
    log.info("thời gian lượt (ms): %s", thoi_gian)   # chỉ con số — không dữ liệu khách
    if loi_luot is not None:
        e = loi_luot
        _so_loi.ghi_loi("chat-reply", f"lượt trả lời hỏng, giữ chỗ rồi thử lại: {type(e).__name__}: {e}"[:200])
        giu_cho = cau_mau.cau("giu_cho")
        sync_to_supabase_async(external_user_id=uk, incoming_text=incoming_text, bot_reply=giu_cho,
                               zalo_msg_id=payload.msg_id, user_name=zalo_name, nhan_luc=nhan_luc)
        _thu_lai_nen(uk, lam, moc, sau_hong, zalo_name)
        return ZaloBridgeResponse(reply=giu_cho, replies=[giu_cho], nhip_go=[0], assistant_name="", captured=[],
                                  next_field=None, property_score=0.0, user_score=0.0, tier="", completeness=0.0)

    # Clean asterisks so Zalo displays clean text without markdown markup
    cleaned_reply = r.reply.replace("**", "").strip()
    # SRS-5.1zzzzzzz136 (Lê Quang 22/10: "Còn một điểm em cần nắm thêm: cái này bỏ đi"): câu dẫn thừa của model, bỏ cứng ở lối ra.
    cleaned_reply = _CAU_DAN_THUA.sub("", cleaned_reply).lstrip()

    # Deliver via paced bubbles: listing drafts and any formatted ad (bullets / '---') stay as ONE whole message — chunk_reply
    # nhận tin rao theo bố cục, không so chữ "Em sẽ rao như vầy" (SRS-5.1zzzzzzz64).
    if r.is_listing_post:
        bubbles = [cleaned_reply]
    else:
        bubbles = [c.replace("**", "") for c in chunk_reply(cleaned_reply)]
    nhip_go = [int(typing_delay(c) * 1000) for c in bubbles]
    # Chế độ test (SRS-5.1zzzzzzz130): tin phụ "$$$$$ đã trích xuất / đã hiểu gì". Chỉ nằm trong `replies` — không vào `reply`, lịch sử
    # hội thoại hay kho tin nhắn CRM (model không đọc lại nó). SRS-5.1zzzzzzz136 (Lê Quang 22/10: "câu thật là câu không có $$$$$"): tin
    # debug gửi TRƯỚC, các tin cho khách thật sau — người cầm máy thấy ngay đâu là debug, đâu là lời bot nói với khách.
    if r.chu_thich:
        bubbles.insert(0, r.chu_thich)
        nhip_go.insert(0, 0)

    captured = r.captured
    if r.role == "buyer" and r.lead:
        lead_fields = [k for k, v in r.lead.fields.items() if v]
        captured = list(dict.fromkeys(captured + lead_fields))

    # Real-time async sync to Supabase CRM (shows on https://aioinhadat.vercel.app/admin/tin-nhan)
    sync_to_supabase_async(
        external_user_id=payload.external_user_id,
        incoming_text=incoming_text,
        bot_reply=cleaned_reply,
        zalo_msg_id=payload.msg_id,
        role=r.role,
        user_name=zalo_name,
        nhan_luc=nhan_luc,
    )

    # Khách xin gặp người thật (lượt AI đọc, đã kiểm trích dẫn) → bật cờ + nhắn admin, chạy nền (SRS-5.1zzzzzzz82).
    if r.can_nguoi_that:
        _bao_can_nguoi_nen(payload.external_user_id, r.can_nguoi_that, zalo_name, r.role)
    # Chấm sao cho AI (SRS-5.1zzzzzzz104): ghi lúc xin / điểm khách chấm (≤ 2 sao báo admin), chạy nền.
    if r.xin_danh_gia or r.danh_gia:
        _ghi_danh_gia_nen(payload.external_user_id, r.xin_danh_gia, r.danh_gia, zalo_name, r.role)

    # Cancel previous follow-up timer for this user and schedule a new 5-minute inactivity follow-up
    followup_manager.cancel_followup(payload.external_user_id)
    if r.role == "seller" and r.completeness < 1.0:
        followup_manager.schedule_followup(
            user_key=payload.external_user_id,
            engine=_engine,
            user_name=zalo_name,
            role=r.role,
        )

    photos = anh_gui_kem(payload.external_user_id, r.role, payload.text)
    # SRS-5.1zzzzzzz145: căn bot vừa giới thiệu (có link trong lời) → 1–2 ảnh mỗi căn nếu căn đã có ảnh công khai
    photos = (photos + anh_can_gui_kem(payload.external_user_id, r.role, cleaned_reply))[:6]

    return ZaloBridgeResponse(
        reply=cleaned_reply,
        replies=bubbles,
        nhip_go=nhip_go,
        assistant_name=r.assistant_name,
        captured=captured,
        next_field=r.next_field,
        property_score=r.property_score,
        user_score=r.user_score,
        tier=r.tier,
        completeness=r.completeness,
        photos=photos,
        thoi_gian_ms={**thoi_gian, "may_chu": int((time.perf_counter() - t_vao) * 1000)},
    )


@app.post("/trigger-followup/{user_key}")
def trigger_followup(user_key: str):
    followup_manager.cancel_followup(user_key)
    followup_manager._execute_followup(user_key, _engine)
    return {"ok": True, "message": f"Follow-up triggered for {user_key}"}


@app.post("/reset/{user_key}")
def reset_user(user_key: str):
    followup_manager.cancel_followup(user_key)
    _engine.reset(user_key)
    return {"ok": True, "message": f"Reset conversation and listing for {user_key}"}


@app.post("/reset-all")
def reset_all():
    _engine.reset_all()
    return {"ok": True, "message": "All conversations and listings reset"}

