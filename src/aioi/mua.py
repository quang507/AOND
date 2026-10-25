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
import os
import re
import time
import urllib.parse
from typing import Any, Callable

from . import cau_mau

log = logging.getLogger("aioi.mua")

# Link trang chi tiết căn đưa cho khách (SRS-5.1zzzzzzz145). `nhadat.cc` chưa trỏ về web (mọi đường dẫn 404, kiểm 23/10/2026) nên dùng cùng mặc định
# với `lib/format.ts` SITE_URL; đổi tên miền thì đặt biến môi trường AIOI_SITE_URL trên VPS, không sửa chữ ở chỗ khác.
SITE_URL = os.environ.get("AIOI_SITE_URL", "https://aioinhadat.vercel.app").rstrip("/")

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


_SDT_KHACH = re.compile(r"(?<!\d)(?:\+?84|0)(?:[\s.\-]?\d){8,9}(?!\d)")


def tim_sdt(text: str) -> str | None:
    """Số điện thoại di động VN trong lời khách (SRS-5.1zzzzzzz148): chấp nhận cách gõ có khoảng trắng / chấm / gạch và +84; trả dạng 0xxxxxxxxx."""
    for m in _SDT_KHACH.finditer(text or ""):
        so = re.sub(r"\D", "", m.group(0))
        if so.startswith("84"):
            so = "0" + so[2:]
        if len(so) == 10 and so[:2] in ("03", "05", "07", "08", "09"):
            return so
    return None


_SO_GIONG_SDT = re.compile(r"(?<!\d)(?:\+?84|0)(?:[\s.\-]?\d){6,12}(?!\d)")


def giong_sdt_sai(text: str) -> bool:
    """Khách gõ một dãy số GIỐNG số điện thoại (đầu 0 / +84, 7–13 số) nhưng `tim_sdt` không nhận — thiếu hoặc thừa chữ số, hoặc sai đầu số
    (SRS-5.1zzzzzzz161, chat chị Ngân 23/10: gõ thiếu một số "070772473", bot vẫn "cảm ơn chị đã gửi số" mà DB không ghi gì)."""
    return tim_sdt(text) is None and bool(_SO_GIONG_SDT.search(text or ""))


def _q(s: str) -> str:
    return urllib.parse.quote(str(s), safe="")


def _sach_khu(chu: str) -> str | None:
    """Chữ khu vực khách nói → mẫu tìm: bỏ ký tự đại diện của ILIKE, lấy cụm đầu."""
    k = re.sub(r"[%_\\,()*\"]+", " ", chu).strip()
    return re.split(r"\s{2,}", k)[0].strip() or None


def _so_dau(v: Any) -> float | None:
    """Số đầu tiên trong chữ ("2PN" → 2, "60m2" → 60, "3,5" → 3.5); không có → None."""
    m = re.search(r"\d+(?:[.,]\d+)?", str(v or ""))
    return float(m.group(0).replace(",", ".")) if m else None


def _can_xe_hoi(v: Any) -> bool:
    t = str(v or "").strip()
    return bool(t) and not re.match(r"(?i)\s*(không|khong|ko)\b", t)


# Ô nhu cầu mang NGHĨA (khách tả bằng lời) — những ô này mới đáng nhúng; số / khu vực / giá đã lọc hoặc tính điểm bằng cột.
_O_NGHIA = ("moi_truong_song", "thanh_vien", "noi_lam_viec", "muc_dich", "tien_ich_mong_muon")

# Loại tiện ích quanh căn (SRS-5.1zzzzzzz179 mục 2) — CÙNG 5 loại `geocode-listings` ghi vào `listings.tien_ich_gan` từ Overpass
# (`_shared/geocode.ts` loaiTuTags). AI đã đọc ý khách ra ô `tien_ich_mong_muon` / `moi_truong_song`; ở đây chỉ ánh xạ chữ khách sang mã loại
# cố định (tra bảng, không đoán ý). Thêm loại = thêm ở cả geocode.ts lẫn đây.
TIEN_ICH_LOAI: dict[str, tuple[str, tuple[str, ...]]] = {
    "truong_hoc": ("trường học", ("truong", "school", "mam non", "mẫu giáo", "dai hoc")),
    "benh_vien": ("bệnh viện", ("benh vien", "bv ", "hospital", "phong kham", "y te")),
    "cho": ("chợ", ("cho ", "cho,", "cho.", "market")),
    "sieu_thi": ("siêu thị", ("sieu thi", "supermarket", "mall", "trung tam thuong mai")),
    "cong_vien": ("công viên", ("cong vien", "park", "cay xanh")),
}


