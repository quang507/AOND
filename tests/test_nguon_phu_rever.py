"""SRS-5.1zzzzzzz324 (chủ dự án 02/11/2026 chọn crawl Rever theo luật mogi để làm giàu kho dự án). Dữ kiện Rever nằm ở `specs.rever` của
CHÍNH dòng `projects` (một kho). Đỏ khi: bot không đọc `specs.rever`; nguồn phụ đè nguồn chính (mogi / nhập tay); giá rao gộp mất số tin /
ngày lấy (model sẽ nói như giá chốt); tên nguồn lộ ra lời khách; ô rỗng thành dòng dữ kiện."""
from aioi import du_an_mua
from aioi.projects import dong_nguon_phu, project_from_row

REVER = {"url": "https://rever.vn/du-an/la-pura", "ngay": "2026-11-02", "khoang_gia": "46.77 - 62.5 triệu/ m²",
         "du_kien": {"số block": "4", "số căn": "1,500", "tổng diện tích": "17,000 m²", "loại hình": ""},
         "gia_rao_ban": {"so_tin": 18, "tr_m2_thap": 45.2, "tr_m2_giua": 56.5, "tr_m2_cao": 62.5}}
DONG = {"id": "p9", "name": "La Pura", "developer": "Phát Đạt", "province": "Bình Dương", "district": "Thuận An",
        "specs": {"tong_dien_tich": "1,7 ha", "rever": REVER}, "amenities": [], "unit_types": []}


def test_cap_nguon_phu_co_so_tin_va_ngay():
    d = dict(dong_nguon_phu(DONG["specs"]))
    assert d["số block"] == "4" and "loại hình" not in d          # ô rỗng không thành dữ kiện
    assert d["khoảng giá tham khảo"].startswith("46.77")
    assert "45,2–62,5 triệu/m²" in d["giá rao bán thị trường"] and "18 tin" in d["giá rao bán thị trường"]
    assert "2026-11-02" in d["giá rao bán thị trường"]


def test_khong_co_rever_thi_rong():
    assert dong_nguon_phu({}) == [] and dong_nguon_phu(None) == [] and dong_nguon_phu({"rever": "x"}) == []


def test_phia_mua_doc_rever_khong_lo_ten_nguon_khong_lap_dien_tich():
    dong = du_an_mua.dong_du_an(DONG)
    van = "\n".join(dong)
    assert "- Số block: 4" in van and "Giá rao bán thị trường" in van
    assert "rever" not in van.lower()
    assert sum("Tổng diện tích" in x for x in dong) == 1 and "- Tổng diện tích: 1,7 ha" in van   # nguồn chính thắng


def test_phia_ban_nguon_phu_khong_de_nguon_chinh():
    p = project_from_row(DONG)
    assert p.goc["tổng diện tích"] == "1,7 ha"
    assert p.goc["số căn"] == "1,500" and "giá rao bán thị trường" in p.goc
    assert "rever" not in " ".join(p.goc.values()).lower()
