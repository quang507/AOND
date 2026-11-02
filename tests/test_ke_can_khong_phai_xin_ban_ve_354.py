"""SRS-5.1zzzzzzz354 — `lakeview` lượt 1 (lúc có lúc không): "Em gửi căn nhà phố LakeView City, 5x20, 1 trệt 3 lầu, 4 phòng ngủ, giá 27 tỷ"
→ AI bóc tách điền `xin_xem_ban_ve` (mô tả ô có "xin gửi bản vẽ", khách nói "em GỬI căn") → lượt cắt sớm ở nhánh xin bản vẽ, TRƯỚC bước ghi ô:
bot đáp câu mẫu `chua_co_ban_ve`, mất giá 27 tỷ và loại nhà phố. Điều kiện bật: AI điền ô đó (ô nhận theo ý AI từ Q5, không cụm trích).
Sửa: chỉ cắt sớm khi cùng lượt AI KHÔNG lập thao tác ghi ô (kiểm cấu trúc đầu ra AI, không đọc chữ khách); mô tả ô dặn rõ khách tự gửi căn
thì bỏ trống. Số / tên giả."""
from aioi.engine import Engine
from aioi.llm.mock import MockProvider
from aioi.config import Settings


class _Ai(MockProvider):
    def __init__(self, plan):
        super().__init__(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
        self.plan = plan

    def extract(self, system, messages, json_schema):
        if "operations" in (json_schema.get("properties") or {}) or "user_intent" in (json_schema.get("properties") or {}):
            return dict(self.plan)
        return super().extract(system, messages, json_schema)

    def reply(self, system, messages, **k):
        return "Căn đẹp quá anh! Hướng nhà nhìn về hướng nào vậy anh?"

    chat = reply


def _luot(cau, fields, xin="gửi căn nhà phố"):
    plan = {"user_intent": "sell", "xin_xem_ban_ve": xin,
            "operations": [{"op": "update", "fields": fields, "bang_chung": cau}] if fields else []}
    eng = Engine(_Ai(plan))
    r = eng.handle("thu-354", cau)
    return eng.conversation("thu-354"), r


def test_ke_can_kem_xin_ban_ve_nham_van_ghi_o():
    for cau, f, gia in (
        ("Em gửi căn nhà phố LakeView City, 5x20, 1 trệt 3 lầu, 4 phòng ngủ, giá 27 tỷ",
         {"loai_hinh": "nhà phố", "du_an": "LakeView City", "gia": "27 tỷ"}, "27"),
        ("Gửi em căn shophouse Vinhomes Grand Park 6x20 giá 18 tỷ nha",                 # cách nói mới
         {"loai_hinh": "nhà phố", "du_an": "Vinhomes Grand Park", "gia": "18 tỷ"}, "18"),
    ):
        c, r = _luot(cau, f)
        assert "CHƯA có bản vẽ" not in r.reply, cau
        assert gia in str(c.prop.fields.get("gia") or ""), cau


def test_xin_ban_ve_that_khong_ke_can_van_tra_loi_ban_ve():
    c, r = _luot("cho anh xem bản vẽ căn đó được không em", {}, xin="xin xem bản vẽ căn")
    assert "CHƯA có bản vẽ" in r.reply
