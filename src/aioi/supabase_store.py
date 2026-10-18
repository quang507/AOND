"""Supabase-backed ConversationStore — Single Source of Truth for AOND.

Persists sellers, conversations, listings, and leads directly to Supabase Postgres
so that deleting or editing a record on the Web CRM (aioinhadat.vercel.app/admin)
immediately syncs to the Zalo Bot in real time without stale state.

Falls back gracefully to SQLite if Supabase credentials are not supplied.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING

from .schema import Property
from .assistants import assign_assistant

if TYPE_CHECKING:
    from .engine import Conversation, Listing, Turn, BuyerLead

log = logging.getLogger("aioi.supabase_store")


# 18/10/2026: cột `sellers.seller_type` trên Supabase mang mã của CRM / lõi cũ (`ccrb`, `nmg`), còn engine cần `SellerRole`
# (`chu_nha`, `moi_gioi`…). Nạp chuỗi trần vào `Conversation.user_type` làm `_build_result` sập ở `.value` (AttributeError → 500,
# bot im với khách thật). Mọi đường nạp vai từ Supabase đi qua hàm này.
_SELLER_TYPE_SANG_VAI = {"ccrb": "chu_nha", "nmg": "moi_gioi"}


def vai_tu_seller_type(raw: Any) -> "SellerRole":
    from .revenue import SellerRole

    ma = str(raw or "").strip().lower()
    ma = _SELLER_TYPE_SANG_VAI.get(ma, ma)
    try:
        return SellerRole(ma)
    except ValueError:
        return SellerRole.UNKNOWN


class SupabaseConversationStore:
    """Persistent ConversationStore storing state in Supabase REST API (PostgreSQL).
    Implements ConversationStore protocol: save, load, reset.
    """

    def __init__(
        self,
        url: str | None = None,
        key: str | None = None,
        fallback_store: Any | None = None,
    ):
        base_url = (url or os.environ.get("SUPABASE_URL", "https://rqxmmqmctpklqcmbfxuj.supabase.co")).rstrip("/")
        if not base_url.endswith("/rest/v1"):
            self.url = f"{base_url}/rest/v1"
        else:
            self.url = base_url
        self.key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        self.fallback = fallback_store
        self._seller_cache: dict[str, str] = {}
        self._conv_cache: dict[str, str] = {}

    @property
    def is_configured(self) -> bool:
        return bool(self.url and self.key)

    # --- HTTP Helpers ----------------------------------------------------

    def _request(self, method: str, endpoint: str, data: dict | list | None = None, prefer: str | None = None) -> Any:
        full_url = f"{self.url}/{endpoint}"
        body = json.dumps(data).encode("utf-8") if data is not None else None
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        req = urllib.request.Request(full_url, data=body, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=8) as resp:
            content = resp.read()
            if content:
                try:
                    return json.loads(content.decode("utf-8"))
                except Exception:
                    return None
            return None

    def _get(self, endpoint: str) -> list[dict]:
        res = self._request("GET", endpoint)
        return res if isinstance(res, list) else []

    def _post(self, endpoint: str, data: dict, prefer: str = "return=representation") -> list[dict]:
        res = self._request("POST", endpoint, data=data, prefer=prefer)
        return res if isinstance(res, list) else []

    def _patch(self, endpoint: str, data: dict) -> None:
        self._request("PATCH", endpoint, data=data, prefer="return=minimal")

    def _delete(self, endpoint: str) -> None:
        self._request("DELETE", endpoint, prefer="return=minimal")

    # --- Seller & Conversation Resolution --------------------------------

    def _get_or_create_seller(self, user_key: str, name: str | None = None) -> str | None:
        if user_key in self._seller_cache:
            return self._seller_cache[user_key]

        sellers = self._get(f"sellers?zalo_user_id=eq.{urllib.parse.quote(user_key)}")
        if sellers:
            seller_id = sellers[0]["id"]
            if name and ("Khách Zalo" in sellers[0].get("name", "") or not sellers[0].get("name")):
                try:
                    self._patch(f"sellers?id=eq.{seller_id}", {"name": name})
                except Exception as e:
                    log.warning("Failed to patch seller name: %s", e)
            self._seller_cache[user_key] = seller_id
            return seller_id

        # Create new seller row
        short_uid = user_key[-4:] if len(user_key) >= 4 else user_key
        display_name = name or f"Khách Zalo {short_uid}"
        try:
            res = self._post(
                "sellers",
                {"zalo_user_id": user_key, "name": display_name, "seller_type": "ccrb"}
            )
            if res:
                seller_id = res[0]["id"]
                self._seller_cache[user_key] = seller_id
                return seller_id
        except Exception as e:
            log.error("Failed to create seller in Supabase: %s", e)
        return None

    def _get_or_create_conversation(self, seller_id: str) -> str | None:
        if seller_id in self._conv_cache:
            return self._conv_cache[seller_id]

        convs = self._get(f"conversations?seller_id=eq.{seller_id}&channel=eq.zalo_personal_test")
        if convs:
            conv_id = convs[0]["id"]
            self._conv_cache[seller_id] = conv_id
            return conv_id

        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            res = self._post(
                "conversations",
                {"seller_id": seller_id, "channel": "zalo_personal_test", "started_at": now_iso}
            )
            if res:
                conv_id = res[0]["id"]
                self._conv_cache[seller_id] = conv_id
                return conv_id
        except Exception as e:
            log.error("Failed to create conversation in Supabase: %s", e)
        return None

    # --- ConversationStore Protocol --------------------------------------

    def save(self, conv: Conversation) -> None:
        """Persist conversation, listings, and leads into Supabase."""
        # Always mirror into local fallback first if configured for backup/safety
        if self.fallback:
            try:
                self.fallback.save(conv)
            except Exception as e:
                log.warning("Fallback SQLite save failed: %s", e)

        if not self.is_configured:
            return

        try:
            seller_id = self._get_or_create_seller(conv.user_key)
            if not seller_id:
                return

            conv_id = self._get_or_create_conversation(seller_id)
            now_iso = datetime.now(timezone.utc).isoformat()

            # 1. Update conversation timestamp
            if conv_id:
                self._patch(f"conversations?id=eq.{conv_id}", {"last_message_at": now_iso})

            # 2. Persist listings into Supabase `listings` table
            for li in conv.listings:
                fields = li.prop.fields
                deal_type = "thue" if li.prop.is_rental else "ban"
                listing_payload: dict[str, Any] = {
                    "seller_id": seller_id,
                    "code": li.listing_id[:8].upper(),
                    "deal": deal_type,
                    "district": fields.get("quan"),
                    "ward": fields.get("phuong"),
                    "street": fields.get("duong"),
                    "legal_status": fields.get("phap_ly"),
                    "boc_tach": fields,
                    "status": "dang_rao" if li.listing_proposed else "cho_thong_tin",
                    "updated_at": now_iso,
                }
                # Parse numeric area if available
                if li.prop.dien_tich:
                    listing_payload["area_m2"] = float(li.prop.dien_tich)
                # Parse numeric price if available
                if li.prop.gia:
                    listing_payload["price_vnd"] = int(li.prop.gia)
                if li.prop.loai_hinh:
                    listing_payload["property_type"] = li.prop.loai_hinh

                # Upsert listing by (seller_id, code) or check existing
                existing = self._get(f"listings?seller_id=eq.{seller_id}&code=eq.{listing_payload['code']}")
                if existing:
                    lid = existing[0]["id"]
                    self._patch(f"listings?id=eq.{lid}", listing_payload)
                else:
                    self._post("listings", listing_payload)

        except Exception as e:
            log.error("Failed to save conversation to Supabase: %s", e)

    def load(self, user_key: str) -> Any:
        """Load conversation from Supabase.
        CRITICAL: If the seller or conversation was deleted on CRM (aioinhadat.vercel.app),
        this returns None so the bot immediately resets its session!
        """
        from .engine import Conversation, Listing, Turn

        if not self.is_configured:
            return self.fallback.load(user_key) if self.fallback else None

        try:
            # 1. Check if seller exists in Supabase
            sellers = self._get(f"sellers?zalo_user_id=eq.{urllib.parse.quote(user_key)}")
            if not sellers:
                # User was deleted on CRM! Drop any cache and return None (reset bot session)
                self._seller_cache.pop(user_key, None)
                if self.fallback:
                    self.fallback.reset(user_key)
                return None

            seller = sellers[0]
            seller_id = seller["id"]
            self._seller_cache[user_key] = seller_id

            # 2. Check if conversation exists
            convs = self._get(f"conversations?seller_id=eq.{seller_id}&channel=eq.zalo_personal_test")
            if not convs:
                # Conversation was deleted/reset on CRM!
                if self.fallback:
                    self.fallback.reset(user_key)
                return None

            conv_data = convs[0]
            conv_id = conv_data["id"]
            self._conv_cache[seller_id] = conv_id

            # 3. Load listings for this seller
            db_listings = self._get(f"listings?seller_id=eq.{seller_id}&order=created_at.asc")
            listings: list[Listing] = []
            for row in db_listings:
                boc_tach = row.get("boc_tach") or {}
                prop = Property(
                    loai_hinh=row.get("property_type") or boc_tach.get("loai_hinh"),
                    is_rental=(row.get("deal") == "thue"),
                    fields=boc_tach,
                )
                li = Listing(
                    listing_id=row.get("code", "") or row.get("id"),
                    prop=prop,
                    listing_proposed=bool(row.get("status") == "dang_rao"),
                    status=row.get("status", "cho_thong_tin"),
                )
                listings.append(li)

            # 4. Load messages for history
            history_rows = self._get(f"messages?conversation_id=eq.{conv_id}&order=created_at.asc")
            history: list[Turn] = []
            for m in history_rows:
                sender = m.get("sender", "")
                role = "assistant" if sender in ("bot", "assistant") else "user"
                body = m.get("body", "")
                # Parse timestamp if available
                ts = 0.0
                if m.get("created_at"):
                    try:
                        ts = datetime.fromisoformat(m["created_at"].replace("Z", "+00:00")).timestamp()
                    except Exception:
                        pass
                history.append(Turn(role=role, content=body, at=ts))

            # 5. Reconstruct Conversation
            conv = Conversation(
                user_key=user_key,
                user_type=vai_tu_seller_type(seller.get("seller_type")),
                assistant=assign_assistant(user_key),
                history=history,
                listings=listings if listings else [Listing(prop=Property())],
                active_listing_id=listings[0].listing_id if listings else None,
                role="seller" if listings else "unknown",
            )
            return conv

        except Exception as e:
            log.error("Failed to load conversation from Supabase: %s. Using fallback.", e)
            return self.fallback.load(user_key) if self.fallback else None

    def reset(self, user_key: str) -> None:
        """Reset conversation and listings for this user directly in Supabase."""
        self._seller_cache.pop(user_key, None)
        if self.fallback:
            try:
                self.fallback.reset(user_key)
            except Exception as e:
                log.warning("Fallback SQLite reset failed: %s", e)

        if not self.is_configured:
            return

        try:
            sellers = self._get(f"sellers?zalo_user_id=eq.{urllib.parse.quote(user_key)}")
            if not sellers:
                return
            seller_id = sellers[0]["id"]

            # 1. Delete or unlist listings
            self._delete(f"listings?seller_id=eq.{seller_id}")

            # 2. Delete conversations and messages
            convs = self._get(f"conversations?seller_id=eq.{seller_id}")
            for c in convs:
                cid = c["id"]
                self._delete(f"messages?conversation_id=eq.{cid}")
                self._delete(f"conversations?id=eq.{cid}")

            # 3. Clear cache
            self._conv_cache.pop(seller_id, None)
            log.info("Successfully reset user %s in Supabase", user_key)
        except Exception as e:
            log.error("Failed to reset user %s in Supabase: %s", user_key, e)
