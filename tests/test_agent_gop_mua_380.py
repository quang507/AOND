"""03/11/2026 (SRS-5.1zzzzzzz380, chủ dự án duyệt "làm … 5": "Phía mua đi cùng kiểu vòng gộp như phía bán — một đường cho cả hai phía, sửa luật
một chỗ"). Lượt khách MUA (vai đã rõ) là MỘT vòng agent như người bán (SRS-371): bước 1 gọi công cụ ghi (ô nhu cầu qua cổng trích, việc căn,
ý khách), engine áp qua đúng đường cũ (`_chon_nhu_cau` / `BuyerLead.update`, `_viec_mua` → ghi_hen_xem / ghi_hoi_chu_nha), bước 2 CÙNG cuộc
hội thoại đọc KẾT QUẢ GHI rồi viết lời (công cụ chỉ đọc). Form JSON Haiku chỉ còn dự phòng.
Đỏ khi gỡ bản sửa: gỡ cổng `Engine._loc_nhu_cau` (ô bịa vào nhu cầu), gỡ báo cáo / bước 2 (`agent_gop.viet_mua`), gỡ nhánh `mo_mua` trong
`_lap_ke_hoach` (lượt mua lại gọi form)."""
from aioi import agent_gop
from aioi.engine import Engine
from aioi.llm.base import RANH_GIOI_CACHE, ToolCall, ToolTurn
from aioi.prompts import GIONG_VUI, mua_co_dinh
from tests.test_viec_mua import KHACH_MUA, AiGia, KhoGia

TIN1 = "Em tìm nhà phố quận 5 tầm 5 tỷ"
TIN2 = "căn ABCD1234 nhà mình cần 3 phòng ngủ nha, chiều thứ 7 3h anh qua xem được không"
LOI = "Thứ 7 3h em ghi lịch rồi nha anh."


class AiGopMua(AiGia):
    """Lượt đầu (vai chưa rõ) đọc bằng form `ke_hoach`; lượt sau bước 1 (có `ghi_nhu_cau`) trả lần lượt các vòng `vong`, bước 2 trả lần lượt
    `buoc2` (mặc định: lời `LOI`). Ghi lại system / tin / công cụ mỗi lần gọi; đếm lần gọi form lập thao tác."""

    def __init__(self, vong, buoc2=None, ke_hoach=KHACH_MUA):
        super().__init__(ke_hoach)
        self.vong, self.buoc2_kb = list(vong), list(buoc2 or [])
        self.buoc1, self.buoc2, self.form = [], [], []

    def extract(self, system, messages, json_schema):
        if "user_intent" in (json_schema.get("properties") or {}):
            self.form.append(set(json_schema["properties"]))
        return super().extract(system, messages, json_schema)

    def converse(self, system, messages, tools, max_tokens=1024):
        ten = {t["name"] for t in tools}
        if "ghi_nhu_cau" in ten:
            self.buoc1.append((system, list(messages), tools))
            if not self.vong:
                return ToolTurn(text="", tool_calls=[])
            return _luot([ToolCall(id=f"g{len(self.buoc1)}_{i}", name=n, input=v) for i, (n, v) in enumerate(self.vong.pop(0))])
        self.buoc2.append((system, list(messages), tools))
        return self.buoc2_kb.pop(0) if self.buoc2_kb else ToolTurn(text=LOI, tool_calls=[])


def _luot(calls):
    return ToolTurn(text="", tool_calls=calls, assistant_content=[{"type": "tool_use", "id": c.id, "name": c.name, "input": c.input}
                                                                  for c in calls], stop_reason="tool_use")


VONG = [
    [("ghi_nhu_cau", {"fields": {"so_phong_ngu": "3PN", "huong": "Đông Nam"},
                      "bang_chung": {"so_phong_ngu": "3 phòng ngủ", "huong": "hướng đông nam"}}),   # hướng: khách KHÔNG nói
     ("viec_can", {"ma_can": ["ABCD1234"], "quan_tam": True, "hen_xem": "3h chiều thứ 7"}),
     ("ghi_y_khach", {"user_intent": "buy"})],
    [("ghi_y_khach", {"user_intent": "buy"})],   # model không sửa cụm trích sai → ô bị bỏ hẳn
]


