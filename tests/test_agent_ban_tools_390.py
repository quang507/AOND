"""Kiểm tra bộ công cụ Function Calling cho luồng Ký Gửi / Bán (SRS-5.1zzzzzzz390, 06/11/2026)."""
from __future__ import annotations

from typing import Any

from aioi.agent_ban import CONG_CU, _khoi
from aioi.dinh_gia import (
    dinh_gia_tham_khao_tool,
    kiem_tra_phap_ly_so_tool,
    tinh_dinh_gia_tham_khao,
    tinh_phi_moi_gioi_tool,
)


class ConvGiaBan:
    def __init__(self, dia_chi: str = "12 Nguyễn Thị Thập, P. Tân Phong, Quận 7", gia: str = "10 tỷ", dien_tich: str = "80m²"):
        class PropGia:
            def __init__(self, fields: dict[str, Any]):
                self.fields = fields

        self.prop = PropGia({
            "dia_chi": dia_chi,
            "gia": gia,
            "dien_tich": dien_tich,
            "loai_hinh": "nha_pho",
        })


class ProjectGia:
    def __init__(self, name: str = "Sunrise City", gia_rao: str = "45–55 triệu/m² (tháng 10/2026)"):
        self.name = name
        self.goc = {"giá rao bán thị trường": gia_rao}


class EngineGiaBan:
    def _basket_block(self, conv: Any) -> str:
        return "Rổ 1 căn"

    def _project_memory_block(self, project: Any, conv: Any) -> str:
        return "Dự án Sunrise City"

    def _seller_price_block(self, conv: Any) -> str:
        return "Giá 10 tỷ"


def test_danh_sach_cong_cu_agent_ban():
    ten_cc = {c["name"] for c in CONG_CU}
    assert "ro_hang" in ten_cc
    assert "bo_nho_du_an" in ten_cc
    assert "gia_da_gui" in ten_cc
    assert "dinh_gia_tham_khao" in ten_cc
    assert "kiem_tra_phap_ly_so" in ten_cc
    assert "tinh_phi_moi_gioi" in ten_cc


def test_cong_cu_dinh_gia_tham_khao():
    eng = EngineGiaBan()
    conv = ConvGiaBan()

    # 1. Định giá nhà phố Quận 7 diện tích 80m²
    ra = dinh_gia_tham_khao_tool(
        eng,
        conv,
        None,
        {
            "khu_vuc": "Quận 7",
            "loai_hinh": "nha_pho",
            "dien_tich": 80,
            "gia_chu_dinh_ban": 10_000_000_000,
        },
    )
    assert "ĐỊNH GIÁ THAM KHẢO" in ra
    assert "Quận 7" in ra
    assert "90 – 160 triệu/m²" in ra
    assert "7,2 tỷ – 12,8 tỷ" in ra
    assert "giá khách 10 tỷ nằm trong dải tham khảo" in ra
    assert "quyền quyết định giá bán hoàn toàn thuộc về khách" in ra

    # 08/11: vùng lạ / loại hình không có trong bảng → không có số (bản 06/11 mặc định nội thành)
    assert "KHÔNG CÓ SỐ" in dinh_gia_tham_khao_tool(eng, None, None, {"khu_vuc": "Hà Giang", "loai_hinh": "nha_pho", "dien_tich": 80})
    assert "KHÔNG CÓ SỐ" in dinh_gia_tham_khao_tool(eng, None, None, {"khu_vuc": "Quận 7", "loai_hinh": "dat_nong_nghiep"})
    # "Quận 12" không còn bị đọc thành Quận 1 (trung tâm)
    assert tinh_dinh_gia_tham_khao(khu_vuc="Quận 12", loai_hinh="nha_pho")["vung"] == "ngoai_thanh"

    # 2. Định giá căn hộ theo dự án có sẵn dữ liệu
    p = ProjectGia("Sunrise City", "50–60 triệu/m²")
    ra_da = dinh_gia_tham_khao_tool(eng, conv, p, {"du_an": "Sunrise City"})
    assert "Sunrise City" in ra_da
    assert "50–60 triệu/m²" in ra_da


def test_cong_cu_kiem_tra_phap_ly_so():
    # 1. Kiểm tra nhà chưa hoàn công
    ra_hc = kiem_tra_phap_ly_so_tool({"chu_de": "chua_hoan_cong"})
    assert "CĂN CỨ PHÁP LÝ & HƯỚNG DẪN" in ra_hc
    assert "hoàn công" in ra_hc.lower()
    assert "Căn cứ pháp lý:" in ra_hc

    # 2. Kiểm tra nhà đang thế chấp ngân hàng
    ra_tc = kiem_tra_phap_ly_so_tool({"chu_de": "nha_the_chap"})
    assert "thế chấp" in ra_tc.lower()

    # 3. Kiểm tra mua bán vi bằng
    ra_vb = kiem_tra_phap_ly_so_tool({"chu_de": "vi_bang"})
    assert "vi bằng" in ra_vb.lower()


def test_cong_cu_tinh_phi_moi_gioi():
    conv = ConvGiaBan(gia="10 tỷ")

    # 1. Chủ nhà bán căn 10 tỷ (phí 1% = 100 triệu)
    ra_ban = tinh_phi_moi_gioi_tool(conv, {"gia_vnd": 10_000_000_000, "vai_nguoi_gui": "chu_nha", "loai_giao_dich": "ban"})
    assert "1%" in ra_ban
    assert "100 triệu" in ra_ban
    assert "0 đồng trước" in ra_ban and "ẩn số nhà" in ra_ban
    # 08/11: bỏ cam kết hệ thống không có
    assert "3 THẬT" not in ra_ban.upper() and "Top" not in ra_ban and "SĐT" not in ra_ban

    # 2. Môi giới gửi bán liên kết (phí 0.5% = 50 triệu)
    ra_mg = tinh_phi_moi_gioi_tool(conv, {"gia_vnd": 10_000_000_000, "vai_nguoi_gui": "moi_gioi", "loai_giao_dich": "ban"})
    assert "0,5%" in ra_mg
    assert "50 triệu" in ra_mg

    # 3. Cho thuê 20 triệu/tháng (0.75 tháng = 15 triệu)
    ra_thue = tinh_phi_moi_gioi_tool(conv, {"gia_vnd": 20_000_000, "loai_giao_dich": "thue"})
    assert "0,75 tháng" in ra_thue
    assert "15 triệu" in ra_thue


def test_agent_ban_khoi_dispatch():
    eng = EngineGiaBan()
    conv = ConvGiaBan()

    # Tra dinh_gia_tham_khao
    r1 = _khoi(eng, conv, None, "dinh_gia_tham_khao", {"khu_vuc": "Quận 1", "loai_hinh": "nha_pho", "dien_tich": 100})
    assert "ĐỊNH GIÁ THAM KHẢO" in r1 and "180 – 320 triệu/m²" in r1
    assert "Quận 1" in r1

    # Tra kiem_tra_phap_ly_so
    r2 = _khoi(eng, conv, None, "kiem_tra_phap_ly_so", {"chu_de": "so_do_so_hong"})
    assert "Sổ đỏ" in r2 or "sổ hồng" in r2

    # Tra tinh_phi_moi_gioi
    r3 = _khoi(eng, conv, None, "tinh_phi_moi_gioi", {"gia_vnd": 5_000_000_000})
    assert "50 triệu" in r3
