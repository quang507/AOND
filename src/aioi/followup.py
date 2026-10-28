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

from .xung_ho import goi_toi, tre
from . import cau_mau
from .engine import Turn, _detect_customer_pronoun, _image_count
from .supabase_sync import sync_to_supabase_async

if TYPE_CHECKING:
    from .engine import Engine

log = logging.getLogger("aioi.followup")

DEFAULT_FOLLOWUP_DELAY = int(os.environ.get("FOLLOWUP_DELAY_SECONDS", "300"))  # 300s = 5 minutes
BRIDGE_SEND_URL = os.environ.get("BRIDGE_SEND_URL", "http://127.0.0.1:5005/send")
# SRS-5.1zzzzzzz210: bridge thứ hai — số Zalo tư vấn người mua (`SO_NHAN=tu_van`, cổng SEND_PORT 5006). Tin nhắc người bán dưới đây vẫn đi số ký gửi.
BRIDGE_SEND_URL_TU_VAN = os.environ.get("BRIDGE_SEND_URL_TU_VAN", "http://127.0.0.1:5006/send")


_GOI = {"em": "Em", "anh": "Anh", "chi": "Chị"}


def cau_hoi_cuoi_cua_bot(conv) -> str:
    """Câu hỏi bot vừa hỏi mà khách CHƯA trả lời: lượt cuối của hội thoại là lời bot và có câu kết bằng '?' — lấy câu hỏi cuối
    trong lời đó. Khách đã nhắn sau đó thì không còn gì chờ."""
    if not conv.history or conv.history[-1].role != "assistant":
        return ""
    loi = conv.history[-1].content or ""
    cau = [c.strip() for c in re.findall(r"[^.!?\n]*\?", loi) if c.strip()]
    return cau[-1] if cau else ""


def cau_nhac(conv, listing, pronoun: str, ten: str | None = None) -> str:
    """Tin nhắc khi khách im (SRS-5.1zzzzzzz73): hỏi lại câu đang chờ; không còn câu chờ thì xin ảnh khi căn chưa có ảnh. `ten` = tên trợ lý
    (bot xưng anh / chị / cô / chú khi khách xưng em / cháu — SRS-5.1zzzzzzz214)."""
    goi, toi = goi_toi(pronoun, ten)
    hoi = cau_hoi_cuoi_cua_bot(conv)
    if hoi:   # câu mẫu sửa ở CRM (SRS-5.1zzzzzzz110)
        return cau_mau.cau("nhac_hoi_lai", goi, toi=toi, hoi=hoi)
    if not _image_count(listing.media):
        return cau_mau.cau("nhac_xin_anh_em", goi, toi=toi) if tre(pronoun) else cau_mau.cau("nhac_xin_anh", goi)
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

            # SRS-5.1zzzzzzz153: tin nhắc này là của NGƯỜI BÁN (hỏi ô thiếu / xin ảnh). Khách đang nói chuyện ở vai mua (hẹn xem nhà) mà vẫn
            # có rổ bán dở thì KHÔNG nhắc — chị N. 23/10 đang chốt lịch xem nhà nhận "chụp gửi em vài tấm ảnh thực tế".
            if getattr(conv, "role", "") == "buyer":
                log.info("Follow-up for %s: đang ở vai người mua. Skipping.", user_key)
                return
            # SRS-5.1zzzzzzz177: khách hỏi việc ngoài nhà đất, chưa tỏ ý bán — tin nhắc hỏi ô thiếu là hỏi nhầm người (24/10: nhắc "phường nào" cho
            # cư dân hỏi đồng hồ nước).
            if getattr(conv, "role", "") != "seller" and getattr(conv, "so_luot_ngoai_viec", 0):
                log.info("Follow-up for %s: khách hỏi việc ngoài nhà đất, chưa tỏ ý bán. Skipping.", user_key)
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
            ten = getattr(getattr(conv, "assistant", None), "name", None)
            customer_is_em = tre(customer_pronoun)

            # Determine missing item or draft status
            # Chỉ nói "bản tin nháp em soạn ở trên" khi bản nháp ĐÃ gửi thật (SRS-5.1zzzzzzz91) — trước đây đủ ý (summary_ready) cũng
            # tính, nên khách chưa thấy bản nháp nào vẫn được nhắc "xem bản tin ở trên".
            is_draft_ready = bool(getattr(conv, "listing_proposed", False))
            if is_draft_ready:
                # SRS-5.1zzzzzzz233 (chat chị Ngân 28/10: khách duyệt "đăng giúp chị", bot hỏi phường, 5 phút sau vẫn nhắc "Em gửi chị bản nháp tin
                # đăng…"): `listing_proposed` còn bật sau khi khách đã đáp bản tin. Chỉ nhắc bản nháp khi khách CHƯA nhắn gì sau bản tin 📋 gần nhất.
                hs = list(getattr(conv, "history", []) or [])
                i_tin = max((i for i, t in enumerate(hs) if t.role == "assistant" and "📋" in (t.content or "")), default=-1)
                is_draft_ready = i_tin >= 0 and not any(t.role == "user" for t in hs[i_tin + 1:])

            if is_draft_ready:
                goi, toi = goi_toi(customer_pronoun, ten)
                if customer_is_em:
                    # 21/10 (SRS-5.1zzzzzzz99, câu tester sửa): một câu ngắn, không hỏi "ưng ý chưa" kèm "có cần điều chỉnh không".
                    follow_up_msg = cau_mau.cau("nhac_ban_nhap_em", goi, toi=toi)   # sửa câu ở CRM (SRS-5.1zzzzzzz106)
                else:
                    # Gọi khách đúng cách khách tự xưng (SRS-5.1zzzzzzz90: khách xưng "chị" mà tin nhắc vẫn "anh/chị").
                    # Đúng câu tester (chủ dự án: "đúng rồi vậy giống người hơn"); "mình" ở đây là gọi khách, như "nhà mình".
                    follow_up_msg = cau_mau.cau("nhac_ban_nhap", goi)
            else:
                # 19/10/2026 (SRS-5.1zzzzzzz73): nhắc lại ĐÚNG câu bot vừa hỏi. Bản trước lấy câu mẫu cố định theo ô thiếu đầu
                # tiên; ô nào không có câu mẫu (vd diện tích sàn) rơi vào "chụp gửi em vài tấm ảnh" — chủ nhà vừa gửi 6 ảnh vẫn
                # bị xin ảnh. Không còn câu nào đang chờ trả lời thì chỉ xin ảnh khi căn CHƯA có ảnh; có rồi thì không nhắc.
                follow_up_msg = cau_nhac(conv, listing, customer_pronoun, ten)
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
