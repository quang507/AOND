"""21/10/2026 (SRS-5.1zzzzzzz116). Chủ dự án gửi bộ câu môi giới hỏi chủ nhà (pháp lý, giá, dẫn khách xem, chi tiết nhà): bot hỏi SAU khi
tin lên web và đã nói phí, mỗi lượt một cụm, mỗi cụm một lần — không làm chậm bản nháp ("hỏi ít, ra bản nháp sớm"). Ô riêng của chủ (lý
do bán, người đứng tên, giờ xem, chìa khoá) không vào `listings.boc_tach` (đọc công khai qua API) mà vào `listing_noi_bo`, không vào bản
tin. Đỏ khi các ô mới lọt vào % đầy đủ, khi hỏi lặp một cụm, khi cụm chen trước lượt xin chấm sao, hay khi ô riêng ra web."""
from aioi.engine import _lo_thong_tin_rieng
from aioi.prompts import describe_captured, khoi_hoi_sau_dang, property_field_props
from aioi.schema import CUM_SAU_DANG, O_NOI_BO, O_SAU_DANG, Property
from aioi.supabase_store import SupabaseConversationStore
from tests.test_danh_gia_ai import _eng


def _nha(**f) -> Property:
    return Property(loai_hinh="nha_pho", fields={"dia_chi": "146 Trần Bình Trọng", "duong": "Trần Bình Trọng", **f})


def test_o_moi_khong_vao_phan_tram_ban_nhap():
    for loai in ("nha_pho", "chung_cu", "dat", "kho_xuong", "mat_bang", "toa_nha"):
        p = Property(loai_hinh=loai)
        assert not (O_NOI_BO | {"thue_phi", "thanh_toan", "gio_xem", "huong", "nam_xay"}) & set(p.expected_fields()), loai


def test_thu_tu_cum_va_bo_o_da_co():
    p = _nha()
    assert p.cum_sau_dang() == ("phap_ly", ["dung_ten_so", "the_chap", "quy_hoach"])
    p.fields["the_chap"] = "không thế chấp"
    assert p.cum_sau_dang() == ("phap_ly", ["dung_ten_so", "quy_hoach"])
    assert p.cum_sau_dang({"phap_ly"}) == ("gia", ["thuong_luong", "ly_do_ban"])
    ma = [m for m, _ in CUM_SAU_DANG]
    assert p.cum_sau_dang(set(ma[:-1]))[0] == "chi_tiet" and p.cum_sau_dang(set(ma)) is None


def test_theo_loai():
    thue = Property(loai_hinh="nha_pho", is_rental=True)
    assert thue.cum_sau_dang() == ("xem_nha", ["gio_xem", "chia_khoa"])           # cho thuê: chỉ hỏi dẫn khách xem
    can_ho = Property(loai_hinh="chung_cu")
    assert can_ho.cum_sau_dang({"phap_ly", "gia", "thue_phi", "xem_nha"}) is None   # căn hộ không có cụm chi tiết nhà
    dat = Property(loai_hinh="dat")
    assert "quy_hoach" not in dat.cum_sau_dang()[1]                                 # đất: quy hoạch đã hỏi trước bản nháp


def test_ai_ghi_duoc_o_moi_va_khoi_hoi_dung_y():
    props = property_field_props()
    assert O_SAU_DANG <= set(props)
    k = khoi_hoi_sau_dang(["gio_xem", "chia_khoa"], _nha())
    assert "khung giờ" in k and "chìa khoá" in k and "KHÔNG xin số điện thoại" in k and "DUY NHẤT" in k


