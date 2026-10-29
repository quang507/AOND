"""SRS-5.1zzzzzzz268 (bắn thử ban-thu-kiem E, 29/10/2026): kho xưởng Đức Hòa đủ vị trí + diện tích + giá, khách nói thêm "Sổ đỏ riêng,
đất SKC 50 năm" — AI lập thao tác trả "add" nên code mở căn mới rỗng, bản nháp không ra, bot hỏi lại vị trí.

Lớp lỗi: quyết định "add" của AI được nhận không cần căn cứ. Nay "add" 1 căn phải kèm cụm khách nói căn KHÁC (`can_khac_trich`) nằm
trong lời khách; không có thì thông tin ghi vào căn đang khai. Không đoán bằng từ khoá — AI đọc nghĩa, code kiểm cụm trích.
"""
from aioi.config import Settings
from aioi.engine import Conversation, Engine, Turn
from aioi.assistants import assign_assistant
from aioi.llm.mock import MockProvider


def _engine() -> Engine:
    return Engine(MockProvider(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")))


def _conv_kho() -> Conversation:
    conv = Conversation(user_key="kho268", assistant=assign_assistant("kho268"))
    conv.active.prop.update({"loai_hinh": "kho_xuong", "khu_vuc": "Đức Hòa, Long An", "dien_tich": "1.000m2", "gia": "20 tỷ"})
    conv.history.append(Turn("user", "Anh cần bán kho xưởng ở huyện Đức Hòa, Long An", 0.0))
    return conv


def _add(eng, conv, loi, op):
    conv.history.append(Turn("user", loi, 1.0))
    conv.loi_khach_luot = loi
    eng._apply_operation(conv, {"op": "add", **op}, set(), [])


def test_add_khong_cum_can_khac_ghi_vao_can_dang_khai():
    eng, conv = _engine(), _conv_kho()
    loi = "Sổ đỏ riêng, đất SKC 50 năm"
    _add(eng, conv, loi, {"fields": {"phap_ly_so_do": "Sổ đỏ riêng"}, "bang_chung": {"phap_ly_so_do": "Sổ đỏ riêng"}})
    assert len(conv.listings) == 1
    assert conv.active.prop.fields.get("phap_ly_so_do") == "Sổ đỏ riêng"
    assert conv.active.prop.fields.get("khu_vuc") == "Đức Hòa, Long An"


def test_add_cum_can_khac_khong_nam_trong_loi_khach_van_la_update():
    # Cách nói mới: AI bịa cụm "còn một căn nữa" mà khách không nói.
    eng, conv = _engine(), _conv_kho()
    _add(eng, conv, "Đất này có sổ đỏ, thời hạn 50 năm em", {"fields": {}, "can_khac_trich": "còn một căn nữa"})
    assert len(conv.listings) == 1


def test_add_co_cum_can_khac_mo_can_moi():
    eng, conv = _engine(), _conv_kho()
    _add(eng, conv, "à anh còn lô đất SKC ở Bến Lức nữa", {"fields": {}, "can_khac_trich": "còn lô đất SKC ở Bến Lức nữa"})
    assert len(conv.listings) == 2
    assert conv.listings[0].prop.fields.get("khu_vuc") == "Đức Hòa, Long An"
