"""SRS-5.1zzzzzzz177 (audit hội thoại thật 24/10/2026, chủ dự án 25/10: "Sửa luôn 5 cái đó đi, xong merg"). Bốn lỗi phía lõi (lỗi thứ năm —
bridge không gửi được ảnh — kiểm ở bot/tests/kich-thuoc-anh.mjs):
(2) khách hỏi việc ngoài nhà đất khi chưa tỏ ý bán / mua bị ép vào luồng rao (hỏi địa chỉ, phường, ngang dài; tạo tin; bịa "khu mình đang rao");
(3) mỗi lời chào đẻ một dòng `listings` rỗng; (4) tin báo căn mới gửi lại căn bot vừa giới thiệu trong chat; (5) căn lệch phòng ngủ /
diện tích mà lời bot chỉ nói "khác khu". Đỏ khi: ô vẫn ghi từ câu hỏi ngoài việc, khối lần 2 không đề nghị nối người, dòng rỗng vẫn tạo,
tin báo không loại căn đã dán link, dòng căn không ghi điểm lệch."""
from aioi import bao_can_moi
from aioi.assistants import assign_assistant
from aioi.engine import Conversation
from aioi.mua import danh_dau_lech, dong_can
from aioi.schema import Property
from aioi.supabase_store import SupabaseConversationStore
from tests.test_bao_can_moi import NGAN, KhoGia as KhoBao, chay, tin
from tests.test_viec_mua import CAN, KhoGia, _engine

NGOAI = {"operations": [{"op": "update", "target": "", "fields": {"dia_chi": "198 Trương Đình Hội"}}], "user_intent": "unknown",
         "hoi_ngoai_viec": "cái đhn trước cổng bên cty xuống cắt ngày nào"}


def test_hoi_ngoai_viec_khong_ghi_o_khong_hoi_can_lan_hai_de_nghi_noi_nguoi():
    kho = KhoGia()
    eng, ai = _engine(kho, NGOAI)
    eng.handle("nv-1", "Cho em hỏi cái đhn trước cổng bên cty xuống cắt ngày nào ạ")
    conv = eng.conversation("nv-1")
    assert not conv.prop.fields.get("dia_chi") and conv.so_luot_ngoai_viec == 1
    assert any("KHÁCH HỎI VIỆC NGOÀI NHÀ ĐẤT" in s and "KHÔNG hỏi địa chỉ" in s and "KHÔNG nói khách đang rao" in s for s in ai.system)
    eng._provider.ke_hoach = {**NGOAI, "hoi_ngoai_viec": "Em hỏi đồng hồ nước á"}
    eng.handle("nv-1", "Em hỏi đồng hồ nước á")
    assert conv.so_luot_ngoai_viec == 2 and not conv.prop.fields
    assert any("lần thứ 2" in s and "nối anh/chị phụ trách" in s and "KHÔNG hỏi gì về nhà đất nữa" in s for s in ai.system)


def test_khach_da_to_y_ban_thi_hoi_viec_khac_van_ghi_o():
    kho = KhoGia()
    eng, ai = _engine(kho, {**NGOAI, "user_intent": "sell"})
    eng.handle("nv-2", "Nhà 198 Trương Đình Hội em gửi bán, mà cho hỏi đồng hồ nước cắt ngày nào")
    conv = eng.conversation("nv-2")
    assert conv.prop.fields.get("dia_chi") and conv.so_luot_ngoai_viec == 0
    assert not any("KHÁCH HỎI VIỆC NGOÀI NHÀ ĐẤT" in s for s in ai.system)


def test_cum_trich_ngoai_viec_bia_thi_bo():
    kho = KhoGia()
    eng, _ = _engine(kho, NGOAI)
    eng.handle("nv-3", "Địa chỉ 198 Trương Đình Hội ạ")
    assert eng.conversation("nv-3").so_luot_ngoai_viec == 0


class _Kho(SupabaseConversationStore):
    def __init__(self):
        super().__init__(url="https://x.supabase.co", key="k")
        self.goi = []
        self._seller_cache["u"] = "s1"
        self._conv_cache["s1"] = "c1"

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        if method == "POST" and endpoint == "listings":
            return [{"id": (data or {}).get("id")}]
        return []


def _conv(prop):
    c = Conversation(user_key="u", assistant=assign_assistant("u"))
    c.active.prop = prop
    return c


