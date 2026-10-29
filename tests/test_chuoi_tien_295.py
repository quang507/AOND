"""29/10/2026 (SRS-5.1zzzzzzz295). Chủ dự án chốt bước 3 chuỗi tiền: "1 ko dc 2 dc hỏi 3 20 ngày" — (1) phí hợp đồng không khác mức chuẩn,
(2) bot được hỏi tiền cọc / ngày cọc / hạn công chứng, (3) cứ 20 ngày hỏi chủ nhà căn còn bán không. Ca engine / lõi gửi đỏ khi gỡ bản sửa."""
import pathlib
from datetime import datetime, timezone

from aioi import hoi_con_ban
from aioi.engine import Engine
from aioi.schema import O_COC, O_NOI_BO

TRUA = datetime(2026, 10, 29, 4, 0, tzinfo=timezone.utc)    # 11 giờ Việt Nam
DEM = datetime(2026, 10, 29, 16, 0, tzinfo=timezone.utc)    # 23 giờ


# --- (2) căn đã cọc → hỏi cọc / công chứng ----------------------------------------------------------------------------------------------
def _eng_coc():
    from tests.test_engine import _engine

    eng = _engine()
    seen: list[str] = []
    goc = eng._provider.chat
    eng._provider.chat = lambda system, messages, **k: seen.append(system) or goc(system, messages, **k)

    class Kho:
        def load(self, k): return None
        def reset(self, k): pass
        def save(self, conv): pass
        def trang_thai_tin(self, conv): return {"len_web": True, "thieu": [], "cho_duyet": False, "ma": "ABCDEF12"}

    eng._convstore = Kho()
    conv = eng.conversation("chu-295")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update({"dia_chi": "Trần Bình Trọng, Q5", "duong": "Trần Bình Trọng", "phuong": "Phường Chợ Quán", "dien_tich_dat": "60m2",
                             "dien_tich_nha": "50m2", "gia": "5 tỷ", "ket_cau": "1 trệt 2 lầu", "lo_gioi_hem": "Mặt tiền",
                             "phap_ly": "sổ hồng riêng", "tinh_trang_ban_giao": "đang ở"})
    conv.listing_proposed = True
    return eng, conv, seen


def test_can_da_coc_hoi_lan_luot_tien_coc_ngay_coc_cong_chung():
    eng, conv, seen = _eng_coc()
    conv.active.status = "đã cọc"
    eng.handle("chu-295", "ok em")
    assert any("căn ĐÃ CỌC" in s and "đặt cọc bao nhiêu" in s for s in seen)
    seen.clear()
    eng.handle("chu-295", "ok em")
    assert any("căn ĐÃ CỌC" in s and "cọc ngày nào" in s for s in seen)
    assert conv.prop.fields["_coc_da_hoi"] == "ngay_coc,tien_coc"


def test_can_chua_coc_khong_hoi_coc():
    eng, conv, seen = _eng_coc()
    eng.handle("chu-295", "ok em")
    assert not any("căn ĐÃ CỌC" in s for s in seen)


def test_o_coc_la_o_rieng_khong_len_web():
    assert set(O_COC) <= O_NOI_BO
    from aioi.prompts import property_field_props
    assert set(O_COC) <= set(property_field_props())


# --- (3) 20 ngày hỏi còn bán -----------------------------------------------------------------------------------------------------------------
class KhoHoi:
    is_configured = True

    def __init__(self, dong):
        self.dong, self.post, self.patch = dong, [], []

    def _request(self, method, endpoint, data=None, prefer=None):
        assert endpoint == "rpc/tin_can_hoi_con_ban" and data["p_ngay"] == 20
        return self.dong

    def _post(self, endpoint, data, prefer=None):
        self.post.append((endpoint, data))
        return [{"id": f"r{i}"} for i, _ in enumerate(data)]

    def _patch(self, endpoint, data):
        self.patch.append((endpoint, data))


