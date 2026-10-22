"""22/10/2026 (SRS-5.1zzzzzzz123). Chủ dự án: "đừng để hello thành reset nữa, lệnh reset sẽ là $$$$$ người ta nhắn 5 dấu này". Trước đó
"hello / hi / chào em / 👋 / sticker chào" xoá cả phiên (quyết định 20/10 để test) — khách thật chào giữa chừng là mất tin đang soạn. Đỏ khi
lời chào còn xoá phiên, khi "$$$$$" không làm mới, hay khi lời chào đầu tiên mất câu chào cố định."""
from aioi import cau_mau
from tests.test_doc_y_khach import _eng


def _co_chuyen(eng, uid="r1"):
    eng.handle(uid, "nhà anh ở hẻm 4m đường Cao Lỗ quận 8 giá 6 tỷ")
    return eng.conversation(uid)


def test_lenh_nam_dau_do_lam_moi_phien_va_noi_la_da_lam_moi():
    eng, _ = _eng({"operations": []})
    conv = _co_chuyen(eng)
    assert conv.history
    r = eng.handle("r1", "$$$$$")
    assert r.reply == cau_mau.cau("lenh_lam_moi", ten=conv.assistant.name)
    assert [t.role for t in eng.conversation("r1").history] == ["assistant"]          # chuyện cũ đã xoá, chỉ còn lời bot


def test_chi_dung_nam_dau_do():
    eng, _ = _eng({"operations": []})
    _co_chuyen(eng)
    n = len(eng.conversation("r1").history)
    for chu in ("$$$$", "$$$$$$", "$$$$$ nhé", "giá $$$$$"):
        eng.handle("r1", chu)
    assert len(eng.conversation("r1").history) > n                                    # không ai bị xoá phiên


def test_loi_chao_giua_chuyen_khong_xoa_phien_va_di_qua_model():
    eng, spy = _eng({"operations": []})
    _co_chuyen(eng)
    so_he_thong = len(spy.systems)
    for chao in ("hello", "hi", "hello em", "chào em", "👋"):
        eng.handle("r1", chao)
    assert len(spy.systems) >= so_he_thong + 5                                        # mỗi lời chào đều đi qua model (có thể gọi lại)
    h = eng.conversation("r1").history
    assert len(h) > 5 and h[0].content.startswith("nhà anh ở hẻm 4m")                 # chuyện cũ còn nguyên


def test_loi_chao_dau_tien_van_la_cau_chao_co_dinh_khong_goi_model():
    eng, spy = _eng({"operations": []})
    r = eng.handle("r2", "hello")
    assert r.reply == cau_mau.cau("chao_lan_dau", ten=eng.conversation("r2").assistant.name) and spy.systems == []


def test_lenh_cu_van_lam_moi():
    eng, _ = _eng({"operations": []})
    _co_chuyen(eng)
    eng.handle("r1", "/reset")
    assert [t.role for t in eng.conversation("r1").history] == ["assistant"]
