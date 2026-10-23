"""SRS-5.1zzzzzzz147: nạp lại phiên sau khi lõi khởi động lại không được làm mất ngữ cảnh khách MUA. Ca gốc 23/10/2026: khách chào "Hello" (lượt chào tạo
dòng `sellers` + một dòng `listings` RỖNG), rồi nói chuyện như người mua 14 lượt (hội thoại mua, `conversations.buyer_id`). Lõi khởi động lại (triển khai) →
`load` chỉ đọc hội thoại BÁN (2 tin chào) và gán role = "seller" vì có dòng tin rỗng → tin kế "tầm 40-50m vuông" bị bot hỏi "gửi căn chung cư, nhà phố hay
đất?" và ghi vào hội thoại bán; CRM tách một khách thành hai. Đỏ khi: dòng tin rỗng làm khách thành người bán, lịch sử mua không được nạp, khách chỉ đi mua
(không có `sellers`) bị coi là người mới, hoặc sửa quá tay (người bán có tin thật bị kéo sang mua, hội thoại bán mới hơn bị bỏ)."""
from aioi.supabase_store import SupabaseConversationStore

T0 = "2026-10-23T03:27:30+00:00"
T_MUA = ["2026-10-23T04:01:41+00:00", "2026-10-23T04:01:52+00:00", "2026-10-23T04:03:45+00:00", "2026-10-23T04:03:55+00:00"]


def _tin(cid, ts, sender, body):
    return {"conversation_id": cid, "created_at": ts, "sender": sender, "body": body}


class _Kho(SupabaseConversationStore):
    def __init__(self, co_seller=True, tin_that=False, mua_moi_hon=True, co_buyer=True):
        super().__init__(url="https://x.supabase.co", key="k")
        self.co_seller, self.tin_that, self.mua_moi_hon, self.co_buyer = co_seller, tin_that, mua_moi_hon, co_buyer

    def _request(self, method, endpoint, data=None, prefer=None):
        if endpoint.startswith("sellers?"):
            return [{"id": "s1", "seller_type": None, "active_listing_id": None}] if self.co_seller else []
        if endpoint.startswith("conversations?seller_id"):
            return [{"id": "cb"}]
        if endpoint.startswith("listings?seller_id"):
            if self.co_seller is False:
                return []
            row = {"id": "11111111-2222-3333-4444-555555555555", "code": "X", "status": "cho_thong_tin", "property_type": "chua_ro",
                   "area_m2": None, "price_vnd": None, "boc_tach": {"_thong_so_ai": True}, "deal": "ban"}
            if self.tin_that:
                row.update(property_type="nha_pho", area_m2=50, boc_tach={"dia_chi": "Lê Văn Sỹ"})
            return [row]
        if endpoint.startswith("messages?conversation_id=eq.cb"):
            ts = "2026-10-23T05:00:00+00:00" if not self.mua_moi_hon else T0
            return [_tin("cb", ts, "bot", "Chào anh/chị, em là Đạt"), _tin("cb", ts, "user", "Hello")]
        if endpoint.startswith("buyers?"):
            return [{"id": "b1"}] if self.co_buyer else []
        if endpoint.startswith("conversations?buyer_id"):
            return [{"id": "cm"}]
        if endpoint.startswith("messages?conversation_id=eq.cm"):
            ds = ["mình mua để ở", "Mua để ở thì em ưu tiên căn thoải mái", "mình đi làm quận 1", "Quận 5 cách Quận 1 không xa. Anh/chị muốn diện tích bao nhiêu ạ?"]
            return [_tin("cm", t, "user" if i % 2 == 0 else "bot", d) for i, (t, d) in enumerate(zip(T_MUA, ds))]
        return []


def test_dong_tin_rong_khong_lam_khach_thanh_nguoi_ban_va_nap_ca_hoi_thoai_mua():
    conv = _Kho().load("u")
    assert conv.role == "buyer" and conv.buyer_lead is not None
    assert len(conv.history) == 4 and conv.history[-2].content == "mình đi làm quận 1"   # bot biết khách vừa nói gì, đang hỏi diện tích


def test_khach_chi_di_mua_khong_co_sellers_van_duoc_nap():
    conv = _Kho(co_seller=False).load("u")
    assert conv is not None and conv.role == "buyer" and len(conv.history) == 4
    assert _Kho(co_seller=False, co_buyer=False).load("u") is None                        # xoá cả hai ở CRM → phiên mới như cũ


def test_nguoi_ban_co_tin_that_van_la_nguoi_ban_khong_keo_sang_mua():
    conv = _Kho(tin_that=True).load("u")
    assert conv.role == "seller" and len(conv.history) == 2


def test_hoi_thoai_ban_moi_hon_thi_giu_phia_ban():
    conv = _Kho(mua_moi_hon=False).load("u")
    assert conv.role != "buyer" and len(conv.history) == 2
