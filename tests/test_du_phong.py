"""21/10/2026 (SRS-5.1zzzzzzz117). Tài khoản Anthropic hết số dư lúc 10:14 UTC — mọi lượt trả lời thành câu giữ chỗ, bot câm với cả khách
thật. Lê Quang: "cho key anthropic hết thì qua gemini, hết lun thì qua groq". Đỏ khi Claude hỏng mà không đi tiếp Gemini → Groq, khi lỗi
không chữa được bằng đổi model bị nuốt, hay khi lượt dự phòng lọt đoạn <think> tới khách."""
import pytest

from aioi.config import Settings
from aioi.llm import build_provider
from aioi.llm.base import LLMProvider, Message
from aioi.llm.du_phong import URL_GEMINI, URL_GROQ, DuPhongProvider, LoiNguon, Nguon, nen_doi_sang


class HetTien(Exception):
    status_code = 400

    def __str__(self):
        return "Error code: 400 - {'message': 'Your credit balance is too low to access the Anthropic API.'}"


class SaiSchema(Exception):
    status_code = 400

    def __str__(self):
        return "Error code: 400 - tools.0.input_schema: invalid"


class ClaudeGia(LLMProvider):
    def __init__(self, loi=None):
        self.loi, self.goi = loi, 0

    def _chay(self, kq):
        self.goi += 1
        if self.loi:
            raise self.loi
        return kq

    def chat(self, system, messages, max_tokens=256): return self._chay("claude")
    def reply(self, system, messages, max_tokens=256): return self._chay("claude")
    def extract(self, system, messages, json_schema): return self._chay({"tu": "claude"})
    def describe_media(self, items, instruction, max_tokens=1024): return self._chay("claude anh")
    def group_media(self, items, labels, instruction, json_schema): return self._chay({})
    def extract_media(self, items, instruction, json_schema): return self._chay({})


class So:
    def __init__(self):
        self.loi, self.token = [], []
    def ghi_loi(self, nguon, chi_tiet): self.loi.append((nguon, chi_tiet))
    def ghi_du_phong(self, model, vao, ra): self.token.append((model, vao, ra))


def _nguon():
    return [Nguon("Gemini", URL_GEMINI, ["kg"], ["gemini-x"], True), Nguon("Groq", URL_GROQ, ["kq"], ["qwen-x", "oss-x"], False)]


def _dap(chu):
    return {"choices": [{"message": {"content": chu}}], "usage": {"prompt_tokens": 10, "completion_tokens": 5}}


M = [Message("user", "chị bán nhà")]


def test_claude_het_tien_thi_qua_gemini_va_ghi_so():
    goi = []
    so = So()
    p = DuPhongProvider(ClaudeGia(HetTien()), _nguon(), so=so, goi=lambda n, k, than, han: goi.append((n.ten, than)) or _dap("Em ghi rồi chị."))
    assert p.reply("hệ thống", M) == "Em ghi rồi chị."
    assert goi[0][0] == "Gemini" and goi[0][1]["reasoning_effort"] == "low" and goi[0][1]["messages"][0]["role"] == "system"
    assert so.token == [("Gemini:gemini-x", 10, 5)] and so.loi and so.loi[0][0] == "du phong"


def test_het_tien_thi_nghi_claude_mot_luc():
    claude = ClaudeGia(HetTien())
    p = DuPhongProvider(claude, _nguon(), goi=lambda n, k, than, han: _dap("ok"))
    p.reply("s", M)
    p.reply("s", M)
    assert claude.goi == 1                       # lượt thứ hai không gọi Claude hỏng lần nữa


def test_gemini_hong_thi_qua_groq_va_bo_doan_nghi():
    def goi(n, k, than, han):
        if n.ten == "Gemini":
            raise LoiNguon("Gemini HTTP 429", 429)
        assert than["reasoning_format"] == "hidden"
        return _dap("<think>phân tích...</think>Nhà mình ở phường nào vậy chị?")
    p = DuPhongProvider(ClaudeGia(HetTien()), _nguon(), goi=goi)
    assert p.chat("s", M) == "Nhà mình ở phường nào vậy chị?"


def test_extract_doc_json_va_schema_khong_strict_thi_xin_bang_loi():
    schema = {"type": "object", "properties": {"operations": {"type": "array", "items": {"type": "object"}}}}
    lan = []

    def goi(n, k, than, han):
        lan.append("response_format" in than)
        if "response_format" in than:
            raise LoiNguon("Gemini HTTP 400", 400)
        return _dap('```json\n{"operations": "[{\\"op\\": \\"update\\"}]"}\n```')
    p = DuPhongProvider(ClaudeGia(HetTien()), _nguon(), goi=goi)
    assert p.extract("s", M, schema) == {"operations": [{"op": "update"}]}
    assert lan == [True, False]


