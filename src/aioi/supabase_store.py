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
import re
import urllib.request
import urllib.parse
import uuid
from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING

from .kho_anh import BUCKET_CONG_KHAI, BUCKET_RIENG, la_uuid
from .prompts import FIELD_LABELS
from .schema import TYPE_TO_GROUP, Property, _calc_area_from_dimension
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


# 18/10/2026 (SRS-5.1zzzzzzz37): `save` từng đọc `li.prop.dien_tich` / `li.prop.gia` — `Property` không có hai thuộc tính đó
# (giá trị nằm trong `prop.fields`), nên MỌI lượt có tin văng AttributeError và tin người bán không bao giờ vào bảng `listings`.
# Giá gửi CHUỖI GỐC vào `price_raw`: trigger `listings_set_price_vnd` tính `price_vnd` bằng `parse_vnd` (luật tiền một nguồn,
# không đổi tiền ở Python). `legal_status` chỉ nhận mã (`so_hong_rieng`…): chữ khách gõ đổi qua `boc_thong_so` của DB. `status`
# chỉ đặt lúc TẠO tin (`cho_thong_tin`; trigger `listings_quyet_dinh_dang_tin` tự lên `dang_ban` khi đủ) — `dang_rao` cũ không
# có trong CHECK, và ghi đè mỗi lượt sẽ xoá trạng thái admin đặt trên CRM (`an`, `da_chot`).
MA_PHAP_LY = {"so_hong_rieng", "so_hong_chung", "so_hong", "hdmb", "giay_tay"}

# Cột thông số `listings` lấy từ `boc_thong_so` (cùng bộ cột `ap_thong_so` của DB nhận), trừ legal_status (đi `_ma_phap_ly`) và
# rent_income_vnd (chỉ tin bán, đọc tiền là việc của parse_vnd).
COT_THONG_SO = ("frontage_m", "length_m", "rear_width_m", "legal_area_m2", "built_area_m2", "alley_width_m",
                "distance_to_street_m", "floors", "floors_text", "floor", "bedrooms", "bathrooms", "year_built",
                "has_completion", "has_elevator", "car_in_house", "corner_lot", "negotiable", "access_type",
                "planning_status", "furnishing", "direction")
_O_KHONG_PHAI_THONG_SO = {"dia_chi", "duong", "phuong", "quan", "gan_nga_tu", "du_an", "ma_so_can", "unit_type", "gia",
                          "loai_hinh", "phap_ly", "hinh_anh", "ly_do_ban", "trang_thai"}

# Loại hình: mã lõi Python (schema.TYPE_TO_GROUP, 26 mã) → enum `listings.property_type` (12 mã của CRM) — SRS-5.1zzzzzzz68. Trước bản
# này save() ghi thẳng mã lõi: "nha_cap_4" (DB là "nha_cap4"), "chdv", "can_ho"… không có trong enum → PostgREST 22P02, cả dòng tin
# không ghi được. Mã không chắc thuộc loại nào (du_an, shophouse_du_an) thì không ghi cột — để DB giữ giá trị đang có.
LOAI_SANG_DB = {
    "nha_pho": "nha_pho", "nha_cap_4": "nha_cap4", "biet_thu": "biet_thu", "chung_cu": "chung_cu", "can_ho": "chung_cu",
    "officetel": "chung_cu", "penthouse": "chung_cu", "dat": "dat", "dat_tho_cu": "dat", "dat_du_an": "dat",
    "dat_nong_nghiep": "dat_nong_nghiep", "dat_kinh_doanh": "dat_kinh_doanh", "dat_skc": "dat_kinh_doanh",
    "dat_tmd": "dat_kinh_doanh", "kho_xuong": "kho_xuong", "kho_bai": "kho_xuong", "nha_xuong": "kho_xuong",
    "phong_tro": "phong_tro", "toa_nha": "toa_nha", "chdv": "toa_nha", "khach_san": "toa_nha", "mat_bang": "mat_bang",
    "shophouse": "mat_bang", "chua_ro": "chua_ro",
}
DB_SANG_LOAI = {"nha_cap4": "nha_cap_4"}


