"""Bộ công cụ tính Thuế & Phí chuyển nhượng và Trả góp ngân hàng (SRS-5.1zzzzzzz388; sửa 08/11/2026).

Phí công chứng một nguồn ở `phap_ly.phi_cong_chung` (TT 257/2016). Bản 06/11 chép biểu riêng trong `thue_phi` và sai hai bậc trên 10 tỷ —
test cũ khẳng định đúng con số sai (12 tỷ = 5,6 triệu; 150 tỷ = 28,2 triệu)."""
from aioi import thue_phi
from aioi.phap_ly import phi_cong_chung
from aioi.tai_chinh import dinh_dang_vay_chat, tinh_vay_tra_gop
from aioi.thue_phi import dinh_dang_thue_phi_chat, tinh_thue_phi_chuyen_nhuong


def test_phi_cong_chung_theo_tt_257_2016():
    assert phi_cong_chung(0) == 0
    assert phi_cong_chung(40_000_000) == 50_000
    assert phi_cong_chung(80_000_000) == 100_000
    assert phi_cong_chung(500_000_000) == 500_000
    assert phi_cong_chung(2_000_000_000) == 1_600_000      # 1 tr + 0,06 % × 1 tỷ
    assert phi_cong_chung(4_000_000_000) == 2_700_000      # 2,2 tr + 0,05 % × 1 tỷ
    assert phi_cong_chung(6_000_000_000) == 3_600_000      # 3,2 tr + 0,04 % × 1 tỷ
    assert phi_cong_chung(12_000_000_000) == 5_800_000     # 5,2 tr + 0,03 % × 2 tỷ
    assert phi_cong_chung(150_000_000_000) == 42_200_000   # 32,2 tr + 0,02 % × 50 tỷ
    assert phi_cong_chung(600_000_000_000) == 70_000_000   # trần 70 tr


def test_thue_phi_khong_chep_bieu_cong_chung_rieng():
    assert not hasattr(thue_phi, "tinh_phi_cong_chung")
    assert tinh_thue_phi_chuyen_nhuong(12_000_000_000)["phi_cong_chung"] == phi_cong_chung(12_000_000_000)


def test_tinh_thue_phi_chuyen_nhuong_thong_thuong_va_can_duy_nhat():
    kq = tinh_thue_phi_chuyen_nhuong(6_000_000_000, can_duy_nhat=False)
    assert kq["thue_tncn"] == 120_000_000
    assert kq["le_phi_truoc_ba"] == 30_000_000
    assert kq["phi_cong_chung"] == 3_600_000
    assert kq["phi_dang_bo"] == 2_000_000
    assert kq["tong_ben_ban"] == 120_000_000
    assert kq["tong_ben_mua"] == 35_600_000
    assert kq["tong_chi_phi"] == 155_600_000
    kq_mien = tinh_thue_phi_chuyen_nhuong(6_000_000_000, can_duy_nhat=True)
    assert kq_mien["thue_tncn"] == 0 and kq_mien["tong_chi_phi"] == 35_600_000


def test_dinh_dang_thue_phi_la_so_lieu_khong_phai_cau_gui_khach():
    chat = dinh_dang_thue_phi_chat(6_000_000_000)
    assert "6 tỷ" in chat and "120 triệu" in chat and "30 triệu" in chat and "3,6 triệu" in chat and "155,6 triệu" in chat
    assert "Bên bán" in chat and "Bên mua" in chat
    assert not chat.startswith("Dạ")


def test_tinh_vay_tra_gop_ngan_hang():
    vay = tinh_vay_tra_gop(10_000_000_000, ty_le_vay=0.7, so_nam=20, lai_suat_nam=7.5)
    assert vay["von_tu_co"] == 3_000_000_000
    assert vay["so_tien_vay"] == 7_000_000_000
    assert vay["so_thang"] == 240
    assert vay["goc_hang_thang"] == 29_166_667
    assert vay["lai_thang_dau"] == 43_750_000
    assert vay["tong_thang_dau"] == 72_916_667


def test_vay_ty_le_dang_phan_tram_va_kep():
    assert tinh_vay_tra_gop(10_000_000_000, ty_le_vay=70)["so_tien_vay"] == 7_000_000_000
    assert tinh_vay_tra_gop(10_000_000_000, ty_le_vay=1.0)["ty_le_vay"] == 0.9
    assert tinh_vay_tra_gop(10_000_000_000, so_nam=0)["so_thang"] == 12


def test_dinh_dang_vay_chat():
    chat = dinh_dang_vay_chat(10_000_000_000, ty_le_vay=0.7, so_nam=20, lai_suat_nam=7.5)
    assert "10 tỷ" in chat and "3 tỷ" in chat and "7 tỷ" in chat
    assert "29,2 triệu" in chat and "43,8 triệu" in chat and "72,9 triệu" in chat
    assert "dư nợ giảm dần" in chat and "cao nhất" not in chat and not chat.startswith("Dạ")
