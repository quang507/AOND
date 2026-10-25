"""SRS-5.1zzzzzzz181–183 (chủ dự án 25/10/2026): kho tên trợ lý chỉ gồm tên "phụ âm • vần ai" có nghĩa, có chấm giữa."""
import unicodedata

from aioi.assistants import ASSISTANT_NAMES, BUYER_ASSISTANT, SELLER_ASSISTANT, assign_assistant

DUYET = ["Th•ái", "M•ai", "H•ải", "L•ai", "Kh•ải", "T•ài", "Đ•ại", "Đ•ài", "Nh•ài", "Gi•ai", "Ph•ái", "L•ài", "Ho•ài"]


def _khong_dau(t: str) -> str:
    return unicodedata.normalize("NFD", t.replace("Đ", "D").replace("đ", "d")).encode("ascii", "ignore").decode().lower()


def test_kho_dung_13_ten_co_cham_giua_khong_trung():
    assert ASSISTANT_NAMES == DUYET and len(set(ASSISTANT_NAMES)) == 13
    assert all(t.count("•") == 1 and _khong_dau(t.split("•")[1]).endswith("ai") for t in ASSISTANT_NAMES)
    assert all(t not in ASSISTANT_NAMES for t in ("Thảo", "Hương", "Linh", "Tuấn", "Thái", "Mai"))   # tên cũ / tên không chấm đã gỡ


def test_ten_mac_dinh_hai_vai_cung_co_cham_va_ten_on_dinh_theo_khach():
    assert SELLER_ASSISTANT in DUYET and BUYER_ASSISTANT in DUYET
    assert assign_assistant("x", "buyer").name == BUYER_ASSISTANT
    assert assign_assistant("zalo-abc").name == assign_assistant("zalo-abc").name
    assert {assign_assistant(f"khach-{i}").name for i in range(400)} == set(DUYET)
