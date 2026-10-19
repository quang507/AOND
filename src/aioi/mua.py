"""Phía người mua trên Supabase (19/10/2026, docs/07 SRS-5.1zzzzzzz70; chủ dự án: "đưa 4 việc vào lõi python").

Bot TypeScript cũ ghi bốn việc phía mua; lõi Python trước bản này chỉ hỏi nhu cầu khách, không ghi gì. Máy phía sau đã có trên DB
và chạy theo dòng được ghi — lõi chỉ cần GHI ĐÚNG DÒNG:

- **quan tâm căn** → `rpc/mark_listing_interest(p_codes, p_buyer_id)`: bảng `interests` + tin chuyển "đang quan tâm"; khi căn
  chốt, trigger `listings_bao_can_da_chot` báo những khách đã quan tâm.
- **hẹn xem nhà** → dòng `viewings` (status `proposed`): trigger `viewings_bao_ctv_va_email` nhắc CTV / admin, mở câu xác nhận lịch.
- **câu khách hỏi mà dữ liệu căn không có** → dòng `info_requests` (source `buyer_ask`): trigger `route_info_request` giao chủ nhà
  (có Zalo) / CTV khu vực / admin kèm hạn trả lời, `notify_info_request_escalation` gửi nhắc. Trả lời (chủ nhà trong chat, CTV /
  admin bằng "#mã: câu trả lời") → `status = answered` → trigger `info_request_bao_lai_khach` báo lại khách.
- **chốt kèo** → dòng `deals` khi tin chuyển `da_chot` (giá, % phí theo vai người rao).

Ý khách do AI đọc (lượt lập thao tác, khoá `mua` / `tra_loi_khach_hoi`); code chỉ kiểm cụm trích có thật trong tin khách và mã căn
có thật, đang hiện trên web, rồi mới ghi.
"""
from __future__ import annotations

import logging
import re
import time
import urllib.parse
from typing import Any

log = logging.getLogger("aioi.mua")

# Trạng thái tin còn hiện cho khách (cùng bộ với `lib/supabase.ts` TRANG_THAI_HIEN).
TRANG_THAI_HIEN = ("dang_ban", "dang_quan_tam", "da_coc")
# Cột căn đưa cho model khi tư vấn khách mua — KHÔNG có số nhà (`location_raw`), mô tả gốc (có thể chứa SĐT) hay người bán.
COT_CAN = ("id,code,property_type,deal,street,ward,district,area_m2,price_raw,price_vnd,bedrooms,floors_text,legal_status,"
           "direction,access_type,alley_width_m,status")
_LOAI_MUA_SANG_DB = {"nha_pho": "nha_pho", "nha_cap_4": "nha_cap4", "biet_thu": "biet_thu", "chung_cu": "chung_cu",
                     "can_ho": "chung_cu", "condo": "chung_cu", "dat": "dat", "dat_tho_cu": "dat", "dat_nen": "dat",
                     "phong_tro": "phong_tro", "mat_bang": "mat_bang", "toa_nha": "toa_nha", "chdv": "toa_nha",
                     "kho_xuong": "kho_xuong", "dat_nong_nghiep": "dat_nong_nghiep", "dat_kinh_doanh": "dat_kinh_doanh"}
# Lệnh nhân viên (CTV / admin) trả lời câu khách hỏi: "#<mã tin>: <câu trả lời>" — cú pháp do hệ thống đặt trong tin nhắc
# (`notify_info_request_escalation`), không phải đoán ý khách.
_LENH_TRA_LOI = re.compile(r"^\s*#\s*([A-Za-z0-9][A-Za-z0-9-]{3,})\s*:\s*(.+)$", re.S)


def lenh_tra_loi(text: str) -> tuple[str, str] | None:
    """`"#ABCD1234: sổ riêng"` → `("ABCD1234", "sổ riêng")`; không đúng cú pháp → None."""
    m = _LENH_TRA_LOI.match(text or "")
    return (m.group(1).upper(), m.group(2).strip()) if m and m.group(2).strip() else None


def _q(s: str) -> str:
    return urllib.parse.quote(str(s), safe="")


