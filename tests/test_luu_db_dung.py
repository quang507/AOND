"""20/10/2026 (SRS-5.1zzzzzzz83; đánh giá DB). Bắn thử kịch bản cho thuê: tin không có dòng nào trong `listings` — lõi ghi
deal = "thue" trong khi enum `listing_deal` là ban / cho_thue → 22P02, cả dòng hỏng, lỗi chỉ ở journal. Cùng lượt soát: tin chat
mang source mặc định 'import_excel'; lượt chat MUA ghi vào hội thoại BÁN. Đỏ khi quay lại bất kỳ lỗi nào trên."""
from aioi.assistants import assign_assistant
from aioi.engine import Conversation
from aioi.schema import Property
from aioi.supabase_store import SupabaseConversationStore


class _Kho(SupabaseConversationStore):
    def __init__(self, loi=None):
        super().__init__(url="https://x.supabase.co", key="k")
        self.goi, self.loi = [], loi
        self._seller_cache["u"] = "s1"
        self._conv_cache["s1"] = "c1"

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        if self.loi and method == "POST" and endpoint == "listings":
            raise self.loi
        if endpoint.startswith("buyers?"):
            return [{"id": "b1"}]
        if endpoint.startswith("conversations?or="):   # một hội thoại chung cho cả hai vai (SRS-5.1zzzzzzz149)
            return [{"id": "c-mua", "seller_id": "s1", "buyer_id": "b1"}]
        if method == "POST" and endpoint == "listings":
            return [{"id": (data or {}).get("id")}]
        return []


def _conv_thue():
    c = Conversation(user_key="u", assistant=assign_assistant("u"))
    c.active.prop = Property(loai_hinh="nha_pho", is_rental=True, fields={"duong": "Lê Văn Sỹ", "gia": "25 triệu"})
    return c


def test_tin_cho_thue_ghi_dung_enum_va_nguon_chat():
    kho = _Kho()
    kho.save(_conv_thue())
    tao = [d for m, e, d in kho.goi if m == "POST" and e == "listings"][0]
    assert tao["deal"] == "cho_thue" and tao["source"] == "chat_zalo"


def test_nap_lai_tin_cho_thue_van_la_tin_thue():
    from aioi.supabase_store import trang_thai_tu_db
    assert trang_thai_tu_db("da_chot", True) == "đã cho thuê"
    import inspect
    src = inspect.getsource(SupabaseConversationStore.load)
    assert '"cho_thue"' in src                               # đọc ngược đúng enum DB


def test_luot_mua_ghi_vao_hoi_thoai_mua():
    kho = _Kho()
    kho.ghi_luot_chat("u", "tìm nhà Q5 tầm 8 tỷ", "Anh cần mấy phòng ngủ ạ?", role="buyer")
    tin = [d for m, e, d in kho.goi if m == "POST" and e == "messages"]
    assert tin and all(t["conversation_id"] == "c-mua" for t in tin) and tin[0]["sender"] == "buyer"


def test_ghi_tin_hong_thi_vao_so_loi():
    kho = _Kho(loi=OSError("22P02 invalid input value for enum"))
    kho.save(_conv_thue())
    assert any(e == "rpc/log_loi" and d["p_source"] == "supabase save" for m, e, d in kho.goi)
