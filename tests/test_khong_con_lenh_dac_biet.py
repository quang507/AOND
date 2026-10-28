"""26/10/2026 (SRS-5.1zzzzzzz195; chủ dự án: "bên kia ra sao mình trả như vậy … xóa $$$$$ và json"). Bên anh Luận không có lệnh làm mới `$$$$$`, chế độ test
(tin phụ debug) hay lệnh `json` — gõ những chữ đó chỉ là tin nhắn thường. Đỏ khi một trong ba lệnh quay lại."""
from aioi.engine import TurnResult
from tests.test_doc_y_khach import _eng


def _plan(k, v, bc):
    return {"operations": [{"op": "update", "fields": {k: v}, "bang_chung": {k: bc}}], "user_intent": "sell"}


def test_dau_la_khong_con_xoa_phien_va_khong_bat_che_do_test():
    eng, spy = _eng(_plan("gia", "6 tỷ", "6 tỷ"))
    eng.handle("u1", "nhà anh giá 6 tỷ")
    spy.plan = {"operations": []}
    r = eng.handle("u1", "$$$$$")
    assert eng.conversation("u1").prop.fields.get("gia") == "6 tỷ"          # không bị xoá sạch
    assert r.reply != "" and r.chu_thich == ""                               # bot trả lời như tin thường; tin phụ chỉ theo công tắc (SRS-252)
    assert not getattr(eng.conversation("u1"), "che_do_test", False)        # không bật chế độ test


def test_json_la_tin_thuong_khong_in_khoi_du_lieu():
    eng, spy = _eng(_plan("gia", "6 tỷ", "6 tỷ"))
    eng.handle("u2", "nhà anh giá 6 tỷ")
    spy.plan = {"operations": []}
    for lenh in ("json", "/json", "xem json", "thong tin"):
        r = eng.handle("u2", lenh)
        assert "```json" not in r.reply and "Dữ liệu trích xuất" not in r.reply, lenh


def test_tin_phu_chi_theo_cong_tac_chung_khong_theo_lenh():
    """SRS-5.1zzzzzzz252: tin phụ quay lại nhưng là công tắc CHUNG (`AIOI_DONG_TRICH_XUAT`), mặc định tắt — gõ `$$$$$` không bật gì."""
    assert TurnResult.__dataclass_fields__["chu_thich"].default == ""
