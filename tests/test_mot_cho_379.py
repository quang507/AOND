"""SRS-5.1zzzzzzz379 — mỗi luật MỘT chỗ trong mỗi prompt ghép (chủ dự án 03/11: "làm … 6"). Đỏ khi luật một câu hỏi / "không hứa bán"
xuất hiện hai lần trong cùng một prompt, hoặc khối căn phía mua lại tự ghi luật một câu hỏi và tự giục mời xem mỗi lượt."""
from aioi import prompts as P
from aioi.mua import khoi_can_cho_khach
from aioi.prompts import BuyerLead
from aioi.schema import Property


def _can(code: str, gia: float) -> dict:
    return {"code": code, "id": code, "gia_vnd": gia, "loai": "nha_pho", "quan": "Quận 5", "duong": "Trần Hưng Đạo"}


def test_phieu_ban_moi_luat_mot_lan():
    s = P.build_phieu_luot("Đ•ài", Property(), "gia")
    assert s.count(P.LUAT_MOT_CAU_HOI) == 1 and s.count("không hứa bán được") == 1


def test_prompt_mua_mot_luat_mot_cau_hoi_ke_ca_khoi_can():
    s = P.build_buyer_chat_system("Đ•ài", BuyerLead(), None) + khoi_can_cho_khach([_can("A1", 5.5e9)])
    assert s.count("MỘT câu hỏi") == 1
    assert "hỏi khách muốn xem thử căn nào)" not in s and "theo luật câu mời chốt ở khối GIỌNG" in s
