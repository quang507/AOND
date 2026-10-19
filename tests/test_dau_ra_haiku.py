"""19/10/2026 (SRS-5.1zzzzzzz78). Log tên ô bắn thử production (Haiku): (1) có lượt `operations` về thành MỘT CHUỖI JSON — code lọc
`isinstance(op, dict)` bỏ sạch, mọi ô lượt đó mất (ca "diện tích sàn tầm 170m vuông" không được ghi, 4/11 lượt); (2) `bang_chung` lọt
vào TRONG `fields` — cụm trích không được dùng, ô chữ bị bỏ oan. Đỏ khi bỏ `chuan_theo_schema` hoặc bước kéo `bang_chung` ra."""
import json
from types import SimpleNamespace

from aioi.config import Settings
from aioi.engine import Engine
from aioi.llm.base import Message
from aioi.llm.claude import ClaudeProvider, chuan_theo_schema
from aioi.llm.mock import MockProvider
from aioi.prompts import operations_schema
from aioi.so_token import SoToken

S = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")
OPS = [{"op": "update", "fields": {"dien_tich_nha": "170m2"}, "bang_chung": {"dien_tich_nha": "tầm 170m vuông"}}]


def test_operations_la_chuoi_json_thi_giai_ra():
    ra = chuan_theo_schema({"operations": json.dumps(OPS, ensure_ascii=False), "user_intent": "sell"}, operations_schema())
    assert ra["operations"] == OPS
    assert chuan_theo_schema({"operations": "không phải json"}, operations_schema())["operations"] == "không phải json"


def test_claude_extract_tra_dung_dang():
    class Api:
        def create(self, **kw):
            usage = SimpleNamespace(input_tokens=1, output_tokens=1, cache_creation_input_tokens=0, cache_read_input_tokens=0)
            o = SimpleNamespace(type="tool_use", id="t", name="x",
                                input={"operations": json.dumps(OPS, ensure_ascii=False), "user_intent": "sell"})
            return SimpleNamespace(model=kw["model"], usage=usage, content=[o], stop_reason="tool_use")

    p = ClaudeProvider(Settings(provider="claude", anthropic_api_key="test", chat_model="claude-haiku-5-5", vision_model="v"))
    p._client = SimpleNamespace(messages=Api())
    p._so = SoToken(None, nen=False)
    assert p.extract("s", [Message("user", "diện tích sàn tầm 170m vuông")], operations_schema())["operations"] == OPS


class AiGia(MockProvider):
    def __init__(self, ke_hoach):
        super().__init__(S)
        self.ke_hoach = ke_hoach

    def extract(self, system, messages, json_schema):
        if "operations" in (json_schema.get("properties") or {}):
            return json.loads(json.dumps(self.ke_hoach))
        return super().extract(system, messages, json_schema)


def test_bang_chung_lot_vao_fields_thi_keo_ra():
    # Ô chữ: giá trị AI viết lại ("sổ hồng riêng") không nằm nguyên trong lời khách — chỉ cụm trích ("sổ riêng") cứu được.
    eng = Engine(AiGia({"operations": [{"op": "update", "fields": {"phap_ly": "sổ hồng riêng", "bang_chung": {"phap_ly": "sổ riêng"}}}],
                        "user_intent": "sell"}))
    eng.handle("k-1", "nhà mình có sổ riêng")
    f = eng.conversation("k-1").active.prop.fields
    assert f.get("phap_ly") == "sổ hồng riêng" and "bang_chung" not in f


def test_chuoi_json_khong_chat_van_giai():
    # Bắn thử sau bản đầu: chuỗi vẫn lọt — xuống dòng trần trong chuỗi, chữ thừa sau dấu đóng ngoặc.
    tho = '[{"op": "update", "fields": {"dien_tich_nha": "170m2\n"}}]\nXong.'
    ra = chuan_theo_schema({"operations": tho}, operations_schema())["operations"]
    assert isinstance(ra, list) and ra[0]["fields"]["dien_tich_nha"].startswith("170m2")


def test_operations_hong_thi_goi_lai_mot_lan():
    class AiHong(AiGia):
        lan = 0

        def extract(self, system, messages, json_schema):
            if "operations" in (json_schema.get("properties") or {}):
                AiHong.lan += 1
                if AiHong.lan == 1:
                    return {"operations": "[{op: update, fields: ...", "user_intent": "sell"}
            return super().extract(system, messages, json_schema)

    eng = Engine(AiHong({"operations": [{"op": "update", "fields": {"dien_tich_nha": "170m2"}}], "user_intent": "sell"}))
    eng.handle("k-2", "diện tích sàn tầm 170m vuông")
    assert AiHong.lan == 2 and eng.conversation("k-2").active.prop.fields.get("dien_tich_nha") == "170m2"
    khung = chuan_theo_schema({"operations": "[{op: 'nhà Q5', x: 170m2"}, operations_schema())["operations"]
    assert isinstance(khung, str)                                   # không giải được thì để nguyên, chỗ dùng tự lọc
