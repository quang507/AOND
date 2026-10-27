"""SRS-5.1zzzzzzz143: hai luồng cùng tạo seller của khách mới → luồng thua nhận 409 và PHẢI đọc lại dòng đã có, không trả None.
Lớp lỗi: "đọc rồi ghi" không khoá, lỗi ghi bị nuốt thành None, và người gọi (`_save`) coi None là "bỏ lượt lưu". Bắn thử production 22/10:
log lõi có `Failed to create seller … 409` đúng lượt đầu của khách thử, DB có seller nhưng 0 tin. Test đỏ khi bỏ đoạn đọc lại."""
import urllib.error

from aioi.supabase_store import SupabaseConversationStore


class _Dua(SupabaseConversationStore):
    """GET sellers lần đầu rỗng (luồng kia chưa kịp ghi), POST nhận 409, GET lần sau thấy dòng của luồng kia."""

    def __init__(self):
        super().__init__(url="https://x.supabase.co", key="k")
        self.so_get = 0

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "GET" and endpoint.startswith("sellers?"):
            self.so_get += 1
            return [] if self.so_get == 1 else [{"id": "s-da-co", "name": "Khách Zalo 0001"}]
        if method == "POST" and endpoint == "sellers":
            raise urllib.error.HTTPError("u", 409, "Conflict", {}, None)
        return []


def test_thua_cuoc_tao_seller_thi_doc_lai_dong_da_co():
    kho = _Dua()
    assert kho._get_or_create_seller("thu-0001") == "s-da-co"
    assert kho._seller_cache["thu-0001"] == "s-da-co"      # lần sau khỏi hỏi DB nữa


def test_loi_that_su_van_tra_none():
    class _Hong(_Dua):
        def _request(self, method, endpoint, data=None, prefer=None):
            if method == "POST":
                raise urllib.error.HTTPError("u", 500, "Boom", {}, None)
            return []

    assert _Hong()._get_or_create_seller("thu-0002") is None   # đọc lại vẫn không có → không bịa id


# ---------- SRS-5.1zzzzzzz230: cùng lớp ở dòng `buyers` ----------

class _DuaMua(SupabaseConversationStore):
    """GET buyers lần đầu rỗng, POST nhận 409 (luồng lưu nền vừa tạo), GET lần sau thấy dòng của luồng kia."""

    def __init__(self):
        super().__init__(url="https://x.supabase.co", key="k")
        self.so_get = 0

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "GET" and endpoint.startswith("buyers?"):
            self.so_get += 1
            return [] if self.so_get == 1 else [{"id": "b-da-co"}]
        if method == "POST" and endpoint == "buyers":
            raise urllib.error.HTTPError("u", 409, "Conflict", {}, None)
        return []


def test_thua_cuoc_tao_buyer_thi_doc_lai_dong_da_co():
    kho = _DuaMua()
    assert kho.khach_mua("thu-0003", "chị Hoa") == "b-da-co"


def test_tao_buyer_loi_that_su_van_tra_none():
    class _Hong(_DuaMua):
        def _request(self, method, endpoint, data=None, prefer=None):
            if method == "POST":
                raise urllib.error.HTTPError("u", 500, "Boom", {}, None)
            return []

    assert _Hong().khach_mua("thu-0004") is None