def _hai_luot(key, vong, buoc2=None, kho=None):
    kho = kho or KhoGia()
    ai = AiGopMua(vong)
    eng = Engine(ai, conversation_store=kho)
    eng.handle(key, TIN1)   # lượt đầu: vai chưa rõ → form đầy đủ, viết lời đường thường
    assert not ai.buoc1
    ai.form, ai.buoc2, ai.buoc2_kb = [], [], list(buoc2 or [])
    r = eng.handle(key, TIN2)
    return eng, eng.conversation(key), ai, kho, r


def test_buoc_1_ghi_qua_cong_buoc_2_doc_bao_cao_cung_hoi_thoai():
    eng, conv, ai, kho, r = _hai_luot("thu-380a", VONG)
    assert ai.form == [], "lượt mua (vai đã rõ) không còn gọi form JSON"
    assert len(ai.buoc1) == 2 and len(ai.buoc2) == 1, "một vòng: hai lần gọi bước ghi (sửa theo kết quả) + một lần viết lời"
    # Cổng trích: ô có cụm nguyên văn thì ghi, ô bịa thì bỏ — và model được báo "Sẽ BỎ" ngay trong vòng.
    assert conv.buyer_lead.fields.get("so_phong_ngu") == "3PN"
    assert not conv.buyer_lead.fields.get("huong") and not conv.buyer_lead.huong
    assert agent_gop.SUA in ai.buoc1[1][1][-1]["content"][0]["content"]
    # Việc căn đi đúng hàm ghi engine (một lịch hẹn, xin số một lần).
    v = kho.ghi("POST", "viewings")
    assert len(v) == 1 and v[0]["time_text"] == "3h chiều thứ 7"
    assert conv.buyer_lead.fields.get("_da_xin_sdt") == "1"
    # Bước 2: cùng cuộc hội thoại — kết quả công cụ ghi = báo cáo SAU khi áp.
    he, tin, tools = ai.buoc2[0]
    assert tin[-2]["role"] == "assistant" and tin[-1]["content"][0]["type"] == "tool_result"
    bao = tin[-1]["content"][0]["content"]
    assert "KẾT QUẢ GHI LƯỢT NÀY" in bao and bao.split("\n")[1].startswith("- VIỆC LƯỢT NÀY:")
    assert "3PN" in bao.split("ĐÃ GHI nhu cầu", 1)[1].split("\n", 1)[0]
    assert "Đông Nam" in bao.split("KHÔNG GHI", 1)[1].split("\n", 1)[0]
    assert "EM VỪA GHI LƯỢT NÀY" in bao, "việc căn trỏ về khối việc vừa ghi (một chỗ)"
    assert agent_gop.DAU_BUOC_2 in he and GIONG_VUI in he and "CÔNG CỤ TRA KHO" in he
    ten = {t["name"] for t in tools}
    assert {"tim_can", "xem_can", "tra_du_an", "du_an_trong_khu"} <= ten and not ten & {"ghi_nhu_cau", "viec_can", "hen_xem", "hoi_chu_nha"}
    assert r.reply == LOI


def test_buoc_1_dung_phan_co_dinh_prompt_mua_va_luat_doc_y():
    eng, conv, ai, kho, r = _hai_luot("thu-380b", VONG)
    he, tin, tools = ai.buoc1[0]
    assert he.startswith(mua_co_dinh(conv.assistant.name)) and RANH_GIOI_CACHE in he
    truoc = he.split(RANH_GIOI_CACHE, 1)[0]
    assert 'VIỆC CỦA KHÁCH MUA ("mua"' in truoc and "TỪ ĐIỂN TIẾNG LÓNG" in truoc and "Trả về JSON" not in truoc
    assert "CĂN ĐANG CÓ" in he.split(RANH_GIOI_CACHE, 1)[1], "dữ liệu lượt (dòng căn) sau ranh giới cache"
    assert {t["name"] for t in tools} == {"ghi_nhu_cau", "viec_can", "ghi_y_khach"}
    assert tin[-1] == {"role": "user", "content": TIN2}


