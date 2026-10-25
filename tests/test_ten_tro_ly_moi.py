"""SRS-5.1zzzzzzz181/182 (chủ dự án 25/10/2026): kho tên trợ lý chỉ còn 10 tên dạng phụ âm + "ai" — thêm hay bớt dấu vẫn có nghĩa."""
import unicodedata

from aioi.assistants import ASSISTANT_NAMES, BUYER_ASSISTANT, SELLER_ASSISTANT, assign_assistant

MOI = ["Thái", "Mai", "Hải", "Lai", "Khải", "Tài", "Đại", "Đài", "Nhài", "Giai"]


def _khong_dau(t: str) -> str:
    return unicodedata.normalize("NFD", t.replace("Đ", "D").replace("đ", "d")).encode("ascii", "ignore").decode().lower()


def test_kho_chi_con_10_ten_ai_khong_trung():
    assert ASSISTANT_NAMES == MOI and len(set(ASSISTANT_NAMES)) == 10
    assert all(_khong_dau(t).endswith("ai") for t in ASSISTANT_NAMES)       # mọi tên đều có "ai" phía sau
    assert all(t not in ASSISTANT_NAMES for t in ("Thảo", "Hương", "Linh", "Tuấn", "Khang"))


def test_ten_mac_dinh_hai_vai_cung_co_ai_va_ten_on_dinh_theo_khach():
    assert SELLER_ASSISTANT in MOI and BUYER_ASSISTANT in MOI
    assert assign_assistant("x", "buyer").name == BUYER_ASSISTANT
    assert assign_assistant("zalo-abc").name == assign_assistant("zalo-abc").name
    assert {assign_assistant(f"khach-{i}").name for i in range(300)} == set(MOI)
