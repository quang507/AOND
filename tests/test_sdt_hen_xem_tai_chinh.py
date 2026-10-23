"""SRS-5.1zzzzzzz148 (23/10/2026), hai quyết định của chủ dự án: (1) "số điện thoại khách lúc xem thử thì lấy được" — người mua vẫn KHÔNG phải để lại số ở
mọi chỗ khác, nhưng khi khách chốt lịch xem bot xin MỘT lần, số khách gõ chỉ được ghi vào lịch hẹn đang chờ và báo người phụ trách; (2) "số liệu tài chính cứ để số
tượng trưng đã" — số tham khảo ở MỘT chỗ (`tai_chinh.py`), chỉ nói khi khách tự hỏi, kèm chữ "tham khảo". Đỏ khi: xin số khi chưa có lịch hẹn, xin lặp, ghi số khi không có
lịch chờ, nhận chuỗi không phải số di động, hoặc khối tài chính mất / nói số ngoài danh sách. Số dùng trong test là số giả."""
import pytest

from aioi import tai_chinh
from aioi.mua import tim_sdt
from tests.test_viec_mua import CAN, KHACH_MUA, KhoGia, _engine

LICH = {"id": "v1", "listing_id": CAN["id"], "listing_code": CAN["code"]}


class KhoSdt(KhoGia):
    def __init__(self, co_lich=True):
        super().__init__()
        self.co_lich = co_lich

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "GET" and endpoint.startswith("viewings?buyer_id=eq.b1&status=in.(proposed,pending)&phone=is.null"):
            self.goi.append((method, endpoint, data))
            return [LICH] if self.co_lich else []
        return super()._request(method, endpoint, data, prefer)


@pytest.mark.parametrize("chu, ra", [
    ("số em 0900 000 001 nha", "0900000001"), ("+84 900-000-001", "0900000001"), ("090.000.0001", "0900000001"),
    ("gọi 0900000001 giúp em", "0900000001"),
    ("tầm 5 tỷ", None), ("căn 60m2 giá 0,5 tỷ", None), ("0900 000 00", None),            # thiếu số
    ("mã 09000000012", None), ("19000000010", None), ("0100000001", None),               # dài hơn / không phải đầu số di động
])
def test_tim_sdt_chi_nhan_so_di_dong(chu, ra):
    assert tim_sdt(chu) == ra


def _luot_hen(eng, kho, khach="mua-s1"):
    eng.handle(khach, "Em tìm nhà phố quận 5 tầm 5 tỷ")
    eng._provider.ke_hoach = {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "hen_xem": "chiều mai 3h", "trich_dan": "chiều mai 3h"}}
    return eng.handle(khach, "căn ABCD1234 chiều mai 3h em đi xem được không")


def test_chot_lich_xem_thi_xin_mot_so_mot_lan():
    kho = KhoSdt()
    eng, ai = _engine(kho, KHACH_MUA)
    _luot_hen(eng, kho)
    assert "xin khách MỘT số điện thoại" in ai.system[-1]
    eng.handle("mua-s1", "căn ABCD1234 chiều mai 3h em đi xem được không")                    # nhắc lại lịch: không xin lần hai
    assert "xin khách MỘT số điện thoại" not in ai.system[-1]


