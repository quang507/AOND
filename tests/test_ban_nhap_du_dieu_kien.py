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
    # 26/10 (SRS-5.1zzzzzzz200, theo anh Luận): "đủ rao" = loại hình + vị trí + giá. Câu đầu đã có cả ba nên ra bản nháp ngay;
    # phường / diện tích nhà / kết cấu không chặn nữa, chỉ được hỏi tiếp (phường trước, vì tin cần phường mới lên web).
    assert p.minimal_missing() == [] and p.summary_ready()     # SRS-202: đủ sàn tối thiểu + chỉ trống 1 facet chính (quy mô xây dựng)
    assert p.missing_fields()[:2] == ["dia_chi", "dien_tich_nha"]   # "hẻm Quận 5" chưa có tên đường → hỏi tên đường, rồi facet còn trống
    # thiếu giá hoặc vị trí → chưa rao, và hai ô đó luôn đứng đầu danh sách hỏi
    q = Property(loai_hinh="nha_pho", fields={"dia_chi": "Trần Hưng Đạo", "duong": "Trần Hưng Đạo", "dien_tich_dat": "60m2"})
    assert not q.summary_ready() and q.missing_fields()[0] == "gia"
    r = Property(loai_hinh="nha_pho", fields={"gia": "5 tỷ"})
    assert not r.summary_ready() and r.missing_fields()[0] == "dia_chi"
    p.update({"duong": "Trần Hưng Đạo", "dia_chi": "Trần Hưng Đạo"})
    assert p.summary_ready() and p.missing_fields()[0] == "dien_tich_nha" and "phuong" in p.missing_fields()


def test_khong_doan_bang_tu_khoa_tren_dia_chi():
    # dia_chi có đủ chữ nhưng AI chưa tách tên đường / phường → vẫn chặn: quyết định thuộc AI, không thuộc regex.
    p = _nha(dia_chi="123 Trần Hưng Đạo, Phường 1, Quận 5", ket_cau="3 tầng")
    assert p.blocking_fields() == ["dia_chi", "phuong"]
    p.update({"duong": "Trần Hưng Đạo", "phuong": "Phường 1"})
    assert p.blocking_fields() == [] and p.summary_ready()   # SRS-5.1zzzzzzz200: diện tích nhà không còn chặn bản nháp


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