class KhoNguoiMua:
    """Trộn vào `SupabaseConversationStore` (dùng `_get` / `_post` / `_patch` / `_request` / `is_configured` của nó)."""

    _buyer_cache: dict[str, str]

    # --- Khách mua ------------------------------------------------------------------------------------------------
    def khach_mua(self, user_key: str, ten: str | None = None, nhu_cau: dict[str, Any] | None = None) -> str | None:
        """id dòng `buyers` của khách (tạo nếu chưa có); ghi nhu cầu vào `preferences`. Lỗi mạng → None (không ghi việc gì)."""
        if not (self.is_configured and user_key):
            return None
        cache = self.__dict__.setdefault("_buyer_cache", {})
        try:
            bid = cache.get(user_key)
            if not bid:
                rows = self._get(f"buyers?zalo_user_id=eq.{_q(user_key)}&select=id")
                if rows:
                    bid = rows[0]["id"]
                else:
                    tao = self._post("buyers", {"zalo_user_id": user_key, "name": ten or f"Khách Zalo {user_key[-4:]}"})
                    bid = tao[0]["id"] if tao else None
                if bid:
                    cache[user_key] = bid
            if bid and nhu_cau:
                self._patch(f"buyers?id=eq.{bid}", {"preferences": nhu_cau})
            return bid
        except Exception as e:  # noqa: BLE001
            log.warning("khach_mua lỗi: %s", e)
            return None

    # --- Căn cho khách ----------------------------------------------------------------------------------------------
    def can_theo_ma(self, ma: list[str]) -> list[dict]:
        """Căn có mã (code / legacy_code) trong danh sách VÀ đang hiện cho khách."""
        ma = [m.strip().upper().lstrip("#") for m in ma if m and m.strip()][:5]
        if not (self.is_configured and ma):
            return []
        ds = ",".join(_q(m) for m in ma)
        hien = ",".join(TRANG_THAI_HIEN)
        try:
            return self._get(f"listings?or=(code.in.({ds}),legacy_code.in.({ds}))&status=in.({hien})&select={COT_CAN}")
        except Exception as e:  # noqa: BLE001
            log.warning("can_theo_ma lỗi: %s", e)
            return []

    def can_phu_hop(self, lead: Any, toi_da: int = 3) -> list[dict]:
        """Tối đa `toi_da` căn đang hiện khớp nhu cầu (loại BĐS, thuê / mua, khu vực, ngân sách) — mới cập nhật trước."""
        if not self.is_configured or lead is None:
            return []
        loc = [f"status=in.({','.join(TRANG_THAI_HIEN)})",
               "deal=eq." + ("cho_thue" if getattr(lead, "loai_giao_dich", "mua") == "thue" else "ban")]
        f = getattr(lead, "fields", {}) or {}
        loai = _LOAI_MUA_SANG_DB.get(str(getattr(lead, "loai_bds", None) or f.get("loai_bds") or "").strip().lower())
        if loai:
            loc.append(f"property_type=eq.{loai}")
        # Ký tự cú pháp của PostgREST (`,` `(` `)` `*` `"`) trong chữ khách làm hỏng bộ lọc `or=(…)` — bỏ trước khi ghép.
        kv = re.sub(r"[,()*\"\\]+", " ", str(getattr(lead, "khu_vuc", None) or f.get("khu_vuc") or "")).split("  ")[0].strip()
        if kv:
            mau = _q(f"*{kv}*")
            loc.append(f"or=(district.ilike.{mau},ward.ilike.{mau},street.ilike.{mau})")
        ns = str(getattr(lead, "ngan_sach", None) or f.get("ngan_sach") or "").strip()
        if ns:
            try:
                tran = self._request("POST", "rpc/parse_vnd", data={"p": ns})
            except Exception as e:  # noqa: BLE001
                log.warning("parse_vnd lỗi: %s", e)
                tran = None
            if isinstance(tran, (int, float)) and tran > 0:
                loc.append(f"price_vnd=lte.{int(tran * 1.1)}")
        try:
            return self._get(f"listings?{'&'.join(loc)}&select={COT_CAN}&order=updated_at.desc&limit={toi_da}")
        except Exception as e:  # noqa: BLE001
            log.warning("can_phu_hop lỗi: %s", e)
            return []

    # --- Ghi việc của khách ------------------------------------------------------------------------------------------
    def ghi_quan_tam(self, buyer_id: str, ma: list[str]) -> bool:
        try:
            self._request("POST", "rpc/mark_listing_interest", data={"p_codes": ma, "p_buyer_id": buyer_id})
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("ghi_quan_tam lỗi: %s", e)
            return False

    def ghi_hen_xem(self, buyer_id: str, can: dict, gio: str) -> bool:
        """Một lịch đang chờ cho mỗi (khách, căn): đã có lịch `proposed` / `pending` thì không tạo thêm."""
        try:
            co = self._get(f"viewings?buyer_id=eq.{buyer_id}&listing_id=eq.{can['id']}&status=in.(proposed,pending)&select=id")
            if co:
                return True
            self._post("viewings", {"listing_id": can["id"], "listing_code": can.get("code"), "buyer_id": buyer_id,
                                    "time_text": gio[:200], "status": "proposed", "source": "bot_python"},
                       prefer="return=minimal")
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("ghi_hen_xem lỗi: %s", e)
            return False

    def ghi_hoi_chu_nha(self, buyer_id: str, can: dict, cau_hoi: str) -> bool:
        """Câu khách hỏi → `info_requests` (DB tự giao chủ nhà / CTV / admin). Cùng câu đang chờ thì không tạo thêm."""
        cau_hoi = cau_hoi.strip()[:500]
        try:
            co = self._get(f"info_requests?buyer_id=eq.{buyer_id}&listing_id=eq.{can['id']}&status=eq.pending"
                           f"&question=eq.{_q(cau_hoi)}&select=id")
            if co:
                return True
            self._post("info_requests", {"listing_id": can["id"], "buyer_id": buyer_id, "question": cau_hoi,
                                         "status": "pending", "source": "buyer_ask"}, prefer="return=minimal")
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("ghi_hoi_chu_nha lỗi: %s", e)
            return False

    # --- Trả lời câu khách hỏi ----------------------------------------------------------------------------------------
    def cau_hoi_cho_nguoi_ban(self, user_key: str) -> list[dict]:
        """Câu khách hỏi đang chờ CHÍNH người rao này trả lời (giao `seller`), mới trước. Nhớ 60 giây mỗi người — lượt chat nào của
        người rao cũng gọi; trả lời xong thì xoá nhớ (`tra_loi_cau_hoi`)."""
        if not (self.is_configured and user_key):
            return []
        nho = self.__dict__.setdefault("_cau_hoi_nho", {})
        if user_key in nho and time.time() - nho[user_key][0] < 60:
            return nho[user_key][1]
        ra = self._cau_hoi_cho(user_key)
        nho[user_key] = (time.time(), ra)
        return ra

    def _cau_hoi_cho(self, user_key: str) -> list[dict]:
        try:
            s = self._get(f"sellers?zalo_user_id=eq.{_q(user_key)}&select=id")
            if not s:
                return []
            tin = self._get(f"listings?seller_id=eq.{s[0]['id']}&select=id,code")
            if not tin:
                return []
            ma = {t["id"]: t.get("code") for t in tin}
            ds = ",".join(ma)
            rows = self._get(f"info_requests?listing_id=in.({ds})&status=eq.pending&assignee=eq.seller&source=eq.buyer_ask"
                             f"&question=not.in.(xac_nhan_lich,con_ban)&select=id,listing_id,question&order=created_at.desc&limit=5")
            return [{**r, "code": ma.get(r["listing_id"])} for r in rows]
        except Exception as e:  # noqa: BLE001
            log.warning("cau_hoi_cho_nguoi_ban lỗi: %s", e)
            return []

    def tra_loi_cau_hoi(self, ir_id: str, tra_loi: str) -> bool:
        """Đặt câu trả lời → trigger `info_request_bao_lai_khach` nhắn lại khách."""
        self.__dict__.setdefault("_cau_hoi_nho", {}).clear()
        try:
            from datetime import datetime, timezone
            self._patch(f"info_requests?id=eq.{_q(ir_id)}&status=eq.pending",
                        {"status": "answered", "answer": tra_loi.strip()[:1000],
                         "answered_at": datetime.now(timezone.utc).isoformat()})
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("tra_loi_cau_hoi lỗi: %s", e)
            return False

    def la_nhan_vien(self, user_key: str) -> bool:
        """CTV đang hoạt động hoặc admin (theo Zalo ID) — chỉ họ dùng lệnh "#mã: câu trả lời"."""
        if not (self.is_configured and user_key):
            return False
        try:
            u = _q(user_key)
            return bool(self._get(f"ctvs?zalo_user_id=eq.{u}&active=eq.true&select=id")
                        or self._get(f"admins?zalo_user_id=eq.{u}&select=zalo_user_id"))
        except Exception as e:  # noqa: BLE001
            log.warning("la_nhan_vien lỗi: %s", e)
            return False

    def tra_loi_theo_ma(self, ma: str, tra_loi: str) -> str | None:
        """Lệnh nhân viên: trả lời câu đang chờ MỚI NHẤT của tin `ma`. Trả câu hỏi đã trả lời, hoặc None nếu không có câu chờ."""
        can = self.can_theo_ma([ma]) or self._get(f"listings?code=eq.{_q(ma)}&select=id,code")
        if not can:
            return None
        try:
            rows = self._get(f"info_requests?listing_id=eq.{can[0]['id']}&status=eq.pending&order=created_at.desc&limit=1"
                             "&select=id,question")
        except Exception as e:  # noqa: BLE001
            log.warning("tra_loi_theo_ma lỗi: %s", e)
            return None
        if not rows or not self.tra_loi_cau_hoi(rows[0]["id"], tra_loi):
            return None
        return rows[0].get("question") or ""

    # --- Chốt kèo ------------------------------------------------------------------------------------------------
    def ghi_deal(self, listing_id: str, ti_le_phi: float | None) -> None:
        """Tin vừa chuyển `da_chot` → một dòng `deals` (khoá (listing_id, buyer_id) nulls not distinct: trùng thì bỏ qua)."""
        try:
            tin = self._get(f"listings?id=eq.{listing_id}&select=price_vnd")
            from datetime import datetime, timezone
            dong: dict[str, Any] = {"listing_id": listing_id, "closed_at": datetime.now(timezone.utc).isoformat()}
            if tin and tin[0].get("price_vnd"):
                dong["price_vnd"] = tin[0]["price_vnd"]
            if ti_le_phi is not None:
                dong["fee_pct"] = round(ti_le_phi * 100, 3)
            self._request("POST", "deals?on_conflict=listing_id,buyer_id", data=dong,
                          prefer="resolution=ignore-duplicates,return=minimal")
        except Exception as e:  # noqa: BLE001
            log.warning("ghi_deal lỗi: %s", e)


