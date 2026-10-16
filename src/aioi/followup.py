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

from .engine import Turn, _detect_customer_pronoun
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

            # Determine tone and pronoun based on conversation context
            customer_pronoun = _detect_customer_pronoun(conv, "")
            customer_is_em = (customer_pronoun == "em")

            # Determine missing item or draft status
            is_draft_ready = bool(getattr(conv, "listing_proposed", False) or prop.summary_ready())

            if is_draft_ready:
                if customer_is_em:
                    follow_up_msg = (
                        "Bản tin nháp căn nhà mình soạn ở trên em xem qua thấy ưng ý chưa nè, "
                        "có cần sửa thêm thông tin nào không cứ nhắn mình hỗ trợ nhé!"
                    )
                else:
                    follow_up_msg = (
                        "Bản tin nháp căn nhà em soạn ở trên anh/chị xem qua thấy ưng ý chưa ạ, "
                        "có cần điều chỉnh thêm thông tin nào không cứ nhắn em nhé ạ!"
                    )
            else:
                missing_fields = prop.missing_fields()
                next_f = missing_fields[0] if missing_fields else None

                if next_f in ("gia", "gia_thue"):
                    if customer_is_em:
                        follow_up_msg = "Căn này em đang dự tính bán thu về tầm bao nhiêu để mình lên tin cho chuẩn nè em?"
                    else:
                        follow_up_msg = "Căn này mình đang dự tính bán thu về khoảng bao nhiêu tỷ vậy anh/chị ha, để em lên tin đăng cho chuẩn ạ?"
                elif next_f == "dia_chi":
                    if customer_is_em:
                        follow_up_msg = "Nhà em nằm ở đoạn đường nào, thuộc phường mấy vậy em ha?"
                    else:
                        follow_up_msg = "Nhà mình nằm ở đoạn đường nào, thuộc phường mấy vậy anh/chị ha để em định vị đúng khu vực ạ?"
                elif next_f in ("ket_cau", "so_tang", "so_phong_ngu"):
                    if customer_is_em:
                        follow_up_msg = "Nhà em hiện tại xây mấy tầng, có mấy phòng ngủ vậy em?"
                    else:
                        follow_up_msg = "Nhà mình hiện tại xây mấy tầng, có mấy phòng ngủ vậy anh/chị ha?"
                elif next_f in ("dien_tich", "dien_tich_dat", "kich_thuoc"):
                    if customer_is_em:
                        follow_up_msg = "Diện tích hoặc bề ngang x dài của căn nhà khoảng bao nhiêu mét vậy em?"
                    else:
                        follow_up_msg = "Diện tích hoặc bề ngang x dài của nhà mình khoảng bao nhiêu mét vậy anh/chị?"
                elif next_f in ("lo_gioi_hem", "vi_tri"):
                    if customer_is_em:
                        follow_up_msg = "Đường trước nhà em là mặt tiền hay hẻm xe hơi vậy em?"
                    else:
                        follow_up_msg = "Đường trước nhà mình là mặt tiền hay hẻm xe hơi vậy anh/chị?"
                elif next_f == "tinh_trang_ban_giao":
                    if customer_is_em:
                        follow_up_msg = "Hiện tại nhà em đang ở, để trống hay có khách thuê sẵn vậy em?"
                    else:
                        follow_up_msg = "Hiện tại nhà mình đang ở, để trống hay có khách thuê sẵn vậy anh/chị?"
                else:
                    if customer_is_em:
                        follow_up_msg = "Khi nào tiện em chụp gửi mình vài tấm ảnh mặt tiền hoặc sổ hồng nhé, để tin đăng uy tín và hút khách hơn nè."
                    else:
                        follow_up_msg = "Khi nào tiện anh/chị chụp gửi em vài tấm ảnh thực tế hoặc sổ hồng nhé, để tin đăng nổi bật và hút khách mua hơn ạ."

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
