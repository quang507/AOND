"""20/10/2026 (SRS-5.1zzzzzzz84). Sổ lỗi production: 4 lần "This model does not support assistant message prefill" trong 8 phút, đều ở
hội thoại thật của chủ dự án đang nhắn trên Zalo, bắn thử tuần tự không lần nào. Bridge gom tin 2,5 s rồi gửi lõi nhưng không xếp
hàng theo khách: nhắn tiếp lúc bot còn soạn → hai lượt chạy song song trên cùng lịch sử, lượt sau gọi model khi lượt trước vừa ghi
lời bot → lịch sử kết thúc bằng tin bot → API 400. Đỏ khi bỏ khoá lượt (Engine.khoa_luot) ở server."""
import threading
import time
from types import SimpleNamespace

from fastapi.testclient import TestClient

import aioi.server as srv
from aioi.engine import Turn
from tests.test_chuyen_nguoi import _Kho, _tr


def _handle_kieu_model(loi):
    """Giống Engine.handle: ghi tin khách, 'gọi model' (mất thời gian) đòi lịch sử kết thúc bằng tin khách, rồi ghi lời bot."""
    def handle(uk, text, now=None):
        conv = srv._engine.conversation(uk)
        conv.history.append(Turn("user", text, time.time()))
        time.sleep(0.3)
        if conv.history[-1].role != "user":
            loi.append(text)
            raise RuntimeError("400 assistant prefill")
        conv.history.append(Turn("assistant", "ok " + text, time.time()))
        return _tr(reply="ok " + text)
    return handle


def test_hai_tin_cung_khach_toi_song_song_thi_chay_lan_luot(monkeypatch):
    monkeypatch.setattr(srv._engine, "_convstore", _Kho())
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **k: None)
    monkeypatch.setattr(srv, "_thu_lai_nen", lambda *a, **k: None)
    loi = []
    monkeypatch.setattr(srv._engine, "handle", _handle_kieu_model(loi))
    tl = TestClient(srv.app)
    kq = []

    def gui(t):
        kq.append(tl.post("/chat-reply", json={"external_user_id": "song-song-1", "text": t}).json()["replies"])

    a = threading.Thread(target=gui, args=("giá 5 tỷ",))
    b = threading.Thread(target=gui, args=("sổ hồng riêng",))
    a.start(); time.sleep(0.05); b.start(); a.join(); b.join()
    assert loi == [] and srv.CAU_GIU_CHO not in sum(kq, [])
    # SRS-5.1zzzzzzz279: tin thứ hai tới lúc bot còn soạn tin thứ nhất → lời cũ bỏ, lượt kế đọc gộp hai tin, một lời đáp.
    vai = [t.role for t in srv._engine.conversation("song-song-1").history]
    assert vai == ["user", "assistant"]
    assert srv._engine.conversation("song-song-1").history[0].content == "giá 5 tỷ\nsổ hồng riêng"
    assert sorted(len(v) for v in kq) == [0, 1]


def test_khach_khac_nhau_khong_cho_nhau():
    assert srv._engine.khoa_luot("k-a") is not srv._engine.khoa_luot("k-b")
    assert srv._engine.khoa_luot("k-a") is srv._engine.khoa_luot("k-a")


def test_tin_nhac_khong_chen_khi_khach_vua_noi_chuyen():
    from aioi.followup import FollowUpManager
    from aioi.assistants import assign_assistant
    from aioi.engine import Conversation
    conv = Conversation(user_key="nh-1", assistant=assign_assistant("nh-1"))
    hen = time.time()
    conv.history.append(Turn("user", "à quên, nhà 4 tầng", hen + 1))      # khách nhắn sau lúc hẹn nhắc
    eng = SimpleNamespace(conversation=lambda uk: conv, khoa_luot=lambda uk: threading.RLock(), _convstore=None)
    m = FollowUpManager()
    m._execute_followup("nh-1", eng, None, "seller", hen=hen)
    assert [t.role for t in conv.history] == ["user"]


