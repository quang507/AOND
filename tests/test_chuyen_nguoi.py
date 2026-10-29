"""20/10/2026 (SRS-5.1zzzzzzz82; đánh giá UX/CRM, chủ dự án: "ừ thì báo admin"). /admin đã có khung "khách cần người thật" và nút
"giữ" hội thoại, nhưng lõi Python không bao giờ bật `needs_human` (DB: 0 cuộc) và không đọc `human_hold` — admin nhắn tay thì bot
vẫn trả lời chồng. Nay: lượt AI lập thao tác đọc "khách xin gặp người" (kiểm trích dẫn, không dò từ khoá) → bật cờ + tin nội bộ 🙋
cho admin; admin giữ → bot im. Cùng bản: giờ tin khách là lúc lõi nhận, CRM mới đo được bot trả lời mất bao lâu."""
from types import SimpleNamespace

from fastapi.testclient import TestClient

import aioi.server as srv
from aioi.engine import Engine, TurnResult, khoi_can_nguoi
from aioi.supabase_store import SupabaseConversationStore
from tests.test_doc_y_khach import _eng


def test_ai_doc_xin_gap_nguoi_co_trich_dan_thi_chen_khoi_va_bao_ra():
    eng, spy = _eng({"operations": [], "can_nguoi_that": "cho anh nói chuyện với nhân viên"})
    r = eng.handle("g1", "thôi cho anh nói chuyện với nhân viên đi em")
    assert "KHÁCH XIN GẶP NGƯỜI THẬT" in spy.systems[-1]
    assert r.can_nguoi_that == "cho anh nói chuyện với nhân viên"


def test_trich_dan_khong_co_trong_loi_khach_thi_khong_bao():
    eng, spy = _eng({"operations": [], "can_nguoi_that": "cho gặp quản lý"})
    r = eng.handle("g2", "nhà anh hẻm 4m nha")
    assert "KHÁCH XIN GẶP NGƯỜI THẬT" not in spy.systems[-1] and r.can_nguoi_that is None


def test_khoi_rong_khi_khong_xin():
    from aioi.assistants import assign_assistant
    from aioi.engine import Conversation
    assert khoi_can_nguoi(Conversation(user_key="k", assistant=assign_assistant("k"))) == ""


class _Kho:
    def __init__(self, giu=False):
        self.giu, self.bao, self._conversations = giu, [], {}

    def dang_giu_hoi_thoai(self, uk):
        return self.giu

    def load(self, uk):
        return None

    def save(self, conv):
        pass

    def bao_can_nguoi(self, uk, trich, ten, role):
        self.bao.append((uk, trich, role))
        return True


def _tr(**k):
    base = dict(reply="Em đã báo anh phụ trách rồi ạ.", assistant_name="Thảo", captured=[], next_field=None, user_type="unknown",
                is_listing_post=False, completeness=0.5, property_score=0, user_score=0, tier="")
    base.update(k)
    return TurnResult(**base)


def test_admin_giu_hoi_thoai_thi_bot_im_va_khong_goi_engine(monkeypatch):
    monkeypatch.setattr(srv._engine, "_convstore", _Kho(giu=True))
    goi, ghi = [], []
    monkeypatch.setattr(srv._engine, "handle", lambda *a, **k: goi.append(a))
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **k: ghi.append(k))
    r = TestClient(srv.app).post("/chat-reply", json={"external_user_id": "g3", "text": "anh ơi căn đó sao rồi"})
    assert r.status_code == 200 and r.json()["replies"] == [] and goi == []
    assert ghi and ghi[0]["incoming_text"] == "anh ơi căn đó sao rồi" and ghi[0]["bot_reply"] == ""   # admin vẫn đọc được


def test_khach_xin_gap_nguoi_thi_server_bao_admin(monkeypatch):
    kho = _Kho()
    monkeypatch.setattr(srv._engine, "_convstore", kho)
    monkeypatch.setattr(srv._engine, "handle", lambda *a, **k: _tr(can_nguoi_that="cho gặp nhân viên"))
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **k: None)

    class _Luong:   # chạy ngay, không chờ luồng nền
        def __init__(self, target, daemon=True):
            self.t = target

        def start(self):
            self.t()
    monkeypatch.setattr(srv, "threading", SimpleNamespace(Thread=_Luong))
    r = TestClient(srv.app).post("/chat-reply", json={"external_user_id": "g4", "text": "cho gặp nhân viên"})
    assert r.status_code == 200 and kho.bao == [("g4", "cho gặp nhân viên", "seller")]


class _KhoGia(SupabaseConversationStore):
    def __init__(self, thu=False):
        super().__init__(url="https://x.supabase.co", key="k")
        self.thu, self.goi = thu, []
        self._seller_cache["u"] = "s1"
        self._conv_cache["s1"] = "c1"

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        if endpoint == "rpc/la_id_thu":
            return self.thu
        return []


