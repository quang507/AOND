"""19/10/2026 (SRS-5.1zzzzzzz70): bốn việc phía mua ghi xuống DB từ lõi Python — quan tâm căn, hẹn xem, câu khách hỏi chuyển chủ nhà /
CTV, chốt kèo — và đường trả lời ngược (người rao trong chat, nhân viên bằng "#mã: câu trả lời"). Trước bản này lõi chỉ hỏi nhu cầu
khách: không dòng nào vào `interests` / `viewings` / `info_requests` / `deals`. Đỏ khi bỏ `mua.py` hoặc phần nối trong engine."""
from aioi.config import Settings
from aioi.engine import Engine
from aioi.llm.mock import MockProvider
from aioi.mua import dong_can, lenh_tra_loi
from aioi.supabase_store import SupabaseConversationStore

CAN = {"id": "11111111-1111-1111-1111-111111111111", "code": "ABCD1234", "property_type": "nha_pho", "deal": "ban",
       "street": "Trần Bình Trọng", "ward": "Phường Chợ Quán", "district": "Quận 5", "area_m2": 60, "price_raw": "5 tỷ",
       "price_vnd": 5_000_000_000, "status": "dang_ban"}


class KhoGia(SupabaseConversationStore):
    """PostgREST giả: ghi lại mọi lời gọi, trả dữ liệu tối thiểu theo đường dẫn."""

    def __init__(self, nhan_vien=False, cau_cho=None):
        super().__init__(url="https://x.invalid", key="khoa-gia")
        self.goi: list[tuple[str, str, object]] = []
        self.nhan_vien, self.cau_cho = nhan_vien, cau_cho or []

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        if endpoint.startswith("rpc/parse_vnd"):
            return 5_000_000_000
        if endpoint.startswith("rpc/"):
            return 1
        if method == "POST" and endpoint.startswith("buyers"):
            return [{"id": "b1"}]
        if method == "GET":
            if endpoint.startswith("listings?or=(code.in.("):
                return [CAN] if "ABCD1234" in endpoint else []
            if endpoint.startswith("listings?status=in."):
                return [CAN]
            if endpoint.startswith("listings?code=eq."):
                return [CAN]
            if endpoint.startswith("listings?seller_id=eq.s1&select=id,code"):
                return [{"id": CAN["id"], "code": CAN["code"]}]
            if endpoint.startswith("sellers?zalo_user_id=eq.chu-1&select=id"):
                return [{"id": "s1"}]
            if endpoint.startswith("info_requests?listing_id=in."):
                return self.cau_cho
            if endpoint.startswith("info_requests?listing_id=eq."):
                return [{"id": "ir-9", "question": "sổ riêng không"}]
            if endpoint.startswith("ctvs?") and self.nhan_vien:
                return [{"id": "ctv1"}]
            return []
        return []

    def load(self, user_key):
        return None

    def save(self, conv):
        return None

    def ghi(self, method, prefix):
        return [d for m, e, d in self.goi if m == method and e.startswith(prefix)]


