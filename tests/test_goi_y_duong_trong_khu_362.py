"""SRS-5.1zzzzzzz362 — chat thật 01–02/11 (ẩn danh): "anh cần bán căn nhà cấp 4 ở nhà bè", "3 tỉ em" → bot "Nhà mình nằm đường nào vậy:
Ngô Bệ (Quận Tân Bình), Nhà Đồ, hay một đường khác ở Nhà Bè?". Lớp lỗi: khớp gần tên đường không biết (1) chữ khách gõ là tên ĐỊA BÀN, (2) khu
khách đã nói — đường quận khác thành gợi ý. Đỏ khi bỏ một trong hai bước lọc ở `TraDiaDanh._duong`."""
from aioi.dia_danh import TraDiaDanh, khoi_dia_danh


def _tra(duong, dia_danh):
    def rpc(ten, p):
        if ten == "tim_duong":
            return duong.get(p["p_ten"].lower(), [])
        if ten == "tim_dia_danh":
            return dia_danh.get(p["p_ten"].lower(), [])
        return []
    return TraDiaDanh(rpc, lambda bang, ts: [])


NGO_BE = [{"ten": "Ngô Bệ", "khoang_cach": 1, "quan_cu": ["Quận Tân Bình"], "phuong": []},
          {"ten": "Nhà Đồ", "khoang_cach": 1, "quan_cu": ["Quận 8"], "phuong": []}]


def test_ten_huyen_khong_bi_khop_thanh_ten_duong():
    t = _tra({"nhà bè": NGO_BE}, {"nhà bè": [{"loai": "quan_cu", "ten": "Huyện Nhà Bè", "khoang_cach": 0}]})
    f = {"duong": "nhà bè"}
    assert t.duong("nhà bè") is None and t.ung_vien_duong("nhà bè") == []
    k = khoi_dia_danh(t, f, "gia")
    assert "Ngô Bệ" not in k and "Nhà Đồ" not in k


def test_da_biet_quan_thi_chi_goi_y_duong_trong_quan():
    # cách nói mới: khách đã nói huyện ("nhà ở Bình Chánh, đường quach dieu"); kho chỉ có MỘT tên gần nằm ở quận khác → không gợi ý đường đó
    # (bản cũ: "có phải đường Quách Đình Bảo không" — đường Tân Phú). Hai tên ngang nhau thì đã chọn theo quận từ SRS-273.
    t = _tra({"quach dieu": [{"ten": "Quách Đình Bảo", "khoang_cach": 1, "quan_cu": ["Quận Tân Phú"], "phuong": []}]}, {})
    assert t.duong("quach dieu", "Huyện Bình Chánh") is None
    assert "Quách Đình Bảo" not in khoi_dia_danh(t, {"duong": "quach dieu", "quan": "Huyện Bình Chánh"}, "gia")
    t2 = _tra({"quach dieu": [{"ten": "Quách Điêu", "khoang_cach": 1, "quan_cu": ["Huyện Bình Chánh"], "phuong": ["Xã Vĩnh Lộc"]}]}, {})
    assert '"Quách Điêu"' in khoi_dia_danh(t2, {"duong": "quach dieu", "quan": "Huyện Bình Chánh"}, "gia")   # cùng huyện thì vẫn gợi ý
