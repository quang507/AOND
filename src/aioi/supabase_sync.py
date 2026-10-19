"""Ghi từng lượt chat (tin khách + lời bot) vào `messages` để CRM /admin/tin-nhan thấy ngay — chạy nền, không chặn lượt chat.

19/10/2026 (SRS-5.1zzzzzzz56): bản trước tự viết lại toàn bộ đường tìm / tạo `sellers` + `conversations` (cache riêng, HTTP
riêng) song song với `SupabaseConversationStore` — hai chỗ cùng tạo người bán / hội thoại. Nay đi qua MỘT chỗ:
`SupabaseConversationStore.ghi_luot_chat`.
"""
from __future__ import annotations

import logging
import os
import threading

log = logging.getLogger("aioi.supabase_sync")

_kho = None   # SupabaseConversationStore dùng chung cho mọi lượt ghi (giữ cache seller / conversation)
_khoa = threading.Lock()


def _kho_ghi():
    global _kho
    with _khoa:
        if _kho is None:
            key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
            if not key:
                return None
            from .supabase_store import SupabaseConversationStore
            _kho = SupabaseConversationStore(url=os.environ.get("SUPABASE_URL") or None, key=key)
        return _kho


def _sync_worker(external_user_id: str, incoming_text: str, bot_reply: str, zalo_msg_id: str | None = None,
                 role: str = "seller", user_name: str | None = None) -> None:
    kho = _kho_ghi()
    if kho is None:
        return
    try:
        kho.ghi_luot_chat(external_user_id, incoming_text, bot_reply, zalo_msg_id, role, user_name)
    except Exception as e:  # noqa: BLE001
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
    threading.Thread(
        target=_sync_worker,
        args=(external_user_id, incoming_text, bot_reply, zalo_msg_id, role, user_name),
        daemon=True,
    ).start()
