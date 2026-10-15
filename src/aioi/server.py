"""FastAPI app — Webhook and Bridge endpoint for AI Ơi Nhà Đất (AOND).
Serves:
  - GET  /health: health check
  - POST /message: native AOND API
  - POST /chat-reply: full compatibility endpoint with Zalo Bridge (zca-js) from Nhadat.cc
Run: uvicorn aioi.server:app --reload --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel

from .config import load_settings
from .delivery import chunk_reply, typing_delay
from .drive import make_folder_namer, make_resolver
from .engine import Engine, SqliteConversationStore
from .llm import build_provider
from .projects import SqliteProjectStore
from .sharepoint import (
    GraphAuth,
    LocalDirectoryMediaStore,
    MediaStore,
    SharePointMediaStore,
)
from .supabase_sync import sync_to_supabase_async


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

    return Engine(
        provider,
        resolver=make_resolver(settings.google_api_key),
        folder_namer=make_folder_namer(settings.google_api_key),
        project_store=SqliteProjectStore(settings.db_path),
        conversation_store=SqliteConversationStore(settings.db_path),
        media_store=media_store,
        max_photos_per_listing=settings.max_photos_per_listing,
        sync_json=True,
    )


_settings = load_settings()
_engine = _init_engine()

app = FastAPI(title="AI Ơi Nhà Đất (AOND) API", version="0.2.0")


class IncomingMessage(BaseModel):
    user_key: str        # Zalo user id (sender)
    text: str            # message text (or links / commands)


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


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "provider": _settings.effective_provider}


@app.post("/message", response_model=Reply)
def message(msg: IncomingMessage) -> Reply:
    r = _engine.handle(msg.user_key, msg.text)
    sync_to_supabase_async(
        external_user_id=msg.user_key,
        incoming_text=msg.text,
        bot_reply=r.reply,
        role=r.role,
    )
    return Reply(
        assistant_name=r.assistant_name,
        reply=r.reply,
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

    media_urls = []
    if payload.image_urls:
        for u in payload.image_urls:
            if u and isinstance(u, str) and u.strip() and u.strip() not in media_urls:
                media_urls.append(u.strip())
    if payload.image_url and payload.image_url.strip() and payload.image_url.strip() not in media_urls:
        media_urls.append(payload.image_url.strip())
    if payload.file_url and payload.file_url.strip() and payload.file_url.strip() not in media_urls:
        media_urls.append(payload.file_url.strip())

    incoming_text = payload.text.strip() if payload.text else ""
    if media_urls:
        caption = incoming_text or None
        r = _engine.handle_media_batch(payload.external_user_id, media_urls, caption=caption)
        if not incoming_text:
            incoming_text = f"[Khách gửi {len(media_urls)} tệp tin/ảnh: {', '.join(media_urls)}]"
    else:
        incoming_text = incoming_text or "[Khách gửi tin nhắn]"
        r = _engine.handle(payload.external_user_id, incoming_text)

    # Deliver via paced bubbles
    bubbles = chunk_reply(r.reply)
    nhip_go = [int(typing_delay(c) * 1000) for c in bubbles]

    captured = r.captured
    if r.role == "buyer" and r.lead:
        lead_fields = [k for k, v in r.lead.fields.items() if v]
        captured = list(dict.fromkeys(captured + lead_fields))

    # Real-time async sync to Supabase CRM (shows on https://aioinhadat.vercel.app/admin/tin-nhan)
    sync_to_supabase_async(
        external_user_id=payload.external_user_id,
        incoming_text=incoming_text,
        bot_reply=r.reply,
        zalo_msg_id=payload.msg_id,
        role=r.role,
    )

    return ZaloBridgeResponse(
        reply=r.reply,
        replies=bubbles,
        nhip_go=nhip_go,
        assistant_name=r.assistant_name,
        captured=captured,
        next_field=r.next_field,
        property_score=r.property_score,
        user_score=r.user_score,
        tier=r.tier,
        completeness=r.completeness,
    )
