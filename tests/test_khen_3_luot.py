"""22/10/2026 (SRS-5.1zzzzzzz131 bản 2). Lê Quang: "100% khen là 3 lần khách đưa thông tin đầu tiên thì 100% khen hết". Lõi đếm lượt khách CHO
THÔNG TIN (lượt ghi được ô), chèn khối "LƯỢT THÔNG TIN THỨ N" cho model: N ≤ 3 bắt buộc khen, N ≥ 4 khen khi có điểm tốt. Đỏ khi lượt không ghi ô
cũng bị đếm, khi "$$$$$" không về 0, khi số đếm mất sau khởi động lại, hay khi khối sai nhánh."""
from aioi.engine import SqliteConversationStore
from aioi.prompts import khoi_khen_theo_luot
from tests.test_doc_y_khach import _eng


def _plan(k, v, bc):
    return {"operations": [{"op": "update", "fields": {k: v}, "bang_chung": {k: bc}}], "user_intent": "sell"}


def test_khoi_theo_so_luot():
    assert khoi_khen_theo_luot(0) == ""
    assert "THỨ 1" in khoi_khen_theo_luot(1) and "trong 3 lượt đầu" in khoi_khen_theo_luot(1) and "ƯU TIÊN mở đầu" in khoi_khen_theo_luot(3)
    assert "BẮT BUỘC" not in khoi_khen_theo_luot(3) and "không có thì cảm ơn ngắn" in khoi_khen_theo_luot(3)   # SRS-178: không ép khen gượng
    assert "THỨ 4" in khoi_khen_theo_luot(4) and "đã qua 3 lượt đầu" in khoi_khen_theo_luot(4) and "ƯU TIÊN mở đầu" not in khoi_khen_theo_luot(4)


def test_dem_luot_cho_thong_tin_va_khoi_vao_prompt():
    eng, spy = _eng(_plan("gia", "6 tỷ", "6 tỷ"))
    eng.handle("k3", "nhà anh giá 6 tỷ")
    assert eng.conversation("k3").so_luot_thong_tin == 1 and "LƯỢT THÔNG TIN THỨ 1 CỦA KHÁCH (trong 3 lượt đầu)" in spy.systems[-1]
    spy.plan = {"operations": []}
    eng.handle("k3", "em ơi")                                                  # không ghi ô → không đếm
    assert eng.conversation("k3").so_luot_thong_tin == 1
    for i, (k, v) in enumerate((("ket_cau", "3 tầng"), ("phap_ly", "sổ hồng"), ("mat_tien", "5m")), start=2):
        spy.plan = _plan(k, v, v)
        eng.handle("k3", f"nhà {v} nha")
        assert eng.conversation("k3").so_luot_thong_tin == i
    assert "LƯỢT THÔNG TIN THỨ 4 CỦA KHÁCH (đã qua 3 lượt đầu)" in spy.systems[-1]


def test_lenh_lam_moi_ve_0_va_song_qua_khoi_dong_lai(tmp_path):
    kho = SqliteConversationStore(str(tmp_path / "c.db"))
    eng, spy = _eng(_plan("gia", "6 tỷ", "6 tỷ"))
    eng._convstore = kho
    eng.handle("k4", "giá 6 tỷ"); eng.handle("k4", "giá 6 tỷ nha")
    assert eng.conversation("k4").so_luot_thong_tin == 1                     # cùng giá trị đã có → không phải ô mới
    spy.plan = _plan("ket_cau", "3 tầng", "3 tầng"); eng.handle("k4", "3 tầng")
    assert kho.load("k4").so_luot_thong_tin == 2 and SqliteConversationStore(str(tmp_path / "c.db")).load("k4").so_luot_thong_tin == 2
    eng.handle("k4", "$$$$$")
    assert eng.conversation("k4").so_luot_thong_tin == 0 and kho.load("k4").so_luot_thong_tin == 0
