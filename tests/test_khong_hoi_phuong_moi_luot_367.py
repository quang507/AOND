"""SRS-5.1zzzzzzz367 — chấm độc lập 02/11 trên main 48f9912: bot còn hỏi phường 3/201 lượt dù SRS-359 (chủ dự án 02/11: "tên phường mới, tên phường
cũ được tự động chuyển thành phường mới bằng cách gắn lên bản đồ để biết chứ không hỏi khách"). Model tự ghép "phường nào" vào câu hỏi địa chỉ:
lời dặn hỏi ô `dia_chi` (NATURAL_QUESTIONS) còn liệt kê "tên đường, phường / xã", còn dòng cấm chỉ nằm ở khối cổng web.

Sửa (một nguồn `schema.O_HE_THONG_TRA` → `prompts.NHAN_O_HE_THONG`): luật cố định của MỌI lượt thu thập (`build_phieu_luot`), lời dặn hỏi địa
chỉ bỏ "phường / xã", lưới soát lời bot `hoi_o_he_thong` gọi lại khi câu hỏi vẫn hỏi phường / xã. Đỏ khi gỡ một trong ba."""
import pytest

from aioi.engine import LUAT_SOAT, Engine, _hoi_o_he_thong
from aioi.prompts import LUAT_O_HE_THONG, NHAN_O_HE_THONG, build_phieu_luot, cau_hoi_o
from aioi.schema import O_HE_THONG_TRA, Property

# Ba câu thật của lượt chấm (kịch bản cao_lo l1, xa_phuoc_ly l1, aeon_tan_phu l5) + một cách hỏi mới.
CAU_HOI_PHUONG = [
    "Căn nằm ở đường nào, phường nào, thuộc tỉnh hay thành phố nào vậy?",
    "Lô này nằm ở đường nào, thuộc phường hay xã nào, tỉnh nào vậy anh?",
    "Căn nằm trên đường nào, thuộc phường nào của Tân Phú vậy anh?",
    "Dạ hay quá! Anh cho em xin luôn số nhà với tên phường chỗ nhà mình nha?",   # cách hỏi mới
]
# Câu được phép: nhắc phường như dữ kiện, hỏi ô khác; hỏi đường / số nhà.
CAU_DUOC = [
    "Nhà ở Phường Tân Định, anh muốn bán giá bao nhiêu ạ?",
    "Em ghi lô đất thuộc Xã Phước Lý rồi. Lô đất ngang bao nhiêu mét vậy anh?",
    "Căn nằm ở đường nào, số nhà bao nhiêu vậy anh?",
    "📋 Em sẽ rao như vầy:\n\nNhà phố Phường Tân Định\n\nPhường nào cũng có khách hỏi?",   # câu trong bản tin không phải câu hỏi khách
]


@pytest.mark.parametrize("cau", CAU_HOI_PHUONG)
def test_luoi_bat_cau_hoi_phuong(cau):
    assert _hoi_o_he_thong(cau)


@pytest.mark.parametrize("cau", CAU_DUOC)
def test_luoi_khong_bat_oan(cau):
    assert not _hoi_o_he_thong(cau)


def test_luoi_nam_trong_bang_soat_va_goi_lai():
    assert any(ten == "hoi_o_he_thong" and nhom == "ly_do" for ten, nhom, _ in LUAT_SOAT)

    class _Spy:
        def __init__(self):
            self.systems: list[str] = []

        def reply(self, system, messages, **k):
            self.systems.append(system)
            return "Căn nằm ở đường nào, số nhà bao nhiêu vậy anh?"

        chat = reply

    spy = _Spy()
    eng = Engine(spy)
    c = eng.conversation("k-367")
    c.role = "seller"
    ra = eng._soat_hinh_thuc(c, "SYS", CAU_HOI_PHUONG[0])
    assert spy.systems and "phường / xã" in spy.systems[0]          # gọi lại, nói đúng lý do
    assert not _hoi_o_he_thong(ra)
    # phía mua hỏi khu vực / phường mong muốn là hỏi nhu cầu — không bắt
    c2 = eng.conversation("k-367-mua")
    c2.role = "buyer"
    spy.systems.clear()
    assert eng._soat_hinh_thuc(c2, "SYS", "Anh muốn tìm nhà ở phường nào vậy?") == "Anh muốn tìm nhà ở phường nào vậy?"


@pytest.mark.parametrize("loai", ["nha_pho", "dat", "can_ho"])
def test_phieu_moi_luot_thu_thap_co_luat_va_loi_dan_dia_chi_khong_hoi_phuong(loai):
    p = Property()
    p.update({"loai_hinh": loai, "gia": "3 tỷ"})
    for o in (None, "dia_chi", "gia", "dien_tich_dat"):
        he = build_phieu_luot("Mai·Anh", p, o)
        assert LUAT_O_HE_THONG in he, (loai, o)
    goi_y = cau_hoi_o("dia_chi", p)
    assert "phường" not in goi_y.lower(), goi_y


def test_mot_nguon_tu_o_he_thong_tra():
    assert O_HE_THONG_TRA == frozenset({"phuong"}) and NHAN_O_HE_THONG == "phường / xã"
    assert f"KHÔNG hỏi khách {NHAN_O_HE_THONG}" in LUAT_O_HE_THONG
