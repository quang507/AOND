"""SRS-5.1zzzzzzz49: mọi lượt gọi Claude của lõi Python phải vào sổ token (cong_token) với model THẬT, để /admin quy ra đô."""
from types import SimpleNamespace

from aioi.config import Settings
from aioi.llm.base import Message
from aioi.so_token import SoToken, dem_token


def _resp(model="claude-haiku-4-5-20251001", tool=False):
    usage = SimpleNamespace(input_tokens=120, output_tokens=30, cache_creation_input_tokens=4200,
                            cache_read_input_tokens=9000)
    block = (SimpleNamespace(type="tool_use", id="t1", name="x", input={"a": 1}) if tool
             else SimpleNamespace(type="text", text="ok"))
    return SimpleNamespace(model=model, usage=usage, content=[block], stop_reason="end_turn")


class _FakeMessages:
    def __init__(self):
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        return _resp(model=kw["model"] + "-20251001", tool="tool_choice" in kw)


def _provider(ghi_lai):
    from aioi.llm.claude import ClaudeProvider
    p = ClaudeProvider(Settings(provider="claude", anthropic_api_key="test", chat_model="claude-haiku-4-5",
                                vision_model="claude-opus-4-8", extract_model="claude-haiku-4-5"))
    p._client = SimpleNamespace(messages=_FakeMessages())
    p._so = SoToken(ghi_lai.append, nen=False)
    return p


def test_moi_luot_goi_claude_deu_vao_so_voi_model_that():
    so = []
    p = _provider(so)
    anh = [(b"%PDF-1.4 x", "application/pdf")]
    p.chat("s", [Message("user", "hi")])
    p.extract("s", [Message("user", "hi")], {"type": "object"})
    p.converse("s", [{"role": "user", "content": "hi"}], [])
    p.describe_media(anh, "đọc")
    p.group_media(anh, ["a.pdf"], "nhóm", {"type": "object"})
    p.extract_media(anh, "bóc", {"type": "object"})
    assert len(so) == 6                                     # cả sáu chỗ gọi API, không sót chỗ nào
    assert [b["p_model"] for b in so] == ["claude-haiku-4-5-20251001"] * 3 + ["claude-opus-4-8-20251001"] * 3
    assert so[0] == {"p_in": 120, "p_out": 30, "p_cache_write": 4200, "p_cache_read": 9000,
                     "p_model": "claude-haiku-4-5-20251001"}


def test_so_hong_khong_lam_hong_luot_chat():
    def hong(_body):
        raise OSError("mạng đứt")
    p = _provider([])
    p._so = SoToken(hong, nen=False)
    assert p.chat("s", [Message("user", "hi")]) == "ok"


def test_khong_co_supabase_thi_chi_log_khong_gui():
    so = SoToken.tu_cau_hinh(None, None)
    assert so._gui is None
    assert so.ghi("chat", "claude-haiku-4-5", _resp())["p_in"] == 120


def test_khong_co_usage_thi_khong_ghi():
    assert dem_token(SimpleNamespace(content=[])) is None
    assert SoToken(lambda b: None, nen=False).ghi("chat", "m", SimpleNamespace()) is None


def test_dau_song_va_bao_het_so_du_cho_the_quota():
    # SRS-5.1zzzzzzz56: thẻ Quota tiêu hao biết "hết số dư" nhờ bot_health('model_chinh') + dòng sổ lỗi "credit balance is too
    # low" — bot TS ghi, lõi Python thì không.
    goi = []
    p = _provider([])
    p._so = SoToken(lambda b: None, nen=False, rpc=lambda ten, body: goi.append((ten, body)))
    p.chat("s", [Message("user", "hi")])
    assert ("beat", {"p_who": "model_chinh"}) in goi

    class HetTien(Exception):
        pass

    def tu_choi(**kw):
        raise HetTien("Error code: 400 - Your credit balance is too low to access the Anthropic API.")
    p._client = SimpleNamespace(messages=SimpleNamespace(create=tu_choi))
    try:
        p.chat("s", [Message("user", "hi")])
    except HetTien:
        pass
    ten, body = goi[-1]
    assert ten == "log_loi" and "credit balance is too low" in body["p_detail"] and body["p_source"] == "claude chat"
