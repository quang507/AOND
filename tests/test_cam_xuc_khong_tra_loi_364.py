"""SRS-5.1zzzzzzz364 — chat thật 01–02/11 (ẩn danh): khách mua chỉ thả /-heart 6 lần trong 3 giờ, bot nhắn lại 4 lần ("Em vẫn ở đây…", "Tim
đủ đầy rồi ạ ❤️…"). Lớp lỗi: lượt CẢM XÚC đi đường lượt tin nhắn, model luôn viết lời. Sửa: theo LOẠI SỰ KIỆN bridge gửi (`su_kien`, hay msg_id
`react-` của bridge cũ) — không trả lời, chỉ ghi CRM; ngoại lệ bản nháp chờ duyệt (thả tim = đồng ý, FR-142) hoặc bot chưa từng nhắn."""
from types import SimpleNamespace

from fastapi.testclient import TestClient

import aioi.server as srv
from aioi.engine import Turn, TurnResult


def _chuan_bi(monkeypatch):
    goi, ghi = [], []
    tra = TurnResult(reply="Em vẫn ở đây ạ.", assistant_name="M•ai", captured=[], next_field=None, user_type="unknown",
                     is_listing_post=False, completeness=0.5, property_score=0, user_score=0, tier="")
    monkeypatch.setattr(srv._engine, "handle", lambda *a, **k: (goi.append(a), tra)[1])
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **k: ghi.append(k))

    class _Luong:
        def __init__(self, target, daemon=True, name=None):
            self.t = target

        def start(self):
            self.t()
    monkeypatch.setattr(srv, "threading", SimpleNamespace(Thread=_Luong))
    return TestClient(srv.app), goi, ghi


def test_tha_tim_sau_khi_da_chat_thi_khong_tra_loi(monkeypatch):
    c, goi, ghi = _chuan_bi(monkeypatch)
    conv = srv._engine.conversation("thu-364a")
    conv.history += [Turn("user", "tìm nhà Q7 3 tỷ", 0.0), Turn("assistant", "Em có 2 căn hợp nè anh…", 1.0)]
    for i, (su_kien, mid) in enumerate((("reaction", "react-thu-364a-1"), (None, "react-thu-364a-2"))):   # bridge mới / bridge cũ
        r = c.post("/chat-reply", json={"external_user_id": "thu-364a", "text": "[khách thả cảm xúc /-heart]", "msg_id": mid,
                                        "su_kien": su_kien})
        assert r.json()["replies"] == [] and goi == [] and ghi[-1]["bot_reply"] == "", i


def test_ngoai_le_ban_nhap_cho_duyet_va_chua_tung_chao(monkeypatch):
    c, goi, _ = _chuan_bi(monkeypatch)
    conv = srv._engine.conversation("thu-364b")
    conv.listing_proposed = True
    conv.history += [Turn("user", "nhà Lê Lợi 9 tỷ", 0.0), Turn("assistant", "📋 Em sẽ rao như vầy nhé anh: …", 1.0)]
    c.post("/chat-reply", json={"external_user_id": "thu-364b", "text": "[khách thả cảm xúc 👍]", "msg_id": "react-b-1", "su_kien": "reaction"})
    assert goi and goi[-1][0] == "thu-364b"                              # thả tim lên bản nháp = đồng ý (FR-142) → vẫn xử lý
    c.post("/chat-reply", json={"external_user_id": "thu-364c", "text": "[khách thả cảm xúc ❤️]", "msg_id": "react-c-1", "su_kien": "reaction"})
    assert goi[-1][0] == "thu-364c"                                      # chưa từng nhắn → chào một lần


def test_tin_nhan_thuong_van_tra_loi(monkeypatch):
    c, goi, _ = _chuan_bi(monkeypatch)
    conv = srv._engine.conversation("thu-364d")
    conv.history += [Turn("user", "hi", 0.0), Turn("assistant", "Chào anh…", 1.0)]
    c.post("/chat-reply", json={"external_user_id": "thu-364d", "text": "tim đủ đầy rồi em ❤️", "msg_id": "m-1"})   # gõ chữ có tim: tin nhắn
    assert goi and goi[-1][1] == "tim đủ đầy rồi em ❤️"
