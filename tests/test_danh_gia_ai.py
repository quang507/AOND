"""21/10/2026 (SRS-5.1zzzzzzz104). Chủ dự án chốt: khách chấm sao cho AI MỘT lần — bên bán sau khi tin đã lên web và đã nói xong
phí, bên mua khi khách báo đã nhận đủ thông tin căn; câu "Anh/chị chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ.";
AI đọc câu trả lời theo nghĩa (code kiểm trích dẫn + lời bot trước là câu xin); điểm vào bảng `danh_gia_ai`; ≤ 2 sao báo admin.
Đỏ khi bỏ phần nối trong engine / kho, khi hỏi lại khách đã được hỏi, hay khi nhận điểm không có câu xin trước đó."""
from aioi.danh_gia import cau_xin_sao, vua_xin_sao
from aioi.supabase_store import SupabaseConversationStore
from tests.test_viec_mua import KHACH_MUA, KhoGia, _engine as _engine_mua


class _Kho:
    def __init__(self, da_xin=False):
        self.da_xin, self.hoi = da_xin, 0
    def load(self, k): return None
    def reset(self, k): pass
    def save(self, conv): pass
    def ghi_duyet(self, conv, dong_y): pass
    def trang_thai_tin(self, conv): return {"len_web": True, "thieu": [], "cho_duyet": False}
    def da_xin_danh_gia(self, k):
        self.hoi += 1
        return self.da_xin


def _eng(monkeypatch, kho):
    from tests.test_engine import _engine

    eng = _engine()
    eng._convstore = kho
    seen: list[str] = []
    goc = eng._provider.chat
    eng._provider.chat = lambda system, messages, **k: seen.append(system) or goc(system, messages, **k)
    ke = {"plan": {"operations": []}}
    monkeypatch.setattr(eng._provider, "extract", lambda system, messages, schema: dict(ke["plan"]), raising=False)
    conv = eng.conversation("u-sao")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update({"dia_chi": "146 Trần Bình Trọng", "duong": "Trần Bình Trọng", "phuong": "Phường 2",
                             "dien_tich_dat": "60m2", "dien_tich_nha": "150m2", "gia": "10 tỷ", "ket_cau": "1 trệt 2 lầu",
                             "lo_gioi_hem": "hẻm 4m", "hien_trang": "đang ở", "phap_ly": "sổ hồng"})
    conv.listing_proposed = True
    return eng, seen, ke, conv


def test_cau_xin_dung_cau_chu_du_an_duyet():
    assert cau_xin_sao("anh/chị") == "Anh/chị chấm giúp em 1–5 sao cho lần hỗ trợ này nha, để em làm tốt hơn ạ."
    assert cau_xin_sao("chị").startswith("Chị chấm giúp em") and vua_xin_sao(cau_xin_sao("anh"))
    assert "mình" in cau_xin_sao(em_xung_minh=True) and vua_xin_sao(cau_xin_sao(em_xung_minh=True))


def test_ban_xin_sao_sau_luot_duyet_va_phi_mot_lan(monkeypatch):
    kho = _Kho()
    eng, seen, ke, conv = _eng(monkeypatch, kho)
    ke["plan"] = {"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": "đăng đi"}
    r1 = eng.handle("u-sao", "ok em đăng đi")
    assert not r1.xin_danh_gia and "chấm giúp" not in r1.reply      # lượt duyệt: chỉ hỏi phí
    ke["plan"] = {"operations": []}
    r2 = eng.handle("u-sao", "chưa biết, mà thôi được rồi em")
    assert r2.xin_danh_gia and r2.reply.endswith(cau_xin_sao("anh/chị"))
    assert "LƯỢT NÀY KHÔNG ĐẶT CÂU HỎI" in seen[-1]
    r3 = eng.handle("u-sao", "ok em")
    assert not r3.xin_danh_gia and "chấm giúp" not in r3.reply      # cùng tiến trình: không hỏi lại


def test_khach_da_duoc_hoi_thi_khong_hoi(monkeypatch):
    kho = _Kho(da_xin=True)
    eng, seen, ke, conv = _eng(monkeypatch, kho)
    conv.prop.fields["_phi_da_hoi"] = "1"
    r = eng.handle("u-sao", "ok em cảm ơn")
    assert kho.hoi == 1 and not r.xin_danh_gia and "chấm giúp" not in r.reply