def ma_loai_db(loai: str | None) -> str | None:
    """Mã lõi → mã enum DB; None = không ghi cột."""
    return LOAI_SANG_DB.get(loai or "")


def loai_tu_db(loai_db: str | None, boc_tach: dict[str, Any] | None = None) -> str | None:
    """Mã enum DB → mã lõi; ô `loai_hinh` lõi đã ghi trong boc_tach (cụ thể hơn, vd chdv) đứng trước."""
    cu = (boc_tach or {}).get("loai_hinh")
    if isinstance(cu, str) and cu in TYPE_TO_GROUP:
        return cu
    return DB_SANG_LOAI.get(loai_db or "", loai_db) if loai_db else None


# Trạng thái tin: chữ của engine (STATUS_MAP) ↔ mã cột `listings.status` (SRS-5.1zzzzzzz63). Trước bản này save() không bao giờ ghi
# status — khách nói "bán rồi / ngưng rao" chỉ đổi trong bộ nhớ, web vẫn hiện tin.
TRANG_THAI_SANG_DB = {"đã bán": "da_chot", "đã cho thuê": "da_chot", "đã cọc": "da_coc",
                      "dừng bán": "an", "không rao": "an", "thôi đăng ký": "an"}
DB_SANG_TRANG_THAI = {"da_chot": "đã bán", "da_coc": "đã cọc", "an": "không rao"}
_DB_DANG_HIEN = ("dang_ban", "dang_quan_tam", "da_coc")


def ma_trang_thai(trang_thai: str | None, db_hien_tai: str | None) -> str | None:
    """Mã `listings.status` cần ghi, hoặc None = để nguyên (trigger `listings_quyet_dinh_dang_tin` tự quyết cho_thong_tin ↔ dang_ban).
    "đã cọc" chỉ áp cho tin ĐANG HIỆN — tin chưa duyệt bản nháp không vì "cọc rồi" mà lên web. "đang bán" trên tin đang ẩn / đã chốt /
    đã cọc → về cho_thong_tin để trigger xét lại điều kiện lên web (đủ giá · diện tích · phường + khách đã duyệt)."""
    ma = TRANG_THAI_SANG_DB.get(trang_thai or "")
    if ma == "da_coc" and db_hien_tai not in _DB_DANG_HIEN:
        return None
    if ma:
        return None if ma == db_hien_tai else ma
    if db_hien_tai in ("an", "da_chot", "da_coc"):
        return "cho_thong_tin"
    return None


def trang_thai_tu_db(ma: str | None, la_thue: bool = False) -> str:
    chu = DB_SANG_TRANG_THAI.get(ma or "", "đang bán")
    return "đã cho thuê" if chu == "đã bán" and la_thue else chu
