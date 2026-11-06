"""Công cụ Định giá sơ bộ AVM, Kiểm tra pháp lý sổ hồng và Tính phí môi giới phía Bán / Ký gửi (SRS-5.1zzzzzzz390, 06/11/2026).

Mô hình hóa theo tiêu chuẩn Function Calling của MOSO (post_listing, 3 Thật, Ẩn số nhà, AVM):
- dinh_gia_tham_khao: Định giá sơ bộ AVM theo khu vực (quận/huyện, phường, đường) hoặc dự án, loại hình và diện tích.
- kiem_tra_phap_ly_so: Tra cứu quy định pháp lý, điều kiện giao dịch và thủ tục sang tên sổ đỏ/sổ hồng từ phap_ly.MAC_DINH.
- tinh_phi_moi_gioi: Tính phí môi giới minh bạch theo giá trị BĐS và loại hình (bán 1%, thuê 0.75 tháng), khẳng định chính sách "Chỉ thu khi giao dịch thành công — 0 đồng trước".
"""
from __future__ import annotations

import re
from typing import Any

from . import phap_ly
from .revenue import RENTAL_FEE_MONTHS, SALE_FEE_RATE, SellerRole
from .thue_phi import _dinh_dang_gia_ty, _dinh_dang_tien


# Bảng đơn giá đất / căn hộ tham khảo trung bình thị trường (triệu đồng / m² đất với nhà/đất, hoặc m² sàn với chung cư)
# Các quận trung tâm, nội thành, ngoại thành và vùng ven TP.HCM & lân cận
_BANG_GIA_BENCHMARK: dict[str, dict[str, tuple[int, int]]] = {
    # Khu vực Trung tâm (Q.1, Q.3, Q.10, Phú Nhuận)
    "trung_tam": {
        "nha_pho": (180, 320),
        "mat_bang": (220, 400),
        "can_ho": (75, 150),
        "dat_nen": (150, 280),
        "biet_thu": (220, 380),
    },
    # Nội thành phát triển (Q.7, Bình Thạnh, Gò Vấp, Tân Bình, Tân Phú, TP. Thủ Đức / Q.2, Q.9)
    "noi_thanh": {
        "nha_pho": (90, 160),
        "mat_bang": (110, 200),
        "can_ho": (45, 80),
        "dat_nen": (55, 100),
        "biet_thu": (120, 220),
        "kho_xuong": (25, 45),
    },
    # Ngoại thành (Q.8, Q.12, Bình Tân, Nhà Bè, Hóc Môn, Bình Chánh)
    "ngoai_thanh": {
        "nha_pho": (50, 95),
        "mat_bang": (60, 110),
        "can_ho": (30, 48),
        "dat_nen": (30, 55),
        "biet_thu": (65, 120),
        "kho_xuong": (15, 30),
    },
    # Vùng ven (Long An, Bình Dương, Đồng Nai, Bà Rịa - Vũng Tàu, Tây Ninh)
    "vung_ven": {
        "nha_pho": (25, 50),
        "mat_bang": (30, 60),
        "can_ho": (22, 38),
        "dat_nen": (12, 30),
        "biet_thu": (35, 70),
        "kho_xuong": (8, 20),
    },
}

_KHU_VUC_PHAN_VUNG: dict[str, str] = {
    "quan 1": "trung_tam", "q1": "trung_tam", "quan 3": "trung_tam", "q3": "trung_tam",
    "quan 10": "trung_tam", "q10": "trung_tam", "phu nhuan": "trung_tam",
    "quan 7": "noi_thanh", "q7": "noi_thanh", "binh thanh": "noi_thanh", "go vap": "noi_thanh",
    "tan binh": "noi_thanh", "tan phu": "noi_thanh", "thu duc": "noi_thanh", "quan 2": "noi_thanh",
    "q2": "noi_thanh", "quan 9": "noi_thanh", "q9": "noi_thanh",
    "quan 8": "ngoai_thanh", "q8": "ngoai_thanh", "quan 12": "ngoai_thanh", "q12": "ngoai_thanh",
    "binh tan": "ngoai_thanh", "nha be": "ngoai_thanh", "hoc mon": "ngoai_thanh", "binh chanh": "ngoai_thanh",
    "can gio": "ngoai_thanh", "cu chi": "ngoai_thanh",
    "long an": "vung_ven", "binh duong": "vung_ven", "dong nai": "vung_ven",
    "ba ria": "vung_ven", "vung tau": "vung_ven", "tay ninh": "vung_ven",
}


