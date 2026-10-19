"""19/10/2026 (SRS-5.1zzzzzzz74): bắn thử kịch bản Âu Cơ — bot hỏi "ngang x dài trên sổ" 5 lượt liền khi khách lờ đi, và gửi cho
khách dòng ghi chú nội bộ tiếng Anh của model ("Wait, the system prohibits…"). Đỏ khi bỏ `_o_hoi_ke` / `_bo_loi_noi_bo`."""
from aioi.engine import Conversation, Engine, _bo_markdown
from aioi.assistants import assign_assistant


def test_khong_hoi_cung_mot_o_hai_luot_lien():
    c = Conversation(user_key="k", assistant=assign_assistant("k"))
    thieu = ["kich_thuoc", "dien_tich_nha", "gia"]
    assert Engine._o_hoi_ke(c, thieu) == "kich_thuoc"
    assert Engine._o_hoi_ke(c, thieu) == "dien_tich_nha"       # khách chưa trả lời kich_thuoc → hỏi ý khác trước
    assert Engine._o_hoi_ke(c, thieu) == "kich_thuoc"          # rồi mới quay lại
    assert Engine._o_hoi_ke(c, ["gia"]) == "gia" and Engine._o_hoi_ke(c, ["gia"]) == "gia"   # còn mỗi một ô thì vẫn hỏi


def test_bo_dong_ghi_chu_noi_bo_tieng_anh():
    loi = ('Dạ không, em hiểu anh đang nói nhà mặt tiền đường Âu Cơ.\n'
           'Wait, the system prohibits "Dạ" at start. Also must not repeat user\'s words awkwardly. Rewrite.')
    ra = _bo_markdown(loi)
    assert "Wait" not in ra and "Âu Cơ" in ra
    assert _bo_markdown("Giá 16 tỷ, sổ hồng OK nha anh") == "Giá 16 tỷ, sổ hồng OK nha anh"   # chữ Anh rời trong câu Việt giữ
    assert _bo_markdown("Link: https://aioinhadat.com") == "Link: https://aioinhadat.com"
    url = "Xem tin: https://aioinhadat.com/nha-dat/ban-nha-mat-tien-au-co-quan-11-gia-16-ty"
    assert _bo_markdown(url) == url                                   # slug không dấu trong link không bị coi là ghi chú
