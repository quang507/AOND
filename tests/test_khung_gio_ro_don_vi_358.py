"""SRS-5.1zzzzzzz358 — dữ kiện "hệ thống tự nhắn khách khi có căn mới khớp nhu cầu (trong 8–20 giờ)" đọc theo tiếng Việt là THỜI LƯỢNG ("8–20
tiếng nữa"), ý thật là KHUNG GIỜ 8h–20h. Hai persona khách ảo đều nhận "hệ thống sẽ nhắn anh trong khoảng 8–20 giờ tới" (#274). Lớp lỗi: dữ
kiện đưa model mơ hồ ĐƠN VỊ (thời điểm hay thời lượng). Cùng lớp: dòng "báo căn mới ĐÃ BẬT" ở engine ("trong giờ 8–20h"). Đỏ khi trả câu cũ."""
import re

from aioi.mua import khoi_can_cho_khach

_MO_HO = re.compile(r"trong (?:giờ )?8\s*[–-]\s*20\s*(?:giờ|h)\)")


def test_khoi_chua_co_can_noi_ro_khung_gio():
    k = khoi_can_cho_khach([])
    assert "khung giờ 8h–20h" in k and not _MO_HO.search(k)


def test_dong_bat_bao_can_moi_noi_ro_khung_gio():
    from pathlib import Path
    src = Path(__file__).resolve().parents[1].joinpath("src", "aioi", "engine.py").read_text(encoding="utf-8")
    dong = next(x for x in src.splitlines() if "hệ thống ĐÃ BẬT" in x)          # cách nói thứ hai cùng lớp: "(trong giờ 8–20h)"
    assert "khung giờ 8h–20h" in dong and not _MO_HO.search(dong)
