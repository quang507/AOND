"""30/10/2026 (SRS-5.1zzzzzzz311, kế hoạch bước 4). Lượt DỄ của người bán (thu thập bằng phiếu lượt, không tra dữ liệu, không việc gì khác) viết
bằng model rẻ `AIOI_MODEL_LUOT_DE`; lượt có việc khác (khách hỏi phí…) giữ model chat. Ca đầu đỏ khi gỡ chỗ đặt model ở engine."""
from aioi.config import Settings
from aioi.engine import Engine
from aioi.llm.base import MODEL_CHAT_LUOT
from aioi.llm.mock import MockProvider


class _AiGhiModel(MockProvider):
    def __init__(self):
        super().__init__(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
        self.model = []

    def chat(self, system, messages, max_tokens=256):
        self.model.append(MODEL_CHAT_LUOT.get())
        return "Căn này giá bao nhiêu anh?"


def _luot(monkeypatch, key, *tin):
    monkeypatch.setenv("AIOI_PHIEU_LUOT", "bat")
    monkeypatch.setenv("AIOI_MODEL_LUOT_DE", "model-re")
    monkeypatch.setenv("AIOI_AGENT_BAN", "tat")
    ai = _AiGhiModel()
    eng = Engine(ai)
    for t in tin:
        eng.handle(key, t)
    return ai.model


def test_luot_thu_thap_dung_model_re(monkeypatch):
    m = _luot(monkeypatch, "chu-311a", "Anh cần bán nhà phố đường Lê Lai quận 1")
    assert m and m[-1] == "model-re"
    assert MODEL_CHAT_LUOT.get() is None   # không rò sang lượt sau


def test_luot_khach_hoi_phi_giu_model_chat(monkeypatch):
    m = _luot(monkeypatch, "chu-311b", "Anh cần bán nhà phố đường Lê Lai quận 1", "phí bên em bao nhiêu vậy")
    assert m[-1] is None


def test_cong_tac_tat_khong_doi_model(monkeypatch):
    monkeypatch.setenv("AIOI_MODEL_LUOT_DE", "tat")
    ai = _AiGhiModel()
    monkeypatch.setenv("AIOI_PHIEU_LUOT", "bat")
    Engine(ai).handle("chu-311c", "Anh cần bán nhà phố đường Lê Lai quận 1")
    assert ai.model and all(x is None for x in ai.model)
