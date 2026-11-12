"""SRS-5.1zzzzzzz450 — luật "khách đáp chưa chọn" có trong cả ba prompt phía bán (một nguồn)."""
from aioi import prompts
from aioi.schema import Property


def test_luat_trong_ba_prompt():
    assert "KHÁCH ĐÁP CHƯA CHỌN" in prompts.LUAT_DAP_CHUA_CHON
    assert prompts.LUAT_DAP_CHUA_CHON in prompts.LEAN_SYSTEM_PROMPT
    assert prompts.LUAT_DAP_CHUA_CHON in prompts.phieu_co_dinh("Ngọc")
    he = prompts.build_fee_followup_system("Ngọc", Property())
    assert prompts.LUAT_DAP_CHUA_CHON in he.split(prompts.RANH_GIOI_CACHE)[0]


def test_thue_phi_mot_cau():
    assert "MỘT câu" in prompts.cau_hoi_o("thue_phi", None)
