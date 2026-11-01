"""29/10/2026 (SRS-5.1zzzzzzz277). Chủ dự án: "còn văn thì hay chat thì ổn vui vẻ rồi hả". Soát 61 lời bot gửi khách thật 72 giờ: phía bán
không còn "Dạ", có cảm thán; phía mua mở 5 lượt bằng cùng khuôn khen cách nói ("Em nêu rõ … nên anh dễ lọc hơn nè"), xen giữa là lượt gợi
căn — lưới lặp mở đầu chỉ so một lượt trước nên lọt; prompt mua còn tự gợi ý khen "cách nêu rõ". Mỗi ca đỏ khi gỡ bản sửa."""
from aioi.prompts import build_buyer_chat_system
from aioi.schema import BuyerLead


def test_prompt_mua_khong_goi_y_khen_cach_noi():
    s = build_buyer_chat_system("Lan", BuyerLead(), "ngan_sach")
    assert "cách nêu rõ (khu vực" not in s
    assert "Đừng khen CÁCH khách nói" in s
