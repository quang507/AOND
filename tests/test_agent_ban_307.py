"""30/10/2026 (SRS-5.1zzzzzzz307, B2 bước 2). Chủ dự án: "làm nốt b2 nhưng vẫn lưu các hàm để dễ gọi". Công tắc AGENT_BAN bật: lượt viết lời
người bán KHÔNG nhét sẵn khối rổ hàng / bộ nhớ dự án / giá đã gửi — prompt chỉ có một dòng báo dữ liệu có thể tra, model gọi công cụ; thân công cụ
là CHÍNH hàm khối cũ. Tắt: đường cũ y nguyên. Ca 1–2 đỏ khi gỡ bản sửa."""
from aioi.config import Settings
from aioi.engine import Engine
from aioi.llm.base import ToolCall, ToolTurn
from aioi.llm.mock import MockProvider

ST = Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")


class _Ai(MockProvider):
    def __init__(self, kich_ban):
        super().__init__(ST)
        self.kich_ban, self.he, self.tin, self.he_reply = list(kich_ban), [], [], []

    def converse(self, system, messages, tools, max_tokens=1024):
        self.he.append(system)
        self.tin.append(messages)
        self.cong_cu = [t["name"] for t in tools]
        return self.kich_ban.pop(0) if self.kich_ban else ToolTurn(text="Hết kịch bản.", tool_calls=[])

    def reply(self, system, messages, max_tokens=256):
        self.he_reply.append(system)
        return super().reply(system, messages, max_tokens)


def _eng(ai, key):
    eng = Engine(ai)
    eng.import_listings(key, [{"ma_so_can": "A1", "dia_chi": "12 Cao Lỗ, Quận 8", "gia": "8 tỷ"},
                              {"ma_so_can": "B2", "dia_chi": "5 Âu Cơ, Tân Bình", "gia": "6 tỷ"}])
    return eng


def test_bat_thi_khoi_du_lieu_thanh_cong_cu_va_model_tu_tra(monkeypatch):
    monkeypatch.setenv("AIOI_AGENT_BAN", "thu")
    ai = _Ai([ToolTurn(text="", tool_calls=[ToolCall("t1", "ro_hang", {})], assistant_content=[]),
              ToolTurn(text="Căn Cao Lỗ hay căn Âu Cơ anh?", tool_calls=[])])
    eng = _eng(ai, "thu-307")
    r = eng.handle("thu-307", "căn đó bán rồi em")
    assert r.reply == "Căn Cao Lỗ hay căn Âu Cơ anh?"
    assert "RỔ HÀNG CỦA KHÁCH" not in ai.he[0] and "DỮ LIỆU CÓ THỂ TRA lượt này: ro_hang" in ai.he[0]
    assert "CÔNG CỤ TRA DỮ LIỆU CỦA KHÁCH" in ai.he[0] and {"ro_hang", "bo_nho_du_an", "gia_da_gui"} <= set(ai.cong_cu)
    ket = ai.tin[1][-1]["content"][0]
    assert ket["type"] == "tool_result" and ket["content"] == eng._basket_block(eng.conversation("thu-307")).strip()


def test_tat_thi_duong_cu_y_nguyen(monkeypatch):
    monkeypatch.setenv("AIOI_AGENT_BAN", "thu")
    ai = _Ai([])
    eng = _eng(ai, "khach-307")          # không phải ID thử → "thu" không áp
    eng.handle("khach-307", "căn đó bán rồi em")
    assert not ai.he and any("RỔ HÀNG CỦA KHÁCH" in s for s in ai.he_reply)


def test_het_tran_thi_viet_loi_thuong_kem_ket_qua_tra(monkeypatch):
    monkeypatch.setenv("AIOI_AGENT_BAN", "bat")
    lap = ToolTurn(text="", tool_calls=[ToolCall("t", "gia_da_gui", {})], assistant_content=[])
    ai = _Ai([lap, lap, lap, lap])
    eng = _eng(ai, "s307")
    r = eng.handle("s307", "giá căn A1 anh gửi bao nhiêu nhỉ")
    assert r.reply and len(ai.he) == 3
    assert any("KẾT QUẢ EM VỪA TRA" in s and "A1" in s for s in ai.he_reply)


def test_khong_co_du_lieu_de_tra_thi_khong_mo_vong_cong_cu(monkeypatch):
    monkeypatch.setenv("AIOI_AGENT_BAN", "bat")
    ai = _Ai([])
    Engine(ai).handle("s307b", "bán nhà hẻm Cao Lỗ quận 8 giá 8 tỷ")   # một căn, không dự án, không bảng giá → không có gì để tra
    assert not ai.he and ai.he_reply
