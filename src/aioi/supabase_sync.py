"""Supabase CRM Sync — automatically mirrors Zalo conversations into Supabase
tables: `sellers`, `conversations`, `messages`, so they show up on:
https://aioinhadat.vercel.app/admin/tin-nhan in real time.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import urllib.request
from datetime import datetime, timezone

log = logging.getLogger("aioi.supabase_sync")

DEFAULT_URL = os.environ.get("SUPABASE_URL", "https://rqxmmqmctpklqcmbfxuj.supabase.co/rest/v1")
DEFAULT_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

_seller_cache: dict[str, str] = {}
_conv_cache: dict[str, str] = {}


def _get_credentials() -> tuple[str, str]:
    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    if base_url:
        url = f"{base_url}/rest/v1" if not base_url.endswith("/rest/v1") else base_url
    else:
        url = DEFAULT_URL
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or DEFAULT_KEY
    return url, key


def _post_json(url: str, key: str, endpoint: str, data: dict) -> list[dict]:
    full_url = f"{url}/{endpoint}"
    req = urllib.request.Request(
        full_url,
        data=json.dumps(data).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _get_json(url: str, key: str, endpoint: str) -> list[dict]:
    full_url = f"{url}/{endpoint}"
    req = urllib.request.Request(
        full_url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _patch_json(url: str, key: str, endpoint: str, data: dict) -> None:
    full_url = f"{url}/{endpoint}"
    req = urllib.request.Request(
        full_url,
        data=json.dumps(data).encode("utf-8"),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="PATCH",
    )
    with urllib.request.urlopen(req, timeout=10):
        pass


def _sync_worker(
    external_user_id: str,
    incoming_text: str,
    bot_reply: str,
    zalo_msg_id: str | None = None,
    role: str = "seller",
    user_name: str | None = None,
) -> None:
    try:
        url, key = _get_credentials()
        if not key:
            return
        now_iso = datetime.now(timezone.utc).isoformat()

        # 1. Get or create seller
        seller_id = _seller_cache.get(external_user_id)
        if not seller_id:
            sellers = _get_json(url, key, f"sellers?zalo_user_id=eq.{external_user_id}")
            if sellers:
                seller_id = sellers[0]["id"]
                if user_name and ("Khách Zalo" in sellers[0].get("name", "") or not sellers[0].get("name")):
                    _patch_json(url, key, f"sellers?id=eq.{seller_id}", {"name": user_name})
            else:
                short_uid = external_user_id[-4:] if len(external_user_id) >= 4 else external_user_id
                display_name = user_name or f"Khách Zalo {short_uid}"
                res = _post_json(
                    url, key, "sellers",
                    {"zalo_user_id": external_user_id, "name": display_name, "seller_type": "ccrb"}
                )
                seller_id = res[0]["id"]
            _seller_cache[external_user_id] = seller_id

        # 2. Get or create conversation
        conv_id = _conv_cache.get(seller_id)
        if not conv_id:
            convs = _get_json(url, key, f"conversations?seller_id=eq.{seller_id}&channel=eq.zalo_personal_test")
            if convs:
                conv_id = convs[0]["id"]
            else:
                res = _post_json(
                    url, key, "conversations",
                    {"seller_id": seller_id, "channel": "zalo_personal_test", "started_at": now_iso}
                )
                conv_id = res[0]["id"]
            _conv_cache[seller_id] = conv_id

        # 3. Insert incoming message from user
        if incoming_text:
            sender = "seller" if role == "seller" else "buyer"
            msg_payload = {
                "conversation_id": conv_id,
                "sender": sender,
                "body": incoming_text,
                "created_at": now_iso,
            }
            if zalo_msg_id:
                msg_payload["zalo_msg_id"] = str(zalo_msg_id)
            _post_json(url, key, "messages", msg_payload)

        # 4. Insert bot reply
        if bot_reply:
            _post_json(
                url, key, "messages",
                {
                    "conversation_id": conv_id,
                    "sender": "bot",
                    "body": bot_reply,
                    "created_at": now_iso,
                }
            )

        # 5. Update conversation timestamp so it bumps to top of admin CRM
        _patch_json(url, key, f"conversations?id=eq.{conv_id}", {"last_message_at": now_iso})

    except Exception as e:
        log.warning("Supabase sync failed (non-blocking): %s", e)


def sync_to_supabase_async(
    external_user_id: str,
    incoming_text: str,
    bot_reply: str,
    zalo_msg_id: str | None = None,
    role: str = "seller",
    user_name: str | None = None,
) -> None:
    """Non-blocking asynchronous sync of conversation turn to Supabase CRM."""
    if not external_user_id:
        return
    t = threading.Thread(
        target=_sync_worker,
        args=(external_user_id, incoming_text, bot_reply, zalo_msg_id, role, user_name),
        daemon=True,
    )
    t.start()