def test_bao_can_nguoi_bat_co_va_xep_tin_noi_bo_che_sdt():
    kho = _KhoGia()
    assert kho.bao_can_nguoi("u", "gọi anh 0903123456 nhé", "Anh B.", "seller")
    patch = [g for g in kho.goi if g[0] == "PATCH"][0]
    assert patch[1] == "conversations?id=eq.c1" and patch[2]["needs_human"] is True
    tin = [g for g in kho.goi if g[1] == "reminders"][0][2]
    assert tin["kind"] == "escalation" and tin["note"].startswith("🙋") and "0903123456" not in tin["note"]


def test_id_thu_chi_bat_co_khong_nhan_admin():
    kho = _KhoGia(thu=True)
    assert kho.bao_can_nguoi("u", "cho gặp người thật", None, "seller")
    assert not [g for g in kho.goi if g[1] == "reminders"]


def test_gio_tin_khach_la_luc_nhan():
    kho = _KhoGia()
    kho.ghi_luot_chat("u", "chào em", "Em chào anh", nhan_luc="2026-10-20T01:00:00+00:00")
    tin = [g[2] for g in kho.goi if g[1] == "messages"]
    assert tin[0]["created_at"] == "2026-10-20T01:00:00+00:00" and tin[1]["created_at"] != tin[0]["created_at"]


def test_luot_hong_thi_giu_cho_roi_tu_thu_lai_khong_ghi_tin_hai_lan(monkeypatch):
    """Lượt hỏng trước đây ra 500 → bridge không gửi gì (sổ lỗi "bridge xử lý tin gom"), hoặc "kết nối mạng gián đoạn, nhắn lại giúp
    em". Nay: câu giữ chỗ ngay, luồng nền chạy lại đúng tin đó (cắt lịch sử về mốc trước để không ghi hai lần) rồi gửi qua bridge."""
    from aioi.engine import LoiTraLoi, Turn
    monkeypatch.setattr(srv._engine, "_convstore", _Kho())
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **k: None)
    monkeypatch.setattr(srv, "THU_LAI_SAU", 0)
    lan = []

    def handle(uk, text, now=None):
        conv = srv._engine.conversation(uk)
        conv.history.append(Turn("user", text, 0.0))
        lan.append(len(conv.history))
        if len(lan) == 1:
            raise LoiTraLoi("lời gửi khách rỗng")
        return _tr(reply="Nhà mình ở phường nào vậy anh?")
    monkeypatch.setattr(srv._engine, "handle", handle)
    gui = []
    monkeypatch.setattr(srv, "_gui_bridge", lambda uk, t: gui.append((uk, t)))

    class _Luong:
        def __init__(self, target, daemon=True):
            self.t = target

        def start(self):
            self.t()
    monkeypatch.setattr(srv, "threading", SimpleNamespace(Thread=_Luong))
    r = TestClient(srv.app).post("/chat-reply", json={"external_user_id": "g5", "text": "bán nhà Âu Cơ"})
    assert r.status_code == 200 and r.json()["replies"] == [srv.CAU_GIU_CHO]
    assert "nhắn lại" not in srv.CAU_GIU_CHO and "mạng" not in srv.CAU_GIU_CHO
    assert gui == [("g5", "Nhà mình ở phường nào vậy anh?")]
    assert lan == [1, 1]                                    # lần thử lại không ghi tin khách lần hai


def test_thu_lai_bo_qua_khi_khach_da_nhan_tin_moi(monkeypatch):
    from aioi.engine import Turn
    monkeypatch.setattr(srv._engine, "_convstore", _Kho())
    monkeypatch.setattr(srv, "THU_LAI_SAU", 0)
    goi = []
    conv = srv._engine.conversation("g6")
    conv.history[:] = [Turn("user", "a", 0.0), Turn("user", "b", 0.0), Turn("assistant", "c", 0.0)]

    class _Luong:
        def __init__(self, target, daemon=True):
            self.t = target

        def start(self):
            self.t()
    monkeypatch.setattr(srv, "threading", SimpleNamespace(Thread=_Luong))
    srv._thu_lai_nen("g6", lambda: goi.append(1), moc=0, sau_hong=1, ten=None)   # lúc hỏng có 1 lượt, nay đã 3
    assert goi == [] and len(conv.history) == 3


def test_cau_giu_cho_va_xin_loi_goi_theo_cach_khach_xung():
    # SRS-5.1zzzzzzz267: câu server gửi thẳng khách không viết cứng "anh/chị" / "của mình" — khách xưng "cháu" thì bot gọi "cô/chú".
    import aioi.server as srv
    conv = srv._engine.conversation("xh-267")
    conv.xung_ho = "chau"   # AI lượt lập thao tác đọc "cháu chào cô…" ra mã xưng hô (SRS-54) — đặt thẳng trạng thái đó
    for k in ("giu_cho", "thu_lai_hong"):
        c = srv._cau_theo_khach("xh-267", k)
        assert "anh/chị" not in c and "của mình" not in c and "{" not in c, (k, c)
    assert "người phụ trách" in srv._cau_theo_khach("xh-267", "thu_lai_hong")
