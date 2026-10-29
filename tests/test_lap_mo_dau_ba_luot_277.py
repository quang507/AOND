"""29/10/2026 (SRS-5.1zzzzzzz277). Chủ dự án: "còn văn thì hay chat thì ổn vui vẻ rồi hả". Soát 61 lời bot gửi khách thật 72 giờ: phía bán
không còn "Dạ", có cảm thán; phía mua mở 5 lượt bằng cùng khuôn khen cách nói ("Em nêu rõ … nên anh dễ lọc hơn nè"), xen giữa là lượt gợi
căn — lưới lặp mở đầu chỉ so một lượt trước nên lọt; prompt mua còn tự gợi ý khen "cách nêu rõ". Mỗi ca đỏ khi gỡ bản sửa."""
from aioi.engine import Turn
from aioi.prompts import build_buyer_chat_system
from aioi.schema import BuyerLead
from tests.test_doc_y_khach import _eng


def test_lap_mo_dau_cach_hai_luot_goi_lai_model():
    eng, spy = _eng({"operations": [], "user_intent": "sell"})
    c = eng.conversation("lap277")
    c.role = "seller"
    c.history += [
        Turn("assistant", "Em nêu rõ ba điều là yên tĩnh, gần chợ nên anh dễ lọc căn hơn nè. Nhà mình gồm những ai sẽ ở?", 0.0),
        Turn("user", "nhà có ông bà", 0.0),
        Turn("assistant", "Quận 5 sát quận 1 nên đi làm thuận đường. Khi nào tiện đi xem nhà?", 0.0),
        Turn("user", "cần sàn 60m2 trở lên", 0.0),
    ]
    spy.loi = ["Em nêu rõ mốc 60 m² sàn nên anh dễ đối chiếu nè.", "Mốc 60 m² sàn là đủ rộng cho ba thế hệ."]
    spy.chat = lambda system, messages, **k: spy.systems.append(system) or spy.loi.pop(0)
    eng.handle("lap277", "nhà có thang máy càng tốt")
    assert any("cùng mấy chữ" in s for s in spy.systems[-1:]), spy.systems[-1:]
    assert c.history[-1].content == "Mốc 60 m² sàn là đủ rộng cho ba thế hệ."


def test_prompt_mua_khong_goi_y_khen_cach_noi():
    s = build_buyer_chat_system("Lan", BuyerLead(), "ngan_sach")
    assert "cách nêu rõ (khu vực" not in s
    assert "Đừng khen CÁCH khách nói" in s
