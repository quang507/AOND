"""SRS-5.1zzzzzzz357 — khách ảo 02/11 (vòng sau đóng gói), HAI persona khác nhau nhận cùng một câu và CẢ HAI tự ghi là chỗ không hiểu:
khách 4 (nhà đầu tư) "Khi có căn khớp, hệ thống sẽ nhắn anh trong khoảng 8–20 giờ tới."; khách 5 (thuê) "Có phòng mới khớp thì hệ thống
sẽ nhắn em trong khoảng 8–20 giờ tới." Giám khảo xếp cả hai mức "nặng" (hứa suông / bịa).

Gốc KHÔNG phải model nói sai: `mua.khoi_can_cho_khach` đưa dữ kiện "(trong 8–20 giờ)". Tiếng Việt đọc "trong 8–20 giờ" là KHOẢNG THỜI
LƯỢNG (8 đến 20 tiếng nữa), còn ý thật là KHUNG GIỜ ĐỒNG HỒ 8h–20h — đúng điều mọi chỗ khác trong lõi viết rõ: `bao_can_moi` "chỉ chạy
trong khung 8–20 giờ (giờ Việt Nam)", `engine` "(trong giờ 8–20h)". Model chuyển đúng điều prompt nói, nên thành một cam kết thời hạn bịa.

(1) Lớp lỗi: một dữ kiện đưa cho model bị viết mơ hồ về ĐƠN VỊ (thời điểm / thời lượng), nên bot nói thành điều hệ thống không hứa.
(2) Chỗ khác cùng lớp: soát mọi chỗ "8–20" trong lõi — `engine.py` (có chữ "giờ" trước khoảng: rõ), `bao_can_moi` / `giu_ket_noi` /
`gui_nhac` / `hoi_con_ban` / `server` / `cau_mau` đều là chú thích hoặc có chữ "khung"; CHỈ dòng `mua.py` này vào prompt mà thiếu mốc.
(3) Ca chờ (xfail strict): sửa ở lõi là việc phiên lõi — viết rõ khung giờ đồng hồ. XPASS cũng đỏ: dấu nhắc gỡ xfail khi bản sửa về.
"""
import re

import pytest

from aioi import mua

# "trong 8–20 giờ" / "trong 8-20 giờ" / "trong khoảng 8–20 giờ": đọc được thành THỜI LƯỢNG vì không có mốc đồng hồ ("giờ"/"h" TRƯỚC khoảng).
THOI_LUONG = re.compile(r"trong\s+(?:khoảng\s+)?\d{1,2}\s*[–-]\s*\d{1,2}\s*(?:giờ|h)\b")


def _khoi_khong_co_can() -> str:
    return mua.khoi_can_cho_khach([])


def test_khoi_nay_that_su_hua_bao_lai():
    """Chốt tiền đề: khối lượt "chưa có căn nào" đúng là chỗ cho phép bot nói sẽ nhắn lại."""
    k = _khoi_khong_co_can()
    assert "nhắn" in k and "căn mới khớp" in k


def test_cac_cho_khac_trong_loi_viet_ro_khung_gio():
    """Chốt tiền đề thứ hai: cách viết rõ đã có sẵn trong lõi, nên đây là lệch một chỗ, không phải quy ước chung."""
    import inspect

    from aioi import bao_can_moi, engine
    assert "trong giờ 8–20h" in inspect.getsource(engine)          # có mốc đồng hồ
    assert "khung 8–20 giờ" in inspect.getsource(bao_can_moi)      # có chữ "khung"


def test_du_kien_khong_doc_thanh_thoi_luong():
    k = _khoi_khong_co_can()
    lo = THOI_LUONG.findall(k)
    assert not lo, f"dữ kiện đưa model đọc được thành thời lượng: {lo} — phải ghi rõ khung giờ đồng hồ (8h–20h)"
