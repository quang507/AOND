"""Proactive Inactivity Follow-up Manager (Hỏi bù sau 5 phút im lặng).
If a seller stops responding before completing the listing, after 5 minutes (configurable),
the system politely follows up via Zalo to request the missing information, keeping the
context fully preserved in SQLite and synced to Supabase CRM.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import urllib.request
from typing import TYPE_CHECKING

from .engine import Turn
from .prompts import FIELD_LABELS
from .supabase_sync import sync_to_supabase_async

if TYPE_CHECKING:
    from .engine import Engine

log = logging.getLogger("aioi.followup")

DEFAULT_FOLLOWUP_DELAY = int(os.environ.get("FOLLOWUP_DELAY_SECONDS", "300"))  # 300s = 5 minutes
BRIDGE_SEND_URL = os.environ.get("BRIDGE_SEND_URL", "http://127.0.0.1:5005/send")


class FollowUpManager:
    def __init__(self) -> None:
        self._timers: dict[str, threading.Timer] = {}
        self._scheduled_times: dict[str, float] = {}
        self._lock = threading.Lock()

    def cancel_followup(self, user_key: str) -> None:
        """Cancel any pending follow-up for this user (e.g. when user sends a new message)."""
        with self._lock:
            timer = self._timers.pop(user_key, None)
            self._scheduled_times.pop(user_key, None)
            if timer:
                try:
                    timer.cancel()
                    log.info("Cancelled pending follow-up for user %s", user_key)
                except Exception:
                    pass

    def schedule_followup(
        self,
        user_key: str,
        engine: Engine,
        user_name: str | None = None,
        role: str = "seller",
        delay_seconds: int | None = None,
    ) -> None:
        """Schedule a follow-up after `delay_seconds` (default: 5 minutes) if seller is idle."""
        delay = delay_seconds if delay_seconds is not None else DEFAULT_FOLLOWUP_DELAY
        if delay <= 0:
            return

        self.cancel_followup(user_key)

        def _callback() -> None:
            self._execute_followup(user_key, engine, user_name, role)

        with self._lock:
            timer = threading.Timer(delay, _callback)
            timer.daemon = True
            self._timers[user_key] = timer
            self._scheduled_times[user_key] = time.time()
            timer.start()
            log.info("Scheduled follow-up for %s in %d seconds", user_key, delay)

    def _execute_followup(
        self,
        user_key: str,
        engine: Engine,
        user_name: str | None = None,
        role: str = "seller",
    ) -> None:
        with self._lock:
            self._timers.pop(user_key, None)
            self._scheduled_times.pop(user_key, None)

        try:
            conv = engine.conversation(user_key)
            if not conv:
                return

            # Check if user has an active listing in basket
            if not conv.listings:
                return

            listing = conv.active
            prop = listing.prop
            completeness = prop.completeness()
            if completeness >= 1.0:
                log.info("User %s listing is 100%% complete. Skipping follow-up.", user_key)
                return

            # Avoid repeated follow-ups if already asked
            if getattr(listing, "_followup_sent", False):
                log.info("Follow-up already sent for listing %s. Skipping.", listing.listing_id)
                return

            # Identify the best missing item to ask for
            missing_item = None
            if not prop.fields.get("hinh_anh_so_do") and not prop.fields.get("phap_ly"):
                missing_item = "hình ảnh sổ hồng hoặc giấy tờ pháp lý"
            elif not prop.fields.get("hien_trang_su_dung"):
                missing_item = "hiện trạng nhà mình (đang ở, để trống hay cho thuê)"
            elif not prop.fields.get("so_tang") and not prop.fields.get("so_phong_ngu"):
                missing_item = "số tầng và số phòng ngủ"
            elif prop.missing_fields():
                field_key = prop.missing_fields()[0]
                missing_item = FIELD_LABELS.get(field_key, field_key)
            else:
                missing_item = "hình ảnh thực tế của căn nhà"

            # Craft warm, natural follow-up message (25–35 words)
            if getattr(listing, "listing_proposed", False):
                follow_up_msg = (
                    f"Dạ em chào anh/chị, em đã lưu thông tin căn nhà mình rồi ạ. "
                    f"Để tin đăng đầy đủ và dễ chốt khách nhanh hơn, anh/chị gửi thêm giúp em {missing_item} nhé ạ!"
                )
            else:
                follow_up_msg = (
                    f"Dạ em chào anh/chị, em vẫn đang chờ thông tin về {missing_item} "
                    f"để hoàn thiện tin đăng cho nhà mình ạ. Khi nào tiện anh/chị nhắn thêm cho em nhé!"
                )

            # 1. Send via local bridge HTTP endpoint (non-fatal if bridge fails / test UID)
            req_data = json.dumps({"threadId": user_key, "message": follow_up_msg}).encode("utf-8")
            req = urllib.request.Request(
                BRIDGE_SEND_URL,
                data=req_data,
                headers={"Content-Type": "application/json"},
            )
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    log.info("Sent follow-up to bridge (%s) for %s: %s", resp.status, user_key, follow_up_msg)
            except Exception as bridge_err:
                log.warning("Bridge send notice for %s (non-fatal): %s", user_key, bridge_err)

            # 2. Append turn to conversation history to preserve 100% context
            conv.history.append(Turn(role="assistant", content=follow_up_msg, at=time.time()))
            listing._followup_sent = True
            if engine._convstore is not None:
                engine._convstore.save(conv)

            # 3. Mirror into Supabase CRM so admin sees it in real time
            sync_to_supabase_async(
                external_user_id=user_key,
                incoming_text="",
                bot_reply=follow_up_msg,
                role=role,
                user_name=user_name,
            )
            log.info("Follow-up successfully completed and recorded for %s: %s", user_key, follow_up_msg)

        except Exception as e:
            log.warning("Follow-up execution failed for %s: %s", user_key, e)


# Global singleton instance
followup_manager = FollowUpManager()