def _phan_vung(khu_vuc: str) -> str:
    """Xác định phân vùng theo tên quận/huyện/tỉnh."""
    from .chu import bo_dau
    kv = bo_dau(khu_vuc.lower().strip())
    for ten, vung in _KHU_VUC_PHAN_VUNG.items():
        if ten in kv:
            return vung
    return "noi_thanh"  # mặc định nội thành


def tinh_dinh_gia_tham_khao(
    khu_vuc: str = "",
    phuong: str = "",
    duong: str = "",
    du_an: str = "",
    loai_hinh: str = "nha_pho",
    dien_tich: float = 0.0,
    gia_chu_dinh_ban: int = 0,
    deal: str = "ban",
    project: Any = None,
) -> dict[str, Any]:
    """Tính toán dải đơn giá và tổng giá tham khảo (AVM)."""
    # 1. Dự án có sẵn thông tin giá
    if project is not None and getattr(project, "goc", None):
        gia_rao_da = project.goc.get("giá rao bán thị trường")
        if gia_rao_da:
            return {
                "nguon": "du_an",
                "du_an": project.name or du_an,
                "mo_ta_gia": str(gia_rao_da).strip(),
                "gia_chu_dinh_ban": gia_chu_dinh_ban,
            }

    # 2. Tính theo khu vực và loại hình
    vung = _phan_vung(khu_vuc)
    lh = loai_hinh.lower().strip() if loai_hinh else "nha_pho"
    if "can_ho" in lh or "chung_cu" in lh:
        lh_chuan = "can_ho"
    elif "dat" in lh:
        lh_chuan = "dat_nen"
    elif "biet_thu" in lh:
        lh_chuan = "biet_thu"
    elif "kho" in lh or "xuong" in lh:
        lh_chuan = "kho_xuong"
    elif "mat_bang" in lh or "kinh_doanh" in lh:
        lh_chuan = "mat_bang"
    else:
        lh_chuan = "nha_pho"

    bang_vung = _BANG_GIA_BENCHMARK.get(vung, _BANG_GIA_BENCHMARK["noi_thanh"])
    don_gia_min, don_gia_max = bang_vung.get(lh_chuan, bang_vung.get("nha_pho", (60, 110)))

    # Điều chỉnh nếu ở mặt tiền hay hẻm lớn
    if "mat_tien" in lh or "mat_bang" in lh:
        don_gia_min = int(don_gia_min * 1.25)
        don_gia_max = int(don_gia_max * 1.35)

    gia_min = 0
    gia_max = 0
    if dien_tich > 0:
        gia_min = int(don_gia_min * 1_000_000 * dien_tich)
        gia_max = int(don_gia_max * 1_000_000 * dien_tich)

    return {
        "nguon": "thi_truong",
        "khu_vuc": khu_vuc or "Khu vực khảo sát",
        "phuong": phuong,
        "duong": duong,
        "loai_hinh": lh_chuan,
        "don_gia_min": don_gia_min,
        "don_gia_max": don_gia_max,
        "dien_tich": dien_tich,
        "gia_min": gia_min,
        "gia_max": gia_max,
        "gia_chu_dinh_ban": gia_chu_dinh_ban,
        "deal": deal,
    }