def test_chua_chot_lich_thi_khong_xin_so():
    kho = KhoSdt()
    eng, ai = _engine(kho, KHACH_MUA)
    eng.handle("mua-s2", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    eng.handle("mua-s2", "căn đó giá có bớt không anh")
    assert all("xin khách MỘT số điện thoại" not in s and "số điện thoại khách" not in s for s in ai.system)


def test_khach_de_so_thi_ghi_vao_lich_cho_va_bao_nguoi_phu_trach():
    kho = KhoSdt()
    eng, ai = _engine(kho, KHACH_MUA)
    _luot_hen(eng, kho, "mua-s3")
    eng._provider.ke_hoach = KHACH_MUA
    eng.handle("mua-s3", "số em 0900 000 001")
    vá = [d for m, e, d in kho.goi if m == "PATCH" and e.startswith("viewings?id=eq.v1")]
    assert vá and vá[0] == {"phone": "0900000001"}
    nhac = kho.ghi("POST", "reminders")
    assert nhac and nhac[0]["kind"] == "escalation" and nhac[0]["viewing_id"] == "v1" and "0900000001" in nhac[0]["note"]
    assert "KHÔNG đọc lại số" in ai.system[-1]                                               # bot cảm ơn, không đọc lại số ra lời


def test_so_khach_go_ngoai_ngu_canh_hen_xem_khong_duoc_luu():
    kho = KhoSdt(co_lich=False)
    eng, _ = _engine(kho, KHACH_MUA)
    eng.handle("mua-s4", "Em tìm nhà phố quận 5 tầm 5 tỷ, số em 0900 000 001")
    assert not [1 for m, e, d in kho.goi if m == "PATCH" and e.startswith("viewings")] and not kho.ghi("POST", "reminders")


@pytest.mark.parametrize("chu, sai", [
    ("070772473", True), ("0900 000 00", True), ("09000000012", True), ("+84 900 000", True),     # giống số điện thoại nhưng sai độ dài
    ("0900000001", False), ("+84 900-000-001", False),                                            # số đúng: tim_sdt nhận
    ("tầm 6 tỷ", False), ("căn 0,5 tỷ", False), ("0.75 tháng", False), ("chủ nhật 9h - 10h", False), ("ok", False),
])
def test_giong_sdt_sai(chu, sai):
    from aioi.mua import giong_sdt_sai
    assert giong_sdt_sai(chu) is sai


def test_so_thieu_chu_so_thi_khong_cam_on_nhu_da_nhan():
    """SRS-5.1zzzzzzz161 (chat chị Ngân 23/10): khách cố ý gõ thiếu một số "070772473", bot vẫn "cảm ơn chị đã gửi số" và hứa người phụ trách gọi."""
    kho = KhoSdt()
    eng, ai = _engine(kho, KHACH_MUA)
    _luot_hen(eng, kho, "mua-s6")                                                            # bot xin số (cờ _da_xin_sdt)
    eng._provider.ke_hoach = KHACH_MUA
    eng.handle("mua-s6", "070772473")
    assert not [1 for m, e, d in kho.goi if m == "PATCH" and e.startswith("viewings?id=eq.v1")] and not kho.ghi("POST", "reminders")
    assert "KHÔNG đúng" in ai.system[-1] and "KHÔNG cảm ơn" in ai.system[-1] and "CHƯA ghi được" in ai.system[-1]
    eng.handle("mua-s6", "0900000001")                                                       # gõ lại đủ số thì ghi bình thường
    assert [1 for m, e, d in kho.goi if m == "PATCH" and e.startswith("viewings?id=eq.v1")]
    assert "KHÔNG đúng" not in ai.system[-1] and "chú ý điện thoại" in ai.system[-1]         # và nhắc "điện thoại", không "máy"


def test_so_sai_khi_chua_xin_so_thi_khong_nhac_gi():
    kho = KhoSdt()
    eng, ai = _engine(kho, KHACH_MUA)
    eng.handle("mua-s7", "Em tìm nhà phố quận 5 tầm 5 tỷ, mã 070772473")
    assert "KHÔNG đúng" not in ai.system[-1]


def test_khoi_tai_chinh_mot_nguon_chi_noi_khi_khach_hoi():
    k = tai_chinh.khoi_tai_chinh()
    assert tai_chinh.SINH_LOI_THAM_KHAO in k and tai_chinh.LAI_SUAT_VAY_THAM_KHAO in k and "THAM KHẢO" in k and "tham khảo" in k
    assert "TỰ hỏi" in k and "không tự nêu số khi khách chưa hỏi" in k and "đáng mua" in k   # vẫn cấm bình luận "đáng mua / nên vay"
    kho = KhoGia()
    eng, ai = _engine(kho, KHACH_MUA)
    eng.handle("mua-s5", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    assert tai_chinh.SINH_LOI_THAM_KHAO in ai.system[-1]                                    # khối nằm trong system lượt mua