# --- Khối đưa cho model ---------------------------------------------------------------------------------------------
_TEN_LOAI = {"nha_pho": "nhà phố", "nha_cap4": "nhà cấp 4", "biet_thu": "biệt thự", "chung_cu": "căn hộ", "dat": "đất",
             "phong_tro": "phòng trọ", "mat_bang": "mặt bằng", "toa_nha": "toà nhà / CHDV", "kho_xuong": "kho xưởng",
             "dat_nong_nghiep": "đất nông nghiệp", "dat_kinh_doanh": "đất kinh doanh"}


def dong_can(c: dict) -> str:
    """Một căn thành một dòng cho model: mã, loại, đường / phường / quận (không số nhà), diện tích, giá, phòng ngủ, kết cấu."""
    vi_tri = ", ".join(str(c[k]) for k in ("street", "ward", "district") if c.get(k))
    phan = [f"#{c.get('code')}", _TEN_LOAI.get(str(c.get("property_type")), "BĐS"), vi_tri]
    if c.get("area_m2"):
        phan.append(f"{c['area_m2']:g} m²" if isinstance(c["area_m2"], (int, float)) else f"{c['area_m2']} m²")
    if c.get("price_raw"):
        phan.append(f"giá {c['price_raw']}")
    if c.get("bedrooms"):
        phan.append(f"{c['bedrooms']} phòng ngủ")
    if c.get("floors_text"):
        phan.append(str(c["floors_text"]))
    if c.get("legal_status"):
        phan.append(f"pháp lý {c['legal_status']}")
    if c.get("direction"):
        phan.append(f"hướng {c['direction']}")
    if c.get("status") == "da_coc":
        phan.append("(đã có khách cọc)")
    return " · ".join(p for p in phan if p)


