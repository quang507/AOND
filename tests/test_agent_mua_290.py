"""29/10/2026 (SRS-5.1zzzzzzz290). Chủ dự án: "Ok thử … sang kiểu Suy nghĩ -> Chọn công cụ -> Thực thi -> Đánh giá thôi còn bóc tách vẫn dùng
haiku". Lượt viết lời phía mua có công cụ CHỈ ĐỌC; model tự quyết có tra không; bóc tách + việc ghi giữ đường cũ. Ca 1–4 đỏ khi gỡ bản sửa."""
from aioi.llm.base import ToolCall, ToolTurn
from tests.test_viec_mua import CAN, KHACH_MUA, AiGia, KhoGia
from aioi.engine import Engine

CAN7 = {**CAN, "id": "77777777-7777-7777-7777-777777777777", "code": "Q7AAAAAA", "district": "Quận 7", "street": "Nguyễn Thị Thập"}


class AiCongCu(AiGia):
    """Lượt lập thao tác như AiGia; lượt viết lời có công cụ chạy theo `kich_ban` (mỗi phần tử một lần gọi model)."""

    def __init__(self, ke_hoach, kich_ban):
        super().__init__(ke_hoach)
        self.kich_ban, self.goi_cc, self.he_cc = list(kich_ban), [], []

    def converse(self, system, messages, tools, max_tokens=1024):
        self.goi_cc.append(messages)
        self.he_cc.append(system)
        b = self.kich_ban.pop(0) if self.kich_ban else ToolTurn(text="Hết kịch bản.", tool_calls=[])
        return b


class KhoQ7(KhoGia):
    def _request(self, method, endpoint, data=None, prefer=None):
        if endpoint.startswith("rpc/tim_nha") and (data or {}).get("p_khu") == "Quận 7":
            self.goi.append((method, endpoint, data))
            return [{"can": CAN7, "diem": 3, "ly_do": "đúng khu"}]
        return super()._request(method, endpoint, data, prefer)


def _goi(ten, **inp):
    return ToolCall(id=f"t-{ten}", name=ten, input=inp)


def test_model_tu_tra_can_theo_tieu_chi_moi_roi_moi_viet_loi(monkeypatch):
    monkeypatch.setenv("AIOI_AGENT_MUA", "thu")
    kho = KhoQ7()
    ai = AiCongCu(KHACH_MUA, [ToolTurn(text="để em xem", tool_calls=[_goi("tim_can", khu_vuc="Quận 7")], assistant_content=[]),
                              ToolTurn(text="Có căn Nguyễn Thị Thập Quận 7 hợp anh nè.", tool_calls=[])])
    eng = Engine(ai, conversation_store=kho)
    r = eng.handle("thu-290", "à đổi qua quận 7 được không em")
    assert r.reply == "Có căn Nguyễn Thị Thập Quận 7 hợp anh nè."           # chữ ở lượt gọi công cụ ("để em xem") không tới khách
    assert any(d.get("p_khu") == "Quận 7" for m, e, d in kho.goi if e.startswith("rpc/tim_nha"))
    ket = ai.goi_cc[1][-1]["content"][0]
    assert ket["type"] == "tool_result" and "#Q7AAAAAA" in ket["content"]
    assert "CÔNG CỤ TRA KHO" in ai.he_cc[0]


def test_het_tran_vong_thi_viet_loi_thuong_kem_ket_qua_tra(monkeypatch):
    monkeypatch.setenv("AIOI_AGENT_MUA", "bat")
    lap = ToolTurn(text="", tool_calls=[_goi("xem_can", ma=["ABCD1234"])], assistant_content=[])
    ai = AiCongCu(KHACH_MUA, [lap, lap, lap, lap])
    eng = Engine(ai, conversation_store=KhoGia())
    r = eng.handle("mua-290b", "căn đó sổ gì em")
    assert r.reply   # lời từ `reply` thường (AiGia.chat), không rỗng
    assert len(ai.goi_cc) == 3
    assert any("KẾT QUẢ EM VỪA TRA KHO" in s and "#ABCD1234" in s for s in ai.system)


def test_cong_cu_loi_thi_noi_that_khong_vo_luot(monkeypatch):
    monkeypatch.setenv("AIOI_AGENT_MUA", "bat")

    class KhoHong(KhoGia):
        def du_an_theo_khu(self, khu, toi_da=8):
            raise OSError("mạng")

    ai = AiCongCu(KHACH_MUA, [ToolTurn(text="", tool_calls=[_goi("du_an_trong_khu", khu="Quận 7")], assistant_content=[]),
                              ToolTurn(text="Em chưa tra được, anh đợi em chút nha.", tool_calls=[])])
    r = Engine(ai, conversation_store=KhoHong()).handle("mua-290c", "quận 7 có dự án gì")
    assert r.reply == "Em chưa tra được, anh đợi em chút nha."
    assert "Tra kho lỗi" in ai.goi_cc[1][-1]["content"][0]["content"]


def test_cong_tac_thu_chi_bat_cho_id_thu(monkeypatch):
    monkeypatch.setenv("AIOI_AGENT_MUA", "thu")
    ai = AiCongCu(KHACH_MUA, [ToolTurn(text="không được tới đây", tool_calls=[])])
    r = Engine(ai, conversation_store=KhoGia()).handle("khach-that-290", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    assert ai.goi_cc == [] and "không được tới đây" not in r.reply   # khách thật: đường cũ, không vòng công cụ


def test_tat_thi_nhu_cu(monkeypatch):
    monkeypatch.delenv("AIOI_AGENT_MUA", raising=False)
    ai = AiCongCu(KHACH_MUA, [])
    Engine(ai, conversation_store=KhoGia()).handle("thu-290e", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    assert ai.goi_cc == []
