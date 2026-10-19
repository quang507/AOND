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

_HOUSE_NO_RE = re.compile(r"^(?:(?:đ/?c|dc|địa chỉ)\s*:?\s*)?(\d+[\d/\-.]*[A-Za-z]?)$", re.IGNORECASE)


def _extract_house_num(text: str) -> str | None:
    m = re.search(r"^\s*(\d+[\d/\-.]*[A-Za-z]?)", text)
    if m:
        return m.group(1)
    return None


def _merge_dia_chi(old: str, new: str) -> str:
    """Gộp địa chỉ không mất phần đã có (bản anh Luận b274582 + số nhà thay số nhà cũ). Lượt AI lập thao tác trả địa chỉ ĐẦY ĐỦ
    sau khi ghép phần mới vào "ĐỊA CHỈ ĐANG GHI" và sửa theo lời đính chính (OPERATIONS_SYSTEM); tên đường / phường / quận lưu
    DB đi qua ô riêng duong / phuong / quan + bảng duong / wards, không dò từ khoá trên chữ này (SRS-5.1zzzzzzz55). Code chỉ giữ
    lưới: mảnh đã nằm trong địa chỉ cũ → giữ bản đầy đủ; số nhà đứng một mình → gắn / thay số nhà ở đầu."""
    old, new = (old or "").strip(), (new or "").strip()
    if not old:
        return new
    if not new or new.lower() in old.lower():
        return old
    if old.lower() in new.lower():
        return new
    m_house = _HOUSE_NO_RE.match(new)
    if m_house:
        num = m_house.group(1)
        old_num = _extract_house_num(old)
        if old_num:
            return re.sub(r"^\s*" + re.escape(old_num), num, old)
        return f"{num} {old}"
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
        "lo_gioi_duong",      # Lộ giới đường trước đất (18/10: ô bắt buộc của đất nền — phải bóc được)
        "tho_cu",             # Diện tích thổ cư
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