def test_o_rieng_khong_vao_ban_tin():
    p = _nha(ly_do_ban="cần tiền gấp trả nợ", gio_xem="sau 5h chiều")
    mo_ta = describe_captured(p)
    assert "THÔNG TIN RIÊNG CỦA CHỦ" in mo_ta and mo_ta.index("THÔNG TIN RIÊNG") < mo_ta.index("cần tiền gấp")
    assert _lo_thong_tin_rieng("📋 Bán nhà ... chủ cần tiền gấp trả nợ nên bán nhanh", p) == ["ly_do_ban"]
    assert _lo_thong_tin_rieng("Dạ chị cần tiền gấp trả nợ thì em hiểu", p) == []           # lời chat, không phải bản tin
    assert _lo_thong_tin_rieng("📋 Bán nhà Trần Bình Trọng", p) == []


class _KhoGhi(SupabaseConversationStore):
    def __init__(self):
        self.url, self.key, self.fallback, self.goi = "http://x", "k", None, []

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        return []


def test_kho_ghi_o_rieng_bang_rieng_che_so():
    kho = _KhoGhi()
    kho._ghi_noi_bo("lid-1", {"chia_khoa": "gọi chị Hoa 0903 123 456 giữ chìa", "gio_xem": "cuối tuần"})
    m, ep, data = kho.goi[-1]
    assert m == "POST" and ep.startswith("listing_noi_bo") and data["listing_id"] == "lid-1"
    assert "0903" not in data["du_lieu"]["chia_khoa"] and data["du_lieu"]["gio_xem"] == "cuối tuần"


def test_luot_hoi_them_sau_luot_xin_sao_moi_cum_mot_lan(monkeypatch):
    from tests.test_danh_gia_ai import _Kho

    kho = _Kho()
    eng, seen, ke, conv = _eng(monkeypatch, kho)
    ke["plan"] = {"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": "đăng đi"}
    eng.handle("u-sao", "ok em đăng đi")                     # lượt duyệt: hỏi phí
    ke["plan"] = {"operations": []}
    r2 = eng.handle("u-sao", "chưa biết, mà thôi được rồi em")
    assert r2.xin_danh_gia and "HỎI THÊM LƯỢT NÀY" not in seen[-1]   # xin sao đúng lúc cũ, không chen câu hỏi
    truoc = len(seen)
    o_het = [k for ma, cum in CUM_SAU_DANG if ma != "hdt" for k in cum]   # cụm hdt chỉ hỏi khi AI đọc ra nhà đang có HĐT (SRS-5.1zzzzzzz197)
    for _ in range(len(o_het) + 2):
        eng.handle("u-sao", "ừ em")
    hoi = [x for x in seen[truoc:] if "HỎI THÊM LƯỢT NÀY" in x and "VIẾT LẠI LƯỢT NÀY" not in x]
    da = conv.prop.fields["_sau_da_hoi"].split(",")
    # SRS-5.1zzzzzzz178: mỗi lượt MỘT ô (không hỏi gộp cụm) — đủ mọi ô của 5 cụm, mỗi ô đúng một lần, không hỏi hai ô trong một lượt
    assert {f"sau:{k}" for k in o_het} <= set(da) and len(hoi) == len(o_het)
    assert all("; " not in x.split("về MỘT ý:", 1)[1].split("Đây là câu hỏi DUY NHẤT", 1)[0] for x in hoi)   # mỗi khối một ô
    assert "HỎI THÊM LƯỢT NÀY" not in seen[-1]                     # hết cụm thì thôi


def test_khach_sua_tin_thi_khong_chen_cau_hoi(monkeypatch):
    from tests.test_danh_gia_ai import _Kho

    kho = _Kho(da_xin=True)
    eng, seen, ke, conv = _eng(monkeypatch, kho)
    conv.prop.fields["_phi_da_hoi"] = "1"
    ke["plan"] = {"operations": [{"op": "update", "fields": {"gia": "9 tỷ 5"}, "bang_chung": {"gia": "9 tỷ 5"}}]}
    eng.handle("u-sao", "anh hạ giá còn 9 tỷ 5 nha")
    assert "HỎI THÊM LƯỢT NÀY" not in seen[-1]
