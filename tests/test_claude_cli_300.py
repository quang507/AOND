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


def test_converse_gia_lap_cong_cu_307():
    """SRS-5.1zzzzzzz307: CLI không nhận công cụ riêng — vòng agent giả lập bằng JSON {goi, loi}; vòng sau ghi lại lời gọi + kết quả."""
    goi = []
    tra = iter([{"structured_output": {"goi": [{"ten": "tra", "vao": {"q": "x"}}, {"ten": "la", "vao": {}}], "loi": "để em xem"}},
                {"structured_output": {"goi": [], "loi": "Có rồi anh"}}])

    def chay(model, system, loi_nhan, schema):
        goi.append((system, loi_nhan, schema))
        return next(tra)

    p = ClaudeCliProvider(_st(), chay=chay)
    cc = [{"name": "tra", "description": "Tra kho.", "input_schema": {"type": "object"}}]
    t1 = p.converse("S", [{"role": "user", "content": "hỏi"}], cc)
    assert [c.name for c in t1.tool_calls] == ["tra"] and t1.text == ""           # công cụ lạ bị bỏ; lượt gọi công cụ không có lời
    assert goi[0][2]["properties"]["goi"]["items"]["properties"]["ten"]["enum"] == ["tra"] and "tra: Tra kho." in goi[0][0]
    tin = [{"role": "user", "content": "hỏi"}, {"role": "assistant", "content": t1.assistant_content},
           {"role": "user", "content": [{"type": "tool_result", "tool_use_id": t1.tool_calls[0].id, "content": "KQ123"}]}]
    t2 = p.converse("S", tin, cc)
    assert t2.text == "Có rồi anh" and not t2.tool_calls
    assert "em gọi công cụ tra" in goi[1][1] and "KQ123" in goi[1][1] and "KHÔNG phải khách nói" in goi[1][1]
