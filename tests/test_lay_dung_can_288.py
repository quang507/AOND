"""29/10/2026 (SRS-5.1zzzzzzz288). Chủ dự án: "rủi ro lấy nhầm code" — khách "hỏi giúp a đi e" không gõ mã thì lõi lấy mã căn từ link bot vừa
gửi. Bản trước: lời bot có HAI căn → lấy căn đầu (câu hỏi có thể tới nhầm chủ nhà); khách hỏi hai căn AI đọc ra → chỉ chủ căn đầu nhận.
Mỗi ca đỏ khi gỡ bản sửa."""
import time

from aioi.engine import Turn
from tests.test_viec_mua import CAN, KHACH_MUA, KhoGia, _engine

CAN2 = {**CAN, "id": "22222222-2222-2222-2222-222222222222", "code": "EFGH5678", "street": "Nguyễn Trãi"}
LINK = "https://aioinhadat.vercel.app/nha-dat/"


class _KhoHaiCan(KhoGia):
    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "GET" and endpoint.startswith("listings?or=(code.in.("):
            self.goi.append((method, endpoint, data))
            return [c for c in (CAN, CAN2) if c["code"] in endpoint]
        return super()._request(method, endpoint, data, prefer)


def _sau_loi_bot(loi: str, mua: dict):
    kho = _KhoHaiCan()
    eng, ai = _engine(kho, KHACH_MUA)
    eng.handle("mua-288", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    eng._conversations["mua-288"].history.append(Turn(role="assistant", content=loi, at=time.time()))
    ai.ke_hoach = {**KHACH_MUA, "mua": mua}
    eng.handle("mua-288", "hỏi giúp a đi e")
    return kho, ai


def test_loi_bot_nhac_hai_can_khach_khong_noi_can_nao_thi_hoi_lai_khong_doan():
    kho, ai = _sau_loi_bot(f"Có căn Trần Bình Trọng {LINK}ABCD1234 và căn Nguyễn Trãi {LINK}EFGH5678 anh xem thử",
                           {"hoi_chu_nha": "Nhà vào ở ngay được không?"})
    assert kho.ghi("POST", "info_requests") == []
    assert "chưa rõ căn nào" in ai.system[-1] and "#ABCD1234" in ai.system[-1] and "#EFGH5678" in ai.system[-1]


def test_loi_bot_mot_can_thi_lay_dung_can_do_va_noi_ro_duong():
    kho, ai = _sau_loi_bot(f"Căn Nguyễn Trãi {LINK}EFGH5678 hợp anh nè", {"hoi_chu_nha": "Nhà vào ở ngay được không?"})
    ir = kho.ghi("POST", "info_requests")
    assert ir and ir[0]["listing_id"] == CAN2["id"]
    assert "#EFGH5678 (Nguyễn Trãi, Quận 5)" in ai.system[-1]   # lời đáp gọi căn bằng đường để khách thấy đúng căn


def test_khach_hoi_hai_can_ai_doc_ra_thi_ca_hai_chu_nha_nhan():
    kho, _ = _sau_loi_bot("ok anh", {"ma_can": ["ABCD1234", "EFGH5678"], "hoi_chu_nha": "Chủ có bớt giá không?"})
    assert sorted(d["listing_id"] for d in kho.ghi("POST", "info_requests")) == sorted([CAN["id"], CAN2["id"]])
