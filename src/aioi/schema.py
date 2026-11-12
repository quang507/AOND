"""Dynamic property schema (SRD §III).

The AI auto-detects the property type and surfaces only the core fields relevant to
that type's group. Every property also carries shared identity fields and, when it is
a rental, the shared rental terms. Data is accumulated gradually across conversations,
so all fields are optional and start empty.
"""
from __future__ import annotations

import re
from .chu import bo_dau
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

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


def so_met(v: Any) -> float | None:
    """Số mét của một ô AI đã bóc ra SỐ ("6", "4.5", "4,5", "6m") — chuẩn hoá dấu phẩy / đơn vị, không đọc chữ khách."""
    try:
        x = float(str(v).strip().lower().removesuffix("m").strip().replace(",", "."))
    except (TypeError, ValueError):
        return None
    return x if 0 < x < 10000 else None


def dien_tich_tu_kich_thuoc(fields: dict[str, Any]) -> str | None:
    """SRS-5.1zzzzzzz409 (chủ dự án 11/11/2026: "tao tưởng là AI bóc tách chứ sâu là chữ dài chứ đâu phải regex"): AI đọc NGHĨA lời khách và ghi
    SỐ vào `mat_tien` (bề ngang trước), `dai_m` (dài / sâu), `hau_m` (bề hậu thật, đã tính nở / tóp hậu). Code chỉ tính: chữ nhật ngang × dài,
    có bề hậu khác ngang thì hình thang (ngang + hậu) / 2 × dài. Luôn "khoảng" — số trên sổ mới là chuẩn. Thay `_calc_area_from_dimension`
    (regex dò chuỗi kích thước, không biết chữ "sâu", không biết nở hậu)."""
    w, l, h = so_met(fields.get("mat_tien")), so_met(fields.get("dai_m")), so_met(fields.get("hau_m"))
    if not w or not l:
        return None
    a = round((w + h) / 2 * l, 1) if h and h != w else round(w * l, 1)
    return f"khoảng {int(a) if float(a).is_integer() else a}m2"


import uuid
import time


def _gop_y(cu: str, them: str) -> str:
    """Gộp ý `them` vào chuỗi `cu` của cùng một ô: mọi chữ của `them` đã có trong `cu` → giữ `cu`; ngược lại nối " · " (SRS-5.1zzzzzzz218)."""
    tu = lambda x: set(re.findall(r"[a-z0-9]+", bo_dau(x)))
    if not cu:
        return them
    if tu(them) <= tu(cu):
        return cu
    return f"{cu} · {them}"


