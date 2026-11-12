"""SRS-5.1zzzzzzz446 — căn trong dự án: phường theo toạ độ dự án trước, chữ phường cũ trong kho chỉ là lưới đỡ."""
from aioi.supabase_store import SupabaseConversationStore


class Kho(SupabaseConversationStore):
    def __init__(self):
        self._nho = {}

    def _nho_tra(self, ten, chu, goi):
        return goi()

    def _request(self, method, endpoint, data=None):
        assert endpoint == "rpc/phuong_tai_diem"
        return "Phường Long Bình"

    def _chuan_dia_ban(self, chu):
        return ("Phường Long Bình", "Thành phố Thủ Đức") if "Long Bình" in chu else (None, None)


def test_toa_do_du_an_thang_chu_phuong_cu():
    d = {"name": "Vinhomes Grand Park", "ward": "Long Thạnh Mỹ", "district": "Quận 9", "lat": "10.8395793", "lng": "106.8421165"}
    assert Kho()._phuong_cua_du_an(d)[0] == "Phường Long Bình"


def test_khong_toa_do_doc_chu():
    assert Kho()._phuong_cua_du_an({"ward": "Long Thạnh Mỹ", "district": "Quận 9"}) == (None, None)
