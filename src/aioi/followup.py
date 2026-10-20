"""Proactive Inactivity Follow-up Manager (Hỏi bù sau 5 phút im lặng).
If a seller stops responding before completing the listing, after 5 minutes (configurable),
the system politely follows up via Zalo to request the missing information, keeping the
context fully preserved in SQLite and synced to Supabase CRM.
"""
from __future__ import annotations

import contextlib
import json
import re
import logging
import os
import threading
import time
import urllib.request
from typing import TYPE_CHECKING

from .engine import Turn, _detect_customer_pronoun, _image_count
from .supabase_sync import sync_to_supabase_async

if TYPE_CHECKING:
    from .engine import Engine

log = logging.getLogger("aioi.followup")

DEFAULT_FOLLOWUP_DELAY = int(os.environ.get("FOLLOWUP_DELAY_SECONDS", "300"))  # 300s = 5 minutes
BRIDGE_SEND_URL = os.environ.get("BRIDGE_SEND_URL", "http://127.0.0.1:5005/send")


_GOI = {"em": "Em", "anh": "Anh", "chi": "Chị"}


def cau_hoi_cuoi_cua_bot(conv) -> str:
    """Câu hỏi bot vừa hỏi mà khách CHƯA trả lời: lượt cuối của hội thoại là lời bot và có câu kết bằng '?' — lấy câu hỏi cuối
    trong lời đó. Khách đã nhắn sau đó thì không còn gì chờ."""
    if not conv.history or conv.history[-1].role != "assistant":
        return ""
    loi = conv.history[-1].content or ""
    cau = [c.strip() for c in re.findall(r"[^.!?\n]*\?", loi) if c.strip()]
    return cau[-1] if cau else ""


def cau_nhac(conv, listing, pronoun: str) -> str:
    """Tin nhắc khi khách im (SRS-5.1zzzzzzz73): hỏi lại câu đang chờ; không còn câu chờ thì xin ảnh khi căn chưa có ảnh."""
    goi = _GOI.get(pronoun, "Anh/chị")
    toi = "mình" if pronoun == "em" else "em"
    hoi = cau_hoi_cuoi_cua_bot(conv)
    if hoi:
        return f"{goi} ơi, {toi} hỏi lại chút nha: {hoi}"
    if not _image_count(listing.media):
        return (f"Khi nào tiện {goi.lower()} chụp gửi {toi} vài tấm ảnh thực tế nhé, để tin đăng nổi bật và hút khách hơn"
                + (" nè." if pronoun == "em" else " ạ."))
    return ""


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

        hen = time.time()

        def _callback() -> None:
            self._execute_followup(user_key, engine, user_name, role, hen=hen)

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
        hen: float | None = None,
    ) -> None:
        with self._lock:
            self._timers.pop(user_key, None)
            self._scheduled_times.pop(user_key, None)

        # SRS-5.1zzzzzzz84: đọc / ghi lịch sử dưới khoá lượt của khách (Engine.khoa_luot) — tin nhắc từng có thể chen giữa một lượt
        # đang chạy. Chờ khoá xong mà đã có lượt mới sau lúc hẹn nhắc → khách vừa nói chuyện, không nhắc.
        khoa = getattr(engine, "khoa_luot", None)
        with (khoa(user_key) if khoa else contextlib.nullcontext()):
            self._nhac_trong_khoa(user_key, engine, user_name, role, hen)

    def _nhac_trong_khoa(self, user_key: str, engine: Engine, user_name: str | None, role: str, hen: float | None) -> None:
        try:
            conv = engine.conversation(user_key)
            if not conv:
                return
            if hen is not None and conv.history and conv.history[-1].at > hen:
                log.info("Follow-up for %s: có lượt mới sau lúc hẹn. Skipping.", user_key)
                return

            # Check if user has an active listing in basket
            if not conv.listings:
                return

            listing = conv.active
            prop = listing.prop
            if prop.fields.get("_ngoai_vung"):   # căn ngoài vùng nhận tin — không nhắc hỏi tiếp (SRS-5.1zzzzzzz86)
                log.info("Follow-up for %s: căn ngoài vùng nhận tin. Skipping.", user_key)
                return
            completeness = prop.completeness()
            if completeness >= 1.0:
                log.info("User %s listing is 100%% complete. Skipping follow-up.", user_key)
                return

            # Avoid repeated follow-ups if already asked
            if getattr(listing, "_followup_sent", False):
                log.info("Follow-up already sent for listing %s. Skipping.", listing.listing_id)
                return

            # Determine tone and pronoun based on conversation context
            customer_pronoun = _detect_customer_pronoun(conv, "")
            customer_is_em = (customer_pronoun == "em")

            # Determine missing item or draft status
            # Chỉ nói "bản tin nháp em soạn ở trên" khi bản nháp ĐÃ gửi thật (SRS-5.1zzzzzzz91) — trước đây đủ ý (summary_ready) cũng
            # tính, nên khách chưa thấy bản nháp nào vẫn được nhắc "xem bản tin ở trên".
            is_draft_ready = bool(getattr(conv, "listing_proposed", False))

            if is_draft_ready:
                if customer_is_em:
                    follow_up_msg = (
                        "Bản tin nháp căn nhà mình soạn ở trên em xem qua thấy ưng ý chưa nè, "
                        "có cần sửa thêm thông tin nào không cứ nhắn mình hỗ trợ nhé!"
                    )
                else:
                    # Gọi khách đúng cách khách tự xưng (SRS-5.1zzzzzzz90: khách xưng "chị" mà tin nhắc vẫn "anh/chị").
                    goi = {"anh": "anh", "chi": "chị"}.get(customer_pronoun, "anh/chị")
                    follow_up_msg = (
                        f"Bản tin nháp căn nhà em soạn ở trên {goi} xem qua thấy ưng ý chưa ạ, "
                        "có cần điều chỉnh thêm thông tin nào không cứ nhắn em nhé ạ!"
                    )
            else:
                # 19/10/2026 (SRS-5.1zzzzzzz73): nhắc lại ĐÚNG câu bot vừa hỏi. Bản trước lấy câu mẫu cố định theo ô thiếu đầu
                # tiên; ô nào không có câu mẫu (vd diện tích sàn) rơi vào "chụp gửi em vài tấm ảnh" — chủ nhà vừa gửi 6 ảnh vẫn
                # bị xin ảnh. Không còn câu nào đang chờ trả lời thì chỉ xin ảnh khi căn CHƯA có ảnh; có rồi thì không nhắc.
                follow_up_msg = cau_nhac(conv, listing, customer_pronoun)
                if not follow_up_msg:
                    log.info("Follow-up for %s: không có câu đang chờ, căn đã có ảnh. Skipping.", user_key)
                    return

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
