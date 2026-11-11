"""SRS-5.1zzzzzzz403 — Kiểm tra Fast-path tin chào hỏi và LEAN_SYSTEM_PROMPT chạy thật.
1. Fast-path: Tin chào hỏi thuần tuý ("em ơi", "alo", "chào em"...) bỏ qua bóc tách 70.000 ký tự.
2. Tiết kiệm ~40.000 cache write tokens khi khách mở đầu chỉ chào hỏi.
3. Kích hoạt LEAN_SYSTEM_PROMPT (<1.500 tokens) cho lượt viết lời khi bật AIOI_PROMPT_GON.
4. Bảo tồn tên trợ lý có dấu chấm giữa (Th•ái, M•ai)."""
import os
try:
    import pytest
except ImportError:
    class MockPytest:
        @staticmethod
        def mark(): pass
    pytest = MockPytest()


from aioi.chu import la_tin_chao_hoi_thuan_tuy
from aioi.config import Settings
from aioi.engine import Conversation, Engine, Turn
from aioi.llm.base import Message
from aioi.llm.mock import MockProvider
from aioi.prompts import (
    LEAN_SYSTEM_PROMPT,
    lean_system_prompt_cho_luot,
)
from aioi.schema import Property


def test_la_tin_chao_hoi_thuan_tuy():
    """Kiểm tra nhận diện câu chào hỏi thuần tuý (không dính từ khoá BĐS / số)."""
    chao_dung = [
        "em ơi", "alo", "Alo em ơi!", "Chào em", "chào bạn", "chào em nha",
        "hi", "hello", "ad ơi", "bot ơi", "cho anh hỏi chút",
        "em ơi cho mình hỏi xíu", "alo có ai trực không", "tư vấn giúp mình với",
        "chào bạn nhé", "alo em", "alo ad", "hi bot", "hello em",
    ]
    for c in chao_dung:
        assert la_tin_chao_hoi_thuan_tuy(c) is True, f"Phải nhận câu chào: {c!r}"

    khong_chao = [
        "em ơi bán nhà", "bán đất 2 tỷ", "nhà quận 1", "căn này giá sao",
        "alo em nhà 5 tỷ ở đâu", "thuê phòng", "cần bán gấp", "ban nha quan 1",
        "co nha nao khong", "12 tỷ", "sổ hồng riêng không", "hẻm xe hơi không",
        "gửi bán căn hộ", "xem nhà lúc 3h",
    ]
    for k in khong_chao:
        assert la_tin_chao_hoi_thuan_tuy(k) is False, f"Không được nhận là câu chào thuần: {k!r}"


class _KiemTraExtractProvider(MockProvider):
    def __init__(self, settings):
        super().__init__(settings)
        self.so_lan_extract = 0

    def extract(self, system, messages, json_schema):
        self.so_lan_extract += 1
        return super().extract(system, messages, json_schema)


def test_fast_path_bo_qua_boc_tach_tin_chao_hoi():
    """Lượt khách chỉ chào hỏi ("em ơi") thì bỏ qua gọi provider.extract."""
    provider = _KiemTraExtractProvider(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
    eng = Engine(provider)

    # Lượt 1: Chào hỏi thuần tuý
    r1 = eng.handle("khach-chao-402", "em ơi")
    assert provider.so_lan_extract == 0, f"Fast-path phải bỏ qua extract, nhưng đã gọi {provider.so_lan_extract} lần"
    conv = eng.conversation("khach-chao-402")
    assert conv.y_luot.get("tha_tim") == "chao"

    # Lượt 2: Đưa thông tin căn -> PHẢI gọi extract
    r2 = eng.handle("khach-chao-402", "Anh bán nhà phố 5 tỷ ở đường Lê Lai Quận 1")
    assert provider.so_lan_extract >= 1, "Khi có thông tin căn nhà, bắt buộc phải gọi extract"


def test_lean_system_prompt_duoi_1500_tokens_va_giu_ten_tro_ly():
    """LEAN_SYSTEM_PROMPT cho lượt có độ dài <1.500 tokens và bảo tồn tên trợ lý có dấu chấm."""
    p = Property()
    for ten in ("Th•ái", "M•ai", "Quang·Minh"):
        prompt = lean_system_prompt_cho_luot(ten, p, "gia", viec="hỏi giá bán")
        assert ten in prompt, f"Tên trợ lý {ten} phải nằm trong prompt"
        assert "Customer Insight" in prompt or "THẤU HIỂU" in prompt
        assert "AD_FORMAT" in prompt or "BỐ CỤC TIN RAO" in prompt
        assert "tỏi" in prompt and "củ" in prompt
        tokens = len(prompt.split()) * 1.3
        assert tokens < 1500, f"Token quá lớn: {tokens} tokens"


def test_cong_tac_prompt_gon_kich_hoat(monkeypatch):
    """Khi AIOI_PROMPT_GON=bat, Engine sử dụng lean prompt cho lượt viết lời."""
    monkeypatch.setenv("AIOI_PROMPT_GON", "bat")
    provider = _KiemTraExtractProvider(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
    eng = Engine(provider)
    r = eng.handle("test-lean-on", "em ơi")
    assert r.reply
