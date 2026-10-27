"""SRS-5.1zzzzzzz216 (27/10/2026) — soát "bot bảo làm được nhưng thực chất chưa nối" (chủ dự án: "sửa 1 … lõi python tự gửi", "3 làm đi",
"làm 4 đi trong này có 1 ô để admin gửi lại nữa", "5 làm đi"). Đỏ khi tắt bản sửa:
1. Nhắc `followup` / `sold` / `feedback` do trigger DB tạo không ai gửi (nudge gỡ 18/10) → lõi gửi qua bridge, đánh dấu sent, ghi lịch sử.
2. Prompt bảo bot nói điểm uy tín / hạng mà không khối nào mang số thật → khối ĐIỂM TIN từ `gamification`.
3. Bridge gửi `human_note` mà lõi bỏ qua → lời admin thành lời khách; nay bot nhường sân 30 phút, lời admin vào CRM sender human.
4. File > 20 MB "đã báo admin" chỉ ghi bộ nhớ → đi đường `can_nguoi_that` (tin 🙋 cho admin)."""
import re
import urllib.parse
from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

import aioi.server as srv
from aioi import cau_mau, gui_nhac
from aioi.engine import Conversation, SqliteConversationStore, Turn
from aioi.assistants import assign_assistant
from aioi.supabase_store import SupabaseConversationStore
from tests.test_doc_y_khach import _eng

UTC = timezone.utc
TRUA = datetime(2026, 10, 27, 5, 0, tzinfo=UTC)    # 12:00 giờ Việt Nam
KHUYA = datetime(2026, 10, 27, 16, 0, tzinfo=UTC)  # 23:00 giờ Việt Nam


class _Kho(SupabaseConversationStore):
    """PostgREST giả: reminders / buyers / sellers / info_requests / viewings / listings đủ cho `gui_nhac`."""
    def __init__(self, nhac, buyers=None, sellers=None, ir=None, viewings=None):
        super().__init__(url="https://x.invalid", key="k")
        self.nhac = list(nhac)
        self.buyers = buyers or [{"id": "b1", "name": "Ngân", "zalo_user_id": "zl-ngan"}]
        self.sellers = sellers or [{"id": "s1", "name": "Anh Luận", "zalo_user_id": "zl-luan"}]
        self.ir = ir or []
        self.viewings = viewings or []
        self.patch = []

    def _request(self, method, endpoint, data=None, prefer=None):
        bang = endpoint.split("?")[0]
        q = urllib.parse.unquote(endpoint.split("?", 1)[1]) if "?" in endpoint else ""
        if method == "GET" and bang == "reminders":
            return [r for r in self.nhac if r["status"] == "pending"]
        if method == "GET" and bang == "buyers":
            i = re.search(r"id=eq\.([^&]+)", q).group(1)
            return [b for b in self.buyers if b["id"] == i]
        if method == "GET" and bang == "sellers":
            i = re.search(r"id=eq\.([^&]+)", q).group(1)
            return [s for s in self.sellers if s["id"] == i]
        if method == "GET" and bang == "info_requests":
            return self.ir
        if method == "GET" and bang == "viewings":
            return self.viewings
        if method == "GET" and bang == "listings":
            return [{"code": "BDS-Q5-0001"}]
        if method == "PATCH" and bang == "reminders":
            i = re.search(r"id=eq\.([^&]+)", q).group(1)
            for r in self.nhac:
                if r["id"] == i:
                    r.update(data)
            self.patch.append((i, data))
            return None
        raise AssertionError(f"không ngờ: {method} {endpoint}")


def _nhac(kind, **k):
    return {"id": f"r-{kind}", "kind": kind, "status": "pending", "note": "", "buyer_id": "b1", "seller_id": None,
            "listing_id": "l1", "viewing_id": None, "attempts": 0, **k}


def test_followup_tra_loi_chu_nha_gui_khach_mua_va_danh_dau_sent():
    kho = _Kho([_nhac("followup")], ir=[{"question": "hẻm mấy mét", "answer": "Hẻm 4m, xe hơi vào tận nhà"}])
    gui, lich_su = [], []
    ra = gui_nhac.chay_mot_luot(kho, lambda z, t: gui.append((z, t)) or True, lambda z: ("chi", "M•ai"),
                                lambda *a: lich_su.append(a), bay_gio=TRUA)
    assert [r["kind"] for r in ra] == ["followup"]
    z, t = gui[0]
    assert z == "zl-ngan" and "BDS-Q5-0001" in t and "hẻm mấy mét" in t and "Hẻm 4m, xe hơi vào tận nhà" in t and t.startswith("Chủ nhà")
    assert "chị" in t.lower()
    assert kho.nhac[0]["status"] == "sent" and kho.nhac[0]["noi_dung_gui"] == t
    assert lich_su == [("zl-ngan", t, "buyer", "Ngân", "bot")]


