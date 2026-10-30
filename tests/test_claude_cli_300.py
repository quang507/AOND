"""30/10/2026 (SRS-5.1zzzzzzz300). Chủ dự án: "cài claude code dùng quota của bên mình đi" — provider CHỈ ĐỂ TEST gọi `claude -p`. Kiểm khuôn gọi,
không chạy CLI thật."""
from aioi.config import Settings
from aioi.llm import build_provider
from aioi.llm.base import RANH_GIOI_CACHE, Message
from aioi.llm.claude_cli import ClaudeCliProvider, _ghi_chep


def _st(**k):
    return Settings(provider="claude_cli", anthropic_api_key=None, chat_model="claude-haiku-5-5", vision_model="y",
                    extract_model="claude-haiku-5-5", **k)


def test_build_provider_chon_cli():
    assert isinstance(build_provider(_st()), ClaudeCliProvider)


def test_chat_va_extract_dung_khuon():
    goi = []

    def chay(model, system, loi_nhan, schema):
        goi.append((model, system, loi_nhan, schema))
        return {"result": "Chào anh", "total_cost_usd": 0.001} if schema is None else \
            {"result": "", "structured_output": {"gia": "5 tỷ"}, "total_cost_usd": 0.002}

    p = ClaudeCliProvider(_st(), chay=chay)
    tin = [Message("user", "bán nhà giá 5 tỷ")]
    assert p.chat("CỐ ĐỊNH" + RANH_GIOI_CACHE + "ĐỔI", tin) == "Chào anh"
    assert RANH_GIOI_CACHE not in goi[0][1]                       # dấu cache chỉ dành cho API
    assert p.extract("S", tin, {"type": "object", "properties": {"gia": {"type": "string"}}}) == {"gia": "5 tỷ"}
    assert goi[1][3] is not None and p.so_lan == 2 and abs(p.tien_quy_doi - 0.003) < 1e-9


def test_ghi_chep_giu_thu_tu_va_vai():
    s = _ghi_chep([Message("user", "a"), Message("assistant", "b"), Message("user", "c")])
    assert s.index("KHÁCH: a") < s.index("EM (bot): b") < s.index("KHÁCH: c")
