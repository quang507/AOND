"""30/10/2026 (SRS-5.1zzzzzzz310, kế hoạch bước 3). Người bán đọc ý bằng agent gọi công cụ ghi do code viết sẵn; code kiểm từng lần gọi.
Ca gốc bộ chấm `hai_can_da_ban`: rổ hai căn, khách "căn đó anh bán được rồi" → form đánh dấu căn đang nói là đã bán, bot chúc mừng nhầm căn.
Ca rổ hai căn đỏ khi gỡ cổng `trich_dan_can` ở `agent_boc._chay_cong_cu`."""
from aioi.config import Settings
from aioi.engine import Engine
from aioi.llm.base import ToolCall, ToolTurn
from aioi.llm.mock import MockProvider
from aioi.prompts import operations_schema_ban
from aioi import agent_boc
from tests.test_hai_can_mot_tin_308 import TIN, _Ai


class _AiAgent(_Ai):
    """Lượt đầu (vai chưa rõ) đọc bằng form như cũ (hai căn); lượt sau agent trả lần lượt các vòng `vong`, ghi system lời trả lời."""

    def __init__(self, vong):
        super().__init__(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
        self.vong, self.form, self.he_tra_loi, self.ket_qua = list(vong), 0, [], []

    def extract(self, system, messages, json_schema):
        kq = super().extract(system, messages, json_schema)
        if "operations" in json_schema.get("properties", {}):
            self.form += 1
            kq["user_intent"] = "sell"
        return kq

    def converse(self, system, messages, tools, max_tokens=1024):
        if tools and tools[0]["name"] == "ghi_o":
            last = messages[-1]["content"]
            if isinstance(last, list):
                self.ket_qua += [k["content"] for k in last]
            if not self.vong:
                return ToolTurn(text="xong", tool_calls=[])
            calls = [ToolCall(id=f"c{i}", name=n, input=v) for i, (n, v) in enumerate(self.vong.pop(0))]
            return ToolTurn(text="", tool_calls=calls, assistant_content=[], stop_reason="tool_use")
        return super().converse(system, messages, tools, max_tokens)

    def chat(self, system, messages, max_tokens=256):
        self.he_tra_loi.append(system)
        return "Căn nào vậy anh?"


def _hai_luot(monkeypatch, key, tin2, vong, cong_tac="thu"):
    monkeypatch.setenv("AIOI_FORM_BAN_GON", "bat")
    monkeypatch.setenv("AIOI_AGENT_BOC", cong_tac)
    monkeypatch.setenv("AIOI_AGENT_BAN", "tat")
    ai = _AiAgent(vong)
    eng = Engine(ai)
    eng.handle(key, TIN)
    ai.form = 0
    eng.handle(key, tin2)
    return eng, eng.conversation(key), ai


def test_cong_cu_cat_tu_schema_form():
    cc = {c["name"]: c["input_schema"]["properties"] for c in agent_boc.cong_cu(operations_schema_ban())}
    item = operations_schema_ban()["properties"]["operations"]["items"]["properties"]
    assert set(cc) == {"ghi_o", "them_can", "doi_trang_thai", "bo_can", "ghi_y_khach"}
    assert cc["ghi_o"]["fields"] == item["fields"] and "operations" not in cc["ghi_y_khach"] and "seller_role" in cc["ghi_y_khach"]


def test_ro_hai_can_cau_mo_ho_khong_doi_trang_thai(monkeypatch):
    vong = [[("doi_trang_thai", {"target": "Phạm Hùng", "status": "da_ban", "trich_dan_can": "căn đó"})]]
    eng, conv, ai = _hai_luot(monkeypatch, "thu-310a", "à căn đó anh bán được rồi em nhé", vong)
    assert ai.form == 0 and all(li.status != "đã bán" for li in conv.listings)
    assert len(conv.y_luot.get("chua_ro_can") or []) == 2
    assert "CHƯA đổi căn nào" in ai.he_tra_loi[-1]


def test_ro_hai_can_khach_goi_ten_duong_thi_doi_dung_can(monkeypatch):
    vong = [[("doi_trang_thai", {"target": "Phạm Hùng", "status": "da_ban", "trich_dan_can": "căn Phạm Hùng"})]]
    eng, conv, ai = _hai_luot(monkeypatch, "thu-310b", "căn Phạm Hùng anh bán được rồi em nhé", vong)
    ban = [li.prop.fields.get("duong") for li in conv.listings if li.status == "đã bán"]
    assert ban == ["Phạm Hùng"]


def test_cum_trich_sai_model_sua_o_vong_sau(monkeypatch):
    tin2 = "căn Bùi Minh Trực diện tích sàn 250m2 nha em"
    vong = [[("ghi_o", {"target": "Bùi Minh Trực", "fields": {"dien_tich_nha": "250m2"}, "bang_chung": {"dien_tich_nha": "sàn 250 m vuông"}})],
            [("ghi_o", {"target": "Bùi Minh Trực", "fields": {"dien_tich_nha": "250m2"}, "bang_chung": {"dien_tich_nha": "sàn 250m2"}})]]
    eng, conv, ai = _hai_luot(monkeypatch, "thu-310c", tin2, vong)
    assert agent_boc.SUA in ai.ket_qua[0]
    li = eng._match_listing(conv, "Bùi Minh Trực")
    assert li.prop.fields.get("dien_tich_nha") == "250m2"


def test_agent_khong_goi_cong_cu_thi_doc_bang_form(monkeypatch):
    eng, conv, ai = _hai_luot(monkeypatch, "thu-310d", "ok em", [])
    assert ai.form == 1


def test_khach_that_khi_thu_doc_bang_form(monkeypatch):
    vong = [[("doi_trang_thai", {"target": "Phạm Hùng", "status": "da_ban", "trich_dan_can": "căn đó"})]]
    eng, conv, ai = _hai_luot(monkeypatch, "chu-310e", "à căn đó anh bán được rồi em nhé", vong)
    assert ai.form == 1 and ai.vong   # agent không chạy


class _AiForm(_AiAgent):
    """Đường form (agent tắt): lượt 2 model trả set_status đoán căn, không kèm cụm khách chỉ căn."""

    def extract(self, system, messages, json_schema):
        if "operations" in json_schema.get("properties", {}) and self.form >= 1:
            self.form += 1
            return {"operations": [{"op": "set_status", "status": "da_ban", "target": "Phạm Hùng"}], "user_intent": "sell"}
        return super().extract(system, messages, json_schema)


def test_duong_form_ro_hai_can_doan_can_khong_doi(monkeypatch):
    monkeypatch.setenv("AIOI_FORM_BAN_GON", "bat")
    monkeypatch.setenv("AIOI_AGENT_BOC", "tat")
    monkeypatch.setenv("AIOI_AGENT_BAN", "tat")
    ai = _AiForm([])
    eng = Engine(ai)
    eng.handle("chu-310f", TIN)
    eng.handle("chu-310f", "à căn đó anh bán được rồi em nhé")
    conv = eng.conversation("chu-310f")
    assert all(li.status != "đã bán" for li in conv.listings) and "CHƯA đổi căn nào" in ai.he_tra_loi[-1]
