"""SRS-5.1zzzzzzz358 — dữ kiện "hệ thống tự nhắn khách khi có căn mới khớp nhu cầu (trong 8–20 giờ)" đọc theo tiếng Việt là THỜI LƯỢNG ("8–20
tiếng nữa"), ý thật là KHUNG GIỜ 8h–20h (#274, ca đỏ chính ở `test_khung_gio_8_20_357.py`). Bài này thêm cách viết khác cùng lớp: không số
"8-20" gạch thường, không "8 đến 20 giờ" — chỉ khung giờ có mốc đồng hồ. Đỏ khi trả câu cũ."""
import re

from aioi.mua import khoi_can_cho_khach

_MO_HO = re.compile(r"trong\s+(?:khoảng\s+)?\d{1,2}\s*(?:[–-]|đến)\s*\d{1,2}\s*(?:giờ|h|tiếng)\b")


def test_khoi_chua_co_can_noi_ro_khung_gio():
    k = khoi_can_cho_khach([])
    assert "khung giờ 8h–20h" in k and not _MO_HO.search(k)
    assert not _MO_HO.search("trong khung giờ 8h–20h") and _MO_HO.search("trong 8 đến 20 tiếng")   # cách nói mới: "8 đến 20 tiếng"