def so_m2(fields: dict[str, str]) -> float | None:
    """Diện tích (m²) từ ô bóc tách: số đầu tiên của `dien_tich` / `dien_tich_dat`, không có thì tính từ `kich_thuoc` (4x15)."""
    for k in ("dien_tich", "dien_tich_dat"):
        m = re.search(r"\d+(?:[.,]\d+)?", str(fields.get(k) or ""))
        if m:
            v = float(m.group(0).replace(",", "."))
            if v > 0:
                return v
    tinh = _calc_area_from_dimension(str(fields.get("kich_thuoc") or ""))
    return float(tinh[:-2]) if tinh else None


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
        self._anh_da_ghi: set[str] = set()   # "bucket/khoá" đã có dòng listing_media — khỏi gửi lại mỗi lượt
        self._thong_so_nho: dict[tuple[str, str], dict[str, Any]] = {}   # (loại, chữ đã gửi) → cột thông số boc_thong_so trả
        self._active_da_ghi: dict[str, str] = {}   # seller_id → id căn đang nói đã ghi lên sellers.active_listing_id

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

    def _dia_ban(self, fields: dict[str, str]) -> tuple[str | None, str | None]:
        """(phường mới = wards.ten_day_du, quận cũ) từ chữ khách gõ — nhận cả kiểu trước gộp ("P.1, Q.5") và sau gộp ("Phường Chợ
        Quán") qua `rpc/chuan_dia_ban` (20261018e, SRS-5.1zzzzzzz39). Phường cũ bị chia (mo_ho) / không nhận ra → không ghi phường;
        lỗi mạng → không ghi gì (cột cũ giữ nguyên)."""
        chu = ", ".join(str(fields[k]) for k in ("dia_chi", "phuong", "quan") if fields.get(k))
        phuong, quan = self._chuan_dia_ban(chu)
        # Căn hộ trong dự án: khách thường chỉ nói tên dự án — lấy phường theo địa chỉ dự án trong kho (SRS-5.1zzzzzzz41).
        if not phuong and fields.get("du_an"):
            try:
                da = self._request("POST", "rpc/match_projects?select=location_raw,ward,district",
                                   data={"p_text": str(fields["du_an"])})
            except Exception as e:
                log.warning("match_projects lỗi: %s", e)
                da = None
            if isinstance(da, list) and da:
                d = da[0]
                p2, q2 = self._chuan_dia_ban(", ".join(str(d[k]) for k in ("location_raw", "ward", "district") if d.get(k)))
                phuong, quan = p2, quan or q2
        return phuong, quan

    def _chuan_dia_ban(self, chu: str) -> tuple[str | None, str | None]:
        if not chu:
            return None, None
        try:
            kq = self._request("POST", "rpc/chuan_dia_ban", data={"p_text": chu})
        except Exception as e:
            log.warning("chuan_dia_ban lỗi: %s", e)
            return None, None
        dong = kq[0] if isinstance(kq, list) and kq else {}
        return dong.get("phuong"), dong.get("quan_cu")

    def _ma_phap_ly(self, chu: str | None) -> str | None:
        """Chữ pháp lý khách gõ → mã cột `legal_status` (qua `boc_thong_so` của DB); không nhận ra → None (không ghi)."""
        chu = str(chu or "").strip()
        if not chu:
            return None
        if chu in MA_PHAP_LY:
            return chu
        try:
            kq = self._request("POST", "rpc/boc_thong_so", data={"p_text": chu})
        except Exception as e:
            log.warning("boc_thong_so lỗi: %s", e)
            return None
        ma = kq.get("legal_status") if isinstance(kq, dict) else None
        return ma if ma in MA_PHAP_LY else None

    def _thong_so(self, fields: dict[str, Any], loai: str | None) -> dict[str, Any]:
        """Cột thông số (ngang · dài · tầng · phòng ngủ · WC · đường vào · hướng · nội thất …) đọc từ các ô AI đã bóc, qua cùng bộ đọc
        `boc_thong_so` của DB (SRS-5.1zzzzzzz65). Trước bản này chỉ `listing_facts` (bot TypeScript, đã gỡ) điền các cột đó → tin
        từ lõi Python lên web không có bảng thông số. Ô địa chỉ / giá / dự án không đưa vào (số nhà, "hẻm 123" không phải thông số);
        pháp lý đi đường riêng `_ma_phap_ly`. Nhớ theo chữ đã gửi để không gọi lại mỗi lượt."""
        dong = []
        for k, v in fields.items():
            if k in _O_KHONG_PHAI_THONG_SO or not isinstance(v, (str, int, float)) or not str(v).strip():
                continue
            nhan = FIELD_LABELS.get(k, k.replace("_", " ")).split(" (")[0]
            dong.append(f"{nhan}: {v}")
        chu = "; ".join(dong)
        if not chu:
            return {}
        khoa = (loai or "", chu)
        if khoa not in self._thong_so_nho:
            try:
                kq = self._request("POST", "rpc/boc_thong_so", data={"p_text": chu, "p_type": loai})
            except Exception as e:  # noqa: BLE001 — thông số là phần thêm, tin vẫn lưu
                log.warning("boc_thong_so (thông số) lỗi: %s", e)
                return {}
            if len(self._thong_so_nho) > 2000:
                self._thong_so_nho.clear()
            self._thong_so_nho[khoa] = {c: kq[c] for c in COT_THONG_SO if isinstance(kq, dict) and kq.get(c) is not None}
        return dict(self._thong_so_nho[khoa])

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

    def ghi_luot_chat(self, user_key: str, incoming_text: str, bot_reply: str, zalo_msg_id: str | None = None,
                      role: str = "seller", user_name: str | None = None) -> None:
        """Một lượt chat → hai dòng `messages` (khách, bot) + đẩy hội thoại lên đầu CRM. Dùng chung đường tìm / tạo người bán và
        hội thoại với `save` (SRS-5.1zzzzzzz56 — trước đây supabase_sync có bản riêng)."""
        if not (self.is_configured and user_key):
            return
        seller_id = self._get_or_create_seller(user_key, user_name)
        conv_id = self._get_or_create_conversation(seller_id) if seller_id else None
        if not conv_id:
            return
        now_iso = datetime.now(timezone.utc).isoformat()
        if incoming_text:
            msg = {"conversation_id": conv_id, "sender": "seller" if role == "seller" else "buyer",
                   "body": incoming_text, "created_at": now_iso}
            if zalo_msg_id:
                msg["zalo_msg_id"] = str(zalo_msg_id)
            self._post("messages", msg, prefer="return=minimal")
        if bot_reply:
            self._post("messages", {"conversation_id": conv_id, "sender": "bot", "body": bot_reply, "created_at": now_iso},
                       prefer="return=minimal")
        self._patch(f"conversations?id=eq.{conv_id}", {"last_message_at": now_iso})

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
            lid_dang_noi = None
            for li in conv.listings:
                fields = li.prop.fields
                deal_type = "thue" if li.prop.is_rental else "ban"
                listing_payload: dict[str, Any] = {
                    "seller_id": seller_id,
                    "code": li.listing_id[:8].upper(),
                    "deal": deal_type,
                    "street": fields.get("duong"),
                    "boc_tach": fields,
                    "updated_at": now_iso,
                }
                if fields.get("dia_chi"):
                    listing_payload["location_raw"] = fields["dia_chi"]
                phuong, quan = self._dia_ban(fields)
                if phuong:
                    listing_payload["ward"] = phuong
                if quan:
                    listing_payload["district"] = quan
                listing_payload.update(self._thong_so(fields, ma_loai_db(li.prop.loai_hinh)))
                ma_pl = self._ma_phap_ly(fields.get("phap_ly"))
                if ma_pl:
                    listing_payload["legal_status"] = ma_pl
                dt = so_m2(fields)
                if dt is not None:
                    listing_payload["area_m2"] = dt
                if fields.get("gia"):
                    listing_payload["price_raw"] = str(fields["gia"])
                if ma_loai_db(li.prop.loai_hinh):
                    listing_payload["property_type"] = ma_loai_db(li.prop.loai_hinh)

                # Tin trên DB mang ĐÚNG id của Listing (uuid) — thư mục ảnh trên Storage là `<uuid>/…` và ràng buộc
                # listing_media_duong_dan_theo_uuid đòi khớp (SRS-5.1zzzzzzz56). Tin cũ tạo trước bản này: tìm theo code.
                lid_mong = str(uuid.UUID(li.listing_id)) if la_uuid(li.listing_id) else None
                existing = self._get(f"listings?id=eq.{lid_mong}&select=id,status") if lid_mong else []
                if not existing:
                    existing = self._get(f"listings?seller_id=eq.{seller_id}&code=eq.{listing_payload['code']}&select=id,status")
                if existing:
                    lid = existing[0]["id"]
                    ma = ma_trang_thai(getattr(li, "status", None), existing[0].get("status"))
                    if ma:
                        listing_payload["status"] = ma
                    self._patch(f"listings?id=eq.{lid}", listing_payload)
                else:
                    # Tin tạo từ chat chỉ lên web khi khách đồng ý bản nháp (trigger listings_quyet_dinh_dang_tin đọc
                    # can_chu_duyet + chu_duyet_at; SRS-5.1zzzzzzz47). Admin / Excel tạo tin thì cờ này false như cũ.
                    moi = {**listing_payload, "status": "cho_thong_tin", "can_chu_duyet": True}
                    if lid_mong:
                        moi["id"] = lid_mong
                    tao = self._post("listings", moi)
                    lid = (tao[0].get("id") if tao else None) or lid_mong
                if lid:
                    self._ghi_anh(lid, getattr(li, "media", None) or [])
                    if li.listing_id == getattr(conv, "active_listing_id", None):
                        lid_dang_noi = lid

            # 3. Căn đang nói tới → sellers.active_listing_id, để khởi động lại (mỗi lần cài VPS) không quay về căn đầu tiên.
            if lid_dang_noi and self._active_da_ghi.get(seller_id) != lid_dang_noi:
                self._patch(f"sellers?id=eq.{seller_id}", {"active_listing_id": lid_dang_noi})
                self._active_da_ghi[seller_id] = lid_dang_noi

        except Exception as e:
            log.error("Failed to save conversation to Supabase: %s", e)

    def _ghi_anh(self, lid: str, media: list[dict]) -> None:
        """Ảnh / giấy tờ đã lên Supabase Storage (`kho_anh.SupabaseMediaStore`) → dòng `listing_media` để web hiện ảnh (bucket
        công khai) và admin xem giấy tờ (bucket riêng). Chỉ ghi tệp nằm đúng thư mục `<uuid tin>/`; trùng (bucket, khoá) thì bỏ qua."""
        dong = []
        for i, m in enumerate(media or []):
            bucket, _, khoa = str(m.get("path") or "").partition("/")
            if bucket not in (BUCKET_CONG_KHAI, BUCKET_RIENG) or not khoa.startswith(f"{lid}/"):
                continue
            if f"{bucket}/{khoa}" in self._anh_da_ghi:
                continue
            mime = m.get("content_type") or ("image/jpeg" if re.search(r"\.jpe?g$", khoa, re.I) else
                                              "application/pdf" if khoa.lower().endswith(".pdf") else "application/octet-stream")
            dong.append({"listing_id": lid, "bucket": bucket, "storage_path": khoa, "mime_type": mime,
                         "media_type": "giay_to" if bucket == BUCKET_RIENG else "khac",
                         "sort_order": min(i, 9999), "nguon": "chat"})
        if not dong:
            return
        try:
            self._request("POST", "listing_media?on_conflict=bucket,storage_path", data=dong,
                          prefer="resolution=ignore-duplicates,return=minimal")
            self._anh_da_ghi.update(f"{d['bucket']}/{d['storage_path']}" for d in dong)
        except Exception as e:  # noqa: BLE001 — ghi ảnh hỏng thì tin vẫn lưu, lượt sau thử lại
            log.warning("ghi listing_media lỗi: %s", e)

    def ghi_duyet(self, conv: Conversation, dong_y: bool) -> None:
        """Khách ĐỒNG Ý bản nháp → `chu_duyet_at` = bây giờ (trigger cho lên web nếu đủ giá / diện tích / phường); KHÔNG đồng ý →
        xoá dấu (tin đang hiển thị thì trigger hạ về `cho_thong_tin`). Quyết định đồng ý hay không là của lượt AI, đã kiểm trích
        dẫn ở engine (SRS-5.1zzzzzzz47)."""
        if not self.is_configured:
            return
        sid = self._get_or_create_seller(conv.user_key)
        if not sid:
            return
        code = conv.active.listing_id[:8].upper()
        self._patch(f"listings?seller_id=eq.{sid}&code=eq.{code}",
                    {"chu_duyet_at": datetime.now(timezone.utc).isoformat() if dong_y else None})

    # Cột → ô bot hỏi: đúng ba điều kiện của `listing_du_dang_tin` (giá · diện tích · phường).
    _COT_DANG_TIN = (("phuong", "ward"), ("dien_tich", "area_m2"), ("gia", "price_vnd"))

    def trang_thai_tin(self, conv: Conversation) -> dict | None:
        """Tin đang nói có ĐANG HIỂN THỊ trên web không — đọc `status` thật (trigger `listings_quyet_dinh_dang_tin` quyết),
        không suy từ điểm đủ của lõi (SRS-5.1zzzzzzz44). {"len_web", "thieu": [ô], "cho_duyet"}; lỗi / chưa có dòng → None."""
        if not self.is_configured:
            return None
        try:
            sid = self._get_or_create_seller(conv.user_key)
            if not sid:
                return None
            code = conv.active.listing_id[:8].upper()
            rows = self._get(f"listings?seller_id=eq.{sid}&code=eq.{code}"
                             "&select=status,ward,area_m2,price_vnd,can_chu_duyet,chu_duyet_at")
        except Exception as e:  # noqa: BLE001 — không biết thì bot nói trung tính, không bịa "đã đăng"
            log.warning("trang_thai_tin lỗi: %s", e)
            return None
        if not rows:
            return None
        r = rows[0]
        thieu = [o for o, cot in self._COT_DANG_TIN if r.get(cot) in (None, "")]
        return {"len_web": r.get("status") == "dang_ban", "thieu": thieu,
                "cho_duyet": not thieu and bool(r.get("can_chu_duyet")) and not r.get("chu_duyet_at")}

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

            # Bản SQLite trên VPS giữ thứ Supabase không có cột (bảng giá riêng, mốc lịch sử, ảnh đã cất, đã trình bản nháp…) —
            # Supabase vẫn là nguồn cho tin và hội thoại, SQLite chỉ bù phần thiếu (SRS-5.1zzzzzzz63).
            cu = None
            if self.fallback:
                try:
                    cu = self.fallback.load(user_key)
                except Exception as e:  # noqa: BLE001
                    log.warning("Fallback SQLite load failed: %s", e)

            # 3. Load listings for this seller
            db_listings = self._get(f"listings?seller_id=eq.{seller_id}&order=created_at.asc")
            listings: list[Listing] = []
            for row in db_listings:
                boc_tach = row.get("boc_tach") or {}
                prop = Property(
                    loai_hinh=loai_tu_db(row.get("property_type"), boc_tach),
                    is_rental=(row.get("deal") == "thue"),
                    fields=boc_tach,
                )
                # listing_id = uuid của dòng (bỏ gạch) khi tin tạo từ bản 19/10 (code = 8 ký tự đầu id) — để ảnh ghi đúng thư
                # mục `<uuid>/` và lượt sau cập nhật đúng dòng; tin cũ giữ code như trước (SRS-5.1zzzzzzz56).
                rid = str(row.get("id") or "").replace("-", "")
                lid_engine = rid if rid and (row.get("code") or "") == rid[:8].upper() else (row.get("code", "") or row.get("id"))
                cu_li = next((x for x in (cu.listings if cu else []) if x.listing_id == lid_engine), None)
                li = Listing(
                    listing_id=lid_engine,
                    prop=prop,
                    # Đã trình bản nháp chưa: bản SQLite trên VPS nhớ đúng; không có thì suy từ DB (khách đã duyệt, hoặc tin đã đủ ý —
                    # bản nháp đi ngay lượt đủ ý). Trước đây so với "dang_rao" (không có trên DB) nên luôn sai → trình lại bản nháp.
                    listing_proposed=cu_li.listing_proposed if cu_li else bool(row.get("chu_duyet_at") or prop.summary_ready()),
                    status=trang_thai_tu_db(row.get("status"), prop.is_rental),
                    history_start=cu_li.history_start if cu_li else 0,
                    media=cu_li.media if cu_li else [],
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
            ids = [li.listing_id for li in listings]
            active = str(seller.get("active_listing_id") or "").replace("-", "")
            if active not in ids:
                active = cu.active_listing_id if cu and cu.active_listing_id in ids else (ids[-1] if ids else None)
            conv = Conversation(
                user_key=user_key,
                user_type=vai_tu_seller_type(seller.get("seller_type")),
                assistant=assign_assistant(user_key),
                history=history,
                listings=listings if listings else [Listing(prop=Property())],
                active_listing_id=active,
                role="seller" if listings else (cu.role if cu else "unknown"),
            )
            if cu:
                conv.price_book = cu.price_book
                conv.buyer_lead = cu.buyer_lead
                conv.last_ai_at = cu.last_ai_at
                if conv.user_type.value == "unknown":
                    conv.user_type = cu.user_type
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
