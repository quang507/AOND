"""Công cụ phía Bán / Ký gửi: định giá tham khảo, tra pháp lý sổ, tính phí môi giới (SRS-5.1zzzzzzz390, 06/11/2026; sửa 08/11/2026).

- dinh_gia_tham_khao: dải đơn giá tham khảo theo VÙNG (quận/huyện/tỉnh) × loại hình, nhân diện tích. Bảng `_BANG_GIA_BENCHMARK` là số
  cứng ước lượng, chưa phải dữ liệu giao dịch — bot luôn nói "tham khảo". Không nhận ra vùng / loại hình không có trong bảng → trả
  "không có số", KHÔNG mặc định nội thành (bản 06/11 đoán nội thành cho mọi nơi lạ và coi "Quận 1" khớp trong "Quận 12").
- kiem_tra_phap_ly_so: tra `phap_ly.MAC_DINH`.
- tinh_phi_moi_gioi: tỷ lệ một nguồn ở `revenue.SALE_FEE_RATE` / `RENTAL_FEE_MONTHS` theo vai người rao. Chỉ nêu hai cam kết đã có
  trong hệ thống: 0 đồng trước (chỉ thu khi giao dịch thành công) và ẩn số nhà trên web (FR-104). Bản 06/11 hứa thêm "3 Thật", "lên Top",
  "soạn tin AI 30 giây", "hỗ trợ công chứng trọn gói", "che SĐT" — hệ thống không có cam kết đó.
"""
from __future__ import annotations

from typing import Any

from . import phap_ly
from .phap_ly import tien
from .revenue import RENTAL_FEE_MONTHS, SALE_FEE_RATE, SellerRole


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

# Tên vùng đã bỏ dấu, viết thường, tách bằng dấu cách. Khớp theo NGUYÊN TỪ ("quan 1" không khớp trong "quan 12"), tên dài thử trước.
_KHU_VUC_PHAN_VUNG: dict[str, str] = {
    "quan 1": "trung_tam", "quan 3": "trung_tam", "quan 4": "trung_tam", "quan 5": "trung_tam", "quan 10": "trung_tam",
    "phu nhuan": "trung_tam",
    "quan 6": "noi_thanh", "quan 11": "noi_thanh", "quan 7": "noi_thanh", "binh thanh": "noi_thanh", "go vap": "noi_thanh",
    "tan binh": "noi_thanh", "tan phu": "noi_thanh", "thu duc": "noi_thanh", "quan 2": "noi_thanh", "quan 9": "noi_thanh",
    "quan 8": "ngoai_thanh", "quan 12": "ngoai_thanh", "binh tan": "ngoai_thanh", "nha be": "ngoai_thanh", "hoc mon": "ngoai_thanh",
    "binh chanh": "ngoai_thanh", "can gio": "ngoai_thanh", "cu chi": "ngoai_thanh",
    "long an": "vung_ven", "binh duong": "vung_ven", "dong nai": "vung_ven", "ba ria": "vung_ven", "vung tau": "vung_ven",
    "tay ninh": "vung_ven",
}
_TEN_VUNG_DAI_TRUOC = sorted(_KHU_VUC_PHAN_VUNG, key=len, reverse=True)

# Loại hình (slug `TYPE_TO_GROUP`) → hàng trong bảng giá. Loại không có ở đây (đất nông nghiệp, SKC, toà nhà, phòng trọ…) → không có số.
_LOAI_BANG: dict[str, str] = {
    "nha_pho": "nha_pho", "nha_cap_4": "nha_pho",
    "biet_thu": "biet_thu",
    "chung_cu": "can_ho", "can_ho": "can_ho", "officetel": "can_ho", "penthouse": "can_ho",
    "dat": "dat_nen", "dat_tho_cu": "dat_nen", "dat_nen": "dat_nen",
    "mat_bang": "mat_bang", "shophouse_du_an": "mat_bang",
    "kho_xuong": "kho_xuong", "kho_bai": "kho_xuong", "nha_xuong": "kho_xuong",
}


