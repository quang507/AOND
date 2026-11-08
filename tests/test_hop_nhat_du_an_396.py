"""Test Hợp nhất nguồn dữ liệu dự án thành 1 chuẩn AOND duy nhất (SRS-5.1zzzzzzz396, 06/11/2026).

Yêu cầu:
1. Gộp thuộc tính từ moso, rever, mogi vào schema phẳng và thong_tin.thuoc_tinh.
2. Xóa bỏ nhãn nguồn riêng biệt (source = 'aond', source_url = None, specs không còn moso/rever sub-objects).
3. du_an_mua.dong_du_an không bao giờ xuất hiện chữ "(theo nguồn)" hoặc tên nguồn ngoài.
4. du_an_so_sanh đọc mượt mà từ schema hợp nhất.
"""
from __future__ import annotations

from aioi.du_an_mua import dong_du_an
from aioi.du_an_so_sanh import so_sanh_hai_du_an
from aioi.projects import dong_nguon_phu


def test_dong_du_an_khong_lo_nguon():
    du_an = {
        "name": "The Peak Garden",
        "developer": "Hưng Lộc Phát",
        "province": "Hồ Chí Minh",
        "district": "Quận 7",
        "price_min": 2800000000,
        "price_max": 6500000000,
        "specs": {
            "gia_dong": "38+ triệu/ m²",
            "tong_so_can": 919,
            "don_gia_tb_m2": 61000000,
        },
        "thong_tin": {
            "thuoc_tinh": {
                "Hỗ trợ vay ngân hàng": "Tối đa 70%",
                "Vốn tự có tối thiểu": "30%",
                "Đơn giá trung bình": "61 triệu/m²",
            },
            "tien_ich": ["Hồ bơi tràn bờ", "Công viên 4 mùa"],
        },
    }
    dong = dong_du_an(du_an)
    van = "\n".join(dong)

    assert "(theo nguồn)" not in van
    assert "rever" not in van.lower()
    assert "moso" not in van.lower()
    assert "mogi" not in van.lower()
    assert "- Khoảng giá tham khảo: 38+ triệu/ m²" in van
    assert "- Đơn giá trung bình: 61 triệu/m²" in van
    assert "- Tổng số căn: 919" in van
    assert "- Hỗ trợ vay ngân hàng: Tối đa 70%" in van


def test_dong_nguon_phu_doc_specs_phang():
    specs_phang = {
        "tong_so_can": 1050,
        "don_gia_tb_m2": 45000000,
    }
    ra = dict(dong_nguon_phu(specs_phang))
    assert ra.get("số căn") == "1050"
    assert ra.get("đơn giá trung bình") == "45 triệu/m²"


def test_so_sanh_doc_schema_hop_nhat():
    """08/11: so sánh dùng `dong_du_an` (một hàm đọc dự án) thay cho `_lay_quy_mo` / `_lay_tien_ich` riêng."""
    p1 = {
        "name": "Akari City",
        "developer": "Nam Long",
        "thong_tin": {"thuoc_tinh": {"Số block": "6", "Số tầng": "30", "Tổng số căn": "5000"}, "tien_ich": ["Hồ bơi", "Gym", "Clubhouse"]},
        "specs": {"don_gia_tb_m2": 48000000},
    }

    class Kho:
        def tra_du_an(self, ten):
            return {"khop": "ro", "du_an": p1} if "akari" in ten.lower() else {"khop": "khong"}

    class Eng:
        _convstore = Kho()

    out = so_sanh_hai_du_an(Eng(), None, "Akari City", "X")
    assert "Nam Long" in out and "48 triệu/m²" in out and "Hồ bơi" in out


def test_so_sanh_hai_du_an_khong_crash():
    class DummyEngine:
        _convstore = None

    out = so_sanh_hai_du_an(DummyEngine(), None, "Akari City", "Mizuki Park")
    assert "Akari City vs Mizuki Park" in out
    assert out.count("KHÔNG có trong kho") == 2