# 19/10/2026 (SRS-5.1zzzzzzz68; chủ dự án: "có nguồn duy nhất là dc"): loại trong nhóm mà bộ câu khác hẳn cả nhóm — đè
# `CORE_FIELDS[nhóm]`. Chép ý từ bảng DB `required_facts` (bot TypeScript, gỡ 20261019g): toà nhà / CHDV hỏi số phòng + dòng
# tiền (thay phòng ngủ, hoàn công nhà ở), phòng trọ hỏi tiện ích phòng + điện nước + giờ giấc (thay kết cấu, sổ), đất nông
# nghiệp / đất kinh doanh hỏi theo đất trống (thay chỉ tiêu xây dựng / trần, tải trọng sàn). Bộ câu hỏi chỉ còn ở file này.
CORE_THEO_LOAI: dict[str, list[str]] = {
    "toa_nha": ["ket_cau", "so_phong", "dong_tien_thue", "lo_gioi_hem", "phap_ly_hoan_cong"],
    "chdv": ["ket_cau", "so_phong", "dong_tien_thue", "lo_gioi_hem", "phap_ly_hoan_cong"],
    "khach_san": ["ket_cau", "so_phong", "dong_tien_thue", "lo_gioi_hem", "phap_ly_hoan_cong"],
    "phong_tro": ["tien_ich_phong", "gia_dien_nuoc", "gio_giac"],
    # Đất nông nghiệp: không hỏi chỉ tiêu xây dựng / thổ cư như đất ở — hỏi đường vào, quy hoạch, lên thổ cư được không, nước tưới.
    "dat_nong_nghiep": ["kich_thuoc", "lo_gioi_duong", "quy_hoach", "len_tho_cu", "nguon_nuoc"],
    # Đất kinh doanh / SKC / TMD là ĐẤT trống: không hỏi chiều cao trần, tải trọng sàn như kho xưởng.
    "dat_kinh_doanh": ["kich_thuoc", "lo_gioi_duong", "thoi_han_su_dung", "muc_dich_su_dung_dat", "quy_hoach"],
    "dat_skc": ["kich_thuoc", "lo_gioi_duong", "thoi_han_su_dung", "muc_dich_su_dung_dat", "quy_hoach"],
    "dat_tmd": ["kich_thuoc", "lo_gioi_duong", "thoi_han_su_dung", "muc_dich_su_dung_dat", "quy_hoach"],
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
# on top of having every identity field AND the per-type required fields (`blocking_fields`).
# 18/10/2026 (SRS-5.1zzzzzzz38): 0.55 → 0.70 — bản nháp ra ngay lượt đầu khi mới có "Quận 5".
SUMMARY_READY_COMPLETENESS: float = 0.70

# Đất nền / thổ cư phải có tên đường + lộ giới hoặc thổ cư mới soạn tin; đất nông nghiệp thường ở xã, không có tên đường —
# không chặn theo tên đường để khỏi kẹt câu hỏi.
LAND_GATED_TYPES: set[str] = {"dat", "dat_tho_cu"}

# 18/10/2026 (chủ dự án: "độ rộng hẻm ko bắt buộc, hỏi sau khi ra tin"): ô KHÔNG hỏi trước bản nháp — bỏ khỏi `missing_fields`
# và khỏi % đầy đủ, được hỏi từng câu sau khi khách duyệt tin (`cau_hoi_sau_ra_tin`, prompt build_fee_followup_system).
# 19/10/2026 (SRS-5.1zzzzzzz76; chủ dự án: "nó hỏi nhiều quá chán chết được"): thêm hiện trạng đang ở / cho thuê — không đổi nội
# dung tin rao, người mua hỏi lúc hẹn xem; trước đó nó vẫn tính vào % nên nhà phố phải trả lời 7–8 câu mới thấy bản nháp.
HOI_SAU_KHI_RA_TIN: set[str] = {"lo_gioi_hem", "tinh_trang_ban_giao"}

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

    def core_fields(self) -> list[str]:
        """Ô cốt lõi của loại này: bộ riêng của loại (`CORE_THEO_LOAI`) nếu có, không thì bộ của nhóm."""
        return list(CORE_THEO_LOAI.get(self.loai_hinh or "", CORE_FIELDS[self.group]))

    def expected_fields(self) -> list[str]:
        """All fields this property should eventually have, given its type."""
        expected = self.identity_fields() + self.core_fields()
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
        if self.blocking_fields():
            return False
        expected = [x for x in self.expected_fields() if x not in HOI_SAU_KHI_RA_TIN]
        return sum(1 for x in expected if self._has(x)) >= SUMMARY_READY_COMPLETENESS * len(expected)

    def blocking_fields(self) -> list[str]:
        """Ô BẮT BUỘC theo loại BĐS trước khi soạn bản nháp (ngoài ngưỡng %), theo thứ tự hỏi:
        - nhà phố / biệt thự / cấp 4: địa chỉ có tên đường (trừ căn dự án chưa có địa chỉ, định vị bằng dự án + mã căn),
          và kết cấu (hoặc diện tích nhà / số tầng / số phòng ngủ);
        - chung cư / căn hộ: tên dự án / chung cư và số phòng ngủ;
        - đất nền / thổ cư: địa chỉ có tên đường, và lộ giới đường trước đất hoặc diện tích thổ cư."""
        f = self.fields
        can: list[str] = []
        # 18/10/2026 (SRS-5.1zzzzzzz41): tên đường / phường là ô AI bóc tách đọc theo nghĩa (prompts.EXTRACTION_SYSTEM:
        # duong / phuong), code chỉ kiểm có hay chưa — không dò từ khoá trên chữ dia_chi.
        if self.loai_hinh in HOUSE_TYPES:
            if "dia_chi" in self.identity_fields() and not f.get("duong"):
                can.append("dia_chi")
            if not any(f.get(k) for k in ("ket_cau", "dien_tich_nha", "so_tang", "so_phong_ngu")):
                can.append("ket_cau")
        elif self.group is PropertyGroup.CONDO:
            if not f.get("du_an"):
                can.append("du_an")
            if not f.get("so_phong_ngu"):
                can.append("so_phong_ngu")
        elif self.loai_hinh in LAND_GATED_TYPES:
            if not f.get("duong"):
                can.append("dia_chi")
            if not (f.get("lo_gioi_duong") or f.get("tho_cu")):
                can.append("lo_gioi_duong")
        # Mọi loại định vị bằng địa chỉ: phải biết phường mới đăng được (DB). Căn hộ có tên dự án lấy phường của dự án
        # (supabase_store._dia_ban), không hỏi khách.
        if ("dia_chi" in self.identity_fields() and not f.get("phuong")
                and not (self.group is PropertyGroup.CONDO and f.get("du_an"))):
            can.insert(can.index("dia_chi") + 1, "phuong") if "dia_chi" in can else can.append("phuong")
        return can

    def missing_fields(self) -> list[str]:
        """Fields still unknown — the pool the AI draws its next question from. Ô bắt buộc chưa đạt (vd địa chỉ mới có
        quận) nằm đúng chỗ của nó trong thứ tự hỏi; ô bắt buộc không thuộc danh sách mong đợi (tên dự án của căn hộ đã có
        địa chỉ) đứng ngay sau nhóm nhận diện."""
        chan = self.blocking_fields()
        identity = set(self.identity_fields())
        expected = self.expected_fields()
        ra = [x for x in expected if x in identity and (not self._has(x) or x in chan)]
        ra += [x for x in chan if x not in expected]
        ra += [x for x in expected if x not in identity and (not self._has(x) or x in chan)]
        # Phường hỏi NGAY sau địa chỉ (đường → phường; địa chỉ xong rồi thì phường lên đầu, sau loại hình), kể cả khi nhóm
        # nhận diện còn ô khác (diện tích nhà) chen giữa.
        if "phuong" in ra:
            ra.remove("phuong")
            if "dia_chi" in ra:
                ra.insert(ra.index("dia_chi") + 1, "phuong")
            else:
                ra.insert(1 if ra[:1] == ["loai_hinh"] else 0, "phuong")
        return [x for x in ra if x not in HOI_SAU_KHI_RA_TIN]

    def cau_hoi_sau_ra_tin(self) -> str | None:
        """Ô hỏi SAU khi khách duyệt bản nháp, từng ô một: độ rộng hẻm của nhà ở trong hẻm khi chưa biết bề rộng (chưa có chữ
        số, không phải mặt tiền), rồi hiện trạng đang ở / cho thuê."""
        if self.group is not PropertyGroup.RESIDENTIAL:
            return None
        v = (self.fields.get("lo_gioi_hem") or "").lower()
        if not ("mặt tiền" in v or re.search(r"\bmt\b", v) or re.search(r"\d", v)):
            return "lo_gioi_hem"
        if "tinh_trang_ban_giao" in self.expected_fields() and not self._has("tinh_trang_ban_giao"):
            return "tinh_trang_ban_giao"
        return None

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
        if name == "dia_chi":     # có tên đường là đã định vị được — không hỏi lại "đường nào" (SRS-5.1zzzzzzz74; 19/10 hỏi 3 lần)
            return bool(self.fields.get("dia_chi") or self.fields.get("duong"))
        if name == "phap_ly_hoan_cong":   # khách đã nói sổ (ô phap_ly) thì không hỏi riêng hoàn công (SRS-5.1zzzzzzz76)
            return bool(self.fields.get("phap_ly_hoan_cong") or self.fields.get("phap_ly"))
        if name == "dien_tich":   # BĐS một diện tích (chung cư / đất / công nghiệp)
            return bool(self.fields.get("dien_tich") or self.fields.get("dien_tich_dat") or self.fields.get("kich_thuoc"))
        # Nhà có đất riêng: diện tích ĐẤT và diện tích NHÀ là hai ô riêng, mỗi ô phải có chính nó (bản anh Luận,
        # SRS-5.1zzzzzzz52). Bản 16/10 cho một con số đứng thay cả hai → nhà phố ra bản nháp khi chưa biết diện tích nhà.
        return bool(self.fields.get(name))

    def next_question_field(self) -> str | None:
        """Determines the next targeted core field to ask."""
        missing = self.missing_fields()
        if missing:
            return missing[0]
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

        # 19/10/2026 (SRS-5.1zzzzzzz55): bỏ khối đoán loai_hinh bằng từ khoá ("nhà / lầu / hẻm" → nhà phố, tên thương hiệu → chung
        # cư…). Loại BĐS do lượt AI bóc tách đọc (ô loai_hinh); chưa rõ thì bot hỏi.

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

        # Nhà có đất riêng: KHÔNG đồng bộ dien_tich ↔ dien_tich_dat (SRS-5.1zzzzzzz52, theo bản anh Luận). Một con số khách
        # chưa nói là đất hay nhà nằm yên ở dien_tich; build_chat_system hỏi lại "80m2 đó là đất hay nhà". Riêng chuỗi
        # kích thước ("4x15") đã chuyển sang kich_thuoc → diện tích đất ở trên, không phải con số mơ hồ nên bỏ khỏi dien_tich.
        if self.loai_hinh in HOUSE_TYPES and re.search(r"\d+\s*[x*X]\s*\d+", self.fields.get("dien_tich") or "") \
                and self.fields.get("kich_thuoc"):
            del self.fields["dien_tich"]
            if "dien_tich" in newly:
                newly.remove("dien_tich")

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