def _chuan_ten(chu: str) -> str:
    """Bỏ dấu, viết thường, ký tự không phải chữ/số thành dấu cách; "q1" / "q.1" / "quận 1" → "quan 1"."""
    from .chu import bo_dau
    tu = "".join(c if c.isalnum() else " " for c in bo_dau(chu.lower())).split()
    ra: list[str] = []
    for i, t in enumerate(tu):
        if t == "q" and i + 1 < len(tu) and tu[i + 1].isdigit():
            ra.append("quan")
        elif t[:1] == "q" and t[1:].isdigit():
            ra += ["quan", t[1:]]
        else:
            ra.append(t)
    return " ".join(ra)


def _phan_vung(khu_vuc: str) -> str | None:
    """Vùng giá của quận/huyện/tỉnh; không nhận ra → None (không đoán)."""
    kv = f" {_chuan_ten(khu_vuc)} "
    for ten in _TEN_VUNG_DAI_TRUOC:
        if f" {ten} " in kv:
            return _KHU_VUC_PHAN_VUNG[ten]
    return None


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

    # 2. Tính theo vùng × loại hình — thiếu một trong hai thì không có số
    vung = _phan_vung(" ".join(x for x in (khu_vuc, phuong, duong) if x))
    lh_chuan = _LOAI_BANG.get((loai_hinh or "").strip().lower())
    don = _BANG_GIA_BENCHMARK.get(vung or "", {}).get(lh_chuan or "")
    if not don:
        return {"nguon": "khong_co", "khu_vuc": khu_vuc, "loai_hinh": loai_hinh,
                "ly_do": "chưa nhận ra quận/huyện/tỉnh" if not vung else "bảng tham khảo chưa có loại hình này ở vùng đó"}
    don_gia_min, don_gia_max = don

    gia_min = 0
    gia_max = 0
    if dien_tich > 0:
        gia_min = int(don_gia_min * 1_000_000 * dien_tich)
        gia_max = int(don_gia_max * 1_000_000 * dien_tich)

    return {
        "nguon": "thi_truong",
        "khu_vuc": khu_vuc,
        "vung": vung,
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
    loai_hinh = str(vao.get("loai_hinh") or "")
    dien_tich = float(vao.get("dien_tich") or 0.0)
    gia_chu = int(vao.get("gia_chu_dinh_ban") or 0)
    deal = str(vao.get("deal") or "ban")

    # Thiếu thì lấy từ căn đang nói. Loại hình là THUỘC TÍNH `prop.loai_hinh` (không nằm trong `fields` — bản 06/11 đọc nhầm chỗ, luôn ra
    # nhà phố). Diện tích chỉ lấy khi ô là một con số trơn; "4x15", "50m2 đất 40m2 sàn" để model tự đọc rồi truyền `dien_tich`.
    prop = getattr(conv, "prop", None) if conv else None
    if prop is not None:
        f = getattr(prop, "fields", {}) or {}
        khu_vuc = khu_vuc or str(f.get("quan") or f.get("tinh") or f.get("dia_chi") or "")
        phuong = phuong or str(f.get("phuong") or "")
        duong = duong or str(f.get("duong") or "")
        du_an = du_an or str(f.get("du_an") or "")
        loai_hinh = loai_hinh or str(getattr(prop, "loai_hinh", "") or "")
        if dien_tich <= 0:
            for k in ("dien_tich_dat", "dien_tich", "dien_tich_san"):
                v = str(f.get(k) or "").lower().replace("m²", "").replace("m2", "").replace(",", ".").strip()
                try:
                    dien_tich = float(v)
                    break
                except ValueError:
                    continue

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

    if kq.get("nguon") == "khong_co":
        return (f"=== ĐỊNH GIÁ THAM KHẢO: KHÔNG CÓ SỐ ({kq['ly_do']}) ===\n"
                "- Không nêu con số nào. Nói thật là bảng tham khảo chưa có số cho khu / loại này; giá rao do khách quyết.\n")

    if kq.get("nguon") == "du_an":
        return (
            f"=== KẾT QUẢ ĐỊNH GIÁ THỊ TRƯỜNG DỰ ÁN ({kq.get('du_an')}) ===\n"
            f"- Mức giá rao bán thị trường hiện tại: {kq.get('mo_ta_gia')}\n"
            "- Nói rõ với khách: Đây là khoảng giá các căn trong dự án đang rao bán trên thị trường để khách tham khảo; "
            "không phán xét giá khách đưa ra cao hay thấp, tin vẫn rao theo đúng mức giá khách mong muốn."
        )

    dia_diem = ", ".join(x for x in (duong, phuong, khu_vuc) if x)
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
        g_min_str = tien(kq["gia_min"])
        g_max_str = tien(kq["gia_max"])
        dong_gia_tong = f"- Khoảng giá ước tính ({kq['dien_tich']:g} m²): {g_min_str} – {g_max_str}\n"

    dong_so_sanh = ""
    if gia_chu > 0 and kq.get("gia_min") and kq.get("gia_max"):
        g_chu_str = tien(gia_chu)
        if gia_chu < kq["gia_min"]:
            dong_so_sanh = f"- Đối chiếu: giá khách {g_chu_str} thấp hơn dải tham khảo.\n"
        elif gia_chu > kq["gia_max"]:
            dong_so_sanh = f"- Đối chiếu: giá khách {g_chu_str} cao hơn dải tham khảo.\n"
        else:
            dong_so_sanh = f"- Đối chiếu: giá khách {g_chu_str} nằm trong dải tham khảo.\n"

    return (
        f"=== ĐỊNH GIÁ THAM KHẢO (bảng ước lượng theo vùng, chưa phải giá giao dịch) ===\n"
        f"- Khu vực: {dia_diem}\n"
        f"- Loại hình: {loai_vn}\n"
        f"- Đơn giá rao tham khảo: {kq['don_gia_min']} – {kq['don_gia_max']} triệu/m²\n"
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
            if (chu_de and (k in chu_de or chu_de in k)) or (chi_tiet and (chi_tiet in v[0].lower() or k in chi_tiet)):
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


def tinh_phi_moi_gioi_tool(conv: Any, vao: dict[str, Any], engine: Any = None) -> str:
    """Phí môi giới theo vai người rao — tỷ lệ một nguồn `revenue.SALE_FEE_RATE` / `RENTAL_FEE_MONTHS`."""
    gia_vnd = int(vao.get("gia_vnd") or 0)
    vai = str(vao.get("vai_nguoi_gui") or "").lower()
    if not vai and conv is not None:
        vai = getattr(getattr(conv, "user_type", None), "value", "") or ""
    thue = "thue" in str(vao.get("loai_giao_dich") or "ban").lower()
    # Model không truyền giá → đổi giá chữ của căn bằng `parse_vnd` (luật tiền một nguồn), không tự đọc số bằng regex.
    if gia_vnd <= 0 and conv is not None and engine is not None:
        gia = str(getattr(getattr(conv, "prop", None), "fields", {}).get("gia") or "").strip()
        doi = getattr(getattr(engine, "_convstore", None), "_ngan_sach_vnd", None)
        if gia and doi is not None:
            try:
                gia_vnd = int(doi(gia) or 0)
            except Exception:  # noqa: BLE001 — không đổi được thì báo tỷ lệ, không báo số tiền
                gia_vnd = 0
    if thue:
        ty_le_str = f"{RENTAL_FEE_MONTHS:g}".replace(".", ",") + " tháng tiền thuê"
        phi = int(gia_vnd * RENTAL_FEE_MONTHS) if gia_vnd > 0 else 0
    else:
        try:
            vai_enum = SellerRole(vai)
        except ValueError:
            vai_enum = SellerRole.CHU_NHA
        ty_le = SALE_FEE_RATE.get(vai_enum, SALE_FEE_RATE[SellerRole.CHU_NHA])
        ty_le_str = f"{ty_le * 100:g}".replace(".", ",") + "% giá bán"
        phi = int(gia_vnd * ty_le) if gia_vnd > 0 else 0
    dong_tien = f"- Với giá {tien(gia_vnd)}: phí khoảng {tien(phi)}\n" if gia_vnd > 0 else ""
    return (
        "=== PHÍ MÔI GIỚI (chỉ nói khi khách hỏi mức phí) ===\n"
        f"- Mức phí: {ty_le_str}, chỉ thu khi giao dịch thành công — 0 đồng trước (đăng tin, dẫn khách không mất phí)\n"
        f"{dong_tien}"
        "- Trên web công khai hệ thống ẩn số nhà của căn.\n"
    )