def test_loi_khong_chua_duoc_bang_doi_model_thi_nem_len():
    p = DuPhongProvider(ClaudeGia(SaiSchema()), _nguon(), goi=lambda n, k, than, han: _dap("không được tới đây"))
    with pytest.raises(SaiSchema):
        p.extract("s", M, {"type": "object"})
    assert not nen_doi_sang(SaiSchema()) and nen_doi_sang(HetTien())


def test_anh_bo_qua_groq_pdf_khong_doc():
    goi = []
    def g(n, k, than, han):
        goi.append(n.ten)
        raise LoiNguon(f"{n.ten} HTTP 503", 503)
    p = DuPhongProvider(ClaudeGia(HetTien()), _nguon(), goi=g)
    with pytest.raises(HetTien):                 # hết đường → ném lỗi gốc của Claude (còi "hết tiền" đọc lỗi này)
        p.describe_media([(b"x", "image/jpeg")], "đọc ảnh")
    assert goi == ["Gemini"]                     # Groq không nhìn được ảnh
    goi.clear()
    with pytest.raises(HetTien):
        p.describe_media([(b"%PDF", "application/pdf")], "đọc")
    assert goi == []                             # PDF: không nguồn dự phòng nào đọc → không gọi


def test_build_provider_chi_boc_khi_co_khoa():
    co = Settings(provider="claude", anthropic_api_key="k", chat_model="a", vision_model="b", gemini_api_keys=("g",))
    khong = Settings(provider="claude", anthropic_api_key="k", chat_model="a", vision_model="b")
    assert isinstance(build_provider(co), DuPhongProvider)
    assert not isinstance(build_provider(khong), DuPhongProvider)


# --- SRS-5.1zzzzzzz133 (22/10/2026, Lê Quang: "rút ngắn đi"): theo dõi thật 13:36 — Claude hết số dư, vòng dự phòng thử từng khoá × model,
# mỗi lần chờ 30 s, một lượt khách hơn 4 phút; bridge chờ 90 s rồi bỏ → lời bot không tới Zalo. Đỏ khi hạn một lần gọi dài lại, khi model
# quá hạn mà vẫn thử khoá khác của cùng model, hay khi cả vòng chạy quá ngân sách mà không dừng. -----------------------------------------
import socket
import urllib.error

from aioi.llm import du_phong


def test_han_moi_lan_goi_khong_qua_20s():
    hans = []
    p = DuPhongProvider(ClaudeGia(HetTien()), _nguon(), goi=lambda n, k, than, han: hans.append(han) or _dap('{"tu": "g"}'))
    p.extract("s", M, {"type": "object"})          # extract xin 4096 token — trước đây tới 30 s
    p.chat("s", M)
    assert max(hans) <= du_phong.HAN_MOT_LAN_GIAY == 20.0 and min(hans) >= 10.0


def test_model_qua_han_thi_bo_khoa_con_lai_sang_model_ke():
    goi = []
    nguon = [Nguon("Gemini", URL_GEMINI, ["k1", "k2", "k3"], ["g-lite", "g-flash"], True), Nguon("Groq", URL_GROQ, ["kq"], ["qwen-x"], False)]

    def g(n, k, than, han):
        goi.append((than["model"], k))
        if than["model"] == "g-lite":
            raise urllib.error.URLError(socket.timeout("timed out"))     # model chậm: quá hạn
        if than["model"] == "g-flash":
            raise LoiNguon("Gemini HTTP 429", 429)                       # quá nhịp: lỗi theo khoá → thử khoá kế
        return _dap("Em ghi rồi chị.")
    p = DuPhongProvider(ClaudeGia(HetTien()), nguon, goi=g)
    assert p.chat("s", M) == "Em ghi rồi chị."
    assert goi == [("g-lite", "k1"), ("g-flash", "k1"), ("g-flash", "k2"), ("g-flash", "k3"), ("qwen-x", "kq")]


def test_ca_vong_du_phong_qua_ngan_sach_thi_dung(monkeypatch):
    dong_ho = [1000.0]
    monkeypatch.setattr(du_phong.time, "time", lambda: dong_ho[0])
    goi = []

    def g(n, k, than, han):
        goi.append(than["model"])
        dong_ho[0] += 25.0                                                # mỗi lần gọi "mất" 25 s rồi hỏng
        raise LoiNguon(f"{n.ten} HTTP 503", 503)
    nguon = [Nguon("Gemini", URL_GEMINI, ["k1", "k2"], ["g1", "g2", "g3"], True), Nguon("Groq", URL_GROQ, ["kq"], ["q1"], False)]
    p = DuPhongProvider(ClaudeGia(HetTien()), nguon, goi=g)
    with pytest.raises(LoiNguon):
        p.chat("s", M)
    assert len(goi) == 2 and goi == ["g1", "g1"]                          # 25 s + 25 s > 40 s → dừng, không chạy hết 7 đường