DONG = [
    {"listing_id": "l1", "code": "AAA11111", "deal": "ban", "street": "Trần Bình Trọng", "district": "Quận 5", "seller_id": "s1", "zalo_user_id": "z1"},
    {"listing_id": "l2", "code": "BBB22222", "deal": "ban", "street": "Nguyễn Trãi", "district": "Quận 5", "seller_id": "s1", "zalo_user_id": "z1"},
    {"listing_id": "l3", "code": "CCC33333", "deal": "cho_thue", "street": None, "district": None, "seller_id": "s2", "zalo_user_id": "z2"},
]


def test_moi_nguoi_ban_mot_tin_gom_cac_can_toi_han():
    kho, gui = KhoHoi(DONG), []
    ra = hoi_con_ban.chay_mot_luot(kho, lambda z, c: gui.append((z, c)) or True, bay_gio=TRUA)
    assert [r["so_can"] for r in ra] == [2, 1]
    assert len(gui) == 2 and gui[0][0] == "z1"
    assert "Trần Bình Trọng" in gui[0][1] and "Nguyễn Trãi" in gui[0][1] and "còn bán" in gui[0][1]
    assert "#CCC33333" in gui[1][1] and "còn cho thuê" in gui[1][1]
    assert [len(d) for e, d in kho.post] == [2, 1] and all(x["kind"] == "con_ban" for e, d in kho.post for x in d)
    assert all(d["status"] == "sent" for e, d in kho.patch)


def test_ngoai_gio_khong_hoi_bridge_hut_thi_huy_cho():
    assert hoi_con_ban.chay_mot_luot(KhoHoi(DONG), lambda z, c: True, bay_gio=DEM) == []
    kho = KhoHoi(DONG[:1])
    assert hoi_con_ban.chay_mot_luot(kho, lambda z, c: False, bay_gio=TRUA) == []
    assert kho.patch[0][1]["status"] == "cancelled"


def test_chu_dap_con_thi_ghi_moc_xac_nhan():
    from tests.test_viec_mua import AiGia, KhoGia

    class Kho(KhoGia):
        def __init__(self):
            super().__init__()
            self.xac_nhan = []

        def xac_nhan_con_ban(self, conv):
            self.xac_nhan.append(conv.user_key)
            return 1

    kho = Kho()
    ai = AiGia({"operations": [], "user_intent": "sell", "con_ban": True})
    Engine(ai, conversation_store=kho).handle("chu-295b", "còn em")
    assert kho.xac_nhan == ["chu-295b"]
    assert any("CHỦ NHÀ VỪA XÁC NHẬN CĂN CÒN BÁN" in s for s in ai.system)


def test_store_ghi_moc_cho_can_vua_hoi():
    from aioi.supabase_store import SupabaseConversationStore

    goi = []
    kho = SupabaseConversationStore.__new__(SupabaseConversationStore)
    kho.url, kho.key = "http://x", "k"
    kho._get_or_create_seller = lambda k: "s1"
    kho._get = lambda e: goi.append(("GET", e)) or [{"listing_id": "l1"}, {"listing_id": "l2"}, {"listing_id": "l1"}]
    kho._patch = lambda e, d: goi.append(("PATCH", e, d))

    class C:
        user_key = "chu-x"

    assert kho.xac_nhan_con_ban(C()) == 2
    p = [g for g in goi if g[0] == "PATCH"][0]
    assert "id=in.(l1,l2)" in p[1] and "status=in.(dang_ban,dang_quan_tam)" in p[1] and "xac_nhan_con_ban_at" in p[2]
    assert "kind=eq.con_ban" in goi[0][1] and "seller_id=eq.s1" in goi[0][1]


def test_migration_them_kind_cot_va_rpc():
    sql = (pathlib.Path(__file__).parents[1] / "bot/supabase/migrations/20261029g_cau_mau_hoi_con_ban.sql").read_text()
    assert "'con_ban'::text" in sql and "xac_nhan_con_ban_at" in sql and "function public.tin_can_hoi_con_ban" in sql
    assert "comment on column public.listings.xac_nhan_con_ban_at" in sql
    assert "revoke all on function public.tin_can_hoi_con_ban" in sql
