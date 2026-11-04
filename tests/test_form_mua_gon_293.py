"""29/10/2026 (SRS-5.1zzzzzzz293). Chủ dự án: "Hay là bớt prompt dài đi, cấu trúc form json ngắn hơn ổn hơn k". Lượt Haiku đọc ý khách MUA dùng
form gọn (prompt + schema chỉ phần phía mua) thay vì form 27 nghìn chữ / 36 khoá phần lớn là thao tác rổ hàng người bán.
Từ Đợt 8 (SRS-5.1zzzzzzz319) form gọn là đường duy nhất cho khách mua (công tắc FORM_MUA_GON đã gỡ). Từ SRS-5.1zzzzzzz380 lượt khách mua đi
vòng agent gộp (`agent_gop.mo_mua`) — form gọn là đường DỰ PHÒNG khi vòng lỗi / model không gọi công cụ: đồ giả ở đây không gọi công cụ nên
các ca dưới kiểm chính đường dự phòng (`test_khach_mua_doc_bang_form_gon` soát vòng gộp có được thử trước). Ca engine đỏ khi gỡ bản sửa."""
from aioi.llm.base import ToolTurn
from aioi.prompts import KHOA_FORM_MUA, OPERATIONS_SYSTEM, OPERATIONS_SYSTEM_MUA, operations_schema, operations_schema_mua
from tests.test_viec_mua import KHACH_MUA, AiGia, KhoGia
from aioi.engine import Engine


class AiGhiForm(AiGia):
    """Ghi lại form (system + khoá schema) của mọi lượt lập thao tác; trả `ke_hoach` (hoặc lần lượt `cac_ke_hoach`). Bước ghi của vòng gộp
    phía mua: không gọi công cụ (→ form dự phòng), đếm số lần thử ở `vong_gop`."""

    def __init__(self, ke_hoach, cac_ke_hoach=None):
        super().__init__(ke_hoach)
        self.form, self.cac, self.vong_gop = [], list(cac_ke_hoach or []), 0

    def converse(self, system, messages, tools, max_tokens=1024):
        if "ghi_nhu_cau" in {t["name"] for t in tools}:
            self.vong_gop += 1
            return ToolTurn(text="", tool_calls=[])
        return super().converse(system, messages, tools, max_tokens)

    def extract(self, system, messages, json_schema):
        p = json_schema.get("properties") or {}
        if "user_intent" in p:
            self.form.append((system, set(p)))
            return dict(self.cac.pop(0) if self.cac else self.ke_hoach)
        return super().extract(system, messages, json_schema)


def test_form_gon_ngan_hon_va_du_khoa_phia_mua():
    assert len(OPERATIONS_SYSTEM_MUA) < 0.6 * len(OPERATIONS_SYSTEM)
    p = operations_schema_mua()["properties"]
    assert set(p) == set(KHOA_FORM_MUA) and "operations" not in p
    assert all(p[k] == operations_schema()["properties"][k] for k in p)   # cùng định nghĩa ô với form đầy đủ — cắt, không viết lại
    for doan in ("buyer_lead", "TỪ ĐIỂN TIẾNG LÓNG", "CÁC Ô DÙNG CHUNG", "XIN GẶP NGƯỜI THẬT"):
        assert doan in OPERATIONS_SYSTEM_MUA


def _hai_luot(user_key, cac=None):
    ai = AiGhiForm(KHACH_MUA, cac)
    eng = Engine(ai, conversation_store=KhoGia())
    eng.handle(user_key, "Em tìm nhà phố quận 5 tầm 5 tỷ")
    eng.handle(user_key, "có căn nào hẻm xe hơi không em")
    return ai, eng


def test_khach_mua_doc_bang_form_gon():
    """Đường dự phòng (SRS-5.1zzzzzzz380): vòng gộp được thử ĐÚNG một lần ở lượt mua đã rõ vai, model không gọi công cụ → form mua gọn."""
    ai, _ = _hai_luot("khach-293")
    sys2, khoa2 = ai.form[-1]
    assert ai.vong_gop == 1 and len(ai.form) == 2
    assert "operations" not in khoa2 and sys2.startswith(OPERATIONS_SYSTEM_MUA)


def test_form_gon_doc_ra_y_ban_thi_doc_lai_form_day_du():
    ban = {"operations": [], "user_intent": "sell"}
    ai, _ = _hai_luot("khach-293b", [KHACH_MUA, ban, ban])
    assert len(ai.form) == 3
    assert "operations" not in ai.form[1][1] and "operations" in ai.form[2][1]
    assert ai.form[2][0].startswith(OPERATIONS_SYSTEM) and OPERATIONS_SYSTEM_MUA not in ai.form[2][0]


# --- SRS-5.1zzzzzzz294 -------------------------------------------------------------------------------------------------------------------
def test_luot_doc_y_chi_nhan_dong_can_khong_nhan_cach_noi():
    """Chủ dự án 29/10 "bớt prompt nữa dc ko": lượt đọc ý khách mua nhận cả phần dặn CÁCH NÓI (bốn đoạn, khen, link…) của lượt viết lời —
    ≈ 2.500 chữ sau dấu cache, tính tiền đủ mỗi lượt. Nay chỉ dòng căn (mã + điều đã có)."""
    from aioi.llm.base import RANH_GIOI_CACHE
    ai, _ = _hai_luot("khach-294")
    dong = ai.form[-1][0].split(RANH_GIOI_CACHE, 1)[1]
    assert "CĂN ĐANG CÓ" in dong and "#ABCD1234" in dong
    assert "CÁCH NÓI" not in dong and "BỐN ĐOẠN" not in dong
    assert any("CÁCH NÓI" in s for s in ai.system)   # lượt viết lời vẫn đủ
