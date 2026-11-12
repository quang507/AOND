"""SRS-5.1zzzzzzz438 — thông tin pháp lý ghi được và lấy lại được: câu đáp ngắn vào đúng ô bot vừa hỏi, ô riêng ghi kèm nhãn cho trang admin,
bot phía mua đọc pháp lý công khai."""
from aioi.assistants import assign_assistant
from aioi.engine import Conversation, Engine
from aioi.mua import COT_CAN, O_PHAP_LY_CONG_KHAI, dong_can, phap_ly_can
from aioi.prompts import nhan_o_ngan
from aioi.schema import O_NOI_BO
from aioi.supabase_store import SupabaseConversationStore


def _conv(loi: str, bot_vua_hoi: list[str]) -> Conversation:
    c = Conversation(user_key="thu-437", assistant=assign_assistant("thu-437"))
    c.loi_khach_luot = loi
    c.y_luot["_bot_vua_hoi"] = bot_vua_hoi
    return c


def test_dap_ngan_cau_bot_vua_hoi_ghi_nghia():
    c = _conv("ok", ["dong_y_ban"])
    assert Engine._gia_tri_ghi(c, "dong_y_ban", "đã đồng ý ký bán", {"dong_y_ban": "ok"}) == "đã đồng ý ký bán"


def test_o_bot_khong_hoi_van_ghi_nguyen_cum():
    c = _conv("ok", ["gia"])
    assert Engine._gia_tri_ghi(c, "dong_y_ban", "đã đồng ý ký bán", {"dong_y_ban": "ok"}) == "ok"


def test_cum_dap_khong_co_trong_loi_khach_thi_bo():
    c = _conv("để anh hỏi lại", ["dong_y_ban"])
    assert Engine._gia_tri_ghi(c, "dong_y_ban", "đã đồng ý ký bán", {"dong_y_ban": "ok"}) is None


def test_o_rieng_ghi_kem_nhan(monkeypatch):
    ghi = {}
    s = SupabaseConversationStore.__new__(SupabaseConversationStore)
    monkeypatch.setattr(s, "_post", lambda duong, body, prefer=None: ghi.update(body), raising=False)
    s._ghi_noi_bo("id-1", {"dong_y_ban": "đã đồng ý", "tien_coc": "200 triệu", "_qc_anh": "x"})
    nhan = ghi["du_lieu"]["_nhan"]
    assert nhan == {"dong_y_ban": nhan_o_ngan("dong_y_ban"), "tien_coc": nhan_o_ngan("tien_coc")}
    assert nhan["dong_y_ban"].startswith("người đứng tên sổ đã đồng ý")


def test_nhan_ngan_moi_o_rieng_co_nghia():
    for k in O_NOI_BO:
        if not k.startswith("_"):
            assert "_" not in nhan_o_ngan(k), k


def test_phia_mua_doc_phap_ly_cong_khai():
    assert "has_completion" in COT_CAN and "thoi_han_su_dung:boc_tach->>thoi_han_su_dung" in COT_CAN
    assert not set(O_PHAP_LY_CONG_KHAI) & O_NOI_BO
    c = {"code": "AB12", "legal_status": "dat_thue", "has_completion": None, "thoi_han_su_dung": "tới 2058"}
    assert "tới 2058" in phap_ly_can(c) and "Đất thuê" in phap_ly_can(c)
    assert "tới 2058" in dong_can(c)
