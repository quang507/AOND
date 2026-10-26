"""SRS-5.1zzzzzzz52: nhà có đất riêng (nhà phố / biệt thự / cấp 4) cần CẢ diện tích đất lẫn diện tích nhà — theo bản anh Luận.

Lớp lỗi: bí danh trong `_has` + đồng bộ dien_tich ↔ dien_tich_dat cho MỘT con số đứng thay cả hai ô, nên nhà phố ra bản nháp khi
chưa biết diện tích nhà, và con số khách chưa nói là đất hay nhà bị tự gán thành diện tích đất.
"""
from aioi.prompts import build_chat_system
from aioi.schema import Property

_DU = {"dia_chi": "146 Trần Bình Trọng", "duong": "Trần Bình Trọng", "phuong": "Phường 2", "gia": "10 tỷ",
       "ket_cau": "1 trệt 2 lầu", "lo_gioi_hem": "hẻm 4m", "phap_ly_hoan_cong": "sổ hồng", "tinh_trang_ban_giao": "trống"}


def test_chi_dien_tich_dat_thi_van_hoi_tiep_dien_tich_nha():
    # SRS-5.1zzzzzzz200: diện tích nhà không còn chặn bản nháp, nhưng vẫn nằm trong danh sách hỏi tiếp.
    p = Property(loai_hinh="nha_pho", fields={**_DU, "dien_tich_dat": "60m2"})
    assert p.summary_ready() and "dien_tich_nha" in p.missing_fields()
    p.update({"dien_tich_nha": "150m2"})
    assert "dien_tich_nha" not in p.missing_fields()


def test_mot_con_so_mo_ho_khong_tu_thanh_dien_tich_dat():
    p = Property(loai_hinh="biet_thu", fields=dict(_DU))
    p.update({"dien_tich": "200m2"})
    assert p.fields.get("dien_tich_dat") is None   # con số mơ hồ không tự thành diện tích đất (SRS-52, vẫn đúng)
    assert {"dien_tich_dat", "dien_tich_nha"} <= set(p.missing_fields())


def test_kich_thuoc_van_tinh_ra_dien_tich_dat():
    p = Property(loai_hinh="nha_pho", fields=dict(_DU))
    p.update({"dien_tich": "4x15"})
    assert p.fields.get("dien_tich_dat") == "60m2" and "dien_tich" not in p.fields   # "4x15" là kích thước, không mơ hồ


def test_khong_hoi_lai_con_so_da_ro_la_dat():
    p = Property(loai_hinh="nha_pho", fields={**_DU, "dien_tich": "80m2"})
    assert "CHƯA RÕ là diện tích ĐẤT hay" in build_chat_system("Linh", p, "dien_tich_dat")
    p.update({"dien_tich_dat": "80 m2"})                  # khách vừa nói "80m2 đó là đất"
    he = build_chat_system("Linh", p, "dien_tich_nha")
    assert "CHƯA RÕ là diện tích ĐẤT hay" not in he and "diện tích nhà" in he


def test_chung_cu_van_mot_dien_tich():
    p = Property(loai_hinh="chung_cu", fields={"dien_tich": "70m2"})
    assert p._has("dien_tich") and "dien_tich_nha" not in p.expected_fields()
