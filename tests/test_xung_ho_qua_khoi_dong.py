"""19/10/2026 (SRS-5.1zzzzzzz76). Ca gốc: chat thử Âu Cơ — khách "anh cần bán căn nhà…", bot gọi "anh" ở lượt đầu rồi từ lượt kế
đổi sang "anh/chị" đến hết. `conv.xung_ho` chỉ nằm trong bộ nhớ; lõi khởi động lại (cài code) là mất, và lượt AI sau chỉ được nhận
lại khi cụm tự xưng còn trong 6 lượt khách gần nhất. Đỏ khi xưng hô không đi qua kho hội thoại."""
from aioi.config import Settings
from aioi.engine import Engine, SqliteConversationStore, _detect_customer_pronoun
from aioi.llm.mock import MockProvider

S = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")


class AiGia(MockProvider):
    def __init__(self, ke_hoach):
        super().__init__(S)
        self.ke_hoach = ke_hoach

    def extract(self, system, messages, json_schema):
        if "operations" in (json_schema.get("properties") or {}):
            return dict(self.ke_hoach)
        return super().extract(system, messages, json_schema)


def test_xung_ho_giu_qua_khoi_dong_lai(tmp_path):
    db = str(tmp_path / "x.db")
    e1 = Engine(AiGia({"operations": [], "user_intent": "sell", "xung_ho": "anh", "xung_ho_trich_dan": "anh cần bán"}),
                conversation_store=SqliteConversationStore(db))
    e1.handle("k1", "anh cần bán căn nhà ở đường âu cơ")
    assert _detect_customer_pronoun(e1.conversation("k1")) == "anh"
    e2 = Engine(AiGia({"operations": [], "user_intent": "sell"}), conversation_store=SqliteConversationStore(db))
    assert _detect_customer_pronoun(e2.conversation("k1")) == "anh"