def test_hoi_thoai_trong_cache_da_bi_xoa_thi_tim_lai_va_van_ghi_tin():
    """DB 20/10: hội thoại thật của chủ dự án 0 tin trong khi last_message_at vẫn chạy — sau "hello" (reset ở bản kho của engine),
    bản kho ghi tin vẫn nhớ mã hội thoại đã xoá, mọi tin chèn vào 409 rồi bị nuốt ở log.warning. Đỏ khi bỏ nhánh 409."""
    import io
    import urllib.error
    from aioi.supabase_store import SupabaseConversationStore

    class _K(SupabaseConversationStore):
        def __init__(self):
            super().__init__(url="https://x.supabase.co", key="k")
            self.goi = []
            self._seller_cache["u"] = "s1"
            self._conv_cache["s1"] = "c-cu"                     # hội thoại đã bị reset xoá

        def _request(self, method, endpoint, data=None, prefer=None):
            self.goi.append((method, endpoint, data))
            if method == "POST" and endpoint == "messages" and data["conversation_id"] == "c-cu":
                raise urllib.error.HTTPError("u", 409, "Conflict", {}, io.BytesIO(b""))
            if endpoint.startswith("sellers?"):
                return [{"id": "s1"}]
            if endpoint.startswith("conversations?or="):   # hội thoại chung của khách (SRS-5.1zzzzzzz149)
                return [{"id": "c-moi", "seller_id": "s1", "buyer_id": None}]
            return []

    k = _K()
    k.ghi_luot_chat("u", "giá 5 tỷ", "Em ghi rồi ạ")
    tin = [d for m, e, d in k.goi if m == "POST" and e == "messages" and d["conversation_id"] == "c-moi"]
    assert [t["sender"] for t in tin] == ["seller", "bot"]


def test_tin_cho_luc_bot_dang_soan_gom_thanh_mot_luot(monkeypatch):
    """SRS-5.1zzzzzzz91 (chat tester 20/10): khách nhắn 3 tin lúc bot còn soạn → trước đây 3 lượt, 3 bản tin trong 20 giây. Nay lượt kế
    tiếp gom mọi tin đang chờ; tin đã gom trả rỗng (bridge không gửi gì). Đỏ khi bỏ `_lay_cho`."""
    monkeypatch.setattr(srv._engine, "_convstore", _Kho())
    ghi = []
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **k: ghi.append((k["incoming_text"], k["bot_reply"])))
    monkeypatch.setattr(srv, "_thu_lai_nen", lambda *a, **k: None)
    luot = []

    def handle(uk, text, now=None):
        luot.append(text)
        time.sleep(0.4)
        return _tr(reply="ok")
    monkeypatch.setattr(srv._engine, "handle", handle)
    tl = TestClient(srv.app)
    kq = {}

    def gui(t):
        kq[t] = tl.post("/chat-reply", json={"external_user_id": "gom-1", "text": t}).json()["replies"]

    ts = [threading.Thread(target=gui, args=(t,)) for t in ("1 bếp, 3wc", "giá này không bớt", "không nuôi thú cưng")]
    ts[0].start(); time.sleep(0.1); ts[1].start(); time.sleep(0.05); ts[2].start()
    for t in ts:
        t.join()
    # SRS-5.1zzzzzzz279: lời lượt "1 bếp, 3wc" soạn xong khi đã có tin mới chờ → bỏ, lượt kế gộp CẢ BA tin, khách nhận MỘT lời đáp.
    assert luot[0] == "1 bếp, 3wc" and len(luot) == 2
    assert luot[1] == "1 bếp, 3wc\ngiá này không bớt\nkhông nuôi thú cưng"
    assert sorted(len(v) for v in kq.values()) == [0, 0, 1]
    assert sorted(t for t, _ in ghi) == sorted(["1 bếp, 3wc", "giá này không bớt", "không nuôi thú cưng"])   # CRM đủ từng tin
