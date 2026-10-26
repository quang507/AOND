"""SRS-5.1zzzzzzz189: `$$$$$` (làm mới phiên) phải xoá cả hồ sơ người mua, không chỉ phía bán.

Ca gốc (chat thử "Anh Luận" 26/10/2026): gõ `$$$$$` rồi "chào em", năm phút sau vòng báo căn mới vẫn gửi căn Quận 8 theo nhu cầu cũ,
vì `SupabaseConversationStore.reset` chỉ xoá tin + hội thoại của dòng `sellers` và không bao giờ đụng `buyers.preferences`.
"""
from aioi.supabase_store import SupabaseConversationStore


def _kho(sellers, buyers, convs):
    kho = SupabaseConversationStore.__new__(SupabaseConversationStore)
    kho.fallback = None
    kho.url, kho.key = "http://x/rest/v1", "k"
    kho._seller_cache, kho._conv_cache = {"u1": "S1"}, {"S1": "C1", "mua:B1": "C1"}
    kho._buyer_cache = {"u1": "B1"}
    goi = {"get": [], "xoa": [], "sua": []}

    def _get(ep):
        goi["get"].append(ep)
        if ep.startswith("sellers?"):
            return list(sellers)
        if ep.startswith("buyers?"):
            return list(buyers)
        if ep.startswith("conversations?"):
            return list(convs)
        return []

    kho._get = _get
    kho._delete = lambda ep: goi["xoa"].append(ep)
    kho._patch = lambda ep, data: goi["sua"].append((ep, data))
    return kho, goi


def test_reset_xoa_nhu_cau_mua_va_so_bao_can():
    kho, goi = _kho([{"id": "S1"}], [{"id": "B1"}], [{"id": "C1"}])
    kho.reset("u1")
    assert ("buyers?id=eq.B1", {"preferences": {}, "bao_can_moi": True}) in goi["sua"]   # nhu cầu cũ hết → co_tieu_chi False
    assert "interests?buyer_id=eq.B1" in goi["xoa"]
    assert "reminders?kind=eq.match&buyer_id=eq.B1" in goi["xoa"]                       # sổ báo căn: khách mới thì 24 giờ / "không báo lại" cũng hết
    assert "listings?seller_id=eq.S1" in goi["xoa"] and "conversations?id=eq.C1" in goi["xoa"]   # phía bán vẫn như cũ
    assert "B1" not in kho._buyer_cache and "mua:B1" not in kho._conv_cache


def test_reset_khach_chi_mua_van_xoa():
    """Khách chỉ đi mua (không có dòng `sellers`): bản cũ thoát ngay, không xoá gì."""
    kho, goi = _kho([], [{"id": "B1"}], [{"id": "C9"}])
    kho.reset("u1")
    assert ("buyers?id=eq.B1", {"preferences": {}, "bao_can_moi": True}) in goi["sua"]
    assert "conversations?id=eq.C9" in goi["xoa"] and "messages?conversation_id=eq.C9" in goi["xoa"]
    assert not any(ep.startswith("listings?") for ep in goi["xoa"])
    assert any("buyer_id.eq.B1" in ep for ep in goi["get"] if ep.startswith("conversations?"))


def test_reset_khach_moi_khong_gap_gi():
    kho, goi = _kho([], [], [])
    kho.reset("u1")
    assert goi["xoa"] == [] and goi["sua"] == []
