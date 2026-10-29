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


# --- SRS-5.1zzzzzzz292 -------------------------------------------------------------------------------------------------------------------
def test_bo_tach_bo_sot_hen_xem_thi_agent_ghi_lich(monkeypatch):
    """Bắn thử ban-thu-mua lần 2 (29/10): Haiku không đọc ra hẹn xem / câu hỏi chủ nhà → việc mất. Nay Sonnet ghi qua công cụ."""
    monkeypatch.setenv("AIOI_AGENT_MUA", "bat")
    kho = KhoGia()
    ai = AiCongCu(KHACH_MUA, [ToolTurn(text="", tool_calls=[_goi("hen_xem", ma="ABCD1234", gio="3h chiều thứ 7"),
                                                           _goi("hoi_chu_nha", ma="ABCD1234", cau_hoi="Nhà có sổ hồng riêng không?")],
                                       assistant_content=[]),
                              ToolTurn(text="Em ghi lịch 3h chiều thứ 7 và hỏi chủ nhà về sổ rồi nha.", tool_calls=[])])
    Engine(ai, conversation_store=kho).handle("mua-292", "chiều thứ 7 3h anh qua xem được không, sổ hồng riêng không em")
    v, ir = kho.ghi("POST", "viewings"), kho.ghi("POST", "info_requests")
    assert v and v[0]["time_text"] == "3h chiều thứ 7" and ir and ir[0]["question"] == "Nhà có sổ hồng riêng không?"
    ket = ai.goi_cc[1][-1]["content"]
    assert all(k["content"].startswith("ĐÃ GHI") for k in ket)


def test_bo_tach_da_ghi_thi_agent_khong_ghi_lai(monkeypatch):
    monkeypatch.setenv("AIOI_AGENT_MUA", "bat")
    kho = KhoGia()
    ai = AiCongCu({**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "hen_xem": "3h chiều thứ 7"}},
                  [ToolTurn(text="", tool_calls=[_goi("hen_xem", ma="ABCD1234", gio="3h chiều thứ 7")], assistant_content=[]),
                   ToolTurn(text="Em ghi lịch rồi nha.", tool_calls=[])])
    Engine(ai, conversation_store=kho).handle("mua-292b", "chiều thứ 7 3h anh qua xem căn ABCD1234")
    assert len(kho.ghi("POST", "viewings")) == 1
    assert "đã ghi ở lượt này rồi" in ai.goi_cc[1][-1]["content"][0]["content"]


def test_cong_cu_ghi_can_khong_hien_thi_khong_ghi(monkeypatch):
    monkeypatch.setenv("AIOI_AGENT_MUA", "bat")
    kho = KhoGia()
    ai = AiCongCu(KHACH_MUA, [ToolTurn(text="", tool_calls=[_goi("hoi_chu_nha", ma="ZZZZ9999", cau_hoi="Còn không?")], assistant_content=[]),
                              ToolTurn(text="Căn đó em không thấy nữa ạ.", tool_calls=[])])
    Engine(ai, conversation_store=kho).handle("mua-292c", "căn ZZZZ9999 còn không")
    assert kho.ghi("POST", "info_requests") == [] and "Chưa ghi" in ai.goi_cc[1][-1]["content"][0]["content"]


def test_tin_ngoai_chat_dang_hien_khong_trinh_lai_ban_tin():
    """Phía bán (ban-thu-mua 29/10 hai lần): tin tạo ngoài chat đang hiển thị, chủ nhà bổ sung pháp lý → bot rao "📋 Bản tin cập nhật" /
    hỏi "đăng luôn" dù chưa từng gửi bản tin nào."""
    from tests.test_engine import _engine

    eng = _engine()
    seen: list[str] = []
    goc = eng._provider.chat
    eng._provider.chat = lambda system, messages, **k: seen.append(system) or goc(system, messages, **k)

    class Kho:
        def load(self, k): return None
        def reset(self, k): pass
        def save(self, conv): pass
        def trang_thai_tin(self, conv): return {"len_web": True, "thieu": [], "cho_duyet": False, "ma": "ABCDEF12"}

    eng._convstore = Kho()
    conv = eng.conversation("chu-292")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update({"dia_chi": "Trần Bình Trọng, Q5", "duong": "Trần Bình Trọng", "phuong": "Phường Chợ Quán", "dien_tich_dat": "60m2",
                             "dien_tich_nha": "50m2", "gia": "5 tỷ", "ket_cau": "1 trệt 2 lầu", "lo_gioi_hem": "Mặt tiền",
                             "phap_ly": "sổ hồng riêng", "tinh_trang_ban_giao": "đang ở"})
    conv.listing_proposed = True   # tin tạo ngoài chat đang hiển thị (SRS-257) — chưa từng có bản tin 📋 trong chat
    eng.handle("chu-292", "căn đó sổ hồng riêng chính chủ nha em, công chứng ngay được")
    assert any("TIN NÀY ĐANG HIỂN THỊ TRÊN WEB" in s for s in seen)
    assert conv.y_luot.get("_tin_dang_hien_ngoai_chat")
    assert any("ĐANG HIỂN THỊ" in x for x in Engine._ly_do_cung(conv, "Em cập nhật rồi.\n\n📋 Bản tin cập nhật:\nNhà phố"))
