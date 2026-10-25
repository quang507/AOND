"""SRS-5.1zzzzzzz181 (chủ dự án 25/10/2026): thêm 10 tên có nghĩa vào cạnh kho tên cũ — chỉ đúng danh sách chủ dự án duyệt."""
from aioi.assistants import ASSISTANT_NAMES, assign_assistant

MOI = ["Thái", "Mai", "Hải", "Lai", "Khải", "Tài", "Đại", "Đài", "Nhài", "Giai"]


def test_kho_ten_co_du_ten_moi_khong_trung_va_giu_ten_cu():
    assert len(ASSISTANT_NAMES) == 30 and len(set(ASSISTANT_NAMES)) == 30
    assert all(t in ASSISTANT_NAMES for t in MOI)
    assert all(t in ASSISTANT_NAMES for t in ("Thảo", "Hương", "Tuấn", "Toàn"))


def test_ten_van_on_dinh_theo_khach_va_ten_moi_co_luc_duoc_chon():
    assert assign_assistant("zalo-abc").name == assign_assistant("zalo-abc").name
    chon = {assign_assistant(f"khach-{i}").name for i in range(400)}
    assert set(MOI) <= chon
