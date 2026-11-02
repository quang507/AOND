"""SRS-5.1zzzzzzz350 — chấm 02/11: kịch bản `cao_lo` lượt 8, lưới `goi_minh` bắt oan câu "viết theo ý mình" (sở hữu của người nghe, đúng luật)
nên tiêu LƯỢT GỌI LẠI DUY NHẤT; bản viết lại thêm "4 tầng" (số chủ nhà không nói) và KHÔNG được soát lại, nên số bịa ra tới khách.
Lớp lỗi: `_soat_hinh_thuc` soát → gọi lại → NHẬN bản mới mà không soát vòng hai, nên mọi luật `ly_do` chỉ bảo vệ được bản ĐẦU.
Chỗ khác cùng lớp: mọi dòng `ly_do` trong `LUAT_SOAT` (số bịa, tiêu đề thiếu giá, phí sai vai…) đều mất hiệu lực trên bản viết lại.
Ca chờ (xfail strict): sửa ở lõi là việc của phiên bot — chạm được bằng cách soát lại bản viết lại, hoặc gạt phép bắt oan khỏi `ly_do`.
XPASS cũng là đỏ: nhắc gỡ dấu xfail khi bản sửa về."""
import pytest

from aioi.engine import Engine, Turn, _goi_khach_la_minh, _so_khong_co_trong_tin

# Lời ĐẦU: hợp luật (CLAUDE.md cấm "mình" ĐẠI TỪ NGÔI HAI; "theo ý mình" là sở hữu của chính người nghe) — nhưng lưới vẫn gắn.
LOI_DAU = "Anh cứ viết theo ý mình, em sửa lại tin cho khớp nha anh."
# Bản VIẾT LẠI: bản tin thêm "4 tầng" — chủ nhà chỉ nói "1 trệt 3 lầu", không nói số tầng.
VIET_LAI = ("📋 Bản tin cập nhật:\n\nNhà hẻm Cao Lỗ, Quận 8, 10 tỷ\n\nNhà 1 trệt 3 lầu, 4 tầng xây kiên cố, diện tích 80m².\n\nNhắn Zalo nha!")


class _Spy:
    def __init__(self):
        self.systems: list[str] = []

    def extract(self, *a, **k):
        return {"operations": []}

    def reply(self, system, messages, **k):
        self.systems.append(system)
        return VIET_LAI

    chat = reply


def _phien() -> tuple[Engine, object, _Spy]:
    spy = _Spy()
    eng = Engine(spy)
    c = eng.conversation("thu-350")
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update({"duong": "Cao Lỗ", "quan": "Quận 8", "gia": "10 tỷ", "dien_tich": "80m²", "ket_cau": "1 trệt 3 lầu"})
    c.history.append(Turn("user", "nhà hẻm Cao Lỗ quận 8, 80m2, 1 trệt 3 lầu, 10 tỷ", 0.0))
    return eng, c, spy


def test_loi_dau_bi_luoi_goi_minh_gan_oan():
    """Chốt tiền đề: lời đầu ĐÚNG luật mà lưới vẫn gắn → lượt gọi lại bị tiêu."""
    assert _goi_khach_la_minh(LOI_DAU, "anh")


def test_ban_viet_lai_co_so_bia():
    """Chốt tiền đề thứ hai: bản viết lại thật sự có số chủ nhà không nói."""
    eng, c, _ = _phien()
    assert "4 tầng" in " ".join(_so_khong_co_trong_tin(VIET_LAI, c))


def test_so_bia_trong_ban_viet_lai_phai_bi_bat():
    eng, c, spy = _phien()
    ra = eng._soat_hinh_thuc(c, "SYS", LOI_DAU)
    assert spy.systems, "phải có lần gọi lại (lưới goi_minh gắn lời đầu)"
    assert "4 tầng" not in ra, "bản viết lại thêm số chủ nhà không nói mà vẫn ra tới khách"


# ---- SRS-5.1zzzzzzz352 (phiên lõi): soát lại bản viết lại, giữ bản ít lệch SỰ THẬT hơn — không gọi model lần hai.
class _Spy2(_Spy):
    def __init__(self, ra: str):
        super().__init__()
        self.ra = ra

    def reply(self, system, messages, **k):
        self.systems.append(system)
        return self.ra

    chat = reply


def _phien_le_lai(ra: str):
    spy = _Spy2(ra)
    eng = Engine(spy)
    c = eng.conversation("thu-352")
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update({"duong": "Lê Lai", "quan": "Quận 1", "gia": "15 tỷ", "kich_thuoc": "4x18", "_duong_vao": "hem"})
    c.history.append(Turn("user", "anh bán nhà hẻm đường Lê Lai quận 1, giá 15 tỷ, đất 4x18", 0.0))
    return eng, c, spy


def test_352_ban_viet_lai_tu_nhan_dien_tich_thi_giu_ban_dau():
    """Cách nói mới (`ka_lo_trinh_tu` 02/11): bản đầu lệch HÌNH THỨC (hai câu hỏi), bản viết lại sửa được câu hỏi nhưng tự nhân 4×18 = "72m²"."""
    dau = "Nhà hẻm Lê Lai mà 15 tỷ ngon lành! Sổ hồng riêng chưa anh? Hoàn công đủ chưa anh?"
    lai = ("📋 Em sẽ rao như vầy nhé anh:\n\nNhà hẻm Lê Lai Quận 1, 15 tỷ\n\nĐất ngang 4m dài 18m, tức khoảng 72m², hẻm yên tĩnh.\n\n"
           "- Đất 4x18m, khoảng 72m²\n- 15 tỷ\n\nNhắn Zalo cho em liền!")
    eng, c, spy = _phien_le_lai(lai)
    ra = eng._soat_hinh_thuc(c, "SYS", dau)
    assert len(spy.systems) == 1                                   # đúng MỘT lần gọi lại, không gọi thêm
    assert "72m²" not in ra and ra == dau                           # bản viết lại bịa số → giữ bản đầu (chỉ lệch hình thức)


def test_352_ban_viet_lai_sach_hoac_nhe_hon_thi_nhan():
    dau = "Nhà hẻm Lê Lai mà 15 tỷ ngon lành! Sổ hồng riêng chưa anh? Hoàn công đủ chưa anh?"
    sach = "Nhà hẻm Lê Lai 15 tỷ ngon lành anh! Sổ hồng riêng đã hoàn công đủ chưa anh?"
    eng, c, spy = _phien_le_lai(sach)
    assert eng._soat_hinh_thuc(c, "SYS", dau) == sach and len(spy.systems) == 1