def test_loi_chao_khong_tao_dong_listings_rong_co_o_thi_tao():
    kho = _Kho()
    kho.save(_conv(Property()))
    assert not [d for m, e, d in kho.goi if m == "POST" and e == "listings"]
    kho = _Kho()
    kho.save(_conv(Property(fields={"_ngoai_vung": "Hà Nội"})))              # khoá nội bộ không tính là ô thật
    assert not [d for m, e, d in kho.goi if m == "POST" and e == "listings"]
    kho = _Kho()
    kho.save(_conv(Property(fields={"dia_chi": "Lê Văn Sỹ"})))
    assert [d for m, e, d in kho.goi if m == "POST" and e == "listings"]
    kho = _Kho()
    kho.save(_conv(Property(loai_hinh="nha_pho")))
    assert [d for m, e, d in kho.goi if m == "POST" and e == "listings"]


def test_dong_can_noi_thang_thieu_phong_ngu_va_nho_dien_tich():
    from types import SimpleNamespace
    lead = SimpleNamespace(so_phong_ngu="2", fields={"dien_tich_mong_muon": "60m2"})
    c1 = danh_dau_lech([{**CAN, "bedrooms": 1, "area_m2": 44.0}], lead)[0]
    d = dong_can(c1)
    assert "ÍT phòng ngủ hơn khách cần (có 1, khách cần 2)" in d and "NHỎ hơn diện tích khách muốn (44 m², khách muốn 60 m²)" in d
    c2 = danh_dau_lech([{**CAN, "bedrooms": None, "area_m2": 80.0}], lead)[0]
    assert "CHƯA RÕ số phòng ngủ (khách cần 2)" in dong_can(c2) and "NHỎ hơn" not in dong_can(c2)
    c3 = danh_dau_lech([{**CAN, "bedrooms": 3, "area_m2": 80.0}], lead)[0]
    assert "phòng ngủ hơn" not in dong_can(c3) and "CHƯA RÕ" not in dong_can(c3)


def test_tim_nha_danh_dau_lech_tren_duong_that():
    kho = KhoGia()
    eng, ai = _engine(kho, {"operations": [], "user_intent": "buy",
                            "buyer_lead": {"loai_giao_dich": "mua", "loai_bds": "nha_pho", "khu_vuc": "Quận 5", "ngan_sach": "5 tỷ", "so_phong_ngu": "4"}})
    eng.handle("mua-pn", "Em tìm nhà phố quận 5 tầm 5 tỷ, 4 phòng ngủ")
    assert any("CHƯA RÕ số phòng ngủ (khách cần 4)" in s and "MỌI điểm lệch" in s for s in ai.system)   # CAN không có bedrooms


class KhoBaoChat(KhoBao):
    """Kho báo căn mới + tin bot đã dán link trong chat của khách."""

    def __init__(self, tins, da_dan=(), khach=(NGAN,)):
        super().__init__(tins, khach)
        self.da_dan = list(da_dan)
        self.q_messages = []

    def _request(self, method, endpoint, data=None, prefer=None):
        bang = endpoint.split("?")[0]
        if method == "GET" and bang == "conversations":
            return [{"id": "ht-" + k["id"], "buyer_id": k["id"]} for k in self.khach]
        if method == "GET" and bang == "messages":
            self.q_messages.append(endpoint)
            return [{"conversation_id": "ht-b1", "body": f"Em gửi anh căn này nha https://aioinhadat.vercel.app/nha-dat/{m}"} for m in self.da_dan]
        if method == "GET" and bang == "listings" and "code=in." in endpoint:
            return [{"id": t["id"], "code": t["code"]} for t in self.tins if t["code"] in endpoint]
        return super()._request(method, endpoint, data, prefer)


def test_bao_can_moi_khong_gui_lai_can_da_dan_link_trong_chat():
    kho = KhoBaoChat([tin("l1", "SEED0044", 6.2e9), tin("l2", "SEED0045", 6.5e9)], da_dan=["SEED0044"])
    ra, gui = chay(kho)
    assert len(ra) == 1 and ra[0]["listing_id"] == "l2" and "SEED0045" in gui[0][1]
    assert kho.q_messages and "sender=eq.bot" in kho.q_messages[0] and "nha-dat" in kho.q_messages[0]
    kho = KhoBaoChat([tin("l1", "SEED0044", 6.2e9)], da_dan=["SEED0044"])
    ra, gui = chay(kho)
    assert ra == [] and gui == [] and kho.reminders == []


def test_vi_sao_hop_noi_thang_thieu_phong_ngu():
    lead = bao_can_moi.nhu_cau_tu_ho_so({**NGAN["preferences"], "so_phong_ngu": "4"})
    c = danh_dau_lech([tin("l1", "SEED0001", 6.8e9)], lead)[0]
    assert bao_can_moi.vi_sao_hop(c, lead).endswith("Lưu ý căn có 3 phòng ngủ, ít hơn 4 phòng khách cần.")
