"""Kiểm tra bộ công cụ tính Thuế & Phí chuyển nhượng và Trả góp ngân hàng (SRS-5.1zzzzzzz388)."""
from aioi.tai_chinh import dinh_dang_vay_chat, tinh_vay_tra_gop
from aioi.thue_phi import dinh_dang_thue_phi_chat, tinh_phi_cong_chung, tinh_thue_phi_chuyen_nhuong


def test_tinh_phi_cong_chung_theo_tt_257_2016():
    assert tinh_phi_cong_chung(0) == 0
    assert tinh_phi_cong_chung(40_000_000) == 50_000
    assert tinh_phi_cong_chung(80_000_000) == 100_000
    assert tinh_phi_cong_chung(500_000_000) == 500_000
    # 2 tỷ: 1 triệu + 0.06% của 1 tỷ = 1.600.000 đ
    assert tinh_phi_cong_chung(2_000_000_000) == 1_600_000
    # 4 tỷ: 2.2 triệu + 0.05% của 1 tỷ = 2.700.000 đ
    assert tinh_phi_cong_chung(4_000_000_000) == 2_700_000
    # 6 tỷ: 3.2 triệu + 0.04% của 1 tỷ = 3.600.000 đ
    assert tinh_phi_cong_chung(6_000_000_000) == 3_600_000
    # 12 tỷ: 5.2 triệu + 0.02% của 2 tỷ = 5.600.000 đ
    assert tinh_phi_cong_chung(12_000_000_000) == 5_600_000
    # 150 tỷ: 23.2 triệu + 0.01% của 50 tỷ = 28.200.000 đ
    assert tinh_phi_cong_chung(150_000_000_000) == 28_200_000
    # 600 tỷ: vượt 70 triệu -> trần 70 triệu
    assert tinh_phi_cong_chung(600_000_000_000) == 70_000_000


def test_tinh_thue_phi_chuyen_nhuong_thong_thuong_va_can_duy_nhat():
    # Căn 6 tỷ thông thường
    kq = tinh_thue_phi_chuyen_nhuong(6_000_000_000, can_duy_nhat=False)
    assert kq["thue_tncn"] == 120_000_000
    assert kq["le_phi_truoc_ba"] == 30_000_000
    assert kq["phi_cong_chung"] == 3_600_000
    assert kq["phi_dang_bo"] == 2_000_000
    assert kq["tong_ben_ban"] == 120_000_000
    assert kq["tong_ben_mua"] == 35_600_000
    assert kq["tong_chi_phi"] == 155_600_000

    # Căn 6 tỷ - nhà duy nhất (miễn TNCN)
    kq_mien = tinh_thue_phi_chuyen_nhuong(6_000_000_000, can_duy_nhat=True)
    assert kq_mien["thue_tncn"] == 0
    assert kq_mien["tong_ben_ban"] == 0
    assert kq_mien["tong_ben_mua"] == 35_600_000
    assert kq_mien["tong_chi_phi"] == 35_600_000


def test_dinh_dang_thue_phi_chat():
    chat = dinh_dang_thue_phi_chat(6_000_000_000)
    assert "6 tỷ" in chat
    assert "120.000.000 đ" in chat
    assert "30.000.000 đ" in chat
    assert "3.600.000 đ" in chat
    assert "155.600.000 đ" in chat
    assert "Bên bán" in chat and "Bên mua" in chat


def test_tinh_vay_tra_gop_ngan_hang():
    # Căn 10 tỷ, vay 70%, 20 năm, lãi 7.5%/năm
    vay = tinh_vay_tra_gop(10_000_000_000, ty_le_vay=0.7, so_nam=20, lai_suat_nam=7.5)
    assert vay["von_tu_co"] == 3_000_000_000
    assert vay["so_tien_vay"] == 7_000_000_000
    assert vay["so_thang"] == 240
    assert vay["goc_hang_thang"] == 29_166_667
    assert vay["lai_thang_dau"] == 43_750_000
    assert vay["tong_thang_dau"] == 72_916_667


def test_dinh_dang_vay_chat():
    chat = dinh_dang_vay_chat(10_000_000_000, ty_le_vay=0.7, so_nam=20, lai_suat_nam=7.5)
    assert "10 tỷ" in chat
    assert "3.000.000.000 đ" in chat
    assert "7.000.000.000 đ" in chat
    assert "29.166.667 đ" in chat
    assert "43.750.000 đ" in chat
    assert "72.916.667 đ" in chat
    assert "dư nợ giảm dần" in chat