def test_followup_chot_lich_xem_noi_gio_khach_da_noi():
    kho = _Kho([_nhac("followup", viewing_id="v1")], viewings=[{"time_text": "9 giờ sáng thứ 7", "slot": None, "listing_code": "BDS-Q5-0001"}])
    gui = []
    gui_nhac.chay_mot_luot(kho, lambda z, t: gui.append(t) or True, bay_gio=TRUA)
    assert gui and "9 giờ sáng thứ 7" in gui[0] and "BDS-Q5-0001" in gui[0] and "chốt" in gui[0]


def test_sold_va_feedback_chi_di_trong_khung_gio_admin_reply_di_ngay():
    kho = _Kho([_nhac("sold"), _nhac("feedback"), _nhac("admin_reply", note="Chị ơi, Luận đây, mai em dẫn chị xem nhé", seller_id=None)])
    gui, lich_su = [], []
    gui_nhac.chay_mot_luot(kho, lambda z, t: gui.append(t) or True, ghi_lich_su=lambda *a: lich_su.append(a), bay_gio=KHUYA)
    assert gui == ["Chị ơi, Luận đây, mai em dẫn chị xem nhé"]       # 23 giờ: sold / feedback để pending, admin nói thì gửi ngay
    assert lich_su[0][4] == "human" and [r["status"] for r in kho.nhac] == ["pending", "pending", "sent"]
    gui.clear()
    gui_nhac.chay_mot_luot(kho, lambda z, t: gui.append(t) or True, bay_gio=TRUA)
    assert len(gui) == 2 and "chốt" in gui[0] and "thấy sao" in gui[1]


def test_gui_hut_thi_dem_lan_va_khong_danh_dau_sent_qua_tran_thanh_dead():
    kho = _Kho([_nhac("sold")])
    def hong(z, t):
        raise OSError("bridge chết")
    gui_nhac.chay_mot_luot(kho, hong, bay_gio=TRUA)
    r = kho.nhac[0]
    assert r["status"] == "pending" and r["attempts"] == 1 and r["next_retry_at"] and "bridge chết" in r["last_error"]
    r["attempts"] = gui_nhac.ATTEMPTS_TOI_DA - 1
    kho.nhac[0]["next_retry_at"] = None
    gui_nhac.chay_mot_luot(kho, hong, bay_gio=TRUA)
    assert r["status"] == "dead"


def test_nguoi_nhan_khong_co_zalo_hoac_thieu_cau_tra_loi_thi_dead_khong_ket_vong():
    kho = _Kho([_nhac("sold", buyer_id="b9"), _nhac("followup")], buyers=[{"id": "b9", "name": "X", "zalo_user_id": None}], ir=[])
    gui = []
    gui_nhac.chay_mot_luot(kho, lambda z, t: gui.append(t) or True, bay_gio=TRUA)
    assert gui == [] and all(r["status"] == "dead" for r in kho.nhac)


def test_khong_ghi_noi_dung_gui_khi_con_pending():
    """escalation-feed cũng kéo dòng có `noi_dung_gui` — ghi sớm là hai bên cùng gửi."""
    kho = _Kho([_nhac("sold")])
    def hong(z, t):
        return False
    gui_nhac.chay_mot_luot(kho, hong, bay_gio=TRUA)
    assert "noi_dung_gui" not in kho.nhac[0]


# --- 2. Khối ĐIỂM TIN ---------------------------------------------------------------------------------------------------------------
def test_prompt_ban_co_khoi_diem_tin_so_that():
    eng, spy = _eng({"operations": [{"op": "set", "field": "loai_hinh", "value": "nhà phố", "bang_chung": "nhà phố"}]})
    eng.handle("dt1", "em ơi anh có căn nhà phố cần bán")
    he = spy.systems[-1]
    m = re.search(r"=== ĐIỂM TIN .*?===\nTin này: (\d+)/100\. Người rao: hạng (Đồng|Bạc|Vàng) \((\d+)/100\)", he)
    assert m, he[-600:]
    assert "Để tăng điểm:" in he and "không hứa lên Top" in he