def test_buoc_2_tra_kho_cung_hoi_thoai_va_khong_ghi_lai():
    tra = _luot([ToolCall(id="t1", name="xem_can", input={"ma": ["ABCD1234"]}), ToolCall(id="t2", name="hen_xem", input={"ma": "ABCD1234", "gio": "9h"})])
    eng, conv, ai, kho, r = _hai_luot("thu-380c", VONG, [tra, ToolTurn(text=LOI, tool_calls=[])])
    assert len(ai.buoc2) == 2
    kq = ai.buoc2[1][1][-1]["content"]
    assert "#ABCD1234" in kq[0]["content"] and "đã đóng" in kq[1]["content"]
    assert len(kho.ghi("POST", "viewings")) == 1, "bước 2 không có đường ghi thứ hai"
    assert r.reply == LOI


def test_vong_loi_thi_form_du_phong_va_duong_cu():
    eng, conv, ai, kho, r = _hai_luot("thu-380d", [])
    assert len(ai.buoc1) == 1 and ai.form and "operations" not in ai.form[0], "model không gọi công cụ → form mua gọn (Haiku) dự phòng"
    assert conv.vong_mua is None
    assert ai.buoc2 and agent_gop.DAU_BUOC_2 not in ai.buoc2[0][0], "viết lời đi đường dự phòng `agent_mua.chay`"
    assert "hen_xem" in {t["name"] for t in ai.buoc2[0][2]}


def test_vong_loi_ngoai_le_thi_form_du_phong():

    class AiHong(AiGopMua):
        def converse(self, system, messages, tools, max_tokens=1024):
            if "ghi_nhu_cau" in {t["name"] for t in tools}:
                raise TimeoutError("hết giờ")
            return super().converse(system, messages, tools, max_tokens)

    ai = AiHong([])
    eng = Engine(ai, conversation_store=KhoGia())
    eng.handle("thu-380e", TIN1)
    ai.form = []
    assert eng.handle("thu-380e", TIN2).reply and ai.form


def test_khach_mua_chuyen_sang_ban_doc_lai_form_day_du():
    vong = [[("ghi_y_khach", {"user_intent": "sell"})]]
    ai = AiGopMua(vong)
    eng = Engine(ai, conversation_store=KhoGia())
    eng.handle("thu-380f", TIN1)
    ai.form, ai.ke_hoach = [], {"operations": [], "user_intent": "sell"}
    eng.handle("thu-380f", "à anh cũng có căn nhà ở quận 8 muốn bán luôn em")
    conv = eng.conversation("thu-380f")
    assert ai.form and "operations" in ai.form[-1], "ý bán giữa chừng → đọc lại cả lượt bằng form đầy đủ (đường bán)"
    assert conv.role == "seller" and conv.vong_mua is None
    assert not any(agent_gop.DAU_BUOC_2 in s for s, _m, _t in ai.buoc2)


def test_cong_nhu_cau_so_va_nhan():
    """Cổng một chỗ: ô số nhận khi mọi số của cụm trích có trong lời khách; nhãn bộ nhu cầu không qua cổng; cách nói mới "dưới 7 tỉ"."""
    eng = Engine(AiGia(KHACH_MUA), conversation_store=KhoGia())
    conv = eng.conversation("thu-380g")
    conv.loi_khach_luot = "anh cần tìm thêm căn cho con, dưới 7 tỉ khu bình thạnh"
    giu, bo = Engine._loc_nhu_cau(conv, {"ngan_sach_den": "7 tỷ", "khu_vuc": "Bình Thạnh", "nhu_cau": "cho con", "nhu_cau_moi": True,
                                         "muc_dich": "đầu tư", "so_phong_ngu": 2},
                                  {"ngan_sach_den": "dưới 7 tỷ", "khu_vuc": "bình thạnh", "muc_dich": "đầu tư"})
    assert giu == {"ngan_sach_den": "7 tỷ", "khu_vuc": "Bình Thạnh", "nhu_cau": "cho con", "nhu_cau_moi": True}
    assert {k for k, _v, _l in bo} == {"muc_dich", "so_phong_ngu"}
