"""Dynamic property schema (SRD §III).

The AI auto-detects the property type and surfaces only the core fields relevant to
that type's group. Every property also carries shared identity fields and, when it is
a rental, the shared rental terms. Data is accumulated gradually across conversations,
so all fields are optional and start empty.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum

DISTRICT_PAIRS = [
    "tân bình", "bình tân", "bình thạnh", "phú nhuận", "gò vấp", "tân phú",
    "thủ đức", "bình chánh", "hóc môn", "củ chi", "nhà bè", "cần giờ",
    "dĩ an", "thuận an", "biên hòa"
]

_HOUSE_NO_RE = re.compile(r"^(?:(?:đ/?c|dc|địa chỉ)\s*:?\s*)?(\d+[\d/\-.]*[A-Za-z]?)$", re.IGNORECASE)

def _clean_address_filler(text: str) -> str:
    t = text.strip()
    t = re.sub(r"^(?:ở|tại|thuộc|nằm ở|địa chỉ(?:\s*là)?|đc:?)\s+", "", t, flags=re.IGNORECASE)
    t = re.sub(r"\s+(?:đó|nha|nhé|ạ|em|ạ em|ấy em|nhe|đấy|đó)\s*$", "", t, flags=re.IGNORECASE)
    return t.strip()

def _extract_district(text: str) -> str | None:
    # 1. Numbered districts: Quận 1..12 or Q.1..12 or Q 1..12
    m_num = re.search(r"\b(?:quận|q\b\.?)\s*(?:1[0-2]|[1-9])\b", text, flags=re.IGNORECASE)
    if m_num:
        return m_num.group(0)
    # 2. Named districts (with or without 'quận/q.')
    tl = text.lower()
    for d in sorted(DISTRICT_PAIRS, key=lambda x: -len(x)):
        m = re.search(r"\b(?:(?:quận|q\b\.?)\s*)?" + re.escape(d) + r"\b", tl)
        if m:
            start, end = m.span()
            return text[start:end]
    return None

def _extract_ward(text: str) -> str | None:
    m = re.search(r"\b(?:phường\s+[\w\d]+|p\.\s*[\w\d]+|p\b\s+\d+|xã\s+[\w\d]+|thị trấn\s+[\w\d]+)", text, flags=re.IGNORECASE)
    if m:
        return m.group(0)
    return None

def _extract_house_num(text: str) -> str | None:
    m = re.search(r"^\s*(\d+[\d/\-.]*[A-Za-z]?)", text)
    if m:
        return m.group(1)
    return None

def _merge_dia_chi(old: str, new: str) -> str:
    """Address fields ACCUMULATE & MERGE WITHOUT LOSS — adding house number, ward, or district
    must never erase the components already captured. Supports corrections (e.g. correcting
    Tân Bình vs Bình Tân)."""
    old = (old or "").strip()
    raw_new = (new or "").strip()
    new = _clean_address_filler(raw_new)

    if not old:
        return new
    if not new or new.lower() in old.lower():
        return old
    if old.lower() in new.lower():
        return new

    # 1. Bare house number: '100/9', '120', 'số 120'
    m_house = _HOUSE_NO_RE.match(new)
    if m_house:
        num = m_house.group(1)
        old_num = _extract_house_num(old)
        if old_num:
            return re.sub(r"^\s*" + re.escape(old_num), num, old)
        return f"{num} {old}"

    # 2. Explicit correction pattern: 'tân bình chứ không phải bình tân'
    m_not = re.search(r"([A-ZÀ-Ỹa-zà-ỹ0-9\s]+?)\s+(?:chứ\s+)?không\s+phải\s+([A-ZÀ-Ỹa-zà-ỹ0-9\s]+)", new, re.IGNORECASE)
    if m_not:
        right_val = m_not.group(1).strip()
        wrong_val = m_not.group(2).strip()
        if wrong_val.lower() in old.lower():
            return re.sub(re.escape(wrong_val), right_val, old, flags=re.IGNORECASE)

    # 3. Ward / District analysis
    old_dist = _extract_district(old)
    new_dist = _extract_district(new)
    old_ward = _extract_ward(old)
    new_ward = _extract_ward(new)

    # Check if new is ONLY ward / district (no street)
    new_without_loc = new
    if new_dist:
        new_without_loc = re.sub(re.escape(new_dist), "", new_without_loc, flags=re.IGNORECASE)
    if new_ward:
        new_without_loc = re.sub(re.escape(new_ward), "", new_without_loc, flags=re.IGNORECASE)
    new_without_loc = re.sub(r"[,\s]+", "", new_without_loc)
    new_is_only_location = (len(new_without_loc) == 0)

    if new_is_only_location:
        res = old
        # District update/replacement
        if new_dist:
            if old_dist and old_dist in res:
                res = res.replace(old_dist, new_dist)
            else:
                res = f"{res}, {new_dist}"
        # Ward update/insertion
        if new_ward:
            if old_ward and old_ward in res:
                res = res.replace(old_ward, new_ward)
            else:
                cur_dist = new_dist or old_dist
                if cur_dist and cur_dist in res:
                    res = res.replace(cur_dist, f"{new_ward}, {cur_dist}")
                else:
                    res = f"{res}, {new_ward}"
        return res

    # 4. New has street and/or house number, but lacks ward/district that old has
    if (old_dist and not new_dist) or (old_ward and not new_ward):
        extras = []
        if old_ward and not new_ward:
            extras.append(old_ward)
        if old_dist and not new_dist:
            extras.append(old_dist)
        suffix = ", ".join(extras)
        return f"{new}, {suffix}"

    return new


def _calc_area_from_dimension(dim: str) -> str | None:
    """Calculate area m2 from dimension string like '6x20', 'ngang 6m dài 20m'."""
    if not dim:
        return None
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*m?\s*[x*X]\s*(\d+(?:[.,]\d+)?)", dim)
    if not m:
        m = re.search(r"(?:ngang|rộng)\s*(\d+(?:[.,]\d+)?)\s*m?.*?dài\s*(\d+(?:[.,]\d+)?)", dim, re.IGNORECASE)
    if not m:
        m = re.search(r"dài\s*(\d+(?:[.,]\d+)?)\s*m?.*?(?:ngang|rộng)\s*(\d+(?:[.,]\d+)?)", dim, re.IGNORECASE)
    if m:
        try:
            w = float(m.group(1).replace(",", "."))
            l = float(m.group(2).replace(",", "."))
            area = round(w * l, 2)
            if area > 0:
                return f"{int(area) if area.is_integer() else area}m2"
        except Exception:
            pass
    return None


import uuid
import time


class PropertyGroup(str, Enum):
    RESIDENTIAL = "residential"   # Nhóm 1: Nhà phố, Biệt thự, Nhà cấp 4, CHDV, Phòng trọ
    CONDO = "condo"               # Nhóm 2: Căn hộ, Chung cư, Penthouse, Officetel
    PROJECT = "project"           # Nhóm 3: Dự án, Đất dự án, Shophouse dự án
    LAND = "land"                 # Nhóm 4: Đất trống, Đất thổ cư, Đất nông nghiệp
    INDUSTRIAL = "industrial"     # Nhóm 5: Sản xuất & Thương mại (Kho xưởng, SKC, Đất kinh doanh)
    COMMERCIAL = "commercial"     # Nhóm 6: Mặt bằng kinh doanh, Cửa hàng, Shophouse cho thuê
    UNKNOWN = "unknown"


# Loại hình BĐS -> nhóm. Used to map a detected property type onto its field group.
# Đồng bộ 100% với 12 loại hình trên CRM (aioinhadat.vercel.app/admin):
# [Chưa rõ, Nhà phố, Nhà cấp 4, Chung cư, Đất, Biệt thự, Phòng trọ, Mặt bằng, Toà nhà / CHDV, Đất nông nghiệp, Đất kinh doanh, Kho xưởng]
TYPE_TO_GROUP: dict[str, PropertyGroup] = {
    # Nhóm 1: Nhà đất & Lưu trú dân dụng
    "nha_pho": PropertyGroup.RESIDENTIAL,
    "biet_thu": PropertyGroup.RESIDENTIAL,
    "nha_cap_4": PropertyGroup.RESIDENTIAL,
    "chdv": PropertyGroup.RESIDENTIAL,
    "toa_nha": PropertyGroup.RESIDENTIAL,
    "phong_tro": PropertyGroup.RESIDENTIAL,
    "khach_san": PropertyGroup.RESIDENTIAL,
    # Nhóm 2: Chung cư & Căn hộ
    "chung_cu": PropertyGroup.CONDO,
    "can_ho": PropertyGroup.CONDO,
    "officetel": PropertyGroup.CONDO,
    "penthouse": PropertyGroup.CONDO,
    # Nhóm 3: Dự án
    "dat_du_an": PropertyGroup.PROJECT,
    "du_an": PropertyGroup.PROJECT,
    "shophouse_du_an": PropertyGroup.PROJECT,
    # Nhóm 4: Đất & Đất nông nghiệp
    "dat": PropertyGroup.LAND,
    "dat_tho_cu": PropertyGroup.LAND,
    "dat_nong_nghiep": PropertyGroup.LAND,
    # Nhóm 5: Kho xưởng & Đất kinh doanh công nghiệp
    "dat_skc": PropertyGroup.INDUSTRIAL,
    "dat_tmd": PropertyGroup.INDUSTRIAL,
    "dat_kinh_doanh": PropertyGroup.INDUSTRIAL,
    "kho_bai": PropertyGroup.INDUSTRIAL,
    "nha_xuong": PropertyGroup.INDUSTRIAL,
    "kho_xuong": PropertyGroup.INDUSTRIAL,
    # Nhóm 6: Mặt bằng & Thương mại
    "mat_bang": PropertyGroup.COMMERCIAL,
    "shophouse": PropertyGroup.COMMERCIAL,
    "chua_ro": PropertyGroup.UNKNOWN,
}

# Trường cốt lõi theo nhóm (SRD §III) — quyết định AI hỏi gì trong giai đoạn nhận diện/khai thác sâu.
CORE_FIELDS: dict[PropertyGroup, list[str]] = {
    PropertyGroup.RESIDENTIAL: [
        "ket_cau",            # Kết cấu (số tầng, phòng ngủ, WC)
        "lo_gioi_hem",        # Vị trí mặt tiền hay hẻm (đường trước nhà)
        "tinh_trang_ban_giao", # Tình trạng bàn giao (trống / có khách thuê)
        "phap_ly_hoan_cong",  # Pháp lý, hoàn công (sổ hồng riêng)
    ],
    PropertyGroup.CONDO: [
        "so_phong_ngu",       # Số phòng ngủ & WC
        "tang_toa",           # Tầng mấy, tòa/block nào, mã căn
        "ban_cong_view",      # Hướng ban công & tầm nhìn (view thoáng/nội khu)
        "noi_that",           # Tình trạng nội thất (full, cơ bản, nhà thô)
        "phi_quan_ly",        # Phí quản lý dịch vụ / gửi xe
    ],
    PropertyGroup.PROJECT: [
        "chu_dau_tu_phan_khu", # Chủ đầu tư & Phân khu
        "tien_do_xay_dung",    # Tiến độ xây dựng (móng, cất nóc, bàn giao)
        "chinh_sach_thanh_toan", # Tiến độ thanh toán & gói vay ưu đãi
        "thoi_gian_ban_giao",  # Thời gian dự kiến bàn giao
    ],
    PropertyGroup.LAND: [
        "kich_thuoc",         # Kích thước (ngang x dài)
        "chi_tieu_xay_dung",  # Chỉ tiêu xây dựng
        "quy_hoach",          # Quy hoạch
        "yeu_to_ha_tang",     # Hạ tầng (vướng cột điện / hố ga)
    ],
    PropertyGroup.INDUSTRIAL: [
        "thoi_han_su_dung",   # Thời hạn sử dụng đất
        "chieu_cao_tran",     # Chiều cao trần
        "tai_trong_san",      # Tải trọng sàn
        "tram_bien_ap",       # Trạm biến áp
        "tieu_chuan_container",  # Tiêu chuẩn Container
    ],
    PropertyGroup.COMMERCIAL: [
        "mat_tien",           # Bề ngang mặt tiền (m)
        "loi_di",             # Lối đi riêng hay chung chủ
        "vi_he_xe",           # Vỉa hè & chỗ để xe (xe máy / ô tô)
        "nganh_nghe",         # Ngành nghề kinh doanh phù hợp / hạn chế
    ],
    PropertyGroup.UNKNOWN: [],
}

# Trường hỏi thêm khi đã làm rõ thông tin cơ bản (Secondary facts & Closing)
SECONDARY_FIELDS: dict[PropertyGroup, list[str]] = {
    PropertyGroup.RESIDENTIAL: [
        "kich_thuoc",         # Kích thước (ngang x dài)
        "the_chap",           # Đang thế chấp ngân hàng không?
        "thuong_luong",       # Giá có thương lượng / bớt lộc không?
        "hinh_anh",           # Xin ảnh thực tế / sổ hồng
    ],
    PropertyGroup.CONDO: [
        "can_goc",            # Có phải căn góc không?
        "phi_gui_xe",         # Phí gửi ô tô / xe máy
        "hien_trang_su_dung", # Đang ở, trống hay có hợp đồng thuê sẵn?
        "hinh_anh",           # Xin ảnh căn hộ / view ban công
    ],
    PropertyGroup.PROJECT: [
        "chiet_khau",         # Chính sách chiết khấu CĐT
        "phi_chuyen_nhuong",  # Phí chuyển nhượng hợp đồng
        "hinh_anh",           # Xin brochure / layout
    ],
    PropertyGroup.LAND: [
        "ranh_gioi_cot_moc",  # Ranh mốc, cắm cọc rõ ràng chưa?
        "thuong_luong",       # Bớt lộc, thương lượng
        "hinh_anh",           # Xin hình trích lục quy hoạch / sổ đỏ
    ],
    PropertyGroup.INDUSTRIAL: [
        "pccc",               # Hệ thống PCCC
        "phap_ly",
        "hinh_anh",
    ],
    PropertyGroup.COMMERCIAL: [
        "dien_tich_trang_thiet_bi", # Hiện trạng bàn giao & trang thiết bị
        "dien_nuoc_kd",             # Điện 3 pha, nước kinh doanh
        "thuong_luong",             # Thương lượng bớt lộc / giá thuê
        "hinh_anh",                 # Xin ảnh mặt tiền, vỉa hè
    ],
    PropertyGroup.UNKNOWN: [],
}

# Trường nhận diện chung — luôn cần cho mọi BĐS.
IDENTITY_FIELDS: list[str] = [
    "loai_hinh",   # property type slug
    "dia_chi",     # address
    "dien_tich",   # area (m2) — single area (chung cư/đất/công nghiệp: chỉ có 1 diện tích)
    "gia",         # price
]

# Nhà có ĐẤT RIÊNG (không phải căn hộ/chung cư) mang 2 diện tích khác nhau — diện tích đất
# và diện tích nhà (gộp chung "sử dụng"/"xây dựng" thành một trường, theo yêu cầu người dùng:
# không cần tách chi tiết hơn). Các loại còn lại (chung cư, đất, công nghiệp...) chỉ có 1.
HOUSE_TYPES: set[str] = {"nha_pho", "biet_thu", "nha_cap_4"}
HOUSE_AREA_FIELDS: list[str] = ["dien_tich_dat", "dien_tich_nha"]

# A listing is "khá đầy đủ" (ready to draft an ad) at this fraction of expected fields,
# on top of having every identity field. Lowered to 0.55 so the initial draft fires early
# (once core identity + 1 main feature is known), keeping sellers engaged immediately.
SUMMARY_READY_COMPLETENESS: float = 0.55

# Thông số cho thuê (áp dụng chung khi là tin cho thuê) — SRD §III.
RENTAL_FIELDS: list[str] = [
    "thoi_han_hd",   # Thời hạn hợp đồng
    "muc_coc",       # Mức cọc
    "truot_gia",     # Trượt giá
    "thoi_gian_fitout",  # Thời gian Fit-out
]


@dataclass
class Property:
    """A single listing whose data is filled in gradually."""

    loai_hinh: str | None = None        # detected type slug (key of TYPE_TO_GROUP)
    is_rental: bool = False             # tin cho thuê?
    fields: dict[str, str] = field(default_factory=dict)  # all captured values

    @property
    def group(self) -> PropertyGroup:
        if self.loai_hinh is None:
            return PropertyGroup.UNKNOWN
        return TYPE_TO_GROUP.get(self.loai_hinh, PropertyGroup.UNKNOWN)

    def identity_fields(self) -> list[str]:
        """Identity fields for THIS property, adapting to type AND lifecycle phase:
        - area: a standalone house (nhà phố/biệt thự/nhà cấp 4) has its own land, so it uses
          `dien_tich_dat` + `dien_tich_nha` instead of a single `dien_tich`;
        - locator: normally the street `dia_chi`, but a PROJECT unit still in pre-sale (a
          `du_an` is known and NO address yet) is located by `du_an` + `ma_so_can` (mã số
          căn) — a unit "graduates" to being located by `dia_chi` once it has one. See the
          identity-handle-decay note in [[aioi-data-model]]."""
        areas = HOUSE_AREA_FIELDS if self.loai_hinh in HOUSE_TYPES else ["dien_tich"]
        if self.fields.get("du_an") and not self.fields.get("dia_chi"):
            locator = ["du_an", "ma_so_can"]   # pre-sale project unit: no address yet
        else:
            locator = ["dia_chi"]
        return ["loai_hinh", *locator, *areas, "gia"]

    def expected_fields(self) -> list[str]:
        """All fields this property should eventually have, given its type."""
        expected = self.identity_fields() + list(CORE_FIELDS[self.group])
        if self.is_rental:
            expected += RENTAL_FIELDS
        return expected

    def summary_ready(self) -> bool:
        """True once the listing is "khá đầy đủ" — detailed enough to draft a real ad.

        Requires ALL identity fields (type, address, area(s), price) AND a high overall
        completeness, so the draft includes core details, not just the basics.
        """
        if not all(self._has(f) for f in self.identity_fields()):
            return False
        return self.completeness() >= SUMMARY_READY_COMPLETENESS

    def missing_fields(self) -> list[str]:
        """Fields still unknown — the pool the AI draws its next question from."""
        return [f for f in self.expected_fields() if not self._has(f)]

    def completeness(self) -> float:
        """Fraction of expected fields that are filled, in [0, 1]."""
        expected = self.expected_fields()
        if not expected:
            return 0.0
        filled = sum(1 for f in expected if self._has(f))
        return filled / len(expected)

    def _has(self, name: str) -> bool:
        if name == "loai_hinh":
            return self.loai_hinh is not None
        if name == "ma_so_can":
            return bool(self.fields.get("ma_so_can") or self.fields.get("tang_toa"))
        if name in ("dien_tich", "dien_tich_dat"):
            return bool(self.fields.get("dien_tich_dat") or self.fields.get("dien_tich") or self.fields.get("kich_thuoc"))
        if name == "dien_tich_nha":
            return bool(self.fields.get("dien_tich_nha") or self.fields.get("dien_tich") or self.fields.get("dien_tich_dat"))
        return bool(self.fields.get(name))

    def secondary_missing_fields(self) -> list[str]:
        """Fields to ask AFTER core fields are completed (Làm rõ rồi thì hỏi thêm gì)."""
        have = set(self.fields.keys())
        sec = SECONDARY_FIELDS.get(self.group, [])
        return [f for f in sec if f not in have]

    def next_question_field(self) -> str | None:
        """Determines the next targeted core field to ask."""
        missing = self.missing_fields()
        if missing:
            return missing[0]
        return None

    def next_secondary_field(self) -> str | None:
        """Determines the next secondary question (Thế chấp, Thương lượng, Hình ảnh) once core is done."""
        sec = self.secondary_missing_fields()
        if sec:
            return sec[0]
        return None

    def update(self, captured: dict[str, str]) -> list[str]:
        """Merge newly extracted fields; return the names that were newly set."""
        newly: list[str] = []
        for k, v in captured.items():
            if not v:
                continue
            if k == "loai_hinh":
                if self.loai_hinh != v:
                    self.loai_hinh = v
                    newly.append(k)
                continue
            if k == "dia_chi":                  # MERGE, don't overwrite — keep street/ward intact
                v = _merge_dia_chi(self.fields.get("dia_chi", ""), v)
            if self.fields.get(k) != v:
                self.fields[k] = v
                newly.append(k)

        # Guard: if dien_tich was erroneously extracted as a slash number (e.g. "100/9"), that is a house number, NOT area!
        dt = self.fields.get("dien_tich") or ""
        if re.match(r"^\s*\d+/\d+\s*$", dt):
            if dt not in (self.fields.get("dia_chi") or ""):
                self.fields["dia_chi"] = _merge_dia_chi(self.fields.get("dia_chi", ""), dt)
            del self.fields["dien_tich"]
            if "dien_tich" in newly:
                newly.remove("dien_tich")

        # Slash in address -> inherently an alley house ("nhà trong hẻm")
        dia_chi_val = self.fields.get("dia_chi") or ""
        if "/" in dia_chi_val and not self.fields.get("lo_gioi_hem"):
            if re.search(r"\b\d+[\w]*\/[\d\w/]+", dia_chi_val):
                self.fields["lo_gioi_hem"] = "Nhà hẻm"
                if "lo_gioi_hem" not in newly:
                    newly.append("lo_gioi_hem")

        # 1. Tự động suy luận loại hình nếu chưa có (Auto-inference loai_hinh)
        if self.loai_hinh is None:
            dia_chi_l = (self.fields.get("dia_chi") or "").lower()
            du_an_l = (self.fields.get("du_an") or "").lower()
            raw_text = " ".join(str(v).lower() for v in self.fields.values())

            if any(k in dia_chi_l or k in raw_text for k in ("kho xưởng", "kho xuong", "nhà xưởng", "nha xuong", "kho bãi")):
                self.loai_hinh = "kho_xuong"
                newly.append("loai_hinh")
            elif any(k in dia_chi_l or k in du_an_l for k in ("chung cư", "chung cu", "căn hộ", "can ho", "officetel", "penthouse")):
                self.loai_hinh = "chung_cu"
                newly.append("loai_hinh")
            elif self.fields.get("tang_toa") or self.fields.get("ban_cong_view") or self.fields.get("phi_quan_ly") or self.fields.get("ma_so_can"):
                self.loai_hinh = "chung_cu"
                newly.append("loai_hinh")
            elif self.fields.get("du_an"):
                condo_kw = ("tower", "residence", "park", "city", "apartment", "condo", "chung cư", "officetel", "sunrise", "masteri", "vinhomes", "safira", "feliz", "botanic", "jamona", "novaland")
                if any(w in du_an_l for w in condo_kw) or not any(w in du_an_l for w in ("kdc", "khu dân cư", "đất nền", "kho xưởng")):
                    self.loai_hinh = "chung_cu"
                    newly.append("loai_hinh")
            elif any(k in raw_text for k in ("đất thổ cư", "lô đất", "đất nền", "sào", "công đất")):
                self.loai_hinh = "dat"
                newly.append("loai_hinh")
            elif self.fields.get("tho_cu") or self.fields.get("quy_hoach") or self.fields.get("chi_tieu_xay_dung"):
                self.loai_hinh = "dat"
                newly.append("loai_hinh")
            elif any(k in raw_text for k in ("mặt bằng", "shophouse", "cửa hàng")):
                self.loai_hinh = "mat_bang"
                newly.append("loai_hinh")
            elif self.fields.get("chieu_cao_tran") or self.fields.get("tai_trong_san") or self.fields.get("tram_bien_ap"):
                self.loai_hinh = "kho_xuong"
                newly.append("loai_hinh")
            elif self.fields.get("mat_tien") or self.fields.get("vi_he_xe") or self.fields.get("loi_di"):
                self.loai_hinh = "mat_bang"
                newly.append("loai_hinh")
            elif self.fields.get("lo_gioi_hem") or self.fields.get("ket_cau") or any(k in raw_text for k in ("nhà", "nhà phố", "trệt", "lầu", "tầng", "hẻm")):
                self.loai_hinh = "nha_pho"
                newly.append("loai_hinh")

        # 2. Tự động tính diện tích từ kích thước (vd 4x15 -> 60m2) và đồng bộ diện tích
        dim_str = self.fields.get("kich_thuoc") or ""
        raw_dt = self.fields.get("dien_tich") or ""
        if not dim_str and re.search(r"\d+\s*[x*X]\s*\d+", raw_dt):
            dim_str = raw_dt
            self.fields["kich_thuoc"] = dim_str
            if "kich_thuoc" not in newly:
                newly.append("kich_thuoc")

        if dim_str:
            area_calc = _calc_area_from_dimension(dim_str)
            if area_calc:
                if self.loai_hinh in HOUSE_TYPES:
                    if not self.fields.get("dien_tich_dat"):
                        self.fields["dien_tich_dat"] = area_calc
                        newly.append("dien_tich_dat")
                else:
                    if not self.fields.get("dien_tich") or re.search(r"\d+\s*[x*X]\s*\d+", self.fields.get("dien_tich", "")):
                        self.fields["dien_tich"] = area_calc
                        newly.append("dien_tich")

        # Đồng bộ diện tích đất cho nhà có đất riêng khi chỉ có dien_tich
        if self.loai_hinh in HOUSE_TYPES:
            if self.fields.get("dien_tich") and not self.fields.get("dien_tich_dat"):
                self.fields["dien_tich_dat"] = self.fields["dien_tich"]
                if "dien_tich_dat" not in newly:
                    newly.append("dien_tich_dat")
            elif self.fields.get("dien_tich_dat") and not self.fields.get("dien_tich"):
                self.fields["dien_tich"] = self.fields["dien_tich_dat"]
                if "dien_tich" not in newly:
                    newly.append("dien_tich")

        return newly


@dataclass
class BuyerLead:
    """Hồ sơ nhu cầu của Người Mua / Người Thuê (Buyer Lead)."""
    lead_id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    user_key: str = ""
    loai_giao_dich: str = "mua"       # "mua" hoặc "thue"
    loai_bds: str | None = None      # "nha_pho", "chung_cu", "du_an", "dat_tho_cu"...
    ngan_sach: str | None = None     # "5 tỷ", "10-15 tỷ", "15 tr/tháng"...
    khu_vuc: str | None = None       # "Quận 1", "Bình Thạnh", "Vinhomes Grand Park"...
    so_phong_ngu: str | None = None  # "2PN", "3PN"...
    yeu_cau_xe_hoi: str | None = None # "hẻm xe hơi", "chỗ đậu ô tô"...
    huong: str | None = None         # "Đông Tứ Trạch", "Tây Tứ Trạch", "Đông Nam"...
    muc_dich: str | None = None      # "ở", "đầu tư", "kinh doanh"...
    tien_do_mua: str | None = None   # "mua ngay trong tháng", "tham khảo"...
    vay_ngan_hang: str | None = None # "cần vay 70%", "tiền mặt sẵn sàng"...
    stage: str = "discovery"         # "discovery" -> "deep_dive" -> "closing"
    notes: str = ""
    fields: dict[str, str] = field(default_factory=dict)
    updated_at: float = field(default_factory=time.time)

    def next_question_field(self) -> str | None:
        """Quyết định thông tin cần hỏi tiếp theo theo cây phân nhánh người mua."""
        # Giai đoạn 1: Nhu cầu & Ngân sách cốt lõi (Discovery)
        if not self.khu_vuc and not self.fields.get("khu_vuc"):
            return "khu_vuc"
        if not self.ngan_sach and not self.fields.get("ngan_sach"):
            return "ngan_sach"
        if not self.loai_bds and not self.fields.get("loai_bds"):
            return "loai_bds"

        # Giai đoạn 2: Chi tiết theo loại BĐS (Deep-dive)
        loai = (self.loai_bds or self.fields.get("loai_bds", "")).lower()
        if loai in ("chung_cu", "can_ho", "condo"):
            if not self.so_phong_ngu and not self.fields.get("so_phong_ngu"):
                return "so_phong_ngu"
            if not self.fields.get("nhan_nha_khi_nao"):
                return "nhan_nha_khi_nao"
        elif loai in ("nha_pho", "biet_thu", "nha_cap_4"):
            if not self.yeu_cau_xe_hoi and not self.fields.get("yeu_cau_xe_hoi"):
                return "yeu_cau_xe_hoi"
            if not self.so_phong_ngu and not self.fields.get("so_phong_ngu"):
                return "so_phong_ngu"
        elif loai in ("du_an", "dat_du_an"):
            if not self.muc_dich and not self.fields.get("muc_dich"):
                return "muc_dich"
            if not self.vay_ngan_hang and not self.fields.get("vay_ngan_hang"):
                return "vay_ngan_hang"

        if not self.muc_dich and not self.fields.get("muc_dich"):
            return "muc_dich"

        # Giai đoạn 3: Làm rõ rồi thì hỏi thêm gì? (Closing & Hẹn xem)
        if not self.tien_do_mua and not self.fields.get("tien_do_mua"):
            return "tien_do_mua"

        return None

    def update(self, data: dict[str, str]) -> list[str]:
        newly = []
        for k, v in data.items():
            if not v:
                continue
            if hasattr(self, k) and getattr(self, k) != v:
                setattr(self, k, v)
                newly.append(k)
            if self.fields.get(k) != v:
                self.fields[k] = v
                if k not in newly:
                    newly.append(k)
        if newly:
            self.updated_at = time.time()
        return newly

