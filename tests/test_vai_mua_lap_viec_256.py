"""SRS-5.1zzzzzzz256 — bắn thử ban-thu-mua 28/10/2026 16:21 (model thật): khách mua chọn căn, hẹn xem và hỏi "sổ hồng riêng không" → lượt lập
thao tác trả `update phap_ly_hoan_cong` của phía BÁN, khối "mua" trống: không quan tâm, không lịch hẹn, không câu hỏi chủ nhà. Prompt lập thao
tác không nói người nhắn là khách mua. Đỏ khi bỏ khối vai khỏi prompt lập thao tác của khách mua."""
from aioi.engine import KHOI_VAI_MUA_LAP_VIEC
from tests.test_viec_mua import KHACH_MUA, AiGia, KhoGia
from aioi.engine import Engine


class AiNho(AiGia):
    def __init__(self, ke_hoach):
        super().__init__(ke_hoach)
        self.lap = []

    def extract(self, system, messages, json_schema):
        if "operations" in (json_schema.get("properties") or {}):
            self.lap.append(system)
        return super().extract(system, messages, json_schema)


def test_lap_thao_tac_cua_khach_mua_biet_vai_khach_mua():
    ai = AiNho(KHACH_MUA)
    eng = Engine(ai, conversation_store=KhoGia())
    eng.handle("mua-vai", "Chào em, anh tìm nhà phố quận 5 tầm 5 tỷ")
    eng.handle("mua-vai", "Căn đó anh thấy được, chiều thứ 7 anh qua xem, mà nhà này sổ hồng riêng không em?")
    assert KHOI_VAI_MUA_LAP_VIEC in ai.lap[-1]                 # lượt 2: vai khách mua đã biết → prompt lập thao tác nói rõ
    assert "hoi_chu_nha" in KHOI_VAI_MUA_LAP_VIEC and "KHÔNG phải ô tin rao" in KHOI_VAI_MUA_LAP_VIEC


def test_nguoi_ban_khong_co_khoi_vai_mua():
    ai = AiNho({"operations": [], "user_intent": "sell"})
    eng = Engine(ai, conversation_store=KhoGia())
    eng.handle("ban-vai", "Anh cần bán nhà phố quận 5 giá 5 tỷ")
    eng.handle("ban-vai", "Nhà sổ hồng riêng em nhé")
    assert all(KHOI_VAI_MUA_LAP_VIEC not in s for s in ai.lap)