def khoi_can_cho_khach(can: list[dict]) -> str:
    if not can:
        return ("\nRỔ HÀNG: chưa có căn nào đang rao khớp nhu cầu khách. KHÔNG giới thiệu căn nào, KHÔNG bịa căn; nói em sẽ báo khi "
                "có căn phù hợp.\n")
    return ("\nCĂN ĐANG CÓ TRONG RỔ (chỉ được giới thiệu các căn dưới đây, luôn kèm mã #; không đọc số nhà; thông tin không có "
            "ở dòng của căn thì nói em hỏi chủ nhà rồi báo lại, KHÔNG đoán):\n" + "\n".join(f"- {dong_can(c)}" for c in can) + "\n")


def khoi_viec_vua_ghi(viec: list[str]) -> str:
    if not viec:
        return ""
    return ("\nEM VỪA GHI LƯỢT NÀY (nói đúng các việc này, không hứa thêm việc khác): " + "; ".join(viec) + ".\n")


def khoi_cau_hoi_cho(cau: list[dict]) -> str:
    """Cho người rao: các câu khách hỏi đang chờ họ trả lời (có id để lượt lập thao tác chỉ đúng câu)."""
    if not cau:
        return ""
    return ("\nCÂU KHÁCH MUA ĐANG HỎI CHỦ NHÀ (chờ trả lời):\n"
            + "\n".join(f"- id={c['id']} · căn #{c.get('code')}: \"{c.get('question')}\"" for c in cau) + "\n")