def dinh_gia_tham_khao_tool(engine: Any, conv: Any, project: Any, vao: dict[str, Any]) -> str:
    """Xử lý lệnh gọi công cụ dinh_gia_tham_khao."""
    khu_vuc = str(vao.get("khu_vuc") or "")
    phuong = str(vao.get("phuong") or "")
    duong = str(vao.get("duong") or "")
    du_an = str(vao.get("du_an") or "")
    loai_hinh = str(vao.get("loai_hinh") or "nha_pho")
    dien_tich = float(vao.get("dien_tich") or 0.0)
    gia_chu = int(vao.get("gia_chu_dinh_ban") or 0)
    deal = str(vao.get("deal") or "ban")

    # Bổ sung từ thông tin căn đang hội thoại nếu thiếu
    if conv and getattr(conv, "prop", None):
        prop = conv.prop
        f = getattr(prop, "fields", {}) or {}
        if not khu_vuc:
            khu_vuc = f.get("dia_chi") or f.get("phuong") or ""
        if not phuong:
            phuong = f.get("phuong") or ""
        if not duong:
            duong = f.get("duong") or ""
        if not du_an:
            du_an = f.get("du_an") or ""
        if not loai_hinh:
            loai_hinh = f.get("loai_hinh") or "nha_pho"
        if dien_tich <= 0:
            dt_raw = f.get("dien_tich") or f.get("dien_tich_dat") or ""
            m = re.search(r"(\d+(?:[.,]\d+)?)", str(dt_raw))
            if m:
                dien_tich = float(m.group(1).replace(",", "."))

    kq = tinh_dinh_gia_tham_khao(
        khu_vuc=khu_vuc,
        phuong=phuong,
        duong=duong,
        du_an=du_an,
        loai_hinh=loai_hinh,
        dien_tich=dien_tich,
        gia_chu_dinh_ban=gia_chu,
        deal=deal,
        project=project,
    )

    if kq.get("nguon") == "du_an":
        return (
            f"=== KẾT QUẢ ĐỊNH GIÁ THỊ TRƯỜNG DỰ ÁN ({kq.get('du_an')}) ===\n"
            f"- Mức giá rao bán thị trường hiện tại: {kq.get('mo_ta_gia')}\n"
            "- Nói rõ với khách: Đây là khoảng giá các căn trong dự án đang rao bán trên thị trường để khách tham khảo; "
            "không phán xét giá khách đưa ra cao hay thấp, tin vẫn rao theo đúng mức giá khách mong muốn."
        )

    dia_diem = ", ".join(x for x in (duong, phuong, khu_vuc) if x) or khu_vuc or "khu vực"
    loai_vn = {
        "nha_pho": "Nhà phố / Nhà lẻ",
        "can_ho": "Căn hộ / Chung cư",
        "dat_nen": "Đất nền / Đất thổ cư",
        "biet_thu": "Biệt thự",
        "kho_xuong": "Kho xưởng",
        "mat_bang": "Mặt bằng kinh doanh",
    }.get(kq.get("loai_hinh", "nha_pho"), "BĐS")

    dong_gia_tong = ""
    if kq.get("gia_min") and kq.get("gia_max"):
        g_min_str = _dinh_dang_gia_ty(kq["gia_min"])
        g_max_str = _dinh_dang_gia_ty(kq["gia_max"])
        dong_gia_tong = f"- Khoảng giá ước tính ({kq['dien_tich']}m²): **{g_min_str} – {g_max_str}**\n"

    dong_so_sanh = ""
    if gia_chu > 0 and kq.get("gia_min") and kq.get("gia_max"):
        g_chu_str = _dinh_dang_gia_ty(gia_chu)
        if gia_chu < kq["gia_min"]:
            dong_so_sanh = f"- Đối chiếu: Giá {g_chu_str} của anh/chị đang mềm hơn khoảng phổ biến, khả năng thanh khoản rất nhanh.\n"
        elif gia_chu > kq["gia_max"]:
            dong_so_sanh = f"- Đối chiếu: Giá {g_chu_str} của anh/chị đang nhỉnh hơn mức phổ biến một chút (thường căn có vị trí hoặc nội thất đặc biệt tốt).\n"
        else:
            dong_so_sanh = f"- Đối chiếu: Giá {g_chu_str} của anh/chị nằm rất chuẩn trong khoảng giao dịch của khu vực.\n"

    return (
        f"=== KẾT QUẢ ĐỊNH GIÁ THAM KHẢO THỊ TRƯỜNG (AVM) ===\n"
        f"- Khu vực: {dia_diem}\n"
        f"- Loại hình: {loai_vn}\n"
        f"- Đơn giá rao tham khảo: **{kq['don_gia_min']} – {kq['don_gia_max']} triệu/m²**\n"
        f"{dong_gia_tong}"
        f"{dong_so_sanh}"
        "- LƯU Ý KHI TRẢ LỜI: Nêu số liệu khách quan để khách tham khảo, khẳng định quyền quyết định giá bán hoàn toàn thuộc về khách; "
        "bên em luôn hỗ trợ rao đúng mức giá khách mong muốn."
    )


