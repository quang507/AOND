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
from fastapi import FastAPI
from pydantic import BaseModel

from .anh_du_an import anh_gui_kem
from .config import load_settings
from .delivery import chunk_reply, typing_delay
from .drive import make_folder_namer, make_resolver
from .engine import Engine, SqliteConversationStore
from .followup import followup_manager
from .llm import build_provider
from .projects import SqliteProjectStore
from .sharepoint import (
    GraphAuth,
    LocalDirectoryMediaStore,
    MediaStore,
    SharePointMediaStore,
)
from .supabase_sync import sync_to_supabase_async
from .voice import is_audio_file, transcribe_voice_url

log = logging.getLogger("aioi.server")


def _init_engine() -> Engine:
    settings = load_settings()
    provider = build_provider(settings)

    media_store: MediaStore
    if settings.sharepoint_configured:
        auth = GraphAuth(settings.azure_tenant_id, settings.azure_client_id, settings.azure_client_secret)
        media_store = SharePointMediaStore(auth, settings.sharepoint_site_id)
    else:
        # Graceful local fallback storing files + thong_tin.json matching SharePoint structure
        media_store = LocalDirectoryMediaStore("sharepoint_store")

    sqlite_store = SqliteConversationStore(settings.db_path)
    if settings.supabase_service_role_key:
        from .supabase_store import SupabaseConversationStore
        conv_store = SupabaseConversationStore(
            url=settings.supabase_url,
            key=settings.supabase_service_role_key,
            fallback_store=sqlite_store,
        )
        log.info("Initialized SupabaseConversationStore (Single Source of Truth) at %s", settings.supabase_url)
    else:
        conv_store = sqlite_store
        log.info("Initialized local SqliteConversationStore at %s", settings.db_path)

    return Engine(
        provider,
        resolver=make_resolver(settings.google_api_key),
        folder_namer=make_folder_namer(settings.google_api_key),
        project_store=SqliteProjectStore(settings.db_path),
        conversation_store=conv_store,
        media_store=media_store,
        max_photos_per_listing=settings.max_photos_per_listing,
        sync_json=True,
    )


_settings = load_settings()
_engine = _init_engine()

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


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "provider": _settings.effective_provider,
        "chat_model": _settings.chat_model,
        "stt": "groq-whisper" if _settings.groq_api_key else "disabled",
    }


@app.post("/message", response_model=Reply)
def message(msg: IncomingMessage) -> Reply:
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


@app.post("/chat-reply", response_model=ZaloBridgeResponse)
def chat_reply(payload: ZaloBridgePayload) -> ZaloBridgeResponse:
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
        else:
            incoming_text = "[Khách gửi tin nhắn thoại nhưng không tìm thấy file ghi âm]"

    # 4. Dispatch to Engine
    if media_urls:
        caption = incoming_text or None
        r = _engine.handle_media_batch(payload.external_user_id, media_urls, caption=caption)
        if not incoming_text:
            incoming_text = f"[Khách gửi {len(media_urls)} tệp tin/ảnh: {', '.join(media_urls)}]"
    else:
        incoming_text = incoming_text or "[Khách gửi tin nhắn]"
        r = _engine.handle(payload.external_user_id, incoming_text)

    # Clean asterisks so Zalo displays clean text without markdown markup
    cleaned_reply = r.reply.replace("**", "").strip()

    # Deliver via paced bubbles: Listing drafts stay as ONE whole message
    if r.is_listing_post or "Em sẽ rao như vầy" in cleaned_reply or "Em sẽ đăng như vầy" in cleaned_reply:
        bubbles = [cleaned_reply]
    else:
        bubbles = [c.replace("**", "") for c in chunk_reply(cleaned_reply)]
    nhip_go = [int(typing_delay(c) * 1000) for c in bubbles]

    captured = r.captured
    if r.role == "buyer" and r.lead:
        lead_fields = [k for k, v in r.lead.fields.items() if v]
        captured = list(dict.fromkeys(captured + lead_fields))

    # Real-time async sync to Supabase CRM (shows on https://aioinhadat.vercel.app/admin/tin-nhan)
    zalo_name = payload.sender_name or payload.user_name
    sync_to_supabase_async(
        external_user_id=payload.external_user_id,
        incoming_text=incoming_text,
        bot_reply=cleaned_reply,
        zalo_msg_id=payload.msg_id,
        role=r.role,
        user_name=zalo_name,
    )

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