class AiGia(MockProvider):
    """Lượt lập thao tác trả `ke_hoach`; lượt viết lời ghi lại system prompt."""

    def __init__(self, ke_hoach):
        super().__init__(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
        self.ke_hoach, self.system = ke_hoach, []

    def extract(self, system, messages, json_schema):
        if "operations" in (json_schema.get("properties") or {}):
            return dict(self.ke_hoach)
        return super().extract(system, messages, json_schema)

    def chat(self, system, messages, max_tokens=256):
        self.system.append(system)
        return "Dạ em ghi nhận rồi ạ."


def _engine(kho, ke_hoach):
    ai = AiGia(ke_hoach)
    return Engine(ai, conversation_store=kho), ai


KHACH_MUA = {"operations": [], "user_intent": "buy",
             "buyer_lead": {"loai_giao_dich": "mua", "loai_bds": "nha_pho", "khu_vuc": "Quận 5", "ngan_sach": "5 tỷ"}}


def test_lenh_tra_loi_nhan_vien():
    assert lenh_tra_loi("#abcd1234: sổ riêng chính chủ") == ("ABCD1234", "sổ riêng chính chủ")
    assert lenh_tra_loi("căn #ABCD1234 còn không") is None
    assert lenh_tra_loi("#ABCD1234:   ") is None


def test_dong_can_khong_co_so_nha():
    d = dong_can({**CAN, "location_raw": "12 Trần Bình Trọng"})
    assert "#ABCD1234" in d and "Trần Bình Trọng" in d and "12 Trần" not in d


def test_khach_mua_thay_can_dang_co_va_tao_dong_buyers():
    kho = KhoGia()
    eng, ai = _engine(kho, KHACH_MUA)
    eng.handle("mua-1", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    assert kho.ghi("POST", "buyers")                                     # khách mua có dòng buyers
    assert any("CĂN ĐANG CÓ TRONG RỔ" in s and "#ABCD1234" in s for s in ai.system)
    tim = [e for m, e, d in kho.goi if m == "GET" and e.startswith("listings?status=in.")]
    assert tim and "deal=eq.ban" in tim[0] and "property_type=eq.nha_pho" in tim[0] and "price_vnd=lte." in tim[0]


def test_quan_tam_hen_xem_hoi_chu_nha_ghi_xuong_db():
    kho = KhoGia()
    eng, ai = _engine(kho, KHACH_MUA)
    eng.handle("mua-2", "Em tìm nhà phố quận 5 tầm 5 tỷ")               # lượt 1: vai khách mua
    eng._provider.ke_hoach = {**KHACH_MUA, "mua": {
        "ma_can": ["ABCD1234"], "quan_tam": True, "hen_xem": "chiều mai 3h", "hoi_chu_nha": "sổ riêng không",
        "trich_dan": "căn ABCD1234"}}
    eng.handle("mua-2", "căn ABCD1234 em thích, chiều mai 3h đi xem được không, sổ riêng không anh")
    assert [d for m, e, d in kho.goi if e.startswith("rpc/mark_listing_interest")][0] == {"p_codes": ["ABCD1234"], "p_buyer_id": "b1"}
    vw = kho.ghi("POST", "viewings")[0]
    assert vw["listing_id"] == CAN["id"] and vw["time_text"] == "chiều mai 3h" and vw["status"] == "proposed"
    ir = kho.ghi("POST", "info_requests")[0]
    assert ir["question"] == "sổ riêng không" and ir["source"] == "buyer_ask" and ir["status"] == "pending"
    assert "EM VỪA GHI LƯỢT NÀY" in ai.system[-1] and "hẹn xem #ABCD1234" in ai.system[-1]


def test_khong_ghi_khi_trich_dan_khong_co_trong_tin_hoac_ma_khong_co_that():
    kho = KhoGia()
    eng, _ = _engine(kho, KHACH_MUA)
    eng.handle("mua-3", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    eng._provider.ke_hoach = {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "hen_xem": "thứ 7", "trich_dan": "thứ 7"}}
    eng.handle("mua-3", "để em hỏi vợ đã")                               # AI bịa: cụm trích không có trong tin
    eng._provider.ke_hoach = {**KHACH_MUA, "mua": {"ma_can": ["ZZZZ9999"], "quan_tam": True, "trich_dan": "căn ZZZZ9999"}}
    eng.handle("mua-3", "căn ZZZZ9999 còn không")                        # mã không có / không hiện
    assert not kho.ghi("POST", "viewings") and not [e for m, e, d in kho.goi if e.startswith("rpc/mark_listing_interest")]


def test_nguoi_ban_tra_loi_cau_khach_hoi():
    kho = KhoGia(cau_cho=[{"id": "ir-1", "listing_id": CAN["id"], "question": "sổ riêng không"}])
    eng, ai = _engine(kho, {"operations": [], "user_intent": "sell",
                            "tra_loi_khach_hoi": {"id": "ir-1", "tra_loi": "sổ hồng riêng"}})
    eng.handle("chu-1", "dạ sổ hồng riêng em nha")
    patch = [(e, d) for m, e, d in kho.goi if m == "PATCH" and e.startswith("info_requests?id=eq.ir-1")]
    assert patch and patch[0][1]["status"] == "answered" and patch[0][1]["answer"] == "sổ hồng riêng"
    assert "EM VỪA CHUYỂN câu trả lời" in ai.system[-1]


def test_nhan_vien_tra_loi_bang_lenh():
    kho = KhoGia(nhan_vien=True)
    eng, _ = _engine(kho, {"operations": []})
    r = eng.handle("ctv-1", "#ABCD1234: sổ riêng, chủ bớt 100 triệu")
    patch = [d for m, e, d in kho.goi if m == "PATCH" and e.startswith("info_requests?id=eq.ir-9")]
    assert patch and patch[0]["answer"] == "sổ riêng, chủ bớt 100 triệu" and "#ABCD1234" in r.reply
    kho2 = KhoGia(nhan_vien=False)
    eng2, _ = _engine(kho2, {"operations": []})
    eng2.handle("khach-la", "#ABCD1234: sổ riêng")                       # người lạ gõ đúng cú pháp: không được trả lời thay
    assert not [e for m, e, d in kho2.goi if m == "PATCH" and e.startswith("info_requests")]


def test_chot_keo_ghi_deals():
    from tests.test_trang_thai_va_nap_lai import StoreGia, _conv
    st = StoreGia(db_status="dang_ban")
    st.save(_conv("đã bán"))
    deal = [(e, d) for m, e, d in st.goi if m == "POST" and e.startswith("deals")]
    assert deal and deal[0][1]["listing_id"] and "closed_at" in deal[0][1]
