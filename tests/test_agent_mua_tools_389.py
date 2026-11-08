"""Kiểm tra bộ công cụ nguyên tử Function Calling mở rộng phía Mua (SRS-5.1zzzzzzz389)."""
from aioi.agent_mua import CONG_CU, CONG_CU_DOC, chay_cong_cu
from tests.test_viec_mua import CAN, KhoGia


class KhoTestTools(KhoGia):
    def __init__(self):
        super().__init__()
        self.can_2 = {
            "id": "22222222-2222-2222-2222-222222222222",
            "code": "XYZW5678",
            "price_vnd": 8_000_000_000,
            "price_text": "8 tỷ",
            "street": "Trần Hưng Đạo",
            "ward": "Phường 1",
            "legal_area_m2": 80,
            "usable_area_m2": 200,
            "legal_status": "Sổ hồng riêng",
        }

    def can_theo_ma(self, ma):
        ds = []
        for m in ma:
            if m == "ABCD1234":
                ds.append(CAN)
            elif m == "XYZW5678":
                ds.append(self.can_2)
        return ds


class ConvGia:
    def __init__(self):
        self.user_key = "buyer-test-1"
        self.buyer_lead = None
        self.y_luot = {}


class EngineGia:
    def __init__(self, kho):
        self._convstore = kho

    def _gan_ke_thua(self, can):
        pass


def test_danh_sach_cong_cu_nguyen_tu_function_calling():
    ten_cc = {c["name"] for c in CONG_CU}
    assert "so_sanh_can" in ten_cc
    assert "tinh_thue_phi" in ten_cc
    assert "tinh_vay_tra_gop" in ten_cc
    assert "luu_so_dien_thoai" in ten_cc
    assert "tim_can" in ten_cc and "xem_can" in ten_cc and "tra_du_an" in ten_cc

    ten_doc = {c["name"] for c in CONG_CU_DOC}
    assert "so_sanh_can" in ten_doc
    assert "tinh_thue_phi" in ten_doc
    assert "tinh_vay_tra_gop" in ten_doc
    assert "luu_so_dien_thoai" not in ten_doc  # tool ghi không vào CONG_CU_DOC bước 2


def test_cong_cu_so_sanh_can():
    kho = KhoTestTools()
    eng = EngineGia(kho)
    conv = ConvGia()
    gom = []

    # So sánh 2 căn
    ra = chay_cong_cu(eng, conv, "so_sanh_can", {"ma": ["ABCD1234", "XYZW5678"]}, gom)
    assert "SO SÁNH CÁC CĂN TRONG KHO" in ra
    assert "#ABCD1234" in ra and "#XYZW5678" in ra
    assert "tr/m²" in ra
    assert len(gom) == 2

    # Thiếu mã căn
    ra_thieu = chay_cong_cu(eng, conv, "so_sanh_can", {"ma": ["ABCD1234"]}, gom)
    assert "ít nhất 2 mã căn" in ra_thieu


def test_cong_cu_tinh_thue_phi_truc_tiep_hoac_theo_ma_can():
    kho = KhoTestTools()
    eng = EngineGia(kho)
    conv = ConvGia()
    gom = []

    # Tính theo số tiền trực tiếp: 6 tỷ
    ra_tien = chay_cong_cu(eng, conv, "tinh_thue_phi", {"gia_vnd": 6_000_000_000}, gom)
    assert "6 tỷ" in ra_tien
    assert "120 triệu" in ra_tien      # TNCN 2%
    assert "30 triệu" in ra_tien       # Trước bạ 0.5%
    assert "3,6 triệu" in ra_tien      # Công chứng TT 257

    # Tính theo mã căn ABCD1234 (kho có giá 5 tỷ)
    ra_ma = chay_cong_cu(eng, conv, "tinh_thue_phi", {"ma": "ABCD1234"}, gom)
    assert "5 tỷ" in ra_ma
    assert "100 triệu" in ra_ma


def test_cong_cu_tinh_vay_tra_gop_truc_tiep_hoac_theo_ma_can():
    kho = KhoTestTools()
    eng = EngineGia(kho)
    conv = ConvGia()
    gom = []

    # Tính vay trực tiếp căn 10 tỷ
    ra_vay = chay_cong_cu(eng, conv, "tinh_vay_tra_gop", {"gia_vnd": 10_000_000_000, "ty_le_vay": 0.7, "so_nam": 20}, gom)
    assert "10 tỷ" in ra_vay
    assert "3 tỷ" in ra_vay             # Vốn tự có 30%
    assert "7 tỷ" in ra_vay             # Vay 70%
    assert "29,2 triệu" in ra_vay       # Gốc tháng
    assert "43,8 triệu" in ra_vay       # Lãi tháng đầu
    assert "dư nợ giảm dần" in ra_vay


def test_cong_cu_luu_so_dien_thoai():
    kho = KhoTestTools()
    eng = EngineGia(kho)
    conv = ConvGia()
    gom = []

    ra = chay_cong_cu(eng, conv, "luu_so_dien_thoai", {"sdt": "0909123456"}, gom)
    assert "ĐÃ LƯU số điện thoại 0909123456" in ra
    # Kiểm tra SĐT được lưu vào buyers
    va = [d for m, e, d in kho.goi if m == "PATCH" and e.startswith("buyers?id=eq.b1")]
    assert va and va[0] == {"phone": "0909123456"}
    # Kiểm tra tin báo admin
    nhac = kho.ghi("POST", "reminders")
    assert nhac and nhac[0]["kind"] == "escalation" and "0909123456" in nhac[0]["note"]
