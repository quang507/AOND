"""SRS-5.1zzzzzzz461 (mở lại cuộc chat ở số ký gửi) + SRS-5.1zzzzzzz462 (sticker đồng ý)."""
from aioi.engine import PHIEN_MOI_GIAY, SO_TU_VAN, Conversation, _form_mua_gon, _mua_cu_mo_lai
from aioi.prompts import khoi_so_dang_nhan
from aioi.sticker import la_sticker, ra_van_ban


def _conv(**kw) -> Conversation:
    c = Conversation(user_key="thu-461")
    for k, v in kw.items():
        setattr(c, k, v)
    return c


def test_mo_lai_so_ky_gui_khong_dung_form_mua():
    c = _conv(role="buyer", so_vai="ky_gui", so_nhan="", phien_moi=True)
    assert _mua_cu_mo_lai(c)
    assert not _form_mua_gon(c)


def test_cung_phien_van_dung_form_mua():
    c = _conv(role="buyer", so_vai="ky_gui", so_nhan="", phien_moi=False)
    assert not _mua_cu_mo_lai(c)
    assert _form_mua_gon(c)


def test_so_tu_van_mo_lai_van_la_mua():
    c = _conv(role="buyer", so_vai=SO_TU_VAN, so_nhan=SO_TU_VAN, phien_moi=True)
    assert not _mua_cu_mo_lai(c)
    assert _form_mua_gon(c)


def test_khoi_so_dang_nhan_mo_lai():
    assert "mở lại cuộc chat" in khoi_so_dang_nhan(False, None, mo_lai=True)
    assert "mở lại cuộc chat" not in khoi_so_dang_nhan(False, None)
    assert PHIEN_MOI_GIAY == 6 * 3600


def test_sticker_dong_y_khong_con_trung_tinh():
    chu = ra_van_ban({"y_nghia": "dong_y", "mo_ta": "Con mèo giơ chân kèm chữ OK"})
    assert chu.startswith("[khách gửi sticker đồng ý")
    assert not la_sticker(chu)


def test_sticker_khac_van_trung_tinh():
    assert la_sticker(ra_van_ban({"y_nghia": "buon_gian", "mo_ta": "mèo khóc"}))
    assert la_sticker("[khách gửi sticker]")
    assert ra_van_ban({"y_nghia": "chao", "mo_ta": "thỏ vẫy tay"}) == "hello"
