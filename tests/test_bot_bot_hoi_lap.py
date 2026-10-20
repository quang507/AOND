"""19/10/2026 (SRS-5.1zzzzzzz74): bắn thử kịch bản Âu Cơ — bot hỏi "ngang x dài trên sổ" 5 lượt liền khi khách lờ đi, và gửi cho
khách dòng ghi chú nội bộ tiếng Anh của model ("Wait, the system prohibits…"). Đỏ khi bỏ `_o_hoi_ke`. Ghi chú nội bộ: từ
SRS-5.1zzzzzzz76 tách ở lượt gọi model (`tests/test_loi_gui_khach.py`), không lọc chữ."""
from aioi.engine import Conversation, Engine
from aioi.assistants import assign_assistant


def test_khong_hoi_cung_mot_o_hai_luot_lien():
    c = Conversation(user_key="k", assistant=assign_assistant("k"))
    thieu = ["dien_tich_dat", "dien_tich_nha", "gia"]
    assert Engine._o_hoi_ke(c, thieu) == "dien_tich_dat"
    # khách chưa trả lời → hỏi ý khác trước; từ SRS-5.1zzzzzzz79 hỏi theo cụm, dien_tich_dat + dien_tich_nha cùng cụm nên lùi CẢ CỤM
    assert Engine._o_hoi_ke(c, thieu) == "gia"
    assert Engine._o_hoi_ke(c, thieu) == "dien_tich_dat"       # rồi mới quay lại
    assert Engine._o_hoi_ke(c, ["gia"]) == "gia" and Engine._o_hoi_ke(c, ["gia"]) == "gia"   # còn mỗi một ô thì vẫn hỏi