def kiem_tra_phap_ly_so_tool(vao: dict[str, Any]) -> str:
    """Tra cứu kiến thức pháp lý và thủ tục sổ hồng từ phap_ly.MAC_DINH."""
    chu_de = str(vao.get("chu_de") or "").lower().strip()
    chi_tiet = str(vao.get("chi_tiet") or "").lower().strip()

    # Ánh xạ từ khóa chủ đề nếu gọi tên khác
    anh_xa = {
        "so_do": "so_do_so_hong",
        "so_hong": "so_do_so_hong",
        "the_chap": "nha_the_chap",
        "ngan_hang": "nha_the_chap",
        "vay": "nha_the_chap",
        "hoan_cong": "chua_hoan_cong",
        "vi_bang": "vi_bang",
        "thua_phat_lai": "vi_bang",
        "ho_so": "ho_so_ban_nha",
        "giay_to": "ho_so_ban_nha",
        "thue": "thue_phi_sang_ten",
        "phi": "thue_phi_sang_ten",
        "dong_so_huu": "tai_san_chung_vo_chong",
        "vo_chong": "tai_san_chung_vo_chong",
        "thua_ke": "tai_san_chung_vo_chong",
        "lo_gioi": "lo_gioi",
        "quy_hoach": "tra_quy_hoach",
        "coc": "dat_coc",
        "dat_coc": "dat_coc",
    }
    khoa = anh_xa.get(chu_de, chu_de)

    # Tìm kiếm theo khoá chính xác hoặc tìm kiếm trong tiêu đề/nội dung
    muc = phap_ly.MAC_DINH.get(khoa)
    if not muc:
        # Tìm trong danh sách
        for k, v in phap_ly.MAC_DINH.items():
            if k in chu_de or chu_de in k or (chi_tiet and (chi_tiet in v[0].lower() or k in chi_tiet)):
                muc = v
                khoa = k
                break

    if muc:
        tieu_de, loi_giai, can_cu, _nhom = muc
        return (
            f"=== CĂN CỨ PHÁP LÝ & HƯỚNG DẪN: {tieu_de.upper()} ===\n"
            f"- Hướng dẫn: {loi_giai}\n"
            f"- Căn cứ pháp lý: {can_cu}\n"
            "- Lời dặn: Thông tin tham khảo theo quy định pháp luật hiện hành, khuyên khách nên đối chiếu thêm với "
            "Văn phòng công chứng hoặc Văn phòng đăng ký đất đai khi nộp hồ sơ thực tế."
        )

    # Nếu không khớp, trả về hướng dẫn tổng quan sang tên và hồ sơ bán nhà
    muc_mac_dinh = phap_ly.MAC_DINH["ho_so_ban_nha"]
    return (
        f"=== HỒ SƠ PHÁP LÝ BÁN NHÀ ĐẤT CẦN CHUẨN BỊ ===\n"
        f"- Hướng dẫn: {muc_mac_dinh[1]}\n"
        f"- Căn cứ pháp lý: {muc_mac_dinh[2]}\n"
        "- Lời dặn: Khuyên khách kiểm tra với Văn phòng công chứng để được rà soát từng bộ hồ sơ cụ thể."
    )


