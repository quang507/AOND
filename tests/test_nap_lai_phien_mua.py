"""SRS-5.1zzzzzzz147 + 149: nạp lại phiên sau khi lõi khởi động lại không được làm mất ngữ cảnh khách MUA. Ca gốc 23/10/2026: khách chào "Hello"
(lượt chào tạo dòng `sellers` + một dòng `listings` RỖNG), rồi nói chuyện như người mua 14 lượt. Lõi khởi động lại (triển khai) → `load` chỉ đọc hội
thoại BÁN (2 tin chào) và gán role = "seller" vì có dòng tin rỗng → tin kế "tầm 40-50m vuông" bị bot hỏi "gửi căn chung cư, nhà phố hay đất?" và ghi
vào hội thoại bán; CRM tách một khách thành hai. Từ 149 mỗi khách Zalo chỉ có MỘT hội thoại (gắn cả `seller_id` và `buyer_id`), vai của phiên suy từ
người KHÁCH nói cuối (`messages.sender`). Đỏ khi: dòng tin rỗng làm khách thành người bán, lịch sử mua không được nạp, khách chỉ đi mua (không có
`sellers`) bị coi là người mới, hoặc sửa quá tay (người bán có tin thật bị kéo sang mua, người bán nói cuối vẫn là người bán)."""
from aioi.engine import Engine
from aioi.supabase_store import SupabaseConversationStore

CAU_MUA = ["mình mua để ở", "Mua để ở thì em ưu tiên căn thoải mái", "mình đi làm quận 1", "Quận 5 cách Quận 1 không xa. Anh/chị muốn diện tích bao nhiêu ạ?"]


def _tin(ts, sender, body):
    return {"conversation_id": "c1", "created_at": ts, "sender": sender, "body": body}


class _Kho(SupabaseConversationStore):
    def __init__(self, co_seller=True, tin_that=False, nguoi_cuoi="buyer", co_buyer=True, co_hoi_thoai=True):
        super().__init__(url="https://x.supabase.co", key="k")
        self.co_seller, self.tin_that, self.nguoi_cuoi, self.co_buyer, self.co_hoi_thoai = co_seller, tin_that, nguoi_cuoi, co_buyer, co_hoi_thoai

    def _request(self, method, endpoint, data=None, prefer=None):
        if endpoint.startswith("sellers?"):
            return [{"id": "s1", "seller_type": None, "active_listing_id": None}] if self.co_seller else []
        if endpoint.startswith("buyers?"):
            return [{"id": "b1"}] if self.co_buyer else []
        if endpoint.startswith("conversations?or="):   # MỘT hội thoại chung (SRS-5.1zzzzzzz149)
            return [{"id": "c1", "seller_id": "s1" if self.co_seller else None, "buyer_id": "b1" if self.co_buyer else None}] if self.co_hoi_thoai else []
        if endpoint.startswith("listings?seller_id"):
            if not self.co_seller:
                return []
            row = {"id": "11111111-2222-3333-4444-555555555555", "code": "X", "status": "cho_thong_tin", "property_type": "chua_ro",
                   "area_m2": None, "price_vnd": None, "boc_tach": {"_thong_so_ai": True}, "deal": "ban"}
            if self.tin_that:
                row.update(property_type="nha_pho", area_m2=50, boc_tach={"dia_chi": "Lê Văn Sỹ"})
            return [row]
        if endpoint.startswith("messages?conversation_id=eq.c1"):
            chao = [_tin("2026-10-23T03:27:30+00:00", "seller", "Hello"), _tin("2026-10-23T03:27:37+00:00", "bot", "Chào anh/chị, em là Đạt")]
            mua = [_tin(f"2026-10-23T04:0{i}:00+00:00", "buyer" if i % 2 == 0 else "bot", c) for i, c in enumerate(CAU_MUA)]
            ban = [_tin("2026-10-23T05:00:00+00:00", "seller", "nhà em ở Lê Văn Sỹ"), _tin("2026-10-23T05:00:09+00:00", "bot", "Dạ nhà rộng bao nhiêu")]
            return chao + mua + (ban if self.nguoi_cuoi == "seller" else [])
        return []


def test_dong_tin_rong_khong_lam_khach_thanh_nguoi_ban_va_nap_ca_hoi_thoai_mua():
    conv = _Kho().load("u")
    assert conv.role == "buyer" and conv.buyer_lead is not None
    assert len(conv.history) == 6 and conv.history[-2].content == "mình đi làm quận 1"   # bot biết khách vừa nói gì, đang hỏi diện tích


def test_khach_chi_di_mua_khong_co_sellers_van_duoc_nap():
    conv = _Kho(co_seller=False).load("u")
    assert conv is not None and conv.role == "buyer" and len(conv.history) == 6
    assert _Kho(co_seller=False, co_buyer=False).load("u") is None                        # xoá cả hai ở CRM → phiên mới như cũ


def test_khach_vua_mua_vua_ban_vai_theo_tin_khach_gan_nhat_va_tin_ban_van_con():
    """SRS-5.1zzzzzzz153: có tin bán thật mà tin khách gần nhất ở vai MUA thì nạp lại vai mua (bản cũ: có tin bán là "seller" mãi, nên người
    từng rao bán rồi quay lại đi mua luôn bị nạp thành người bán sau mỗi lần lõi khởi động lại — lịch xem nhà không ghi được). Tin bán không mất."""
    conv = _Kho(tin_that=True).load("u")
    assert conv.role == "buyer" and conv.buyer_lead is not None
    assert any(not Engine._is_stub_listing(li) for li in conv.listings)                    # rổ bán vẫn nguyên
    assert _Kho(tin_that=True, nguoi_cuoi="seller").load("u").role == "seller"             # tin khách cuối ở vai bán thì vẫn là người bán


def test_khach_noi_cuoi_o_vai_ban_thi_khong_bi_keo_sang_mua():
    conv = _Kho(nguoi_cuoi="seller").load("u")
    assert conv.role != "buyer" and len(conv.history) == 8                                 # cả hai vai nằm trong CÙNG hội thoại, đủ 8 tin
