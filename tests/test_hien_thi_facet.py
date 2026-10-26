"""26/10/2026 (SRS-5.1zzzzzzz194; chủ dự án: "đổi các hàm để test như bên AOND của anh Luận, /state"): `Property.by_facet()` gom ô đã bóc tách theo
mặt người đọc hiểu ngay — chỉ để hiển thị, KHÔNG đổi luật hỏi. Đỏ khi ô lạ mất, ô nội bộ (`_…`) lộ ra, hoặc facet rỗng vẫn in."""
from aioi.schema import Property, facet_of


def _prop() -> Property:
    p = Property(loai_hinh="nha_pho")
    p.fields.update({"duong": "Hoàng Hoa Thám", "phuong": "Phường Gia Định", "mat_tien": "5,2m", "ket_cau": "3 tầng kiên cố",
                     "phap_ly_hoan_cong": "sổ hồng hoàn công", "gia": "12,5 tỷ", "thuong_luong": "nhẹ",
                     "ghi_chu_la": "có sân thượng", "_cap_nhat": "x", "dien_tich_nha": ""})
    return p


def test_by_facet_gom_dung_nhom_va_giu_o_la():
    kq = {fid: (label, b) for fid, label, b in _prop().by_facet()}
    assert kq["vi_tri"][0] == "Vị trí" and set(kq["vi_tri"][1]) == {"duong", "phuong"}
    assert set(kq["dat"][1]) == {"mat_tien"} and set(kq["cong_trinh"][1]) == {"ket_cau"}
    assert set(kq["phap_ly"][1]) == {"phap_ly_hoan_cong"} and set(kq["gia_tm"][1]) == {"gia", "thuong_luong"}
    assert kq["khac"] == ("Khác", {"ghi_chu_la": "có sân thượng"})          # ô lạ không bị bỏ


def test_o_noi_bo_va_o_rong_khong_hien_thi_va_facet_rong_khong_in():
    ten = [fid for fid, _, _ in _prop().by_facet()]
    assert "vi_the" not in ten                                                  # không có ô nào → không in facet
    tat_ca = {k for _, _, b in _prop().by_facet() for k in b}
    assert "_cap_nhat" not in tat_ca and "dien_tich_nha" not in tat_ca
    assert facet_of("khong_biet") == "khac" and facet_of("gia") == "gia_tm"
