"""30/10/2026 (SRS-5.1zzzzzzz303). Chủ dự án: "prompt bóc tách sao mà dài, giờ có agent làm rồi thì ngắn lại dc ko" và "prompt đầu tiên cho nó
25 từ nhưng nâng hạn mức lại thành 30 từ". Lượt đọc ý NGƯỜI BÁN (vai đã rõ) bỏ mục việc khách mua + ba khoá phía mua; đọc ra ý mua → đọc lại
bằng form đầy đủ. Từ Đợt 8 (SRS-5.1zzzzzzz319) form gọn là đường duy nhất cho người bán đã rõ vai (công tắc
FORM_BAN_GON đã gỡ). Ca engine đỏ khi gỡ bản sửa."""
from aioi.engine import Engine
from aioi.prompts import KHOA_BO_FORM_BAN, OPERATIONS_SYSTEM, OPERATIONS_SYSTEM_BAN, operations_schema, operations_schema_ban
from tests.test_form_mua_gon_293 import AiGhiForm
from tests.test_viec_mua import KhoGia

BAN = {"operations": [{"op": "update", "fields": {"duong": "Hoàng Hoa Thám", "bang_chung": "Hoàng Hoa Thám"}}], "user_intent": "sell"}


def test_form_ban_gon_cat_tu_form_day_du():
    assert "VIỆC CỦA KHÁCH MUA" not in OPERATIONS_SYSTEM_BAN and "VIỆC CỦA KHÁCH MUA" in OPERATIONS_SYSTEM
    assert len(OPERATIONS_SYSTEM_BAN) < 0.9 * len(OPERATIONS_SYSTEM)
    for doan in ("TRẢ LỜI CÂU KHÁCH HỎI", "CĂN CÒN BÁN", "DUYỆT BẢN NHÁP", "TỪ ĐIỂN TIẾNG LÓNG", "KHÁCH BẢO ĐĂNG"):
        assert doan in OPERATIONS_SYSTEM_BAN
    p, d = operations_schema_ban()["properties"], operations_schema()["properties"]
    assert not set(KHOA_BO_FORM_BAN) & set(p) and "operations" in p
    assert all(p[k] == d[k] for k in p)   # cắt, không viết lại định nghĩa ô


def _hai_luot(user_key, cac=None):
    ai = AiGhiForm(BAN, cac)
    eng = Engine(ai, conversation_store=KhoGia())
    eng.handle(user_key, "Anh cần bán nhà mặt tiền đường Hoàng Hoa Thám")
    eng.handle(user_key, "Phường Gia Định")
    return ai


def test_nguoi_ban_luot_hai_doc_bang_form_gon():
    ai = _hai_luot("chu-303")
    assert "mua" in ai.form[0][1]                                 # lượt đầu chưa rõ vai: form đầy đủ
    sys2, khoa2 = ai.form[1]
    assert "mua" not in khoa2 and "operations" in khoa2 and sys2.startswith(OPERATIONS_SYSTEM_BAN)


def test_form_ban_gon_doc_ra_y_mua_thi_doc_lai_form_day_du():
    mua = {"operations": [], "user_intent": "buy"}
    ai = _hai_luot("chu-303b", [BAN, mua, mua])
    assert len(ai.form) == 3 and "mua" not in ai.form[1][1] and "mua" in ai.form[2][1]
    assert ai.form[2][0].startswith(OPERATIONS_SYSTEM) and not ai.form[2][0].startswith(OPERATIONS_SYSTEM_BAN)

