"""18/10/2026 (SRS-5.1zzzzzzz47): tin từ chat chỉ lên web khi khách ĐỒNG Ý bản nháp. Lượt AI lập thao tác đọc "đồng ý / không đồng
ý" theo nghĩa (không regex), code chỉ kiểm cụm trích có thật trong tin khách. Đỏ khi engine ghi duyệt không cần bằng chứng, khi chưa
có bản nháp mà vẫn ghi, hay khi bỏ nhánh "không đồng ý" khỏi prompt. Kèm: khoá Drive đọc từ Vault, link Google Sheets vào đường nhập."""
from types import SimpleNamespace

from aioi.drive import khoa_drive
from aioi.engine import Engine, _trich_dan_khop
from aioi.prompts import OPERATIONS_SYSTEM, build_fee_followup_system, operations_schema
from aioi.schema import Property
from aioi.supabase_store import SupabaseConversationStore


def test_trich_dan_phai_co_that_trong_tin_khach():
    assert _trich_dan_khop("đăng đi", "ok em, Đăng đi nhé")
    assert _trich_dan_khop("khong dong y", "Không đồng ý đâu em")  # bỏ dấu vẫn khớp
    assert not _trich_dan_khop("đồng ý", "để anh xem lại đã")  # AI bịa trích dẫn → không tính
    assert not _trich_dan_khop("", "đồng ý")


def test_schema_va_prompt_lap_thao_tac():
    props = operations_schema()["properties"]
    assert props["duyet_ban_nhap"]["enum"] == ["dong_y", "khong_dong_y"] and "duyet_trich_dan" in props
    assert "{SLANG_NOTES}" not in OPERATIONS_SYSTEM and "tỏi" in OPERATIONS_SYSTEM  # bảng từ lóng tới được model


class _Kho:
    def __init__(self):
        self.duyet: list[bool] = []
    def load(self, k): return None
    def reset(self, k): pass
    def save(self, conv): pass
    def ghi_duyet(self, conv, dong_y): self.duyet.append(dong_y)
    def trang_thai_tin(self, conv): return {"len_web": False, "thieu": [], "cho_duyet": True}


def _eng(plan, monkeypatch):
    from tests.test_engine import _engine

    eng = _engine()
    kho = _Kho()
    eng._convstore = kho
    seen: list[str] = []
    goc = eng._provider.chat
    eng._provider.chat = lambda system, messages, **k: seen.append(system) or goc(system, messages, **k)
    monkeypatch.setattr(eng._provider, "extract", lambda system, messages, schema: dict(plan), raising=False)
    conv = eng.conversation("u-duyet")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update({"dia_chi": "146 Trần Bình Trọng", "duong": "Trần Bình Trọng", "phuong": "Phường 2",
                             "dien_tich_dat": "60m2", "gia": "10 tỷ", "ket_cau": "1 trệt 2 lầu", "lo_gioi_hem": "hẻm 4m"})
    return eng, kho, seen, conv


def test_dong_y_co_bang_chung_thi_ghi_duyet(monkeypatch):
    eng, kho, seen, conv = _eng({"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": "đăng đi"}, monkeypatch)
    conv.listing_proposed = True
    eng.handle("u-duyet", "ok em đăng đi")
    assert kho.duyet == [True]


def test_khong_dong_y_thi_xoa_duyet_va_prompt_hoi_sua(monkeypatch):
    eng, kho, seen, conv = _eng({"operations": [], "duyet_ban_nhap": "khong_dong_y", "duyet_trich_dan": "không đồng ý"},
                                monkeypatch)
    conv.listing_proposed = True
    eng.handle("u-duyet", "không đồng ý em ơi")
    assert kho.duyet == [False]
    assert "KHÁCH VỪA KHÔNG ĐỒNG Ý ĐĂNG BẢN TIN" in seen[-1] and "chính thức đăng lên hệ thống website" not in seen[-1]


def test_khong_ghi_khi_bia_trich_dan_hoac_chua_co_ban_nhap(monkeypatch):
    eng, kho, _, conv = _eng({"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": "đồng ý"}, monkeypatch)
    conv.listing_proposed = True
    eng.handle("u-duyet", "để anh hỏi vợ đã")  # AI nói "đồng ý" nhưng khách không hề nói
    assert kho.duyet == []
    eng2, kho2, _, conv2 = _eng({"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": "ok"}, monkeypatch)
    conv2.listing_proposed = False  # chưa gửi bản nháp thì "ok" không phải duyệt tin
    eng2.handle("u-duyet", "ok")
    assert kho2.duyet == []


def test_prompt_cho_duyet_khong_noi_da_dang():
    s = build_fee_followup_system("Hằng", Property(loai_hinh="nha_pho"), web={"len_web": False, "thieu": [], "cho_duyet": True})
    assert "chờ khách duyệt bản tin" in s and "chính thức đăng lên hệ thống website" not in s


class _StoreGia(SupabaseConversationStore):
    def __init__(self):
        super().__init__(url="https://x.invalid", key="khoa-gia")
        self.goi = []

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        if endpoint.startswith("sellers?"):
            return [{"id": "s1", "name": "A"}]
        if endpoint.startswith("conversations?"):
            return [{"id": "c1"}]
        return []


def test_store_tao_tin_can_duyet_va_ghi_duyet():
    st = _StoreGia()
    li = SimpleNamespace(prop=Property(loai_hinh="nha_pho", fields={"gia": "5 tỷ"}), listing_id="abcdef123456")
    st.save(SimpleNamespace(user_key="thu-1", listings=[li]))
    [(_, _, tao)] = [g for g in st.goi if g[0] == "POST" and g[1] == "listings"]
    assert tao["can_chu_duyet"] is True and tao["status"] == "cho_thong_tin"
    conv = SimpleNamespace(user_key="thu-1", active=li)
    st.ghi_duyet(conv, True)
    st.ghi_duyet(conv, False)
    patch = [g for g in st.goi if g[0] == "PATCH" and g[1] == "listings?seller_id=eq.s1&code=eq.ABCDEF12"]
    assert patch[0][2]["chu_duyet_at"] and patch[1][2] == {"chu_duyet_at": None}


def test_khoa_drive_env_truoc_vault_sau():
    assert khoa_drive("khoa-env", "https://x", "sr", doc=lambda: "khoa-vault") == "khoa-env"
    assert khoa_drive(None, "https://x", "sr", doc=lambda: "khoa-vault") == "khoa-vault"
    assert khoa_drive(None, "https://x", None, doc=lambda: "khoa-vault") is None  # không có service_role thì không đọc Vault
    assert khoa_drive(None, "https://x", "sr", doc=lambda: None) is None
    def hong():
        raise OSError("mạng")
    assert khoa_drive(None, "https://x", "sr", doc=hong) is None


def test_link_google_sheets_trong_chat_vao_duong_nhap(monkeypatch):
    from tests.test_engine import _engine

    eng = _engine()
    goi = []
    monkeypatch.setattr(Engine, "handle_link", lambda self, uk, url, now=None, caption=None: goi.append((url, caption)) or "ok")
    eng.handle("u-sheet", "rổ hàng của anh đây https://docs.google.com/spreadsheets/d/1AbCdEfGhIjK/edit#gid=0")
    eng.handle("u-sheet", "file excel https://example.com/ro-hang.xlsx")
    assert goi == [("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjK/edit#gid=0", "rổ hàng của anh đây"),
                   ("https://example.com/ro-hang.xlsx", "file excel")]
