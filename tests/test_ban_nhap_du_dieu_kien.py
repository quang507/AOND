"""18/10/2026 (SRS-5.1zzzzzzz38 → 41): câu đầu "bán nhà hẻm 4x15 quận 5, sổ hồng riêng, giá 5 tỷ 2" ra bản nháp ngay lượt đầu
(điểm 0.78, "Quận 5" tính là có địa chỉ), rồi tin không lên web vì thiếu phường mà bot vẫn báo "đã đăng". Nay mỗi loại BĐS có ô bắt
buộc (`blocking_fields`) — tên đường / phường là ô AI bóc tách (`duong`, `phuong`), code chỉ kiểm có hay chưa. Đỏ khi bỏ cổng."""
from aioi.prompts import property_field_props
from aioi.schema import Property


def _nha(**f):
    goc = {"dia_chi": "hẻm Quận 5", "quan": "Quận 5", "kich_thuoc": "4x15", "dien_tich_dat": "60m2", "gia": "5,2 tỷ",
           "phap_ly_hoan_cong": "sổ hồng riêng", "lo_gioi_hem": "hẻm"}
    goc.update(f)
    return Property(loai_hinh="nha_pho", fields=goc)


def test_ca_that_hoi_duong_roi_phuong_roi_ket_cau():
    p = _nha()
    assert p.completeness() >= 0.65  # câu đầu đã gần ngưỡng — cổng theo loại / đủ hai diện tích mới là chỗ chặn
    assert not p.summary_ready()
    # 19/10 (SRS-5.1zzzzzzz52, theo bản anh Luận): nhà phố cần CẢ diện tích đất lẫn diện tích nhà — "60m2 đất" không đứng
    # thay diện tích nhà. Thứ tự hỏi vẫn đường → phường, rồi diện tích nhà.
    assert p.missing_fields()[:3] == ["dia_chi", "phuong", "dien_tich_nha"]
    p.update({"duong": "Trần Hưng Đạo", "dia_chi": "Trần Hưng Đạo"})
    assert not p.summary_ready() and p.missing_fields()[:2] == ["phuong", "dien_tich_nha"]
    p.update({"phuong": "Phường 1", "dia_chi": "phường 1"})
    assert not p.summary_ready() and p.missing_fields()[0] == "dien_tich_nha"
    p.update({"ket_cau": "1 trệt 2 lầu, 3PN"})
    assert not p.summary_ready() and p.missing_fields()[0] == "dien_tich_nha"   # kết cấu không thay được diện tích nhà
    p.update({"dien_tich_nha": "150m2 sàn"})
    assert p.summary_ready()


def test_khong_doan_bang_tu_khoa_tren_dia_chi():
    # dia_chi có đủ chữ nhưng AI chưa tách tên đường / phường → vẫn chặn: quyết định thuộc AI, không thuộc regex.
    p = _nha(dia_chi="123 Trần Hưng Đạo, Phường 1, Quận 5", ket_cau="3 tầng")
    assert p.blocking_fields() == ["dia_chi", "phuong"]
    p.update({"duong": "Trần Hưng Đạo", "phuong": "Phường 1"})
    assert p.blocking_fields() == [] and not p.summary_ready()   # còn thiếu diện tích nhà (SRS-5.1zzzzzzz52)
    p.update({"dien_tich_nha": "180m2"})
    assert p.summary_ready()


def test_chung_cu_can_ten_du_an_va_so_phong_ngu_phuong_lay_tu_du_an():
    p = Property(loai_hinh="chung_cu", fields={"dia_chi": "Nguyễn Hữu Thọ, Nhà Bè", "dien_tich": "70m2", "gia": "3 tỷ",
                                               "tang_toa": "tầng 12 block A", "ban_cong_view": "Đông Nam", "noi_that": "full",
                                               "phi_quan_ly": "15k/m2"})
    assert p.blocking_fields() == ["du_an", "so_phong_ngu", "phuong"]
    p.update({"du_an": "Sunrise City", "so_phong_ngu": "2PN 2WC"})
    assert p.blocking_fields() == [] and p.summary_ready()  # có dự án: phường lấy theo dự án khi ghi CRM


def test_dat_nen_can_ten_duong_va_lo_gioi_hoac_tho_cu():
    p = Property(loai_hinh="dat", fields={"dia_chi": "Xã Bình Mỹ, Huyện Củ Chi", "phuong": "xã Bình Mỹ", "dien_tich": "100m2",
                                          "gia": "2 tỷ", "kich_thuoc": "5x20", "chi_tieu_xay_dung": "xây 3 tầng",
                                          "quy_hoach": "đất ở", "yeu_to_ha_tang": "không vướng"})
    assert p.blocking_fields() == ["dia_chi", "lo_gioi_duong"]
    p.update({"duong": "Tỉnh Lộ 8", "tho_cu": "100m2"})
    assert p.blocking_fields() == [] and p.summary_ready()
    # Đất nông nghiệp ở xã không có tên đường — không chặn theo tên đường, chỉ cần phường / xã.
    assert Property(loai_hinh="dat_nong_nghiep", fields={"dia_chi": "Xã Bình Mỹ", "phuong": "Xã Bình Mỹ"}).blocking_fields() == []


def test_o_bat_buoc_boc_duoc():
    props = property_field_props()
    for k in ("duong", "phuong", "quan", "lo_gioi_duong", "tho_cu", "ket_cau", "du_an", "so_phong_ngu"):
        assert k in props, k  # ô chặn mà bộ bóc không ghi được thì bot kẹt mãi


def test_hem_va_hien_trang_hoi_truoc_ban_nhap():
    """20/10/2026 (SRS-5.1zzzzzzz81; chủ dự án: "theo anh Luận"): hẻm / mặt tiền và hiện trạng hỏi TRƯỚC bản nháp, gộp cụm với địa
    chỉ / phường và giá / pháp lý; lượt khách duyệt chỉ hỏi phí. Thay test cũ "độ rộng hẻm hỏi sau khi ra tin" (18/10)."""
    from aioi.prompts import build_fee_followup_system
    p = Property(loai_hinh="nha_pho", fields={"dia_chi": "Trần Hưng Đạo, Quận 5", "duong": "Trần Hưng Đạo"})
    thieu = p.missing_fields()
    assert "lo_gioi_hem" in thieu and "tinh_trang_ban_giao" in thieu
    assert p.cum_hoi("phuong", thieu) == ["phuong"]          # SRS-5.1zzzzzzz136: mỗi lượt một ô, không hỏi gộp
    assert p.cum_hoi("gia", thieu) == ["gia"]
    assert p.cau_hoi_sau_ra_tin() is None
    s = build_fee_followup_system("Hằng", p)
    assert "phí môi giới của tụi em chưa" in s and "BỔ SUNG SAU KHI DUYỆT" not in s
    assert Property(loai_hinh="chung_cu").cau_hoi_sau_ra_tin() is None
