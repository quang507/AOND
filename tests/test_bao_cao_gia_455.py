"""SRS-5.1zzzzzzz455 — LQC 4.6: link báo cáo giá rao chỉ mời khi đủ mẫu đơn giá; mã tin lấy từ UUID."""
from aioi import so_sanh


def test_du_mau_thi_moi():
    kq = {"ma_tin": "56F988C9", "don_gia": {"n": 5}, "dang_rao": []}
    assert "/bao-cao-gia/56F988C9" in so_sanh.dong_bao_cao(kq)


def test_thieu_mau_thi_khong():
    assert so_sanh.dong_bao_cao({"ma_tin": "56F988C9", "don_gia": {"n": 2}}) == ""
    assert so_sanh.dong_bao_cao({"don_gia": {"n": 9}}) == ""
