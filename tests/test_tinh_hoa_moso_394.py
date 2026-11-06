"""Kiểm tra 5 Tinh hoa MOSO tích hợp vào AOND Chatbot (SRS-5.1zzzzzzz394, 06/11/2026).

5 Tinh hoa:
1. tra_cuu_phong_thuy (Bát Trạch, Can Chi, Cung phi, Đông/Tây Tứ Mệnh, đánh giá hướng nhà).
2. so_sanh_du_an (So sánh đối đầu 2 dự án lân cận từ kho 1.388 dự án MOSO).
3. tham_dinh_quy_hoach (Quy hoạch lộ giới hẻm/đường, phân khu 1/2000, QĐ 56/2021/QĐ-UBND).
4. goi_y_dam_phan (Biên độ thương lượng 3 bước giá, đòn bẩy chốt cọc nhanh).
5. bo_loc_gia_dinh (Tiêu chuẩn an cư gia đình: tầng đẹp 8-18, căn góc, ban công Đông Nam mát).
"""
from __future__ import annotations

from typing import Any

from aioi.agent_ban import CONG_CU as CONG_CU_BAN, _khoi as khoi_ban
from aioi.agent_mua import CONG_CU as CONG_CU_MUA, chay_cong_cu
from aioi.dam_phan import goi_y_khoang_gia_dam_phan
from aioi.du_an_so_sanh import so_sanh_hai_du_an
from aioi.phong_thuy import (
    dinh_dang_phong_thuy_chat,
    tinh_can_chi,
    tinh_quai_so,
    tra_cuu_phong_thuy_chi_tiet,
)
from aioi.quy_hoach import tra_cuu_quy_hoach_lo_gioi
from aioi.tieu_chi_gia_dinh import tu_van_tieu_chi_gia_dinh


class KhoGiaDuAn:
    def tra_du_an(self, ten: str):
        t = ten.lower()
        if "akari" in t:
            return {
                "khop": "ro",
                "du_an": {
                    "name": "Akari City",
                    "developer": "Nam Long Group",
                    "district": "Bình Tân",
                    "province": "Hồ Chí Minh",
                    "price_min": 45_000_000,
                    "price_max": 52_000_000,
                    "legal_status": "Sổ hồng lâu dài",
                    "status_text": "Đã bàn giao giai đoạn 1, đang bàn giao giai đoạn 2",
                    "specs": {"moso": {"blocks": 14, "floors": 29, "facilities": ["Hồ bơi", "Công viên Nhật", "Trường học"]}},
                },
            }
        if "mizuki" in t:
            return {
                "khop": "ro",
                "du_an": {
                    "name": "Mizuki Park",
                    "developer": "Nam Long & Hankyu Hanshin",
                    "district": "Bình Chánh",
                    "province": "Hồ Chí Minh",
                    "price_min": 43_000_000,
                    "price_max": 50_000_000,
                    "legal_status": "Sổ hồng lâu dài",
                    "status_text": "Đã bàn giao phân khu Flora",
                    "specs": {"moso": {"blocks": 8, "floors": 20, "facilities": ["Kênh đào", "Hồ bơi tràn", "Đường dạo bộ"]}},
                },
            }
        return {"khop": "khong"}

    def can_theo_ma(self, ma):
        return []


class EngineGia:
    def __init__(self):
        self._convstore = KhoGiaDuAn()


class ConvGia:
    def __init__(self):
        self.user_key = "user-test"
        self.buyer_lead = None


def test_tinh_hoa_1_phong_thuy():
    # 1. Kiểm tra Can Chi
    assert tinh_can_chi(1988) == "Mậu Thìn"
    assert tinh_can_chi(1990) == "Canh Ngọ"
    assert tinh_can_chi(1992) == "Nhâm Thân"

    # 2. Kiểm tra Cung Phi (Quái Số)
    # Nam 1988: 1+9+8+8 = 26 -> 2+6=8. 10-8 = 2 (Cung Khôn - Tây Tứ Mệnh)
    assert tinh_quai_so(1988, "nam") == 2
    # Nữ 1988: 8+5 = 13 -> 1+3 = 4 (Cung Tốn - Đông Tứ Mệnh)
    assert tinh_quai_so(1988, "nu") == 4

    # 3. Tra cứu chi tiết
    pt = tra_cuu_phong_thuy_chi_tiet(1988, "nam", huong_nha="Đông Bắc")
    assert pt["nhom_menh"] == "Tây Tứ Mệnh"
    assert pt["danh_gia_huong"]["hop_menh"] is True
    assert pt["danh_gia_huong"]["sao"] == "Sinh Khí"

    # 4. Format chat
    chat = dinh_dang_phong_thuy_chat(1990, gioi_tinh="nam", huong_nha="Tây Nam")
    assert "PHONG THỦY BÁT TRẠCH" in chat
    assert "CANH NGỌ" in chat
    assert "ĐÁNH GIÁ HƯỚNG NHÀ" in chat


