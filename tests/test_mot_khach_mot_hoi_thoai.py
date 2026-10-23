"""SRS-5.1zzzzzzz149 (chủ dự án 23/10/2026: "1 zalo tính là 1 khách, 1 chỗ trong tin nhắn thôi, không tách ra"). Ca gốc: chị N. và chủ dự án chat thử, mỗi người hiện HAI
dòng trên CRM (một "bán" tên Zalo, một "mua" tên "Khách Zalo ####"), lịch sử mua / bán đứt nhau. Nguyên nhân: mỗi vai tự tạo hội thoại riêng (`seller_id` hoặc
`buyer_id`), `_save` còn tạo dòng `sellers` + hội thoại bán rỗng cho cả khách chỉ đi mua. Đỏ khi: khách đổi vai mà có hội thoại thứ hai, khách chỉ đi mua bị tạo
dòng `sellers`, hoặc dòng mua giữ tên giữ chỗ trong khi dòng bán đã có tên Zalo."""
import itertools
import re

from aioi.engine import Conversation
from aioi.assistants import assign_assistant
from aioi.supabase_store import SupabaseConversationStore

_id = itertools.count(1)


class DbGia(SupabaseConversationStore):
    """PostgREST giả CÓ TRẠNG THÁI: sellers / buyers / conversations / messages."""

    def __init__(self):
        super().__init__(url="https://x.invalid", key="k")
        self.bang = {"sellers": [], "buyers": [], "conversations": [], "messages": []}

    @staticmethod
    def _loc(rows, endpoint):
        m = re.search(r"zalo_user_id=eq\.([^&]+)", endpoint)
        if m:
            rows = [r for r in rows if r.get("zalo_user_id") == m.group(1)]
        m = re.search(r"[?&]id=eq\.([^&]+)", endpoint)
        if m:
            rows = [r for r in rows if r["id"] == m.group(1)]
        m = re.search(r"or=\((.+?)\)", endpoint)
        if m:
            dk = [x.split(".eq.") for x in m.group(1).split(",")]
            rows = [r for r in rows if any(r.get(k) == v for k, v in dk)]
        return rows

    def _request(self, method, endpoint, data=None, prefer=None):
        bang = endpoint.split("?")[0]
        if bang.startswith("rpc/") or bang not in self.bang:
            return []
        rows = self.bang[bang]
        if method == "GET":
            return [dict(r) for r in self._loc(rows, endpoint)]
        if method == "POST":
            r = {"id": f"{bang[0]}{next(_id)}", **(data or {})}
            rows.append(r)
            return [dict(r)]
        if method == "PATCH":
            for r in self._loc(rows, endpoint):
                r.update(data or {})
            return []
        return []

    def conv_cua(self, uk):
        s = next((x["id"] for x in self.bang["sellers"] if x["zalo_user_id"] == uk), None)
        b = next((x["id"] for x in self.bang["buyers"] if x["zalo_user_id"] == uk), None)
        return [c for c in self.bang["conversations"] if (s and c.get("seller_id") == s) or (b and c.get("buyer_id") == b)]


def test_khach_doi_vai_van_chi_co_mot_hoi_thoai_ban_roi_mua():
    db = DbGia()
    db.ghi_luot_chat("zl-1", "Hello", "Chào anh/chị", role="seller", user_name="Ngân Nyah")
    db.ghi_luot_chat("zl-1", "mình mua để ở", "Mua để ở thì…", role="buyer", user_name="Ngân Nyah")
    db.ghi_luot_chat("zl-1", "nhà em ở Lê Văn Sỹ", "Nhà rộng bao nhiêu?", role="seller", user_name="Ngân Nyah")
    hoi = db.conv_cua("zl-1")
    assert len(hoi) == 1 and hoi[0].get("seller_id") and hoi[0].get("buyer_id")           # một hội thoại, gắn cả hai vai
    assert [m["conversation_id"] for m in db.bang["messages"]] == [hoi[0]["id"]] * 6       # cả 3 lượt (6 tin) nằm cùng một chỗ


def test_khach_doi_vai_van_chi_co_mot_hoi_thoai_mua_roi_ban():
    db = DbGia()
    db.ghi_luot_chat("zl-2", "tìm nhà Gò Vấp", "Dạ anh/chị tầm giá?", role="buyer", user_name="Lê Quang")
    assert not db.bang["sellers"]                                                           # khách chỉ đi mua: chưa có dòng người bán
    assert len(db.conv_cua("zl-2")) == 1 and not db.conv_cua("zl-2")[0].get("seller_id")
    db.ghi_luot_chat("zl-2", "em cũng có căn muốn bán", "Dạ căn ở đâu?", role="seller", user_name="Lê Quang")
    hoi = db.conv_cua("zl-2")
    assert len(hoi) == 1 and hoi[0].get("seller_id") and hoi[0].get("buyer_id") and len(db.bang["messages"]) == 4


def test_luu_phien_khach_mua_khong_tao_dong_nguoi_ban_va_hoi_thoai_ban_rong():
    db = DbGia()
    c = Conversation(user_key="zl-3", assistant=assign_assistant("zl-3"))
    c.role = "buyer"
    db.save(c)
    assert not db.bang["sellers"] and not db.bang["conversations"]                          # `_save` bỏ qua khách đang ở vai mua


def test_dong_mua_dung_ten_zalo_cua_dong_ban():
    db = DbGia()
    db.ghi_luot_chat("zl-4", "Hello", "Chào", role="seller", user_name="Ngân Nyah")          # tên Zalo có ở dòng bán
    db.ghi_luot_chat("zl-4", "mua nhà", "Dạ", role="buyer")                                  # lượt mua không mang tên
    assert [b["name"] for b in db.bang["buyers"]] == ["Ngân Nyah"]                           # không còn "Khách Zalo ####"
    db2 = DbGia()
    db2.bang["sellers"].append({"id": "s9", "zalo_user_id": "zl-5", "name": "Lê Quang"})
    db2.bang["buyers"].append({"id": "b9", "zalo_user_id": "zl-5", "name": "Khách Zalo zl-5"})
    db2.ghi_luot_chat("zl-5", "mua nhà", "Dạ", role="buyer")                                 # dòng mua có sẵn tên giữ chỗ → vá theo tên thật
    assert db2.bang["buyers"][0]["name"] == "Lê Quang"
