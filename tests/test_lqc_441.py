"""SRS-5.1zzzzzzz441 — LQC: câu đáp dài vào đúng ô bot vừa hỏi; so sánh không khoá cả ngày khi tin chưa có toạ độ."""
from aioi.engine import _gia_tri_la_cau

CAU = "trước nhà vỉa hè rộng, đậu được 3 4 xe máy, ô tô thì đậu tạm"


def test_dap_cau_bot_vua_hoi_giu_ca_cau():
    assert _gia_tri_la_cau("cho_dau_xe", CAU, CAU, dap_cau_hoi=True) is None


def test_khong_dap_cau_hoi_van_bo_nguyen_cau():
    assert _gia_tri_la_cau("cho_dau_xe", CAU, CAU) is not None


def test_cau_hoi_van_bo():
    assert _gia_tri_la_cau("cho_dau_xe", "đậu xe sao em?", "đậu xe sao em?", dap_cau_hoi=True) is not None