def _khong_dau(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", str(s or "").lower()).replace("đ", "d")
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn")


def loai_tien_ich(lead: Any) -> list[str]:
    """Mã loại tiện ích khách muốn gần, đọc từ ô `tien_ich_mong_muon` (AI trích) và `moi_truong_song`; thứ tự cố định theo bảng. Rỗng = không lọc."""
    f = getattr(lead, "fields", {}) or {}
    chu = " " + _khong_dau(" . ".join(str(f.get(k) or "") for k in ("tien_ich_mong_muon", "moi_truong_song"))) + " "
    if not chu.strip():
        return []
    return [ma for ma, (_, tu) in TIEN_ICH_LOAI.items() if any(t in chu for t in tu)]


def _chu_nhu_cau(lead: Any) -> str:
    """Câu tả nhu cầu để so nghĩa ("yên tĩnh. ông bà. ở"); rỗng nếu khách chưa tả gì — khi đó không nhúng."""
    f = getattr(lead, "fields", {}) or {}
    phan = [str(getattr(lead, k, None) or f.get(k) or "").strip() for k in _O_NGHIA]
    phan.append(str(getattr(lead, "notes", "") or "").strip())
    return ". ".join(p for p in phan if p)


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
                rows = self._get(f"buyers?zalo_user_id=eq.{_q(user_key)}&select=id,name")
                ten_zalo = ten or self._ten_ban_neu_co(user_key)   # SRS-5.1zzzzzzz149: một Zalo một tên — dùng tên Zalo của khách
                if rows:
                    bid = rows[0]["id"]
                    if ten_zalo and str(rows[0].get("name") or "").startswith("Khách Zalo"):
                        self._patch(f"buyers?id=eq.{bid}", {"name": ten_zalo})
                else:
                    tao = self._post("buyers", {"zalo_user_id": user_key, "name": ten_zalo or f"Khách Zalo {user_key[-4:]}"})
                    bid = tao[0]["id"] if tao else None
                if bid:
                    cache[user_key] = bid
            if bid and nhu_cau:
                self._patch(f"buyers?id=eq.{bid}", {"preferences": nhu_cau})
            return bid
        except Exception as e:  # noqa: BLE001
            log.warning("khach_mua lỗi: %s", e)
            return None

    def _ten_ban_neu_co(self, user_key: str) -> str | None:
        """Tên thật của khách ở dòng `sellers` (nếu đã có và không phải tên giữ chỗ "Khách Zalo ####") — để dòng mua dùng cùng tên."""
        try:
            rows = self._get(f"sellers?zalo_user_id=eq.{_q(user_key)}&select=name")
        except Exception:  # noqa: BLE001
            return None
        ten = str((rows[0].get("name") if rows else "") or "").strip()
        return ten if ten and not ten.startswith("Khách Zalo") else None

    # --- Căn cho khách ----------------------------------------------------------------------------------------------
    def can_theo_ma(self, ma: list[str]) -> list[dict]:
        """Căn có mã (code / legacy_code) trong danh sách VÀ đang hiện cho khách."""
        ma = [m.strip().upper().lstrip("#") for m in ma if m and m.strip()][:5]
        if not (self.is_configured and ma):
            return []
        ds = ",".join(_q(m) for m in ma)
        hien = ",".join(TRANG_THAI_HIEN)
        try:
            can = self._get(f"listings?or=(code.in.({ds}),legacy_code.in.({ds}))&status=in.({hien})&select={COT_CAN}")
        except Exception as e:  # noqa: BLE001
            log.warning("can_theo_ma lỗi: %s", e)
            return []
        self._gan_so_anh(can)
        return can

    def _so_anh_theo_ma(self, ma: list[str]) -> dict[str, int] | None:
        """Số ảnh công khai của từng căn, đếm từ view `listing_photos_v` — CHÍNH nguồn ảnh gửi kèm (`anh_can`). None = không đọc được: lúc đó
        không khẳng định căn có hay không có ảnh (SRS-5.1zzzzzzz168 — bot từng hứa "ảnh em gửi ngay" cho căn chưa có ảnh nào)."""
        ma = [str(m) for m in ma if m]
        if not ma:
            return {}
        try:
            dong = self._get(f"listing_photos_v?code=in.({','.join(_q(m) for m in ma)})&select=code")
        except Exception as e:  # noqa: BLE001 — ảnh là phần thêm
            log.warning("đếm ảnh căn lỗi: %s", e)
            return None
        dem = {m: 0 for m in ma}
        for d in dong or []:
            c = str(d.get("code") or "")
            if c in dem:
                dem[c] += 1
        return dem

    def _gan_so_anh(self, can: list[dict]) -> None:
        dem = self._so_anh_theo_ma([c.get("code") for c in can])
        if dem is not None:
            for c in can:
                c["_so_anh"] = dem.get(str(c.get("code")), 0)

    # --- Công cụ tìm nhà (SRS-5.1zzzzzzz138) -------------------------------------------------------------------------------
    def can_phu_hop(self, lead: Any, toi_da: int = 3, loai_tru: set[str] | None = None) -> list[dict]:
        """Căn gợi ý cho khách: `tim_nha` (lọc cứng bán / thuê / loại / giá, điểm mềm khu vực / diện tích / phòng ngủ / xe hơi + vector).
        Hàm DB lỗi / chưa có thì về cách lọc cứng cũ — bot không mất rổ hàng. `loai_tru` = id căn khách đã chê (SRS-5.1zzzzzzz175): không
        đưa lại — xin thêm bấy nhiêu căn rồi lọc ở đây (hàm DB không nhận danh sách loại trừ)."""
        if not self.is_configured or lead is None or not co_tieu_chi(lead):
            return []   # SRS-5.1zzzzzzz146: chưa có khu vực / ngân sách thì không đoán căn — hỏi trước
        loai_tru = set(loai_tru or ())
        try:
            can = self.tim_nha(lead, toi_da + len(loai_tru))
        except Exception as e:  # noqa: BLE001
            log.warning("tim_nha lỗi, về lọc cứng: %s", e)
            can = self._can_phu_hop_loc_cung(lead, toi_da + len(loai_tru))
        return [c for c in can if c.get("id") not in loai_tru][:toi_da]

    def can_khong_hop(self, user_key: str) -> set[str]:
        """id các căn khách đã CHÊ (`interests.trang_thai = khong_hop`, SRS-5.1zzzzzzz175) — `can_phu_hop` và `bao_can_moi` không đưa lại.
        Nhớ 60 giây theo khách; lỗi mạng → rỗng (thà gợi lại một căn còn hơn câm). Không tạo dòng `buyers` ở đây."""
        if not (self.is_configured and user_key):
            return set()
        nho = self.__dict__.setdefault("_nho_khong_hop", {})
        hien = time.time()
        if user_key in nho and hien - nho[user_key][0] < 60:
            return nho[user_key][1]
        ra: set[str] = set()
        try:
            bid = self.__dict__.setdefault("_buyer_cache", {}).get(user_key)
            if not bid:
                rows = self._get(f"buyers?zalo_user_id=eq.{_q(user_key)}&select=id")
                bid = rows[0]["id"] if rows else None
            if bid:
                ra = {r["listing_id"] for r in self._get(f"interests?buyer_id=eq.{bid}&trang_thai=eq.khong_hop&select=listing_id")
                      if r.get("listing_id")}
        except Exception as e:  # noqa: BLE001
            log.warning("can_khong_hop lỗi: %s", e)
        if len(nho) > 500:
            nho.clear()
        nho[user_key] = (hien, ra)
        return ra

    def tim_nha(self, lead: Any, toi_da: int = 3) -> list[dict]:
        """MỘT lượt gọi DB. Quota: chỉ nhúng khi khách có lời tả nhu cầu (yên tĩnh, ông bà…); nhúng nhớ theo chữ; kết quả nhớ 60 giây."""
        f = getattr(lead, "fields", {}) or {}
        tham_so = {
            "p_deal": "cho_thue" if getattr(lead, "loai_giao_dich", "mua") == "thue" else "ban",
            "p_loai": _LOAI_MUA_SANG_DB.get(str(getattr(lead, "loai_bds", None) or f.get("loai_bds") or "").strip().lower()),
            "p_gia_max": self._gia_toi_da(str(getattr(lead, "ngan_sach", None) or f.get("ngan_sach") or "")),
            "p_khu": _sach_khu(str(getattr(lead, "khu_vuc", None) or f.get("khu_vuc") or "")),
            "p_dt_min": _so_dau(f.get("dien_tich_mong_muon")),
            "p_pn_min": (int(_so_dau(getattr(lead, "so_phong_ngu", None) or f.get("so_phong_ngu")) or 0) or None),
            "p_xe_hoi": _can_xe_hoi(getattr(lead, "yeu_cau_xe_hoi", None) or f.get("yeu_cau_xe_hoi")),
            "p_limit": toi_da,
            "p_tien_ich": loai_tien_ich(lead) or None,   # SRS-5.1zzzzzzz179: loại tiện ích khách muốn gần (≤ 1 km, cộng điểm)
        }
        tham_so["p_vec"] = self._vec_nhu_cau(lead)
        khoa = repr(sorted((k, v) for k, v in tham_so.items() if k != "p_vec")) + "|" + _chu_nhu_cau(lead)
        nho = self.__dict__.setdefault("_nho_tim_nha", {})
        hien = time.time()
        if khoa in nho and hien - nho[khoa][0] < 60:
            return nho[khoa][1]
        kq = self._request("POST", "rpc/tim_nha", data=tham_so)
        can: list[dict] = []
        for r in kq if isinstance(kq, list) else []:
            c = dict(r.get("can") or {})
            c["_ly_do"] = r.get("ly_do") or ""
            can.append(c)
        # SRS-5.1zzzzzzz145: `tim_nha` nới trần giá 20 % nhưng giá không là điểm — căn vượt ngân sách có thể đứng TRÊN căn đúng ngân sách
        # (chat thử 23/10: "dưới 6 tỷ" → 6,2 tỷ xếp trước 5,5 tỷ). Đánh dấu mức vượt và xếp căn đúng ngân sách lên trước (sắp ổn định).
        ns = self._ngan_sach_vnd(str(getattr(lead, "ngan_sach", None) or f.get("ngan_sach") or ""))
        if ns:
            for c in can:
                g = c.get("price_vnd")
                if isinstance(g, (int, float)) and g > ns:
                    c["_vuot_ngan_sach"] = max(1, round((g / ns - 1) * 100))
            can.sort(key=lambda c: 1 if c.get("_vuot_ngan_sach") else 0)
        danh_dau_lech(can, lead)
        self._gan_so_anh(can)
        if len(nho) > 200:
            nho.clear()
        nho[khoa] = (hien, can)
        return can

    def _ngan_sach_vnd(self, ns: str) -> int | None:
        """Ngân sách khách nêu (đồng) — `parse_vnd` là hàm cố định của DB nên nhớ theo chữ (khỏi gọi mỗi lượt)."""
        ns = ns.strip()
        if not ns:
            return None
        nho = self.__dict__.setdefault("_nho_parse_vnd", {})
        if ns not in nho:
            try:
                nho[ns] = self._request("POST", "rpc/parse_vnd", data={"p": ns})
            except Exception as e:  # noqa: BLE001
                log.warning("parse_vnd lỗi: %s", e)
                return None
        v = nho[ns]
        return int(v) if isinstance(v, (int, float)) and v > 0 else None

    def _gia_toi_da(self, ns: str) -> int | None:
        """Trần giá (đồng) đưa vào `tim_nha`: ngân sách nới 20 %."""
        v = self._ngan_sach_vnd(ns)
        return int(v * 1.2) if v else None

    def _vec_nhu_cau(self, lead: Any) -> list[float] | None:
        """Vector câu tả nhu cầu của khách. Không có lời tả → KHÔNG gọi Gemini (tiết kiệm quota). Lỗi / hết hạn mức → không vector, vẫn tìm."""
        text = _chu_nhu_cau(lead)
        if not text:
            return None
        nho = self.__dict__.setdefault("_nho_vec_nhu_cau", {})
        if text in nho:
            return nho[text]
        try:
            nhung = self.__dict__.get("_nhung_nhu_cau")
            if nhung is None:
                from .config import load_settings
                from .dia_danh import nhung_gemini
                khoa = [k for k in load_settings().gemini_api_keys if k]
                nhung = nhung_gemini(khoa) if khoa else (lambda _t: None)
                self.__dict__["_nhung_nhu_cau"] = nhung
            v = nhung(text)
        except Exception as e:  # noqa: BLE001
            log.warning("nhúng nhu cầu lỗi (tìm không vector): %s", type(e).__name__)
            return None
        if len(nho) > 256:
            nho.clear()
        nho[text] = v
        return v

    def _can_phu_hop_loc_cung(self, lead: Any, toi_da: int = 3) -> list[dict]:
        """Cách lọc cứng cũ (SRS-5.1zzzzzzz70) — dự phòng khi `tim_nha` lỗi. Tối đa `toi_da` căn khớp loại, thuê / mua, khu vực, ngân sách."""
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
            return danh_dau_lech(self._get(f"listings?{'&'.join(loc)}&select={COT_CAN}&order=updated_at.desc&limit={toi_da}"), lead)
        except Exception as e:  # noqa: BLE001
            log.warning("can_phu_hop lỗi: %s", e)
            return []

    def can_moi_khop(self, lead: Any, ids: list[str], tran: float = 1.15) -> list[dict]:
        """Báo căn mới (SRS-5.1zzzzzzz150): trong `ids` (các tin vừa lên kệ) căn nào khớp CỨNG nhu cầu khách — đúng bán / thuê, loại, KHU VỰC
        (khách đã nêu thì phải trúng), giá ≤ ngân sách × `tran` (vượt nhẹ thì có `_vuot_ngan_sach` = % vượt), xe hơi vào được nếu khách cần.
        Đúng ngân sách xếp trước, rồi tin mới cập nhật trước. Không dùng vector (một lượt gọi DB, không tốn quota)."""
        if not (self.is_configured and lead is not None and ids and co_tieu_chi(lead)):
            return []
        f = getattr(lead, "fields", {}) or {}
        loc = ["status=eq.dang_ban", f"id=in.({','.join(_q(i) for i in ids[:50])})",
               "deal=eq." + ("cho_thue" if getattr(lead, "loai_giao_dich", "mua") == "thue" else "ban")]
        loai = _LOAI_MUA_SANG_DB.get(str(getattr(lead, "loai_bds", None) or f.get("loai_bds") or "").strip().lower())
        if loai:
            loc.append(f"property_type=eq.{loai}")
        khu = _sach_khu(str(getattr(lead, "khu_vuc", None) or f.get("khu_vuc") or ""))
        if khu:
            mau = _q(f"*{khu}*")
            loc.append(f"or=(district.ilike.{mau},ward.ilike.{mau},street.ilike.{mau})")
        ns_chu = str(getattr(lead, "ngan_sach", None) or f.get("ngan_sach") or "")
        ns = self._ngan_sach_vnd(ns_chu)
        if ns:
            loc.append(f"price_vnd=lte.{int(ns * tran)}")
        elif ns_chu.strip():
            return []   # khách nêu ngân sách mà không đọc ra số → không đoán
        try:
            rows = self._get(f"listings?{'&'.join(loc)}&select={COT_CAN},car_in_house,updated_at&order=updated_at.desc&limit=30")
        except Exception as e:  # noqa: BLE001
            log.warning("can_moi_khop lỗi: %s", e)
            return []
        if _can_xe_hoi(getattr(lead, "yeu_cau_xe_hoi", None) or f.get("yeu_cau_xe_hoi")):
            rows = [r for r in rows if str(r.get("access_type")) in ("mat_tien", "hem_xe_tai", "hem_xe_hoi") or r.get("car_in_house")]
        if ns:
            for r in rows:
                g = r.get("price_vnd")
                if isinstance(g, (int, float)) and g > ns:
                    r["_vuot_ngan_sach"] = max(1, round((g / ns - 1) * 100))
        rows.sort(key=lambda r: 1 if r.get("_vuot_ngan_sach") else 0)   # sắp ổn định: giữ thứ tự mới cập nhật trước
        return danh_dau_lech(rows, lead)

    # --- Ghi việc của khách ------------------------------------------------------------------------------------------
    def ghi_quan_tam(self, buyer_id: str, ma: list[str]) -> bool:
        try:
            self._request("POST", "rpc/mark_listing_interest", data={"p_codes": ma, "p_buyer_id": buyer_id})
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("ghi_quan_tam lỗi: %s", e)
            return False

    def ghi_khong_hop(self, buyer_id: str, can: list[dict], ly_do: str = "", user_key: str | None = None) -> bool:
        """Khách chê căn (SRS-5.1zzzzzzz175): `interests` (khách, căn) → `trang_thai = khong_hop` + `ly_do` nguyên văn khách nói (có thể rỗng).
        Dòng "quan tâm" cũ của cùng căn bị đè — khách đổi ý quan tâm lại thì `mark_listing_interest` đè ngược về `quan_tam`."""
        dong = [{"buyer_id": buyer_id, "listing_id": c["id"], "trang_thai": "khong_hop", "ly_do": (ly_do or "")[:300] or None}
                for c in can if c.get("id")]
        if not dong:
            return False
        try:
            self._request("POST", "interests?on_conflict=buyer_id,listing_id", data=dong, prefer="resolution=merge-duplicates,return=minimal")
        except Exception as e:  # noqa: BLE001
            log.warning("ghi_khong_hop lỗi: %s", e)
            return False
        if user_key:
            self.__dict__.setdefault("_nho_khong_hop", {}).pop(user_key, None)
        return True

    def ngung_bao_can(self, buyer_id: str, tat: bool) -> bool:
        """Khách bảo đừng báo căn mới nữa (hoặc xin báo lại) — `buyers.bao_can_moi` (SRS-5.1zzzzzzz175); `bao_can_moi.chay_mot_luot` đọc cờ này."""
        try:
            self._patch(f"buyers?id=eq.{buyer_id}", {"bao_can_moi": not tat})
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("ngung_bao_can lỗi: %s", e)
            return False

    def ghi_hen_xem(self, buyer_id: str, can: dict, gio: str) -> bool:
        """Một lịch đang chờ cho mỗi (khách, căn): đã có lịch `proposed` / `pending` thì không tạo thêm — nhưng giờ khách nói THÊM sau đó
        ("chiều" rồi "4h") được gộp vào lịch cũ (SRS-5.1zzzzzzz157: chị Ngân 23/10 nói "chiều" lúc ghi lịch, "4h" nói sau không vào DB nên
        người phụ trách chỉ thấy "chiều")."""
        try:
            co = self._get(f"viewings?buyer_id=eq.{buyer_id}&listing_id=eq.{can['id']}&status=in.(proposed,pending)&select=id,time_text")
            if co:
                gop = gop_gio_hen(co[0].get("time_text"), gio)
                if gop != (co[0].get("time_text") or ""):
                    self._request("PATCH", f"viewings?id=eq.{co[0]['id']}", data={"time_text": gop}, prefer="return=minimal")
                return True
            self._post("viewings", {"listing_id": can["id"], "listing_code": can.get("code"), "buyer_id": buyer_id,
                                    "time_text": gio[:200], "status": "proposed", "source": "bot_python"},
                       prefer="return=minimal")
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("ghi_hen_xem lỗi: %s", e)
            return False

    def lich_dang_cho(self, buyer_id: str) -> list[dict]:
        """Lịch hẹn xem khách này đang chờ xác nhận (mã căn + chữ giờ đã ghi) — cho lời đáp biết lịch đã có gì, khỏi hỏi lại / tự thêm ngày."""
        try:
            rows = self._get(f"viewings?buyer_id=eq.{buyer_id}&status=in.(proposed,pending)&select=listing_code,time_text"
                             "&order=created_at.desc&limit=3")
            return [r for r in rows if isinstance(r, dict) and r.get("time_text")]
        except Exception as e:  # noqa: BLE001
            log.warning("lich_dang_cho lỗi: %s", e)
            return []

    def ghi_sdt_hen_xem(self, buyer_id: str, sdt: str) -> bool:
        """Khách để số điện thoại sau khi hẹn xem (SRS-5.1zzzzzzz148, chủ dự án 23/10: lúc hẹn xem thì lấy được số): ghi vào lịch đang chờ
        mới nhất CHƯA có số, rồi báo người phụ trách (cùng CTV với lời nhắc lịch; không có CTV thì admin). Không có lịch chờ → không ghi gì:
        số khách gõ ngoài ngữ cảnh hẹn xem không được lưu."""
        try:
            co = self._get(f"viewings?buyer_id=eq.{buyer_id}&status=in.(proposed,pending)&phone=is.null"
                           "&order=created_at.desc&limit=1&select=id,listing_id,listing_code")
            if not co:
                return False
            lich = co[0]
            self._request("PATCH", f"viewings?id=eq.{lich['id']}", data={"phone": sdt}, prefer="return=minimal")
            cu = self._get(f"reminders?viewing_id=eq.{lich['id']}&kind=eq.escalation&select=ctv_id&limit=1")
            self._post("reminders", {"kind": "escalation", "buyer_id": buyer_id, "listing_id": lich.get("listing_id"),
                                     "viewing_id": lich["id"], "ctv_id": (cu[0].get("ctv_id") if cu else None),
                                     "due_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                                     "note": f"Khách lịch xem #{lich.get('listing_code') or '?'} để lại SĐT {sdt}, gọi xác nhận giúp em nha"},
                       prefer="return=minimal")
            return True
        except Exception as e:  # noqa: BLE001
            log.warning("ghi_sdt_hen_xem lỗi: %s", e)
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


def danh_dau_lech(can: list[dict], lead: Any) -> list[dict]:
    """Ghi lên từng căn điểm LỆCH so với nhu cầu mềm của khách — phòng ngủ, diện tích (SRS-5.1zzzzzzz177; chat thử 24/10: khách cần 2PN, bot
    đưa căn 1PN mà chỉ nói "khác khu"). `tim_nha` chỉ cộng điểm cho hai tiêu chí này nên căn lệch vẫn lọt; lời bot phải nói thẳng."""
    f = getattr(lead, "fields", {}) or {}
    pn = int(_so_dau(getattr(lead, "so_phong_ngu", None) or f.get("so_phong_ngu")) or 0)
    dt = _so_dau(f.get("dien_tich_mong_muon"))
    for c in can:
        b = c.get("bedrooms")
        if pn:
            if not isinstance(b, (int, float)):
                c["_thieu_pn"] = (None, pn)
            elif b < pn:
                c["_thieu_pn"] = (int(b), pn)
        a = c.get("area_m2")
        if dt and isinstance(a, (int, float)) and a < dt:
            c["_nho_dt"] = (float(a), float(dt))
        # SRS-5.1zzzzzzz179 mục 2: khách muốn gần tiện ích mà căn chưa có dữ liệu (toạ độ chỉ cấp phường / Overpass chưa chạy) hoặc loại đó
        # không có trong 1 km → ghi rõ để bot nói "chưa rõ", không nói "gần trường" khi dữ liệu không có (lỗi MOSO AI mắc 25/10).
        muon = loai_tien_ich(lead)
        if muon:
            gan = c.get("tien_ich_gan")
            co = {t.get("loai") for t in gan if isinstance(t, dict) and _so_dau(t.get("m")) is not None and _so_dau(t.get("m")) <= 1000} \
                if isinstance(gan, list) else set()
            thieu = [TIEN_ICH_LOAI[m][0] for m in muon if m not in co]
            if thieu:
                c["_chua_ro_tien_ich"] = thieu
    return can


def gia_moi_m2(c: dict) -> str | None:
    """"≈ 83,3 triệu/m²" từ `price_vnd` / `area_m2` (SRS-5.1zzzzzzz179 mục 4; MOSO hiện giá/m² trên mỗi thẻ). Thiếu một trong hai → None.
    Tin thuê (deal cho_thue) không tính — giá tháng chia m² không có nghĩa với khách."""
    gia, dt = c.get("price_vnd"), c.get("area_m2")
    if c.get("deal") == "cho_thue" or not isinstance(gia, (int, float)) or not isinstance(dt, (int, float)) or gia <= 0 or dt <= 0:
        return None
    trieu = gia / dt / 1_000_000
    chu = f"{trieu:,.1f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"≈ {chu} triệu/m²"


def dong_can(c: dict) -> str:
    """Một căn thành một dòng cho model: mã, loại, đường / phường / quận (không số nhà), diện tích, giá, phòng ngủ, kết cấu."""
    vi_tri = ", ".join(str(c[k]) for k in ("street", "ward", "district") if c.get(k))
    phan = [f"#{c.get('code')}", _TEN_LOAI.get(str(c.get("property_type")), "BĐS"), vi_tri]
    if c.get("area_m2"):
        phan.append(f"{c['area_m2']:g} m²" if isinstance(c["area_m2"], (int, float)) else f"{c['area_m2']} m²")
    if c.get("price_raw"):
        phan.append(f"giá {c['price_raw']}")
    gm2 = gia_moi_m2(c)
    if gm2:
        phan.append(gm2)
    if c.get("chinh_chu") is True:
        phan.append("chính chủ rao")
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
    if c.get("_ly_do"):
        phan.append(f"vì sao hợp: {c['_ly_do']}")
    if c.get("_vuot_ngan_sach"):
        phan.append(f"VƯỢT ngân sách khách nêu khoảng {c['_vuot_ngan_sach']}%")
    if c.get("_thieu_pn"):
        co, can_ = c["_thieu_pn"]
        phan.append(f"CHƯA RÕ số phòng ngủ (khách cần {can_})" if co is None else f"ÍT phòng ngủ hơn khách cần (có {co}, khách cần {can_})")
    if c.get("_nho_dt"):
        phan.append(f"NHỎ hơn diện tích khách muốn ({c['_nho_dt'][0]:g} m², khách muốn {c['_nho_dt'][1]:g} m²)")
    if c.get("_chua_ro_tien_ich"):
        phan.append("CHƯA RÕ có gần " + " / ".join(c["_chua_ro_tien_ich"]) + " không (hệ thống chưa có dữ liệu tiện ích quanh căn này)")
    so_anh = c.get("_so_anh")
    if isinstance(so_anh, int):
        phan.append(f"ảnh: có {so_anh} ảnh, tự gửi kèm khi dán link; khách xin ảnh thì hệ thống gửi (kể cả xin lại)" if so_anh else "ảnh: CHƯA có ảnh nào trên hệ thống")
    if c.get("code"):
        phan.append(f"link {SITE_URL}/nha-dat/{c['code']}")
    return " · ".join(p for p in phan if p)


def co_tieu_chi(lead: Any) -> bool:
    """Đủ tiêu chí để gợi ý căn: khách đã nêu KHU VỰC hoặc NGÂN SÁCH (loại BĐS một mình chưa đủ — "nhà phố" thì căn nào cũng khớp)."""
    f = getattr(lead, "fields", {}) or {}
    return any(str(getattr(lead, k, None) or f.get(k) or "").strip() for k in ("khu_vuc", "ngan_sach"))


def khoi_can_cho_khach(can: list[dict], chua_co_tieu_chi: bool = False) -> str:
    """Khối căn đưa cho model phía mua. SRS-5.1zzzzzzz145 (chủ dự án 23/10: "sợ sếp chửi", "sếp thích trả lời như người"): bản trước dạy model
    "luôn kèm mã #" và đặt tên khối "RỔ" — model đọc mã tin, nói "trong rổ", liệt kê bằng dấu "·"; và viết "em" giữa lời xưng "cháu".
    SRS-5.1zzzzzzz146 (cùng ngày: "gửi luôn căn gợi ý rồi sau mới hỏi thêm"): thứ tự tin là khen → căn → MỘT câu hỏi ngắn."""
    if not can and chua_co_tieu_chi:
        return ("\nCĂN ĐANG RAO: khách chưa nêu khu vực hay ngân sách nên chưa tìm căn. Lượt này CHƯA giới thiệu căn nào và KHÔNG nói \"chưa có "
                "căn\"; chỉ hỏi đúng câu thông tin ở trên, thật ngắn (xưng hô y như các lượt trước).\n")
    if not can:
        return ("\nCĂN ĐANG RAO: chưa có căn nào khớp nhu cầu khách. KHÔNG giới thiệu căn nào, KHÔNG bịa căn; nói sẽ báo khi có căn phù hợp "
                "(xưng hô y như các lượt trước).\n")
    return ("\nCĂN ĐANG RAO (chỉ được giới thiệu các căn dưới đây; không đọc số nhà; thông tin không có ở dòng của căn thì nói sẽ hỏi chủ nhà "
            "rồi báo lại, KHÔNG đoán). CÁCH NÓI — như người môi giới nhắn Zalo cho khách, từng tin ngắn, không như bảng liệt kê:\n"
            "  • Mã # CHỈ để ghi thao tác: KHÔNG nói mã ra lời, không viết dấu #. Không nói chữ \"rổ\".\n"
            "  • Mỗi lượt giới thiệu MỘT căn tốt nhất (khách đòi thêm mới đưa căn kế). Viết thành BỐN ĐOẠN, MỖI ĐOẠN cách nhau MỘT DÒNG TRỐNG — mỗi "
            "đoạn là một tin Zalo riêng. KHÔNG gạch đầu dòng, không dấu \"·\", không viết tắt \"P.\" \"Q.\" (viết \"phường\", \"quận\"):\n"
            "      (1) Mở lời như người nhắn, ví dụ \"Chị ơi, em đang có căn này hợp với nhu cầu của chị nè, chị xem qua nha.\" (đổi chữ cho tự "
            "nhiên, đúng xưng hô). Luật khen: nếu có điều đáng khen khách vừa nói thì mở bằng MỘT lời khen ngắn gắn đúng điều đó, cùng đoạn này — "
            "không bịa thị trường, không bình luận giá, không thêm chi tiết khách chưa nói.\n"
            "      (2) Thông số ngắn (khu vực, diện tích, giá, phòng ngủ) rồi VÌ SAO HỢP — kể lại ĐÚNG phần \"vì sao hợp\" của căn, không thêm. "
            "Căn ghi \"KHÁC khu vực\", \"VƯỢT ngân sách\", \"ÍT phòng ngủ\", \"CHƯA RÕ số phòng ngủ\", \"NHỎ hơn diện tích\" hay \"CHƯA RÕ có gần "
            "…\" thì nói thẳng MỌI điểm lệch đó trong một câu ngắn ở đoạn này (khác khu nào / vượt bao nhiêu % / thiếu mấy phòng / chưa rõ gần "
            "trường nào), không giấu điểm nào; chỉ đưa căn như vậy khi không có căn đúng. Tiện ích gần (trường, chợ…) CHỈ nói khi dòng căn ghi "
            "\"gần <tên> ~<m> m\" — không có thì KHÔNG nói gần, không đoán. Giá mỗi m² chỉ nói khi dòng căn có \"≈ … triệu/m²\".\n"
            "      (3) Link: dán nguyên văn dòng \"link …\" của căn để khách xem chi tiết. Dòng căn ghi \"có … ảnh\" thì ảnh tự gửi kèm ngay sau, không "
            "cần nhắc; ghi \"CHƯA có ảnh\" thì sẽ KHÔNG có ảnh nào gửi kèm.\n"
            "      (4) Tối đa MỘT câu hỏi, thật ngắn (khoảng 15 chữ), không giải thích vì sao hỏi — câu thông tin cần hỏi tiếp ở trên, hoặc hỏi khách "
            "có muốn xem thử không. Khách vừa hỏi điều gì và em đã trả lời đủ, hoặc khách đang bận / hẹn sau, thì KHÔNG cần câu hỏi (SRS-178).\n"
            "  • Xưng hô GIỮ NGUYÊN như các lượt trước, không đổi qua lại giữa em / cháu / tôi trong cùng một tin. Không tua lại toàn bộ yêu cầu "
            "của khách; không khen lần hai ở cuối tin.\n"
            "  • Khách hỏi ảnh / hình của căn: dòng căn ghi CÓ ảnh thì nói ảnh em đã gửi kèm link ở tin trên (khách kéo lên xem), cần thì dán lại "
            "link; ghi \"CHƯA có ảnh\" thì nói THẬT là căn này chưa có ảnh trên hệ thống, em xin chủ nhà bổ sung hoặc hẹn khách xem trực tiếp — "
            "KHÔNG nói \"em gửi ảnh ngay\". Dòng căn không ghi gì về ảnh thì KHÔNG hứa gửi ảnh.\n"
            "  • Căn đã giới thiệu ở các tin trước thì KHÔNG nhắc lại, trừ khi khách hỏi; nếu không còn căn mới thì chỉ hỏi câu kế:\n"
            + "\n".join(f"- {dong_can(c)}" for c in can) + "\n")


def gop_gio_hen(cu: str | None, moi: str) -> str:
    """Gộp chữ giờ hẹn khách nói thêm vào chữ đã ghi: đã có trong chữ cũ thì giữ, chữ cũ nằm trong chữ mới thì lấy chữ mới, còn lại nối
    ("chiều" + "4h" → "chiều, 4h"). Chỉ so chữ, không đoán ý; tối đa 200 ký tự như cột."""
    cu, moi = (cu or "").strip(), (moi or "").strip()
    if not moi or moi.lower() in cu.lower():
        return cu
    if not cu or cu.lower() in moi.lower():
        return moi[:200]
    return f"{cu}, {moi}"[:200]


def goi_toi(pronoun: str | None) -> tuple[str, str]:
    """(cách gọi khách, cách bot tự xưng) theo cách khách tự xưng — cùng quy ước `followup.cau_nhac`: khách xưng "em" thì gọi "em", bot xưng
    "mình"; còn lại bot xưng "em"; chưa rõ thì "anh/chị"."""
    return {"em": "em", "anh": "anh", "chi": "chị"}.get(pronoun or "", "anh/chị"), ("mình" if pronoun == "em" else "em")


def khoi_lich_dang_cho(lich: list[dict] | None, pronoun: str | None = None) -> str:
    """Khối đưa lịch hẹn xem ĐÃ GHI cho model phía mua (SRS-5.1zzzzzzz157). Chat chị Ngân 23/10: khách chỉ nói "ngày nào cũng rảnh", "chiều",
    "4h", bot tự viết "chiều nay" rồi "xác nhận giúp em 4 giờ chiều nay…", khách đáp "có" thì bot hỏi "ngày nào" — tự mâu thuẫn vì model không
    thấy lịch đã ghi gì và tự thêm "nay"."""
    if not lich:
        return ""
    dong = "\n".join(f"- #{x.get('listing_code') or '?'}: \"{x['time_text']}\"" for x in lich if x.get("time_text"))
    goi, toi = goi_toi(pronoun)
    mau = cau_mau.cau("xac_nhan_lich", goi, toi=toi, gio="<ngày giờ khách đã nói>", can="<đường / khu của căn>")   # sửa ở CRM (SRS-5.1zzzzzzz158)
    return ("\nLỊCH HẸN XEM ĐÃ GHI (đọc kỹ trước khi hỏi giờ / ngày; chữ trong ngoặc là đúng những gì khách đã nói):\n" + dong + "\n"
            "  • CHỈ nói ngày (hôm nay / chiều nay / ngày mai / thứ …) khi chữ ở trên hoặc lời khách có ngày đó. Khách mới nói \"chiều\" hay \"4h\" "
            "thì CHƯA có ngày — KHÔNG tự thêm \"nay\", hỏi ngày MỘT câu ngắn; khách nói ngày nào cũng được thì gợi ý MỘT ngày gần nhất cho khách "
            "gật.\n"
            "  • Đã đủ ngày VÀ giờ thì chốt, KHÔNG hỏi lại ngày / giờ; xác nhận đúng MỘT lần bằng NGUYÊN VĂN câu mẫu: \"" + mau + "\" (thay "
            "chỗ <…> bằng đúng chữ ngày giờ khách đã nói và tên đường / khu của căn; không hỏi \"có phù hợp không\"). Khách đã đáp \"có / đúng\" "
            "thì cảm ơn ngắn và nói người phụ trách sẽ gọi xác nhận, nhắc khách \"chú ý điện thoại\" (KHÔNG viết \"chú ý máy\", không dùng chữ "
            "\"máy\") — không hỏi thêm ngày giờ.\n"
            "  • Lịch mới ghi chờ xác nhận: KHÔNG nói đã chốt với chủ nhà.\n"
            "  • Khách chỉ đáp ngắn đồng ý / cảm ơn (ok, vâng, ừ, ok ok…) mà KHÔNG thêm thông tin mới, và trong lời em trước đó ĐÃ xác nhận lịch "
            "(hoặc đã nói người phụ trách sẽ gọi): đáp đúng MỘT câu rất ngắn (vd \"Vâng ạ.\") — KHÔNG lặp lại câu xác nhận, KHÔNG nhắc lại ngày giờ "
            "hay căn, KHÔNG nhắc lại người phụ trách sẽ gọi, KHÔNG hỏi thêm câu nào. Khách gõ \"ok\" nhiều lần thì mỗi lần vẫn chỉ một câu ngắn, "
            "không dài ra, không lặp nguyên văn câu trước.\n")


def khoi_viec_vua_ghi(viec: list[str]) -> str:
    if not viec:
        # SRS-5.1zzzzzzz153: lượt không ghi gì thì cũng phải DẶN — bản trước im lặng nên model tự nói "em chuyển lịch cho chủ nhà rồi / giữ sẵn
        # lịch rồi" (ảnh chat chị N. 23/10) trong khi DB không có lịch hẹn nào, không ai được báo.
        return ("\nLƯỢT NÀY EM CHƯA GHI VIỆC GÌ lên hệ thống: TUYỆT ĐỐI KHÔNG nói đã chuyển / đã báo / đã giữ / đã xếp lịch, không nói chủ nhà hay "
                "admin đã nhận được gì, không hứa sẽ báo lại. Khách muốn xem nhà mà còn thiếu căn nào hoặc ngày giờ nào thì hỏi đúng chỗ thiếu "
                "bằng MỘT câu ngắn.\n")
    return ("\nEM VỪA GHI LƯỢT NÀY (nói đúng các việc này, không hứa thêm việc khác): " + "; ".join(viec) + ".\n")


def khoi_cau_hoi_cho(cau: list[dict]) -> str:
    """Cho người rao: các câu khách hỏi đang chờ họ trả lời (có id để lượt lập thao tác chỉ đúng câu)."""
    if not cau:
        return ""
    return ("\nCÂU KHÁCH MUA ĐANG HỎI CHỦ NHÀ (chờ trả lời):\n"
            + "\n".join(f"- id={c['id']} · căn #{c.get('code')}: \"{c.get('question')}\"" for c in cau) + "\n")
