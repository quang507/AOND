"""02/11/2026 (SRS-5.1zzzzzzz326, ca thật chủ dự án): tìm mua ở số TƯ VẤN ("anh đang cần tìm mua nhà quận 8 dưới 7 tỉ") rồi "chào em" ở số KÝ GỬI
→ bot hỏi "anh muốn tìm ở khu vực nào". Lớp lỗi: hội thoại khoá theo NGƯỜI, vai mua của số kia giữ qua lượt mơ hồ. Bất biến: lượt mơ hồ ở số khác số
đặt vai → vai mặc định của số đang nhắn (ký gửi → bán, tư vấn → mua); ý mua / bán của lượt vẫn thắng. Đỏ khi gỡ nhánh `so_vai`."""
from __future__ import annotations

from aioi.engine import SO_TU_VAN, Engine
from tests.gia import KhongCongCu

MUA = {"user_intent": "buy", "buyer_lead": {"loai_giao_dich": "mua", "khu_vuc": "Quận 8", "ngan_sach": "7 tỷ"}}
BAN = {"user_intent": "sell", "operations": [{"op": "update", "fields": {"duong": "Lê Lai"}, "bang_chung": {"duong": "Lê Lai"}}]}
CHAO = {"user_intent": "unknown", "operations": []}


class _AI(KhongCongCu):
    def __init__(self):
        self.ke, self.systems = {}, []

    def extract(self, system, messages, json_schema=None, **k):
        return {"operations": [], **self.ke}

    def chat(self, system, messages, **k):
        self.systems.append(system)
        return "Em chào anh ạ."

    reply = chat


def _luot(eng: Engine, ai: _AI, so: str, ke: dict, cau: str):
    ai.ke = ke
    eng.conversation("vs").so_nhan = SO_TU_VAN if so == "tu_van" else ""
    eng.handle("vs", cau)
    return eng.conversation("vs")


def test_mua_o_tu_van_roi_chao_o_ky_gui_thanh_ban():
    for chao in ("chào em", "alo em ơi", "hi bé"):   # hai cách chào mới ngoài ca gốc
        ai = _AI()
        eng = Engine(ai)
        conv = _luot(eng, ai, "tu_van", MUA, "anh đang cần tìm mua nhà quận 8 dưới 7 tỉ yên tĩnh")
        assert conv.role == "buyer"
        conv = _luot(eng, ai, "ky_gui", CHAO, chao)
        assert conv.role == "seller", chao
        s = ai.systems[-1]
        assert "LƯỢT ĐẦU TIÊN CỦA CUỘC CHAT (số ký gửi)" in s and "người gửi bán / cho thuê" in s, chao
        assert conv.buyer_lead is not None and conv.buyer_lead.khu_vuc == "Quận 8"   # nhu cầu mua giữ nguyên, chỉ không quyết vai


def test_ban_o_ky_gui_roi_hello_o_tu_van_thanh_mua():
    ai = _AI()
    eng = Engine(ai)
    conv = _luot(eng, ai, "ky_gui", BAN, "anh bán nhà Lê Lai")
    assert conv.role == "seller"
    conv = _luot(eng, ai, "tu_van", CHAO, "hello")
    assert conv.role == "buyer" and conv.prop.fields.get("duong") == "Lê Lai"   # tin rao giữ nguyên


def test_chao_o_ky_gui_roi_noi_mua_thi_sang_mua():
    ai = _AI()
    eng = Engine(ai)
    assert _luot(eng, ai, "ky_gui", CHAO, "chào em").role != "buyer"
    assert _luot(eng, ai, "ky_gui", MUA, "anh muốn mua nhà q8").role == "buyer"


def test_cung_so_luot_mo_ho_giu_vai_mua():
    ai = _AI()
    eng = Engine(ai)
    _luot(eng, ai, "tu_van", MUA, "tìm nhà quận 8 dưới 7 tỷ")
    assert _luot(eng, ai, "tu_van", CHAO, "ok em").role == "buyer"


def test_so_vai_qua_khoi_dong_lai(tmp_path):
    from aioi.engine import SqliteConversationStore
    kho = SqliteConversationStore(str(tmp_path / "c.db"))
    ai = _AI()
    eng = Engine(ai)
    _luot(eng, ai, "tu_van", MUA, "tìm nhà quận 8 dưới 7 tỷ")
    kho.save(eng.conversation("vs"))
    assert kho.load("vs").so_vai == SO_TU_VAN
