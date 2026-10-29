"""29/10/2026 (SRS-5.1zzzzzzz276). Soát sổ lỗi production 48 giờ:
(a) `supabase sync: ghi tin vào messages hỏng: TypeError: argument of type 'NoneType' is not iterable` (15 lần) — người bán có cột
    `name` NULL (bắn thử chèn thẳng `sellers`, CRM tạo tay) thì `"Khách Zalo" in None` ném trước khi nhớ cache → mọi tin của khách
    đó không xuống `messages`.
(b) `bridge escalation …: Tham số không hợp lệ` (56 lần / một dòng việc) — escalation-feed đưa bridge việc gửi tới ID THỬ (`thu-…`),
    Zalo từ chối, dòng giữ `pending` và bị kéo lại mỗi phút mãi mãi.
"""
import pathlib

from aioi.supabase_store import SupabaseConversationStore

GOC = pathlib.Path(__file__).parents[1]


class _KhoTenRong(SupabaseConversationStore):
    """Người bán đã có, cột `name` NULL; ghi lại mọi lời gọi."""

    def __init__(self):
        super().__init__(url="https://x.invalid", key="khoa-gia")
        self.goi = []

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        if method == "GET" and endpoint.startswith("sellers?"):
            return [{"id": "s-1", "name": None, "zalo_user_id": "thu-276"}]
        if method == "GET" and endpoint.startswith("buyers?"):
            return []
        if method == "GET" and endpoint.startswith("conversations?"):
            return [{"id": "c-1", "seller_id": "s-1", "buyer_id": None}]
        return None


def test_nguoi_ban_ten_rong_van_ghi_duoc_tin():
    kho = _KhoTenRong()
    kho.ghi_luot_chat("thu-276", "bán nhà hẻm 5m", "Dạ em ghi rồi", role="seller", user_name="Anh Tư")
    tin = [d for m, e, d in kho.goi if m == "POST" and e == "messages"]
    assert len(tin) == 2, kho.goi
    # tên rỗng thì nhận tên Zalo
    assert ("PATCH", "sellers?id=eq.s-1", {"name": "Anh Tư"}) in kho.goi


def _ts() -> str:
    return (GOC / "bot/supabase/functions/escalation-feed/index.ts").read_text(encoding="utf-8")


def test_feed_khong_dua_bridge_viec_toi_id_thu():
    ts = _ts()
    assert 'client.rpc("la_id_thu"' in ts
    assert "items.filter((it) => !thu.has(it.id))" in ts
    # tiền tố ID thử không chép sang TS — `la_id_thu` là chỗ duy nhất
    assert '"thu-"' not in ts and "'thu-'" not in ts


def test_feed_hut_co_tran_va_hen_thu_lai():
    ts = _ts()
    assert 'action === "hut"' in ts and "HUT_TOI_DA" in ts and 'status: "dead"' in ts
    # cả hai truy vấn kéo việc đều bỏ dòng đang chờ thử lại
    assert ts.count("next_retry_at.is.null,next_retry_at.lte.") == 2


def test_bridge_bao_hut_khi_gui_loi():
    mjs = (GOC / "bot/bridge-zca/index.mjs").read_text(encoding="utf-8")
    assert 'action: "hut", id: it.id' in mjs