def test_tinh_hoa_2_so_sanh_du_an():
    eng = EngineGia()
    conv = ConvGia()
    kq = so_sanh_hai_du_an(eng, conv, "Akari City", "Mizuki Park")
    chat_upper = kq.upper()
    assert "SO SÁNH ĐỐI ĐẦU DỰ ÁN" in chat_upper
    assert "AKARI CITY" in chat_upper
    assert "MIZUKI PARK" in chat_upper
    assert "Nam Long" in kq
    assert "triệu/m²" in kq
    assert "TIỆN ÍCH NỘI KHU" in kq


def test_tinh_hoa_3_tham_dinh_quy_hoach():
    # Hẻm
    kq_hem = tra_cuu_quy_hoach_lo_gioi("12/4 Hoàng Diệu, Quận 4", quan_huyen="Quận 4")
    assert "THẨM ĐỊNH QUY HOẠCH" in kq_hem
    assert "Lộ giới quy hoạch hẻm" in kq_hem
    assert "Đất Nhóm Nhà Ở Hiện Hữu" in kq_hem

    # Mặt tiền
    kq_mt = tra_cuu_quy_hoach_lo_gioi("Mặt tiền Nguyễn Thị Thập, Quận 7", quan_huyen="Quận 7")
    assert "khoảng lùi" in kq_mt
    assert "Quyết định 56" in kq_mt or "QĐ 56" in kq_mt


def test_tinh_hoa_4_goi_y_dam_phan():
    # Nhà phố 6 tỷ
    kq = goi_y_khoang_gia_dam_phan(6_000_000_000, loai_hinh="nha_pho", khu_vuc="Quận 7")
    assert "CHIẾN LƯỢC ĐÀM PHÁN GIÁ" in kq
    assert "6.00 tỷ" in kq or "6 tỷ" in kq
    assert "Mức Mở Màn Thử Thách" in kq
    assert "Mức Mục Tiêu Khả Thi" in kq
    assert "Mức Bớt Lộc May Mắn" in kq
    assert "Đòn bẩy" in kq


def test_tinh_hoa_5_bo_loc_gia_dinh():
    kq = tu_van_tieu_chi_gia_dinh(khu_vuc="Bình Thạnh", ngan_sach="3.5 tỷ", so_phong_ngu="2")
    assert "TIÊU CHUẨN LỰA CHỌN NHÀ Ở CHO GIA ĐÌNH" in kq
    assert "Tầng trung lý tưởng (Tầng 8 - 18)" in kq
    assert "Căn góc 2 mặt thoáng" in kq
    assert "Ban công hướng Đông Nam" in kq
    assert "VỊ TRÍ CẦN TRÁNH" in kq


def test_tich_hop_tools_vao_agent_mua_va_agent_ban():
    # Phía mua
    mua_tools = {c["name"] for c in CONG_CU_MUA}
    assert "so_sanh_du_an" in mua_tools
    assert "tra_cuu_phong_thuy" in mua_tools
    assert "tham_dinh_quy_hoach" in mua_tools
    assert "goi_y_dam_phan" in mua_tools
    assert "bo_loc_gia_dinh" in mua_tools

    eng = EngineGia()
    conv = ConvGia()
    gom: list[dict] = []

    # Gọi qua chay_cong_cu
    r_pt = chay_cong_cu(eng, conv, "tra_cuu_phong_thuy", {"nam_sinh": 1988, "gioi_tinh": "nam"}, gom)
    assert "PHONG THỦY BÁT TRẠCH" in r_pt

    r_ss = chay_cong_cu(eng, conv, "so_sanh_du_an", {"du_an_1": "Akari City", "du_an_2": "Mizuki Park"}, gom)
    assert "SO SÁNH ĐỐI ĐẦU DỰ ÁN" in r_ss

    r_qh = chay_cong_cu(eng, conv, "tham_dinh_quy_hoach", {"dia_chi": "Hẻm 45 Lê Văn Lương", "quan_huyen": "Nhà Bè"}, gom)
    assert "THẨM ĐỊNH QUY HOẠCH" in r_qh

    r_dp = chay_cong_cu(eng, conv, "goi_y_dam_phan", {"gia_vnd": 5_000_000_000, "loai_hinh": "can_ho"}, gom)
    assert "CHIẾN LƯỢC ĐÀM PHÁN GIÁ" in r_dp

    r_gd = chay_cong_cu(eng, conv, "bo_loc_gia_dinh", {"khu_vuc": "Quận 2", "ngan_sach": "5 tỷ"}, gom)
    assert "TIÊU CHUẨN LỰA CHỌN NHÀ Ở CHO GIA ĐÌNH" in r_gd

    # Phía bán
    ban_tools = {c["name"] for c in CONG_CU_BAN}
    assert "tra_cuu_phong_thuy" in ban_tools
    assert "tham_dinh_quy_hoach" in ban_tools
    assert "goi_y_dam_phan" in ban_tools

    r_ban_pt = khoi_ban(eng, conv, None, "tra_cuu_phong_thuy", {"nam_sinh": 1992, "gioi_tinh": "nu"})
    assert "PHONG THỦY BÁT TRẠCH" in r_ban_pt