def test_khach_hoi_phi_thi_tra_loi_phi_truoc_chua_xin(monkeypatch):
    kho = _Kho()
    eng, seen, ke, conv = _eng(monkeypatch, kho)
    conv.prop.fields["_phi_da_hoi"] = "1"
    ke["plan"] = {"operations": [], "hoi_ve": "phi", "hoi_ve_trich_dan": "phí bao nhiêu"}
    r = eng.handle("u-sao", "phí bao nhiêu em")
    assert not r.xin_danh_gia and kho.hoi == 0


def test_doc_diem_chi_khi_bot_vua_xin_va_trich_dan_co_that(monkeypatch):
    kho = _Kho(da_xin=True)
    eng, seen, ke, conv = _eng(monkeypatch, kho)
    ke["plan"] = {"operations": [], "danh_gia_sao": 2, "danh_gia_trich_dan": "2 sao"}
    r = eng.handle("u-sao", "2 sao thôi em")                     # bot chưa xin chấm → không nhận
    assert r.danh_gia is None
    from aioi.engine import Turn
    conv.history.append(Turn("assistant", "Em xin phép đăng tin ạ!\n\n" + cau_xin_sao("anh/chị"), 0.0))
    r = eng.handle("u-sao", "2 sao thôi em")
    assert r.danh_gia == (2, "2 sao") and "KHÁCH VỪA CHẤM 2 SAO" in seen[-1] and "xin lỗi" in seen[-1]
    conv.history.append(Turn("assistant", cau_xin_sao("anh/chị"), 0.0))
    ke["plan"] = {"operations": [], "danh_gia_sao": 5, "danh_gia_trich_dan": "tuyệt vời"}
    assert eng.handle("u-sao", "ok em").danh_gia is None         # cụm trích không có trong tin vừa nhắn


def test_mua_xin_sao_khi_khach_bao_du_thong_tin():
    kho = KhoGia()
    eng, ai = _engine_mua(kho, KHACH_MUA)
    eng.handle("mua-sao", "Em tìm nhà phố quận 5 tầm 5 tỷ")
    eng._provider.ke_hoach = {**KHACH_MUA, "xong_viec_mua": "ok cảm ơn anh, vậy đủ rồi"}
    r = eng.handle("mua-sao", "ok cảm ơn anh, vậy đủ rồi")
    assert r.xin_danh_gia and r.reply.endswith(cau_xin_sao("anh/chị"))
    assert any(e.startswith("danh_gia_ai?select=id&zalo_user_id=eq.mua-sao") for m, e, d in kho.goi if m == "GET")


class _KhoGhi(SupabaseConversationStore):
    def __init__(self, thu=False):
        super().__init__(url="https://x.invalid", key="khoa-gia")
        self.goi, self.thu = [], thu

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        if endpoint.startswith("rpc/la_id_thu"):
            return self.thu
        if endpoint.startswith("sellers?zalo_user_id"):
            return [{"id": "s1"}]
        return []


def test_kho_ghi_diem_thap_bao_admin_khong_lo_so():
    kho = _KhoGhi()
    assert kho.ghi_danh_gia("chu-1", 1, "1 sao, gọi 0903123456 mãi không ai nghe", "Chị D.", "seller")
    dg = [d for m, e, d in kho.goi if e.startswith("danh_gia_ai?on_conflict")][0]
    assert dg["sao"] == 1 and dg["da_bao_admin"] is True and "0903123456" not in dg["loi_khach"]
    nhac = [d for m, e, d in kho.goi if m == "POST" and e == "reminders"]
    assert len(nhac) == 1 and nhac[0]["kind"] == "escalation" and nhac[0]["note"].startswith("⭐")
    assert "0903123456" not in nhac[0]["note"]


def test_kho_diem_cao_hoac_id_thu_khong_bao_admin():
    kho = _KhoGhi()
    kho.ghi_danh_gia("chu-1", 4, "4 sao", None, "seller")
    assert not [e for m, e, d in kho.goi if e == "reminders"]
    thu = _KhoGhi(thu=True)
    thu.ghi_danh_gia("thu-1", 1, "1 sao", None, "buyer")
    assert not [e for m, e, d in thu.goi if e == "reminders"]
    assert thu.da_xin_danh_gia("thu-1") is False                  # ID thử: lần bắn nào cũng thấy câu xin
