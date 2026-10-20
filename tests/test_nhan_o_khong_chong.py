"""20/10/2026 (SRS-5.1zzzzzzz86). Bắn thử lần 1–3: một cụm khách nói vào ô sai nghĩa — "7 tầng" vào cả ô số phòng ngủ, "phí quản lý
khoảng 1,2 triệu" vào cả ô giá điện nước. Gốc ở schema của mình: nhãn ô (cũng là mô tả ô trong schema lượt lập thao tác) chồng
nghĩa — `ket_cau` "kết cấu (số lầu, phòng ngủ)" / `so_phong_ngu`; `gia_dien_nuoc` "…và chi phí dịch vụ" / `phi_quan_ly` "phí quản lý
dịch vụ". Nhãn nay nói rõ ranh giới. Phần trước dấu ngoặc là chữ gửi bộ đọc thông số DB (SRS-5.1zzzzzzz85): `so_phong_ngu` giữ nguyên,
`gia_dien_nuoc` ngắn lại thành "giá điện nước" — đã gọi `boc_thong_so('giá điện nước: x')` trên DB 20/10: {} (không tự bật cột)."""
from aioi.prompts import FIELD_LABELS, operations_schema


def _mo_ta(o):
    return operations_schema()["properties"]["operations"]["items"]["properties"]["fields"]["properties"][o]["description"]


def test_mo_ta_o_noi_ro_ranh_gioi():
    assert "kết cấu" in _mo_ta("so_phong_ngu") and "tầng" in _mo_ta("so_phong_ngu")
    assert "phí quản lý" in _mo_ta("gia_dien_nuoc")
    assert "dịch vụ" not in _mo_ta("gia_dien_nuoc")


def test_chu_truoc_ngoac_khong_doi():
    # supabase_store._thong_so gửi DB "nhãn trước ngoặc: giá trị" — đổi phần này là đổi chữ bộ đọc thông số DB thấy; đổi thì soát lại
    # boc_thong_so('<nhãn>: x') trên DB.
    assert FIELD_LABELS["so_phong_ngu"].split(" (")[0] == "số phòng ngủ và WC"
    assert FIELD_LABELS["gia_dien_nuoc"].split(" (")[0] == "giá điện nước"
