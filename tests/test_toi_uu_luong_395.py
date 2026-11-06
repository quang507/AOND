"""Kiểm tra Tối ưu hóa các luồng hội thoại theo chuẩn MOSO (SRS-5.1zzzzzzz395, 06/11/2026).

1. tim_can khi chỉ có khu vực -> gợi ý dải giá thị trường + dự án tiêu biểu rồi hỏi ngân sách.
2. tim_can khi chỉ có ngân sách -> gợi ý khu vực phù hợp tại TP.HCM.
3. tim_can khi 0 kết quả (no results) -> thông tin thực tế thị trường + gợi ý phương án thay thế.
4. prompts.NATURAL_QUESTIONS["hinh_anh"] -> cam kết bảo mật che số nhà, che số sổ.
5. agent_ban.HUONG_DAN -> hướng dẫn gọi các công cụ phong thủy, quy hoạch, đàm phán.
"""
from __future__ import annotations

import copy
from typing import Any

from aioi.agent_ban import HUONG_DAN as HUONG_DAN_BAN
from aioi.agent_mua import chay_cong_cu
from aioi.prompts import NATURAL_QUESTIONS


class MockLead:
    def __init__(self, fields: dict[str, str] | None = None):
        self.fields = fields or {}
        self.khu_vuc = self.fields.get("khu_vuc")
        self.ngan_sach = self.fields.get("ngan_sach")

    def update(self, d: dict[str, str]):
        self.fields.update(d)
        if "khu_vuc" in d:
            self.khu_vuc = d["khu_vuc"]
        if "ngan_sach" in d:
            self.ngan_sach = d["ngan_sach"]


class MockKho:
    def __init__(self, co_can: bool = False):
        self.co_can = co_can

    def can_phu_hop(self, lead, loai_tru=None):
        if not self.co_can:
            return []
        return [{
            "id": "1111",
            "code": "TEST1234",
            "price_text": "3.5 tỷ",
            "price_vnd": 3_500_000_000,
            "street": "Nguyễn Thị Thập",
            "ward": "Tân Phong",
            "district": "Quận 7",
            "legal_area_m2": 65,
        }]

    def can_khong_hop(self, user_key):
        return []

    def du_an_theo_khu(self, khu):
        if "7" in str(khu):
            return [{"name": "Sunrise Riverside"}, {"name": "Belleza"}]
        return []


class MockEngine:
    def __init__(self, kho):
        self._convstore = kho

    def _gan_ke_thua(self, can):
        pass


class MockConv:
    def __init__(self, lead):
        self.user_key = "user-test"
        self.buyer_lead = lead


def test_tim_can_chi_co_khu_vuc_goi_y_dai_gia_va_du_an():
    lead = MockLead({"khu_vuc": "Quận 7"})
    kho = MockKho(co_can=False)
    eng = MockEngine(kho)
    conv = MockConv(lead)
    gom: list[dict] = []

    res = chay_cong_cu(eng, conv, "tim_can", {"khu_vuc": "Quận 7"}, gom)
    assert "CHƯA CÓ NGÂN SÁCH" in res
    assert "dải giá thị trường tham khảo" in res
    assert "Quận 7" in res
    assert "Sunrise Riverside" in res


def test_tim_can_chi_co_ngan_sach_goi_y_khu_vuc():
    lead = MockLead({"ngan_sach": "4 tỷ"})
    kho = MockKho(co_can=False)
    eng = MockEngine(kho)
    conv = MockConv(lead)
    gom: list[dict] = []

    res = chay_cong_cu(eng, conv, "tim_can", {"ngan_sach": "4 tỷ"}, gom)
    assert "CHƯA CHỌN KHU VỰC" in res
    assert "Gợi ý một số khu vực sôi động" in res


def test_tim_can_khong_co_ket_qua_co_fallback_thong_minh():
    lead = MockLead({"khu_vuc": "Quận 1", "ngan_sach": "2 tỷ"})
    kho = MockKho(co_can=False)
    eng = MockEngine(kho)
    conv = MockConv(lead)
    gom: list[dict] = []

    res = chay_cong_cu(eng, conv, "tim_can", {"khu_vuc": "Quận 1", "ngan_sach": "2 tỷ"}, gom)
    assert "Hiện kho chưa có căn nào khớp 100%" in res
    assert "ĐỪNG CHỈ NÓI 'KHÔNG CÓ' RỒI DỪNG LẠI" in res
    assert "thực tế mặt bằng giá" in res
    assert "Gợi ý phương án thay thế" in res


def test_bao_mat_hinh_anh_prompts():
    loi = NATURAL_QUESTIONS["hinh_anh"]
    assert "bảo mật" in loi.lower()
    assert "che số nhà" in loi.lower()


def test_huong_dan_agent_ban_co_cac_cong_cu_moi():
    assert "tra_cuu_phong_thuy" in HUONG_DAN_BAN
    assert "tham_dinh_quy_hoach" in HUONG_DAN_BAN
    assert "goi_y_dam_phan" in HUONG_DAN_BAN