def test_khoi_dinh_gia_khong_hua_chuyen_vien_bao_lai():
    from aioi.prompts import KHOI_DINH_GIA, BUSINESS_CONTEXT
    assert "chuyên viên bên em sẽ xem khu vực và báo lại" not in KHOI_DINH_GIA and "KHÔNG hứa" in KHOI_DINH_GIA
    assert "ĐIỂM TIN" in BUSINESS_CONTEXT
    assert "xin bên dự án rồi gửi lại" not in cau_mau.MAC_DINH["chua_co_ban_ve"][0]


# --- 3. Người thật vào cuộc -----------------------------------------------------------------------------------------------------------
class _KhoServer:
    def __init__(self):
        self.giu, self.bao, self.cham, self._conversations = False, [], [], {}
        self.is_configured = False

    def dang_giu_hoi_thoai(self, uk):
        return self.giu

    def load(self, uk):
        return None

    def save(self, conv):
        pass

    def bao_can_nguoi(self, uk, trich, ten, role):
        self.bao.append((uk, trich, role))
        return True

    def danh_dau_nguoi_that(self, uk, vai):
        self.cham.append((uk, vai))
        return True


def _ngay(monkeypatch):
    class _Luong:   # chạy ngay, không chờ luồng nền
        def __init__(self, target, daemon=True, name=None):
            self.t = target

        def start(self):
            self.t()
    monkeypatch.setattr(srv, "threading", SimpleNamespace(Thread=_Luong))


def test_human_note_bot_nhuong_san_ghi_loi_admin_roi_im_30_phut(monkeypatch):
    kho = _KhoServer()
    monkeypatch.setattr(srv._engine, "_convstore", kho)
    goi, ghi = [], []
    from aioi.engine import TurnResult
    tra = TurnResult(reply="Dạ còn ạ.", assistant_name="M•ai", captured=[], next_field=None, user_type="unknown", is_listing_post=False,
                     completeness=0.5, property_score=0, user_score=0, tier="")
    monkeypatch.setattr(srv._engine, "handle", lambda *a, **k: (goi.append(a), tra)[1])
    monkeypatch.setattr(srv, "sync_to_supabase_async", lambda **k: ghi.append(k))
    _ngay(monkeypatch)
    c = TestClient(srv.app)
    r = c.post("/chat-reply", json={"external_user_id": "ht1", "text": "Chị ơi Luận đây, mai em dẫn chị đi xem nhé", "human_note": True})
    assert r.status_code == 200 and r.json()["replies"] == [] and goi == []
    assert ghi[-1]["bot_reply"].startswith("Chị ơi Luận đây") and ghi[-1]["nguoi_gui"] == "human" and ghi[-1]["incoming_text"] == ""
    assert kho.cham == [("ht1", "seller")]
    conv = srv._engine.conversation("ht1")
    assert conv.nhuong_san_den > srv.time.time() + 1700 and conv.history[-1].content.startswith("Chị ơi Luận đây")
    # Khách nhắn tiếp trong 30 phút: bot im, lời khách vẫn vào CRM cho admin đọc; không gọi model.
    r = c.post("/chat-reply", json={"external_user_id": "ht1", "text": "dạ được anh"})
    assert r.json()["replies"] == [] and goi == [] and ghi[-1]["incoming_text"] == "dạ được anh" and ghi[-1]["bot_reply"] == ""
    # Hết 30 phút: bot trả lời lại.
    conv.nhuong_san_den = srv.time.time() - 1
    c.post("/chat-reply", json={"external_user_id": "ht1", "text": "em ơi còn căn nào không"})
    assert goi and goi[-1][1] == "em ơi còn căn nào không"


def test_nhuong_san_giu_qua_khoi_dong_lai_sqlite():
    kho = SqliteConversationStore(":memory:")
    conv = Conversation(user_key="k1", assistant=assign_assistant("k1"), nhuong_san_den=1_900_000_000.5)
    kho.save(conv)
    assert kho.load("k1").nhuong_san_den == 1_900_000_000.5


# --- 4. File quá 20 MB ----------------------------------------------------------------------------------------------------------------
def test_file_qua_lon_bao_admin_that_qua_duong_can_nguoi_that():
    eng, _ = _eng({"operations": []})
    conv = eng.conversation("big1")
    r = eng._escalate_oversize(conv, ["https://drive.google.com/file/d/abc/view"], now=1.0)
    assert r.can_nguoi_that and r.can_nguoi_that.startswith("gửi file quá 20 MB") and "drive.google.com" in r.can_nguoi_that
    assert r.reply == cau_mau.cau("file_qua_lon")
