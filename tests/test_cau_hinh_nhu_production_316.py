"""01/11/2026 (SRS-5.1zzzzzzz316, audit Đợt 0, AU-05 / AU-25). Bài canh nền test.

1. Test chạy ĐÚNG công tắc production: `tests/conftest.py` đọc `bot/bridge-zca/cai-vps.sh` — env rỗng từng làm mọi công tắc tắt, test đi
   đường production không đi. Đỏ khi gỡ conftest.
2. Model bóc tách một nguồn ở cai-vps.sh (`MODEL_BOC` → `AIOI_EXTRACT_MODEL`): bộ chấm và VPS cùng đọc; sổ `bot_usage_model` 28/10–01/11
   ghi production bóc tách bằng claude-haiku-5-5, trong khi bộ chấm từng rơi về mặc định config claude-haiku-4-5.
3. Cổng bằng chứng (SRS-73) chặn thật trên đường production: đồ giả MockProvider lấy CẢ lời khách làm bằng chứng nên chưa bài nào chạm
   nhánh chặn (AU-25). Đỏ khi gỡ cổng ở `Engine._gia_tri_ghi`."""
import os

from aioi.config import Settings
from aioi.engine import Engine
from aioi.llm.mock import MockProvider
from tests.cau_hinh_vps import cong_tac, cong_tac_vps


def test_test_chay_cong_tac_production():
    for k, v in cong_tac().items():
        assert os.environ.get(k) == v, k
    assert os.environ["AIOI_DONG_TRICH_XUAT"] == "bat"     # công tắc "bat" ở VPS = mọi khách


def test_model_boc_tach_mot_nguon_o_cai_vps():
    env = cong_tac_vps()
    assert env.get("AIOI_EXTRACT_MODEL", "").startswith("claude-")
    assert env["AIOI_EXTRACT_MODEL"] != Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y").extract_model


class _AiTrich(MockProvider):
    """Lượt lập thao tác trả `ghi` (ô → (giá trị, cụm trích)); còn lại như đồ giả thường."""

    def __init__(self, ghi):
        super().__init__(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
        self.ghi = ghi

    def extract(self, system, messages, json_schema):
        if "user_intent" in (json_schema.get("properties") or {}):
            return {"user_intent": "sell", "operations": [{"op": "update", "fields": {k: v for k, (v, _) in self.ghi.items()},
                                                           "bang_chung": {k: t for k, (_, t) in self.ghi.items()}}]}
        return super().extract(system, messages, json_schema)


def _o(ghi, tin):
    eng = Engine(_AiTrich(ghi))
    eng.handle("chu-316", tin)
    return eng.conversation("chu-316").prop.fields


def test_cong_bang_chung_chan_o_cum_trich_khong_co_trong_loi_khach():
    o = _o({"gia": ("9 tỷ", "giá 9 tỷ"), "duong": ("Lê Lai", "đường Lê Lai")}, "Anh bán nhà phố đường Lê Lai quận 1, giá 8 tỷ")
    assert o.get("duong") == "Lê Lai"          # cụm có thật → ghi
    assert o.get("gia") != "9 tỷ"              # cụm AI bịa ("giá 9 tỷ" không có trong lời khách) → không ghi
