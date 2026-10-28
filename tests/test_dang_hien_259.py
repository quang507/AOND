"""SRS-5.1zzzzzzz259 — "tin đang hiển thị" ở lõi cùng bộ trạng thái web hiện (`lib/supabase.ts` TRANG_THAI_HIEN).

Ca gốc (ban-thu-mua 28/10): khách mua hẹn xem → tin sang `dang_quan_tam`; chủ nhà trả lời câu khách hỏi thì `trang_thai_tin` báo
`len_web=False` (chỉ nhận `dang_ban`) → prompt sau bản nháp coi tin chưa lên web, bot hỏi chủ nhà "chốt đăng luôn" một tin đang bán.
"""
from test_trang_thai_web import StoreGia, _conv
from test_xin_chu_nha_254 import TRUA, _KhoTin, _len_web

from aioi import gui_nhac


def _tin(status):
    return StoreGia([{"status": status, "ward": "Phường Chợ Quán", "area_m2": 60, "price_vnd": 10}]).trang_thai_tin(_conv())


def test_dang_quan_tam_va_da_coc_van_la_dang_hien():
    assert _tin("dang_quan_tam")["len_web"] is True
    assert _tin("da_coc")["len_web"] is True
    assert _tin("da_chot")["len_web"] is False
    assert _tin("an")["len_web"] is False


def test_nhac_len_web_gui_khi_tin_dang_quan_tam():
    kho = _KhoTin([_len_web()], trang_thai="dang_quan_tam")
    gui = []
    gui_nhac.chay_mot_luot(kho, lambda z, t: gui.append(t) or True, lambda z: ("chi", "M•ai"), bay_gio=TRUA)
    assert gui and kho.nhac[0]["status"] == "sent"