def _merge_uu_the(old: str, new: str) -> str:
    """Ưu thế khác khách tự nói CỘNG DỒN, không ghi đè (SRS-5.1zzzzzzz205, theo anh Luận): mỗi ý một cụm ngắn, nối bằng " · ", chỉ thêm cụm
    chưa có (không phân biệt hoa thường)."""
    co = [p.strip() for p in (old or "").split("·") if p.strip()]
    thay = {p.lower() for p in co}
    for p in (x.strip() for x in (new or "").split("·")):
        if p and p.lower() not in thay:
            co.append(p)
            thay.add(p.lower())
    return " · ".join(co)


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
        "phap_ly_so_hong",    # Sổ hồng riêng hay HĐMB (pháp lý: một trong bốn nhóm chính trước bản nháp, SRS-5.1zzzzzzz418)
        "hien_trang_su_dung", # Đang ở, trống hay có khách thuê (SRS-5.1zzzzzzz418: không chặn bản nháp, như bản anh Luận)
    ],
    PropertyGroup.PROJECT: [
        "chu_dau_tu_phan_khu", # Chủ đầu tư & Phân khu
        "tien_do_xay_dung",    # Tiến độ xây dựng (móng, cất nóc, bàn giao)
        "chinh_sach_thanh_toan", # Tiến độ thanh toán & gói vay ưu đãi
        "thoi_gian_ban_giao",  # Thời gian dự kiến bàn giao
    ],
    PropertyGroup.LAND: [
        "kich_thuoc",         # Kích thước (ngang x dài)
        "tho_cu",             # Diện tích thổ cư
        "lo_gioi_duong",      # Lộ giới đường trước đất (18/10: ô bắt buộc của đất nền — phải bóc được)
        "phap_ly_so_do",      # Sổ đỏ riêng (pháp lý: một trong bốn nhóm chính trước bản nháp, SRS-5.1zzzzzzz418)
        "quy_hoach",          # Quy hoạch
        "chi_tieu_xay_dung",  # Chỉ tiêu xây dựng
        "yeu_to_ha_tang",     # Hạ tầng (vướng cột điện / hố ga)
    ],
    PropertyGroup.INDUSTRIAL: [
        "tieu_chuan_container",  # Tiêu chuẩn Container (đường xe tải / container vào tận nơi - SRS-393)
        "tram_bien_ap",       # Nguồn điện sản xuất (điện 3 pha / trạm biến áp)
        "chieu_cao_tran",     # Chiều cao trần
        "phap_ly_so_do",      # Sổ đỏ (SRS-5.1zzzzzzz263: kho xưởng phải có pháp lý trước bản nháp)
        "thoi_han_su_dung",   # Thời hạn sử dụng đất
        "tai_trong_san",      # Tải trọng sàn (SRS-5.1zzzzzzz393: đưa xuống cuối, không ép hỏi sớm)
    ],
    PropertyGroup.COMMERCIAL: [
        "phap_ly_so_do",      # Sổ đỏ / sổ hồng (SRS-5.1zzzzzzz263: BĐS thương mại phải có pháp lý trước bản nháp; tin cho thuê bỏ qua)
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
    "dat_kinh_doanh": ["kich_thuoc", "phap_ly_so_do", "lo_gioi_duong", "thoi_han_su_dung", "muc_dich_su_dung_dat", "quy_hoach"],
    "dat_skc": ["kich_thuoc", "phap_ly_so_do", "lo_gioi_duong", "thoi_han_su_dung", "muc_dich_su_dung_dat", "quy_hoach"],
    "dat_tmd": ["kich_thuoc", "phap_ly_so_do", "lo_gioi_duong", "thoi_han_su_dung", "muc_dich_su_dung_dat", "quy_hoach"],
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
# 20/10/2026 (SRS-5.1zzzzzzz79; chủ dự án: "nên ra bản nháp khi nào học theo anh Luận"): 0.75 tính trên MỌI ô mong đợi — đúng bản anh
# Luận (`summary_ready`: đủ ô nhận diện + completeness ≥ 0.75); giữ ô bắt buộc riêng của mình (tên đường, phường — DB cần mới đăng).
SUMMARY_READY_COMPLETENESS: float = 0.75

# SRS-5.1zzzzzzz359 / 366 / 367 (chủ dự án 02/11): ô HỆ THỐNG tự xác định, không bao giờ là câu hỏi cho khách — NGUỒN DUY NHẤT: vòng chọn
# câu hỏi (`missing_fields`) lọc theo đây, lưới soát lời bot (`engine._soat_hoi_dung_o`) chặn đầu ra theo đây, bước áp tên kho
# (`Engine._chuan_dia_danh`) chỉ chạy cho ô có ở đây. Phường: cũ → mới, toạ độ trên bản đồ, kho đường / hẻm. Đường: tên khách đã nói, hệ
# thống áp tên kho (hỏi đường khi khách CHƯA nói là hỏi ô `dia_chi`). Thêm ô hệ thống tự tra = thêm khoá vào đây. Khách tự nói thì vẫn ghi.
O_HE_THONG_TRA: frozenset[str] = frozenset({"phuong", "duong"})

# 20/10/2026 (SRS-5.1zzzzzzz79; chủ dự án: "hỏi theo cụm"): ô hỏi GỘP một câu như môi giới ("nhà ngang dài bao nhiêu, xây mấy tầng
# anh?") thay vì mỗi lượt một ô. Ô thiếu đầu tiên quyết cụm; lượt đó hỏi các ô còn thiếu trong cùng cụm (tối đa 3). Ô không thuộc cụm
# nào hỏi riêng như cũ.
CUM_HOI: list[tuple[str, ...]] = [
    ("dia_chi", "lo_gioi_hem"),            # 20/10 (SRS-5.1zzzzzzz81): hẻm / mặt tiền hỏi trước bản nháp như anh Luận; phường hệ thống tự tra (SRS-359)
    ("dien_tich_dat", "dien_tich_nha", "ket_cau"),   # kích thước = cách nói khác của diện tích đất, không hỏi thêm
    ("dien_tich", "so_phong_ngu"),
    ("phap_ly_hoan_cong", "gia", "tinh_trang_ban_giao"),
    ("du_an", "tang_toa"),
    ("tieu_chuan_container", "tram_bien_ap"),  # SRS-5.1zzzzzzz393: hỏi gộp đường xe tải/cont và điện 3 pha cho kho xưởng
]
# 22/10/2026 (SRS-5.1zzzzzzz136); 06/11/2026 (SRS-5.1zzzzzzz391, chủ dự án: "mỗi lượt hỏi tối đa 2 ý thôi"):
# nâng số ô cùng cụm được hỏi gộp mỗi lượt lên tối đa 2 ý để hội thoại tự nhiên, không tra khảo máy móc.
# 11/11/2026 (SRS-5.1zzzzzzz407, chủ dự án: "sửa mỗi lượt chỉ hỏi 1 ý thôi"): về lại MỘT ý mỗi lượt.
CUM_TOI_DA = 1

# Đất nền / thổ cư phải có tên đường + lộ giới hoặc thổ cư mới soạn tin; đất nông nghiệp thường ở xã, không có tên đường —
# không chặn theo tên đường để khỏi kẹt câu hỏi.
LAND_GATED_TYPES: set[str] = {"dat", "dat_tho_cu"}

# 18/10/2026 (chủ dự án: "độ rộng hẻm ko bắt buộc, hỏi sau khi ra tin"): ô KHÔNG hỏi trước bản nháp — bỏ khỏi `missing_fields`
# và khỏi % đầy đủ, được hỏi từng câu sau khi khách duyệt tin (`cau_hoi_sau_ra_tin`, prompt build_fee_followup_system).
# 19/10/2026 (SRS-5.1zzzzzzz76; chủ dự án: "nó hỏi nhiều quá chán chết được"): thêm hiện trạng đang ở / cho thuê — không đổi nội
# dung tin rao, người mua hỏi lúc hẹn xem; trước đó nó vẫn tính vào % nên nhà phố phải trả lời 7–8 câu mới thấy bản nháp.
# 20/10/2026 (SRS-5.1zzzzzzz81; chủ dự án: "Hẻm / mặt tiền và hiện trạng… theo anh Luận"): bỏ hai quyết định trên — hai ô này lại
# hỏi TRƯỚC bản nháp như bản anh Luận (gộp cụm: hẻm cùng địa chỉ / phường, hiện trạng cùng giá / pháp lý). Tập để trống, giữ tên để
# chỗ nào cần lại thì thêm vào đây.
HOI_SAU_KHI_RA_TIN: set[str] = set()
# Ô pháp lý: khách nói sổ rồi nói hoàn công vào cùng một ô thì câu sau ĐÈ câu trước (ban-thu-ban 26/10, Cao Lỗ: "sổ riêng" mất, cột
# `legal_status` rỗng). Ý cũ cất ở `_phap_ly_cu` (mới nhất trước) để cột mã pháp lý vẫn đọc được; khách SỬA ý cũ thì mã của câu mới thắng.
KHOA_PHAP_LY = ("phap_ly", "phap_ly_hoan_cong", "phap_ly_so_hong", "phap_ly_so_do")
PHAP_LY_CU_TOI_DA = 5

# 21/10/2026 (SRS-5.1zzzzzzz116; chủ dự án gửi bộ câu môi giới hỏi chủ nhà — pháp lý, giá, dẫn khách xem, chi tiết nhà): hỏi SAU khi tin
# đã lên web và đã nói chuyện phí, mỗi lượt MỘT cụm, mỗi cụm hỏi MỘT lần (khách lờ thì thôi). Không thuộc `expected_fields` — không
# tính % đầy đủ, không chặn / không làm chậm bản nháp ("hỏi ít, ra bản nháp sớm"). Ô đã có thì bỏ; ô đã hỏi trước bản nháp (ô cốt lõi
# của loại) thì bỏ. Thứ tự = thứ tự quan trọng (pháp lý trước — "phần quan trọng nhất").
CUM_SAU_DANG: list[tuple[str, tuple[str, ...]]] = [
    ("phap_ly", ("dung_ten_so", "the_chap", "quy_hoach")),
    ("hdt", ("thu_nhap_thue",)),   # SRS-5.1zzzzzzz197: chỉ khi AI đọc nhà đang có hợp đồng thuê (`co_hdt` = "co"), xem cum_sau_dang
    ("gia", ("thuong_luong", "ly_do_ban")),
    ("thue_phi", ("thue_phi", "thanh_toan")),
    ("xem_nha", ("gio_xem", "chia_khoa")),
    ("chi_tiet", ("huong", "nam_xay", "noi_that")),
]
# SRS-5.1zzzzzzz197 (chủ dự án 26/10/2026): `thu_nhap_thue` = tiền thuê nhà đang thu mỗi tháng khi TIN BÁN có hợp đồng thuê (HĐT). Không có ô
# cờ "có HĐT": khách nói "đang cho thuê 35 triệu" thì AI ghi thẳng số tiền (có bằng chứng trong lời khách), `hd_thue_con` là hợp đồng còn bao lâu.
O_SAU_DANG: frozenset[str] = frozenset(k for _, cum in CUM_SAU_DANG for k in cum) | {"hd_thue_con", "thu_nhap_thue", "co_hdt"}
# Chủ dự án 11/11/2026 (SRS-5.1zzzzzzz420, "cố xin thêm hình ảnh thêm 1 tí nữa sau khi đăng tin"; tin #56F988C9 lên web chỉ 2 ảnh): tin chưa đủ
# ANH_TIN_DEP ảnh thật thì cụm XIN ẢNH đi ĐẦU chuỗi hỏi sau đăng, rồi nhắc nhẹ thêm MỘT lần ở CUỐI chuỗi nếu vẫn thiếu. Đếm số ảnh thật
# đã lưu của căn (engine truyền vào), không đọc ô chữ `hinh_anh` (khách nói "ảnh trong nhà" không có nghĩa là ảnh đã vào tin).
ANH_TIN_DEP = 6
CUM_XIN_ANH = ("anh", "anh_lan_2")

# Ô RIÊNG của chủ nhà (SRS-5.1zzzzzzz116): không ghi vào `listings.boc_tach` (đọc công khai qua API cho tin đang bán), không vào bản tin
# rao — lưu bảng `listing_noi_bo` (chỉ admin đọc). Lý do bán / mức gấp cho người mua biết là mất thế thương lượng của chủ; ai đứng tên,
# ai giữ chìa khoá, giờ xem là chuyện nhà người ta.
# SRS-5.1zzzzzzz295 (chủ dự án 29/10/2026, bước 3 chuỗi tiền: "bot được hỏi" cọc / công chứng): tin chuyển "đã cọc" thì hỏi số tiền cọc, ngày
# cọc, hạn công chứng — mỗi lượt một ô, mỗi ô một lần (`_coc_da_hoi`). Chuyện giao dịch giữa hai bên → ô RIÊNG, không lên web.
O_COC: tuple[str, ...] = ("tien_coc", "ngay_coc", "han_cong_chung")
# `_qc_anh` / `_qc_da_nhan` (SRS-5.1zzzzzzz422): kết quả QC ảnh và số tin QC đã nhắn — việc nội bộ, cùng chỗ chỉ admin đọc.
# SRS-5.1zzzzzzz426 (LQC mảng Pháp lý): tiến độ giấy tờ chủ nói — hỏi MỘT lần ngay sau khi chủ nói chưa hoàn công / chỉ có HĐMB. Lời hứa
# chưa kiểm được → ô RIÊNG, không lên web.
O_PHAP_LY_NOI_BO: tuple[str, ...] = ("du_kien_hoan_cong", "du_kien_ra_so")
O_NOI_BO: frozenset[str] = frozenset({"dung_ten_so", "ly_do_ban", "gio_xem", "chia_khoa", *O_COC, *O_PHAP_LY_NOI_BO, "_qc_anh", "_qc_da_nhan"})

# Thông số cho thuê (áp dụng chung khi là tin cho thuê) — SRD §III.
RENTAL_FIELDS: list[str] = [
    "thoi_han_hd",   # Thời hạn hợp đồng
    "muc_coc",       # Mức cọc
    "truot_gia",     # Trượt giá
    "thoi_gian_fitout",  # Thời gian Fit-out
]


# ── NHÓM HIỂN THỊ THEO FACET (26/10/2026, chủ dự án: "đổi các hàm để test như bên AOND của anh Luận", SRS-5.1zzzzzzz194) ───────────────────
# CHỈ để xem dữ liệu đã bóc tách (`cli.py /state`, test): gom ô theo vài mặt người đọc hiểu ngay. KHÔNG đổi luật hỏi / ra bản nháp — bản
# anh Luận (68129e4) dùng cùng nhóm này để quyết câu hỏi, bên mình vẫn theo CORE_FIELDS / CUM_HOI. Ô lạ rơi vào "Khác"; ô bắt đầu bằng "_"
# (nội bộ) không hiển thị.
FACETS: list[tuple[str, str, list[str]]] = [
    ("vi_tri",     "Vị trí",           ["dia_chi", "du_an", "ma_so_can", "duong", "phuong", "quan", "xa", "tinh", "gan_nga_tu", "tang_toa"]),
    ("vi_the",     "Vị thế",           ["lo_gioi_hem", "huong", "view", "ban_cong_view", "vi_the", "goc", "can_goc", "mat_tien_duong", "lo_gioi_duong",
                                        "vi_he_xe", "loi_di", "diem_noi_bat"]),
    ("dat",        "Kích thước đất",   ["dien_tich", "dien_tich_dat", "kich_thuoc", "mat_tien", "no_hau", "tho_cu"]),
    ("cong_trinh", "Quy mô xây dựng",  ["ket_cau", "dien_tich_nha", "so_tang", "so_phong_ngu", "so_phong", "so_phong_thue", "noi_that", "thang_may",
                                        "tien_ich_phong"]),
    ("phap_ly",    "Pháp lý",          ["phap_ly_hoan_cong", "phap_ly", "phap_ly_so_do", "phap_ly_so_hong", "nam_so", "quy_hoach", "thoi_han_su_dung",
                                        "the_chap"]),
    ("gia_tm",     "Giá & thương mại", ["gia", "thuong_luong", "tinh_trang_ban_giao", "hien_trang_su_dung", "muc_coc", "thoi_han_hd",
                                        "co_hdt", "thu_nhap_thue", "dong_tien_thue", "phi_quan_ly"]),
]
FACET_LABEL: dict[str, str] = {fid: label for fid, label, _ in FACETS}
_FACET_OF: dict[str, str] = {k: fid for fid, _, keys in FACETS for k in keys}
_KEYS_FACET: dict[str, list[str]] = {fid: keys for fid, _, keys in FACETS}
# Bốn nhóm chính xét trước bản nháp — theo bản anh Luận (SRS-5.1zzzzzzz418, chủ dự án 11/11: "theo anh Luận đi"; thay SRS-5.1zzzzzzz260
# quy mô · pháp lý · hiện trạng bắt buộc đủ): vị thế · kích thước đất · quy mô xây dựng · pháp lý, thiếu tối đa MỘT nhóm là soạn
# (`SOAN_THIEU_TOI_DA`). Giá + vị trí nằm ở sàn `minimal_missing`. Hiện trạng (đang ở / trống / cho thuê) không chặn bản nháp — nằm nhóm
# giá & thương mại như bản anh Luận. Nhóm chỉ tính khi loại BĐS có ô mong đợi trong nhóm; tin cho thuê bỏ pháp lý.
NHOM_SOAN: tuple[tuple[str, tuple[str, ...]], ...] = tuple((fid, tuple(_KEYS_FACET[fid])) for fid in ("vi_the", "dat", "cong_trinh", "phap_ly"))
SOAN_THIEU_TOI_DA = 1
_NHOM_OF: dict[str, str] = {k: nid for nid, keys in NHOM_SOAN for k in keys}


def facet_of(key: str) -> str:
    """Ô thuộc facet nào ("khac" nếu chưa xếp)."""
    return _FACET_OF.get(key, "khac")


@dataclass
class Property:
    """A single listing whose data is filled in gradually."""

    loai_hinh: str | None = None        # detected type slug (key of TYPE_TO_GROUP)
    is_rental: bool = False             # tin cho thuê?
    fields: dict[str, str] = field(default_factory=dict)  # all captured values
    # Transient (SRS-5.1zzzzzzz80; chủ dự án: "khách lờ 2 lần thì để sau"): ô khách đã lờ 2 lần — không hỏi trước bản nháp nữa,
    # không chặn bản nháp, hỏi lại sau khi khách duyệt (`cau_hoi_sau_ra_tin`). Không lưu DB: khởi động lại thì có thể hỏi lại một lần.
    hoan: set[str] = field(default_factory=set)

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
            # Căn dự án chưa có địa chỉ: định vị bằng tên dự án. Mã căn "có thì tốt, không có vẫn nhận" (chủ dự án 20/10/2026,
            # SRS-5.1zzzzzzz86) — hỏi như ô thường (`expected_fields`), lờ 2 lần thì để sau, không chặn bản nháp.
            locator = ["du_an"]
        else:
            locator = ["dia_chi"]
        return ["loai_hinh", *locator, *areas, "gia"]

    def core_fields(self) -> list[str]:
        """Ô cốt lõi của loại này: bộ riêng của loại (`CORE_THEO_LOAI`) nếu có, không thì bộ của nhóm."""
        return list(CORE_THEO_LOAI.get(self.loai_hinh or "", CORE_FIELDS[self.group]))

    def fields_khach(self) -> dict[str, str]:
        """Ô tin từ lời khách — bỏ khoá NỘI BỘ bắt đầu bằng "_" (cờ hệ thống như `_ngoai_vung`; khoá DB tự thêm vào `boc_tach` như
        `_cap_nhat`, theo về khi nạp lại). Mọi chỗ đưa ô tin cho model / bộ đọc thông số / khách xem đi qua đây (SRS-5.1zzzzzzz86)."""
        return {k: v for k, v in self.fields.items() if not str(k).startswith("_")}

    def expected_fields(self) -> list[str]:
        """All fields this property should eventually have, given its type."""
        expected = self.identity_fields() + self.core_fields()
        if self.fields.get("du_an") and not self.fields.get("dia_chi"):
            expected.insert(len(self.identity_fields()), "ma_so_can")
        if self.is_rental:
            expected += RENTAL_FIELDS
        return expected

    def by_facet(self) -> list[tuple[str, str, dict[str, str]]]:
        """Dữ liệu đã bắt, gom theo facet: (facet_id, nhãn, {ô: giá trị}) cho facet có ít nhất một ô; ô lạ vào "Khác". Chỉ để hiển thị."""
        buckets: dict[str, dict[str, str]] = {fid: {} for fid, _, _ in FACETS}
        buckets["khac"] = {}
        for k, v in self.fields.items():
            if v and not k.startswith("_"):
                buckets.setdefault(facet_of(k), {})[k] = v
        labels = {**FACET_LABEL, "khac": "Khác"}
        return [(fid, labels.get(fid, fid), b) for fid, b in buckets.items() if b]

    def minimal_missing(self) -> list[str]:
        """Còn thiếu gì để RAO được (SRS-5.1zzzzzzz200, chủ dự án 26/10/2026: "đổi cách quyết đủ rao chưa thành loại hình + vị trí + giá
        của anh Luận"): LOẠI HÌNH + VỊ TRÍ (địa chỉ / tên đường, hoặc dự án) + GIÁ — mọi thứ khác bổ sung dần, hỏi thêm sau bản nháp."""
        need: list[str] = []
        if self.loai_hinh is None:
            need.append("loai_hinh")
        # SRS-5.1zzzzzzz260: "địa chỉ HOẶC khu vực" — phường / xã / quận cũng là vị trí đủ để soạn; địa chỉ cụ thể hỏi sau.
        if not any(self.fields.get(k) for k in ("dia_chi", "duong", "du_an", "phuong", "xa", "quan")):
            need.append("du_an" if self.group is PropertyGroup.CONDO else "dia_chi")
        if not self.fields.get("gia"):
            need.append("gia")
        return need

    def can_publish(self) -> bool:
        """Đủ tối thiểu để soạn bản nháp rao (loại hình + vị trí + giá)."""
        return not self.minimal_missing()

    def facet_trong(self) -> list[str]:
        """Nhóm ô cơ bản (`NHOM_SOAN`) còn TRỐNG: không có ô nào khách đã cho, và chưa bị để sau (mọi ô mong đợi của nhóm đều bị khách lờ
        2 lần). Chỉ tính nhóm mà loại BĐS này có ô mong đợi; tin cho thuê không tính pháp lý. Thứ tự theo `NHOM_SOAN`."""
        mong = self.expected_fields()
        ra: list[str] = []
        for fid, keys in NHOM_SOAN:
            if fid == "phap_ly" and self.is_rental:
                continue
            cua_loai = [k for k in mong if k in keys]
            if not cua_loai or any(self._has(k) for k in keys):
                continue
            if all(k in self.hoan for k in cua_loai):
                continue
            ra.append(fid)
        return ra

    def summary_ready(self) -> bool:
        """Đủ để SOẠN bài rao (SRS-5.1zzzzzzz418, theo bản anh Luận): `can_publish` (loại hình + vị trí hoặc khu vực + giá) VÀ trong bốn nhóm
        chính (vị thế · đất · công trình · pháp lý, `NHOM_SOAN`) trống tối đa `SOAN_THIEU_TOI_DA` nhóm (ô khách lờ 2 lần thì để sau). Chưa đủ
        thì bot hỏi tiếp, mỗi nhóm một câu. Khách bảo đăng sớm thì chỉ cần sàn tối thiểu (`thieu_toi_thieu`). Phường / diện tích là điều kiện lên WEB
        (trigger DB), không phải điều kiện soạn bản nháp: thiếu thì bot hỏi sau lượt duyệt (`khoi_trang_thai_web`)."""
        return self.can_publish() and len(self.facet_trong()) <= SOAN_THIEU_TOI_DA

    def thieu_toi_thieu(self) -> list[str]:
        """Ô phải có trước MỌI bản nháp — chính là `minimal_missing` (khách bảo đăng sớm thì chỉ chờ các ô này)."""
        return self.minimal_missing()

    def cum_hoi(self, o: str | None, missing: list[str]) -> list[str]:
        """Các ô hỏi gộp trong lượt có ô `o` (SRS-5.1zzzzzzz79): ô còn thiếu cùng cụm với `o`, theo thứ tự hỏi, tối đa `CUM_TOI_DA`."""
        if not o:
            return []
        for cum in CUM_HOI:
            if o in cum:
                ra = [o] + [x for x in missing if x in cum and x != o]
                return ra[:CUM_TOI_DA]
        return [o]

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
        # SRS-5.1zzzzzzz359 (chủ dự án 02/11: "tên phường mới, tên phường cũ được tự động chuyển thành phường mới bằng cách gắn lên bản đồ để
        # biết chứ không hỏi khách"): phường KHÔNG còn là ô bắt buộc hỏi khách — hệ thống tự tra (`Engine._phuong_tu_dia_chi`), không ra thì
        # để trống + báo admin.
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
        ra = [x for x in ra if x not in HOI_SAU_KHI_RA_TIN and x not in self.hoan and x not in O_HE_THONG_TRA]
        # Sàn tối thiểu hỏi TRƯỚC (loại hình → vị trí → giá); rồi MỖI facet chính còn trống MỘT ô (ô đứng đầu của facet theo thứ tự hỏi);
        # rồi phường và các ô còn lại (SRS-5.1zzzzzzz200 / 202).
        san = self.minimal_missing()   # SRS-5.1zzzzzzz260: chỉ ô sàn còn thiếu đứng đầu (có khu vực thì địa chỉ cụ thể hỏi sau)
        dau = [x for x in ("loai_hinh", "dia_chi", "du_an", "gia") if x in ra and x in san]
        moi_facet: list[str] = []
        for fid in self.facet_trong():
            o = next((x for x in ra if x not in dau and _NHOM_OF.get(x) == fid), None)
            if o:
                moi_facet.append(o)
        giua = dau + moi_facet
        return giua + [x for x in ra if x not in giua]

    def hoan_duoc(self, o: str) -> bool:
        """Ô được để sau bản nháp khi khách lờ 2 lần (SRS-5.1zzzzzzz80). Loại, chỗ (địa chỉ / dự án / mã căn), giá và ô bắt buộc thì
        không: thiếu chúng thì không có tin để rao."""
        return o not in ("loai_hinh", "dia_chi", "du_an", "gia")

    def cau_hoi_sau_ra_tin(self) -> str | None:
        """Ô hỏi SAU khi khách duyệt bản nháp: chỉ còn ô khách đã lờ 2 lần (SRS-5.1zzzzzzz80). Hẻm và hiện trạng từ 20/10 hỏi trước
        bản nháp như bản anh Luận (SRS-5.1zzzzzzz81)."""
        # SRS-5.1zzzzzzz116: mỗi ô hỏi lại MỘT lần (`_sau_da_hoi` ghi "hoan:<ô>" lúc hỏi) — trước đây khách không trả lời thì ô còn đó,
        # lượt nào prompt cũng hỏi lại và chặn luôn các bước sau (xin chấm sao, hỏi thêm sau khi đăng).
        da_hoi = set((self.fields.get("_sau_da_hoi") or "").split(","))
        return next((o for o in self.expected_fields()
                     if o not in O_HE_THONG_TRA and o in self.hoan and not self._has(o) and f"hoan:{o}" not in da_hoi and not self._facet_da_co(o)), None)

    def _facet_da_co(self, o: str) -> bool:
        """MỘT câu hỏi cho MỖI facet còn trống (SRS-5.1zzzzzzz200, mô hình facet của anh Luận): facet của ô `o` đã có ô khác khách cho (vd
        "quy mô xây dựng" đã có số tầng thì không hỏi thêm số phòng ngủ). Vị trí (phường, quận — điều kiện lên web) và ô chưa xếp facet
        thì luôn hỏi."""
        fid = facet_of(o)
        if fid in ("vi_tri", "khac"):
            return False
        keys = next((ks for f, _, ks in FACETS if f == fid), [])
        return any(self._has(k) for k in keys if k != o)

    def cum_sau_dang(self, da_hoi: set[str] | frozenset[str] = frozenset(), so_anh: int | None = None,
                     anh_du: int = ANH_TIN_DEP) -> tuple[str, list[str]] | None:
        """Cụm hỏi kế SAU khi tin lên web (SRS-5.1zzzzzzz116): (mã cụm, các ô còn thiếu) — cụm chưa hỏi lần nào, còn ít nhất một ô
        chưa có. Tin cho thuê chỉ hỏi dẫn khách xem; chi tiết nhà chỉ cho nhà có đất riêng / toà nhà (căn hộ, đất đã có bộ riêng).
        `so_anh` = số ảnh thật đã lưu của căn (None = không biết → không xin ảnh): dưới `anh_du` thì xin ảnh trước mọi cụm ("anh"), hết
        cụm mà vẫn thiếu thì nhắc lần hai ("anh_lan_2") — SRS-5.1zzzzzzz420."""
        thieu_anh = so_anh is not None and so_anh < anh_du
        if thieu_anh and "sau:anh" not in da_hoi:
            return "anh", ["hinh_anh"]
        for o in self.hoi_phap_ly_sau_dang():   # SRS-5.1zzzzzzz426: pháp lý ngay sau cụm ảnh
            if f"sau:{o}" not in da_hoi:
                return "phap_ly", [o]
        mong = set(self.expected_fields())
        for ma, cum in CUM_SAU_DANG:
            if ma in da_hoi or (self.is_rental and ma != "xem_nha"):
                continue
            if ma == "chi_tiet" and self.group is not PropertyGroup.RESIDENTIAL:
                continue
            if ma == "hdt" and self.fields.get("co_hdt") != "co":   # ô phân loại AI đọc theo nghĩa, không dò chữ khách (SRS-5.1zzzzzzz197)
                continue
            con = [k for k in cum if k not in mong and not self._has(k) and f"sau:{k}" not in da_hoi]   # SRS-178: mỗi lượt một ô
            if con:
                return ma, con
        if thieu_anh and "sau:anh_lan_2" not in da_hoi:
            return "anh_lan_2", ["hinh_anh"]
        return None

    def hoi_phap_ly_sau_dang(self) -> list[str]:
        """Câu pháp lý hỏi SAU khi tin lên web (SRS-5.1zzzzzzz426, LQC mảng Pháp lý), mỗi câu một lần qua `cum_sau_dang`:
        - `loai_giay` (2.1): khách mới nói chung chung (mo_ho) hoặc chưa nói gì về giấy tờ mà trước bản nháp chưa hỏi được;
        - `anh_so` (2.2): khách đã nói có sổ mà chưa gửi ảnh sổ — ảnh sổ chỉ để kiểm, vào kho riêng, không lên web.
        Không phải ô tin (không vào `O_SAU_DANG`, AI không ghi được), chỉ là mã câu hỏi."""
        if self.is_rental:
            return []
        tt = self.fields.get("_phap_ly_trang_thai")
        ra = []
        if tt == "mo_ho" or (not tt and not any(self.fields.get(k) for k in KHOA_PHAP_LY)):
            ra.append("loai_giay")
        if tt == "co_so" and not self.fields.get("_da_doc_so"):
            ra.append("anh_so")
        return ra

    def o_phap_ly_hoi_ngay(self) -> str | None:
        """Ô tiến độ giấy tờ hỏi MỘT lần ngay sau khi chủ nói (SRS-5.1zzzzzzz426): chưa hoàn công → dự kiến hoàn công (2.4); căn hộ / đất dự án
        chỉ có HĐMB, sổ chưa có / đang làm → chủ đầu tư hẹn ra sổ (2.5). Trạng thái do AI đọc theo nghĩa (`_hoan_cong`, `_phap_ly_trang_thai`)."""
        f = self.fields
        da = set((f.get("_pl_da_hoi") or "").split(","))
        if f.get("_hoan_cong") == "chua_hoan_cong" and not f.get("du_kien_hoan_cong") and "du_kien_hoan_cong" not in da:
            return "du_kien_hoan_cong"
        du_an = self.group in (PropertyGroup.CONDO, PropertyGroup.PROJECT) or bool(f.get("du_an"))
        if (du_an and f.get("_phap_ly_trang_thai") in ("hdmb", "chua_co", "dang_lam") and not f.get("du_kien_ra_so")
                and "du_kien_ra_so" not in da):
            return "du_kien_ra_so"
        return None

    def completeness(self) -> float:
        """Fraction of expected fields that are filled, in [0, 1]."""
        expected = self.expected_fields()
        if not expected:
            return 0.0
        filled = sum(1 for f in expected if self._has(f))
        return filled / len(expected)

    def _has(self, name: str) -> bool:
        # SRS-5.1zzzzzzz426 (2.1): khách mới nói chung chung ("pháp lý chuẩn", "không phải lo") — AI đọc `_phap_ly_trang_thai` = mo_ho → ô pháp
        # lý coi như CHƯA có, lượt sau hỏi lại loại giấy (không nhận câu mơ hồ thay cho sổ hồng / sổ đỏ).
        if name in KHOA_PHAP_LY and self.fields.get("_phap_ly_trang_thai") == "mo_ho":
            return False
        if name == "loai_hinh":
            return self.loai_hinh is not None
        if name == "ma_so_can":
            return bool(self.fields.get("ma_so_can") or self.fields.get("tang_toa"))
        if name == "dia_chi":     # có tên đường là đã định vị được — không hỏi lại "đường nào" (SRS-5.1zzzzzzz74; 19/10 hỏi 3 lần)
            return bool(self.fields.get("dia_chi") or self.fields.get("duong"))
        if name in ("tinh_trang_ban_giao", "hien_trang_su_dung"):   # MỘT ý hiện trạng (đang ở / trống / đang cho thuê), hai tên ô (SRS-5.1zzzzzzz197)
            return bool(self.fields.get("tinh_trang_ban_giao") or self.fields.get("hien_trang_su_dung"))
        if name == "thoi_gian_ban_giao" and "tinh_trang_ban_giao" in self.core_fields():   # SRS-5.1zzzzzzz218: gộp vào hiện trạng
            return bool(self.fields.get("tinh_trang_ban_giao") or self.fields.get("thoi_gian_ban_giao"))
        if name == "phap_ly_hoan_cong":   # khách đã nói sổ (ô phap_ly) thì không hỏi riêng hoàn công (SRS-5.1zzzzzzz76)
            return bool(self.fields.get("phap_ly_hoan_cong") or self.fields.get("phap_ly"))
        if name in ("phap_ly_so_do", "phap_ly_so_hong"):   # SRS-5.1zzzzzzz321: khách đã nói giấy tờ (ô phap_ly: "thuê đất trả tiền hàng năm") thì
            return bool(self.fields.get(name) or self.fields.get("phap_ly"))   # không hỏi lại "có sổ đỏ chưa" (cham xa_phuoc_ly, Đợt 8 và Đợt 3)
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

    def _nho_phap_ly_cu(self, cu: str) -> None:
        """Cất ý pháp lý cũ sắp bị ô mới ghi đè (mới nhất đứng đầu, không trùng, tối đa `PHAP_LY_CU_TOI_DA`)."""
        ds = [x for x in (self.fields.get("_phap_ly_cu") or "").split(" | ") if x and x != cu]
        self.fields["_phap_ly_cu"] = " | ".join(([cu] + ds)[:PHAP_LY_CU_TOI_DA])

    def phap_ly_da_noi(self) -> list[str]:
        """Mọi chữ pháp lý khách đã nói về căn này, MỚI NHẤT TRƯỚC: các ô pháp lý hiện có rồi ý cũ đã bị ô mới đè. Cột `legal_status` lấy
        mã đầu tiên đọc được trong danh sách này."""
        ra: list[str] = []
        for v in [self.fields.get(k) for k in KHOA_PHAP_LY] + (self.fields.get("_phap_ly_cu") or "").split(" | "):
            if v and v not in ra:
                ra.append(v)
        return ra

    def update(self, captured: dict[str, str]) -> list[str]:
        """Merge newly extracted fields; return the names that were newly set."""
        newly: list[str] = []
        for k, v in captured.items():
            if not v:
                continue
            # SRS-5.1zzzzzzz197: loại có ô bàn giao trong bộ câu hỏi (nhà phố…) thì "hiện trạng" CHỈ nằm ở `tinh_trang_ban_giao` — AI ghi
            # `hien_trang_su_dung` (chủ nhà "nhà anh đang ở", chat Bình Hưng 26/10) cũng gom về đó, khỏi hai ô cùng một ý, bot hỏi lại.
            if k == "hien_trang_su_dung" and "tinh_trang_ban_giao" in self.core_fields():
                k = "tinh_trang_ban_giao"
                if "hien_trang_su_dung" in self.fields:
                    del self.fields["hien_trang_su_dung"]
            # SRS-5.1zzzzzzz218 (chat anh Luận 26/10: "bàn giao tức thì" vào cả `thoi_gian_ban_giao` lẫn `tinh_trang_ban_giao` → bản tin nói
            # hai lần): với loại có ô hiện trạng, thời điểm bàn giao là một phần của hiện trạng — gộp vào, ý đã có thì không nối thêm.
            if k == "thoi_gian_ban_giao" and "tinh_trang_ban_giao" in self.core_fields():
                k = "tinh_trang_ban_giao"
                v = _gop_y(captured.get("tinh_trang_ban_giao") or self.fields.get("tinh_trang_ban_giao") or "", v)
                self.fields.pop("thoi_gian_ban_giao", None)
            if k == "loai_hinh":
                if self.loai_hinh != v:
                    self.loai_hinh = v
                    newly.append(k)
                continue
            if k == "dia_chi":                  # MERGE, don't overwrite — keep street/ward intact
                v = _merge_dia_chi(self.fields.get("dia_chi", ""), v)
            if k == "uu_the":                   # ưu thế khác CỘNG DỒN, không đè
                v = _merge_uu_the(self.fields.get("uu_the", ""), v)
            if k in KHOA_PHAP_LY and self.fields.get("_phap_ly_trang_thai") == "mo_ho":   # SRS-426 (2.1): không ghi câu mơ hồ vào ô pháp lý
                continue
            if k in KHOA_PHAP_LY and self.fields.get(k) and self.fields[k] != v:
                self._nho_phap_ly_cu(self.fields[k])
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

        # SRS-5.1zzzzzzz157 (chủ dự án 23/10: nhà chỉ nói tên đường thì khỏi hỏi "mặt tiền hay hẻm") — SRS-5.1zzzzzzz320 (chủ dự án 02/11: không
        # dùng từ khoá trên lời khách để quyết ý): bản trước TỰ GHI "Mặt tiền" khi địa chỉ thiếu chữ hẻm / ngõ — "HXH Lê Lai", "hẽm" (gõ sai) đều
        # thành mặt tiền trên tin công khai. Nay không ghi sự thật nào; ô đường vào để SAU bản nháp (vẫn khỏi hỏi trước), AI đọc theo nghĩa nếu khách nói.
        if (not self.fields.get("lo_gioi_hem") and self.fields.get("duong") and "lo_gioi_hem" in self.core_fields()
                and "/" not in (self.fields.get("dia_chi") or "")):
            self.hoan.add("lo_gioi_hem")

        # 19/10/2026 (SRS-5.1zzzzzzz55): bỏ khối đoán loai_hinh bằng từ khoá ("nhà / lầu / hẻm" → nhà phố, tên thương hiệu → chung
        # cư…). Loại BĐS do lượt AI bóc tách đọc (ô loai_hinh); chưa rõ thì bot hỏi.

        # 2. Diện tích từ SỐ kích thước AI đã bóc (SRS-5.1zzzzzzz409). Ô diện tích khách tự nói thì giữ; ô do code ước trước đó (đánh dấu
        # `_dt_tu_kich_thuoc`) thì tính lại khi khách bổ sung dài / nở hậu.
        dt_uoc = dien_tich_tu_kich_thuoc(self.fields)
        if dt_uoc:
            o_dt = "dien_tich_dat" if self.loai_hinh in HOUSE_TYPES else "dien_tich"
            cu = self.fields.get(o_dt)
            if not cu or (cu == self.fields.get("_dt_tu_kich_thuoc") and cu != dt_uoc):
                self.fields[o_dt] = dt_uoc
                self.fields["_dt_tu_kich_thuoc"] = dt_uoc
                if o_dt not in newly:
                    newly.append(o_dt)

        # Nhà có đất riêng: KHÔNG đồng bộ dien_tich ↔ dien_tich_dat (SRS-5.1zzzzzzz52, theo bản anh Luận). Một con số khách
        # chưa nói là đất hay nhà nằm yên ở dien_tich; build_chat_system hỏi lại "80m2 đó là đất hay nhà". Riêng chuỗi
        # kích thước ("4x15") đã chuyển sang kich_thuoc → diện tích đất ở trên, không phải con số mơ hồ nên bỏ khỏi dien_tich.
        if self.loai_hinh in HOUSE_TYPES and re.search(r"\d+\s*[x*X]\s*\d+", self.fields.get("dien_tich") or "") \
                and self.fields.get("kich_thuoc"):
            del self.fields["dien_tich"]
            if "dien_tich" in newly:
                newly.remove("dien_tich")

        return newly


# Câu tư vấn khách mua (SRS-5.1zzzzzzz116), theo thứ tự hỏi — sau khu vực / ngân sách / loại (đủ để lọc căn) và mục đích.
O_TU_VAN_MUA: tuple[str, ...] = ("moi_truong_song", "thanh_vien", "noi_lam_viec", "dien_tich_mong_muon", "thang_may",
                                 "nguoi_quyet_dinh", "vay_ngan_hang")


# Khách mua chỉ bị hỏi tối đa chừng này câu về nhu cầu khi đã đủ tiêu chí để gợi ý căn (SRS-5.1zzzzzzz154).
MAX_CAU_HOI_MUA = 2
# SRS-5.1zzzzzzz335: "ô" giả của câu hỏi MỞ phía mua (đủ khu vực + ngân sách + loại) — không phải ô dữ liệu.
CAU_MO_MUA = "_cau_mo"


def _so_nguyen(v: Any) -> int:
    try:
        return int(str(v or "0").strip() or 0)
    except ValueError:
        return 0


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
        # SRS-5.1zzzzzzz154 (chủ dự án 23/10: "hỏi nhiều quá, 1 hoặc 2 câu hỏi thôi"): đã có khu vực VÀ ngân sách (đủ để gợi ý căn — SRS-214,
        # cùng `mua.co_tieu_chi`) mà bot đã hỏi đủ MAX_CAU_HOI_MUA câu thì thôi hỏi nhu cầu — từ đó chỉ gợi ý căn và hẹn xem. Chưa đủ thì vẫn
        # hỏi (không có gì để gợi ý). Engine cộng `_so_cau_hoi` mỗi lượt có câu hỏi.
        co_tieu_chi = all((getattr(self, k, None) or self.fields.get(k) or "").strip() for k in ("khu_vuc", "ngan_sach"))
        if co_tieu_chi and _so_nguyen(self.fields.get("_so_cau_hoi")) >= MAX_CAU_HOI_MUA:
            return None
        # Giai đoạn 1: Nhu cầu & Ngân sách cốt lõi (Discovery)
        if not self.khu_vuc and not self.fields.get("khu_vuc"):
            return "khu_vuc"
        if not self.ngan_sach and not self.fields.get("ngan_sach"):
            return "ngan_sach"
        # Giai đoạn 2 (SRS-5.1zzzzzzz335; điều phối 02/11: "anh đang muốn tìm loại hình nào?" ngay sau khi vừa đưa 3 nhà phố là vô lý): loại BĐS không
        # còn là ô CHẶN — đủ khu vực + ngân sách là đủ để tìm căn; loại còn trống thì thành một ý trong câu hỏi mở (`y_con_thieu`).
        # Giai đoạn 2 (SRS-5.1zzzzzzz335, ca thật 02/11 "nhà Q8 dưới 7 tỉ yên tĩnh" → bot hỏi hẻm xe hơi; chủ dự án: "chat chán quá"): KHÔNG còn cây
        # cố định — đủ ba ô cốt lõi thì một câu MỞ, tuỳ chọn; code đưa danh sách ý còn thiếu (`y_con_thieu`), AI chọn ý hợp lời khách nhất.
        return CAU_MO_MUA if self.y_con_thieu() else None

    def y_con_thieu(self) -> list[str]:
        """Ý nhu cầu còn thiếu SAU ba ô cốt lõi, đã bỏ ý khách đã nói và ý đã hỏi (`_da_hoi`) — danh sách cho câu hỏi mở (SRS-5.1zzzzzzz335).
        Thứ tự chỉ là gợi ý (theo loại BĐS); AI chọn ý hợp nhất với lời khách. Xe hơi / đậu xe đứng cuối và prompt chỉ cho hỏi khi khách nhắc xe."""
        loai = (self.loai_bds or self.fields.get("loai_bds", "")).lower()
        nha = loai in ("nha_pho", "biet_thu", "nha_cap_4")
        ung: list[str] = [] if loai else ["loai_bds"]
        if loai in ("chung_cu", "can_ho", "condo"):
            ung += ["so_phong_ngu", "nhan_nha_khi_nao"]
        elif nha:
            ung += ["so_phong_ngu"]
        elif loai in ("du_an", "dat_du_an"):
            ung += ["muc_dich", "vay_ngan_hang"]
        ung += ["muc_dich"] + [o for o in O_TU_VAN_MUA if o != "thang_may" or nha] + ["tien_do_mua"] + (["yeu_cau_xe_hoi"] if nha else [])
        da_hoi = set((self.fields.get("_da_hoi") or "").split(","))
        ra: list[str] = []
        for o in ung:
            if o not in ra and o not in da_hoi and not getattr(self, o, None) and not self.fields.get(o):
                ra.append(o)
        return ra

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