def tinh_phi_moi_gioi_tool(conv: Any, vao: dict[str, Any]) -> str:
    """Tính phí môi giới minh bạch & cam kết bảo mật 3 Thật phía Bán."""
    gia_vnd = int(vao.get("gia_vnd") or 0)
    vai_nguoi_gui = str(vao.get("vai_nguoi_gui") or "chu_nha").lower()
    loai_giao_dich = str(vao.get("loai_giao_dich") or "ban").lower()

    # Bổ sung từ thông tin căn nếu chưa truyền gia_vnd
    if gia_vnd <= 0 and conv and getattr(conv, "prop", None):
        gia_raw = conv.prop.fields.get("gia") or ""
        m = re.search(r"(\d+(?:[.,]\d+)?)\s*(tỷ|ty|triệu|trieu|tr)?", str(gia_raw), re.I)
        if m:
            so = float(m.group(1).replace(",", "."))
            don_vi = (m.group(2) or "").lower()
            if "t" in don_vi and "r" not in don_vi:
                gia_vnd = int(so * 1_000_000_000)
            elif "tr" in don_vi:
                gia_vnd = int(so * 1_000_000)

    is_rent = "thue" in loai_giao_dich
    if is_rent:
        ty_le_str = "3/4 tháng tiền thuê (0.75 tháng)"
        phi_uoc_tinh = int(gia_vnd * RENTAL_FEE_MONTHS) if gia_vnd > 0 else 0
    else:
        ty_le = 0.005 if "moi_gioi" in vai_nguoi_gui or "san" in vai_nguoi_gui else 0.01
        ty_le_str = "0.5%" if ty_le == 0.005 else "1%"
        phi_uoc_tinh = int(gia_vnd * ty_le) if gia_vnd > 0 else 0

    dong_so_tien = ""
    if gia_vnd > 0:
        g_chu = _dinh_dang_gia_ty(gia_vnd)
        dong_so_tien = f"- Giá trị BĐS ({g_chu}): Phí môi giới dự kiến là **{_dinh_dang_tien(phi_uoc_tinh)}**\n"

    return (
        f"=== BIỂU PHÍ MÔI GIỚI & CHÍNH SÁCH KÝ GỬI AOND ===\n"
        f"- Mức phí chuẩn: **{ty_le_str}** khi giao dịch thành công.\n"
        f"{dong_so_tien}"
        "🛡️ CAM KẾT VÀ QUYỀN LỢI CHO NGƯỜI GỬI BÁN:\n"
        "1. 0 ĐỒNG TRƯỚC: Hoàn toàn KHÔNG thu bất kỳ chi phí nào khi đăng tin, làm hình ảnh hay dẫn khách. Chỉ thu phí KHI giao dịch thành công tại phòng công chứng.\n"
        "2. BẢO MẬT ẨN SỐ NHÀ & CHE SĐT: Trên web công khai, hệ thống tự động ẩn số nhà và che số điện thoại chính chủ để tránh môi giới ngoài làm phiền hay dẫn khách tự do.\n"
        "3. QUY CHUẨN 3 THẬT: Tin đăng được xác thực (Thông tin thật, Giá thật, Hình ảnh thật), chấm điểm cao và ưu tiên lên Top hiển thị tiếp cận khách nét có nhu cầu thật.\n"
        "4. HỖ TRỢ TRỌN GÓI: Soạn tin AI thu hút người mua trong 30 giây (chuẩn AD_FORMAT), sàng lọc khách thực tế, điều phối lịch xem và hỗ trợ thủ tục công chứng sang tên."
    )
