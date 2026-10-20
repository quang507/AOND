"""19/10/2026 (SRS-5.1zzzzzzz76). Khách nhận ghi chú tự soát của model hai lần: "Wait, the system prohibits "Dạ" at start…
Rewrite." (lưới chữ không dấu chặn được) rồi "Lưu ý: vi phạm quy tắc một câu hỏi. Sửa lại: …" (tiếng Việt — lưới chữ thủng). Gốc:
lời trả lời là chữ tự do, model không có chỗ tự soát. Nay lượt trả lời khách BẮT BUỘC gọi công cụ hai ô; chỉ `loi_gui_khach` tới
khách. Đỏ khi lượt trả lời quay về chữ tự do hoặc engine gọi `chat` cho lời gửi khách."""
from types import SimpleNamespace

from aioi.config import Settings
from aioi.engine import Engine
from aioi.llm.base import Message
from aioi.llm.mock import MockProvider
from aioi.so_token import SoToken


class _Api:
    def __init__(self):
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        usage = SimpleNamespace(input_tokens=1, output_tokens=1, cache_creation_input_tokens=0, cache_read_input_tokens=0)
        tu_soat = SimpleNamespace(type="text", text="Lưu ý: vi phạm quy tắc một câu hỏi. Sửa lại:")
        cong_cu = SimpleNamespace(type="tool_use", id="t", name="gui_khach",
                                  input={"tu_soat": "hỏi hai ý — bỏ ý hoàn công", "loi_gui_khach": "Giá anh mong muốn bao nhiêu ạ?"})
        return SimpleNamespace(model=kw["model"], usage=usage, content=[tu_soat, cong_cu], stop_reason="tool_use")


def test_chi_loi_gui_khach_toi_khach():
    from aioi.llm.claude import ClaudeProvider
    p = ClaudeProvider(Settings(provider="claude", anthropic_api_key="test", chat_model="claude-haiku-4-5", vision_model="v"))
    p._client = SimpleNamespace(messages=_Api())
    p._so = SoToken(None, nen=False)
    assert p.reply("s", [Message("user", "nhà mình có sổ riêng")]) == "Giá anh mong muốn bao nhiêu ạ?"
    goi = p._client.messages.calls[0]
    assert goi["tool_choice"] == {"type": "tool", "name": "gui_khach"}
    assert list(goi["tools"][0]["input_schema"]["properties"]) == ["tu_soat", "loi_gui_khach"]   # soát TRƯỚC, viết SAU


def test_engine_tra_loi_khach_qua_reply_khong_qua_chat():
    S = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")

    class Ghi(MockProvider):
        goi: list = []

        def reply(self, system, messages, max_tokens=256):
            self.goi.append("reply")
            return "Dạ em nghe ạ."

        def chat(self, system, messages, max_tokens=256):
            self.goi.append("chat")
            return super().chat(system, messages, max_tokens)

    m = Ghi(S)
    Engine(m).handle("k", "Mình cần bán nhà phố")
    assert "reply" in m.goi and "chat" not in m.goi


def test_o_loi_gui_khach_rong_thi_goi_lai_mot_lan():
    # Bắn thử 19/10: "Phường 9 em" nhận câu dự phòng "kết nối mạng vừa gián đoạn" — lượt model ra ô lời gửi khách trống.
    from aioi.llm.claude import ClaudeProvider

    class Api(_Api):
        def create(self, **kw):
            r = super().create(**kw)
            if len(self.calls) == 1:
                r.content[1].input = {"tu_soat": "…"}
            return r

    p = ClaudeProvider(Settings(provider="claude", anthropic_api_key="test", chat_model="claude-haiku-4-5", vision_model="v"))
    p._client = SimpleNamespace(messages=Api())
    loi_ghi = []
    p._so = SoToken(None, nen=False)
    p._so.ghi_loi = lambda nguon, chi_tiet: loi_ghi.append((nguon, chi_tiet))
    assert p.reply("s", [Message("user", "Phường 9 em")]) == "Giá anh mong muốn bao nhiêu ạ?"
    assert len(p._client.messages.calls) == 2 and loi_ghi and "rỗng" in loi_ghi[0][1]


def test_ten_o_go_co_dau_van_nhan_khong_goi_lai():
    # Bắn thử 20/10 (run 39358553275): Haiku trả ô "loi_gui_khách" (có dấu) → lời rỗng, tốn một lượt gọi lại (SRS-5.1zzzzzzz81).
    from aioi.llm.claude import ClaudeProvider

    class Api(_Api):
        def create(self, **kw):
            r = super().create(**kw)
            r.content[1].input = {"tu_soat": "…", "loi_gui_khách": "Giá anh mong muốn bao nhiêu ạ?"}
            return r

    p = ClaudeProvider(Settings(provider="claude", anthropic_api_key="test", chat_model="claude-haiku-4-5", vision_model="v"))
    p._client = SimpleNamespace(messages=Api())
    p._so = SoToken(None, nen=False)
    assert p.reply("s", [Message("user", "Phường 9 em")]) == "Giá anh mong muốn bao nhiêu ạ?"
    assert len(p._client.messages.calls) == 1

def test_ban_nhap_bo_cau_dan_truoc_dong_mo_dau():
    from aioi.prompts import MO_DAU_NHAP, cat_truoc_mo_dau
    nhap = f"{MO_DAU_NHAP[1]}\n\nBán nhà phố mặt tiền Âu Cơ…"
    assert cat_truoc_mo_dau("Em ghi nhận đủ thông tin rồi ạ. Em sẽ rao như vầy nhé anh:\n\n" + nhap) == nhap
    assert cat_truoc_mo_dau(nhap) == nhap
    # SRS-5.1zzzzzzz80: model chép dòng mở đầu thiếu 📋 → vẫn bỏ câu dẫn và gắn lại đúng dòng cố định
    assert cat_truoc_mo_dau("Em ghi nhận đủ thông tin rồi anh ạ. " + nhap.removeprefix("📋 ")) == nhap
    assert cat_truoc_mo_dau("Anh cho em hỏi giá nhé?") == "Anh cho em hỏi giá nhé?"
    # SRS-5.1zzzzzzz85 (bắn thử 20/10 lần 3): model đổi chữ gọi khách trong dòng mở đầu
    assert cat_truoc_mo_dau("Em ghi nhận giá 16 tỷ rồi anh. Em sẽ rao như vầy nhé anh:\n\nBán nhà MT Âu Cơ") == \
        f"{MO_DAU_NHAP[1]}\n\nBán nhà MT Âu Cơ"
    assert cat_truoc_mo_dau("Mình sẽ rao như vầy nhé bạn:\nBán đất") == f"{MO_DAU_NHAP[0]}\nBán đất"
