"""18/10/2026 (SRS-5.1zzzzzzz38): câu đầu "bán nhà hẻm 4x15 quận 5, sổ hồng riêng, giá 5 tỷ 2" ra bản nháp ngay lượt đầu
(điểm 0.78 ≥ 0.55, "Quận 5" tính là có địa chỉ). Nay mỗi loại BĐS có ô bắt buộc (`blocking_fields`) trước khi soạn tin, và
`missing_fields` đưa ô đó lên để bot hỏi tiếp. Đỏ khi bỏ cổng hoặc khi "Quận 5" lại được tính là có tên đường."""
from aioi.schema import Property, co_ten_duong


def test_co_ten_duong():
    for co in ("Trần Hưng Đạo, Quận 5", "Hẻm 137 Lê Văn Sỹ, P.13, Q.3", "100/9 Nguyễn Trãi", "Đường số 5, Bình Tân",
               "đường N1 khu dân cư", "Lê Văn Sỹ quận Phú Nhuận"):
        assert co_ten_duong(co), co
    for khong in ("Quận 5", "hẻm Quận 5", "hẻm 4x15 quận 5", "Phường 5, Quận 5", "Bình Thạnh", "mặt tiền Q.7", "TP.HCM",
                  "Phường Bến Thành, Quận 1", "hẻm xe hơi quận Gò Vấp", "", None):
        assert not co_ten_duong(khong), khong


def test_ca_that_nha_pho_quan_5_chua_ra_ban_nhap():
    p = Property(loai_hinh="nha_pho", fields={"dia_chi": "hẻm Quận 5", "kich_thuoc": "4x15", "dien_tich_dat": "60m2",
                                              "gia": "5,2 tỷ", "phap_ly_hoan_cong": "sổ hồng riêng", "lo_gioi_hem": "hẻm"})
    assert p.completeness() >= 0.70  # chỉ nâng ngưỡng thì vẫn lọt — cổng theo loại mới là chỗ chặn
    assert not p.summary_ready()
    assert p.missing_fields()[:2] == ["dia_chi", "ket_cau"]
    p.update({"dia_chi": "Trần Hưng Đạo"})
    assert not p.summary_ready() and p.missing_fields()[0] == "ket_cau"
    p.update({"ket_cau": "1 trệt 2 lầu, 3PN"})
    assert p.summary_ready()


def test_chung_cu_can_ten_du_an_va_so_phong_ngu():
    p = Property(loai_hinh="chung_cu", fields={"dia_chi": "Nguyễn Hữu Thọ, Nhà Bè", "dien_tich": "70m2", "gia": "3 tỷ",
                                               "tang_toa": "tầng 12 block A", "ban_cong_view": "Đông Nam", "noi_that": "full",
                                               "phi_quan_ly": "15k/m2"})
    assert p.blocking_fields() == ["du_an", "so_phong_ngu"]
    assert not p.summary_ready()
    assert p.missing_fields().index("du_an") < p.missing_fields().index("so_phong_ngu")
    p.update({"du_an": "Sunrise City", "so_phong_ngu": "2PN 2WC"})
    assert p.summary_ready()


def test_dat_nen_can_ten_duong_va_lo_gioi_hoac_tho_cu():
    p = Property(loai_hinh="dat", fields={"dia_chi": "Xã Bình Mỹ, Huyện Củ Chi", "dien_tich": "100m2", "gia": "2 tỷ",
                                          "kich_thuoc": "5x20", "chi_tieu_xay_dung": "xây 3 tầng", "quy_hoach": "đất ở",
                                          "yeu_to_ha_tang": "không vướng"})
    assert p.blocking_fields() == ["dia_chi", "lo_gioi_duong"]
    p.update({"dia_chi": "đường Tỉnh Lộ 8", "tho_cu": "100m2"})
    assert p.blocking_fields() == [] and p.summary_ready()
    # Đất nông nghiệp ở xã không có tên đường — không chặn theo tên đường.
    assert Property(loai_hinh="dat_nong_nghiep", fields={"dia_chi": "Xã Bình Mỹ"}).blocking_fields() == []


def test_o_bat_buoc_moi_boc_duoc():
    from aioi.prompts import property_field_props
    props = property_field_props()
    for k in ("lo_gioi_duong", "tho_cu", "ket_cau", "du_an", "so_phong_ngu"):
        assert k in props, k  # ô chặn mà bộ bóc không ghi được thì bot kẹt mãi


def test_do_rong_hem_hoi_sau_khi_ra_tin():
    from aioi.prompts import build_fee_followup_system
    p = Property(loai_hinh="nha_pho", fields={"dia_chi": "Trần Hưng Đạo, Quận 5", "lo_gioi_hem": "hẻm"})
    assert "lo_gioi_hem" not in p.missing_fields()  # không hỏi trước bản nháp
    assert p.cau_hoi_sau_ra_tin() == "lo_gioi_hem"
    assert "rộng khoảng mấy mét" in build_fee_followup_system("Hằng", p)
    chua_biet = Property(loai_hinh="nha_pho", fields={})
    assert "mặt tiền hay trong hẻm" in build_fee_followup_system("Hằng", chua_biet)
    for da_ro in ("hẻm 6m", "mặt tiền", "MT"):
        q = Property(loai_hinh="nha_pho", fields={"lo_gioi_hem": da_ro})
        assert q.cau_hoi_sau_ra_tin() is None and "BỔ SUNG SAU KHI DUYỆT" not in build_fee_followup_system("Hằng", q)
    assert Property(loai_hinh="chung_cu").cau_hoi_sau_ra_tin() is None
