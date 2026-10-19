"""19/10/2026 (SRS-5.1zzzzzzz73): chưa biết khách anh hay chị thì gọi "anh/chị", không đoán. Ca gốc (chat thử chủ dự án): bot gọi
"anh" từ lượt thứ năm tới khi khách tự xưng "chị" — nhánh xưng hô "unknown" không có luật, ví dụ mẫu trong prompt toàn gọi "anh".
Đỏ khi bỏ luật unknown hoặc trả lại ví dụ gọi "anh"."""
import re

from aioi.config import Settings
from aioi.engine import Engine
from aioi.llm.mock import MockProvider
from aioi import prompts


class GhiSystem(MockProvider):
    def __init__(self):
        super().__init__(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
        self.system: list[str] = []

    def chat(self, system, messages, max_tokens=256):
        self.system.append(system)
        return "Nhà mình ở đường nào vậy anh/chị?"


def test_chua_biet_xung_ho_thi_co_luat_khong_doan():
    ai = GhiSystem()
    eng = Engine(ai)
    eng.handle("chu-x", "Mình cần bán nhà phố")
    assert any("CHƯA BIẾT khách là anh hay chị" in s for s in ai.system)


def test_vi_du_mau_khong_goi_khach_la_anh():
    van = "\n".join(v for v in vars(prompts).values() if isinstance(v, str))
    assert not re.search(r'vậy anh\?"|chưa anh\?"|tốt anh ha', van)
