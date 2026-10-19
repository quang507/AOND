"""19/10/2026 (SRS-5.1zzzzzzz63): ba lỗi lõi Python ↔ Supabase.
(1) Khách nói "bán rồi / cọc rồi / ngưng rao" chỉ đổi trạng thái trong bộ nhớ — save() không ghi `listings.status`, web vẫn hiện tin.
(2) Khởi động lại (mỗi lần cài VPS) load() dựng lại thiếu: đã trình bản nháp (so với "dang_rao" không có trên DB), căn đang nói (luôn
    căn đầu), bảng giá riêng, ảnh đã cất.
(3) Kho Supabase: `_sync_media_folder` ghi đè đường dẫn ảnh mất tên bucket → `_ghi_anh` bỏ tệp, ảnh / sổ đỏ không vào listing_media.
Đỏ khi bỏ bất kỳ bản sửa nào."""
from types import SimpleNamespace

from aioi.assistants import assign_assistant
from aioi.engine import Conversation, Listing, SqliteConversationStore
from aioi.schema import Property
from aioi.supabase_store import SupabaseConversationStore, ma_trang_thai, trang_thai_tu_db

UUID = "0123456789abcdef0123456789abcdef"
UUID_GACH = "01234567-89ab-cdef-0123-456789abcdef"


def test_ma_trang_thai():
    assert ma_trang_thai("đã bán", "dang_ban") == "da_chot"
    assert ma_trang_thai("đã cho thuê", "dang_quan_tam") == "da_chot"
    assert ma_trang_thai("đã cọc", "dang_ban") == "da_coc"
    assert ma_trang_thai("đã cọc", "cho_thong_tin") is None        # tin chưa duyệt không vì "cọc rồi" mà lên web
    assert ma_trang_thai("không rao", "dang_ban") == "an"
    assert ma_trang_thai("thôi đăng ký", "an") is None             # đã đúng thì khỏi ghi
    assert ma_trang_thai("đang bán", "an") == "cho_thong_tin"      # rao lại: trigger xét lại điều kiện lên web
    assert ma_trang_thai("đang bán", "da_coc") == "cho_thong_tin"
    assert ma_trang_thai("đang bán", "dang_ban") is None and ma_trang_thai("đang bán", "cho_thong_tin") is None
    assert trang_thai_tu_db("da_coc") == "đã cọc" and trang_thai_tu_db("da_chot", la_thue=True) == "đã cho thuê"
    assert trang_thai_tu_db("dang_ban") == "đang bán" and trang_thai_tu_db("an") == "không rao"


class StoreGia(SupabaseConversationStore):
    def __init__(self, db_status="dang_ban", fallback=None, seller_active=None, rows=None):
        super().__init__(url="https://x.invalid", key="khoa-gia", fallback_store=fallback)
        self.goi: list[tuple[str, str, object]] = []
        self.db_status, self.seller_active, self.rows = db_status, seller_active, rows or []

    def _request(self, method, endpoint, data=None, prefer=None):
        self.goi.append((method, endpoint, data))
        if endpoint.startswith("sellers?"):
            return [{"id": "s1", "name": "A", "seller_type": None, "active_listing_id": self.seller_active}]
        if endpoint.startswith("conversations?"):
            return [{"id": "c1"}]
        if endpoint.startswith("rpc/chuan_dia_ban"):
            return [{"phuong": None, "quan_cu": None}]
        if endpoint.startswith("listings?id=eq.") and method == "GET":
            return [{"id": UUID_GACH, "status": self.db_status}]
        if endpoint.startswith("listings?seller_id") and "order=created_at" in endpoint:
            return self.rows
        if endpoint.startswith("messages?"):
            return []
        return []


def _conv(status):
    li = Listing(listing_id=UUID, prop=Property(loai_hinh="nha_pho", fields={"gia": "5 tỷ"}), status=status)
    return Conversation(user_key="zalo-thu-1", assistant=assign_assistant("zalo-thu-1"), listings=[li], active_listing_id=UUID)


def _patch_tin(st):
    return [d for m, e, d in st.goi if m == "PATCH" and e.startswith("listings?id=eq.")]


def test_save_ghi_trang_thai_xuong_db():
    st = StoreGia(db_status="dang_ban")
    st.save(_conv("đã bán"))
    assert _patch_tin(st)[0]["status"] == "da_chot"
    st = StoreGia(db_status="dang_ban")
    st.save(_conv("đã cọc"))
    assert _patch_tin(st)[0]["status"] == "da_coc"
    st = StoreGia(db_status="cho_thong_tin")
    st.save(_conv("đã cọc"))
    assert "status" not in _patch_tin(st)[0]
    st = StoreGia(db_status="dang_ban")
    st.save(_conv("đang bán"))
    assert "status" not in _patch_tin(st)[0]                       # không đè trạng thái admin / trigger quyết


def test_save_ghi_can_dang_noi_mot_lan():
    st = StoreGia()
    st.save(_conv("đang bán"))
    st.save(_conv("đang bán"))
    ghi = [d for m, e, d in st.goi if m == "PATCH" and e.startswith("sellers?id=eq.s1")]
    assert ghi == [{"active_listing_id": UUID_GACH}]


def _dong(id_, code, status="dang_ban", fields=None, **kw):
    return {"id": id_, "code": code, "status": status, "property_type": "nha_pho", "deal": "ban",
            "boc_tach": fields or {"gia": "5 tỷ"}, **kw}


def test_load_bu_phan_sqlite_va_doc_trang_thai_that(tmp_path):
    sql = SqliteConversationStore(str(tmp_path / "a.db"))
    cu = Conversation(user_key="zalo-thu-1", assistant=assign_assistant("zalo-thu-1"),
                      listings=[Listing(listing_id=UUID, prop=Property(loai_hinh="nha_pho"), listing_proposed=True,
                                        history_start=7, media=[{"path": f"listing-public/{UUID_GACH}/a.jpg"}])],
                      active_listing_id=UUID)
    cu.price_book = {"42": {"gia": "3 tỷ"}}
    sql.save(cu)
    hai = "fedcba9876543210fedcba9876543210"
    rows = [_dong(UUID_GACH, UUID[:8].upper(), status="da_coc"),
            _dong("fedcba98-7654-3210-fedc-ba9876543210", hai[:8].upper())]
    st = StoreGia(fallback=sql, seller_active=UUID_GACH, rows=rows)
    conv = st.load("zalo-thu-1")
    li = conv.listings[0]
    assert (li.status, li.listing_proposed, li.history_start) == ("đã cọc", True, 7)
    assert li.media and conv.price_book == {"42": {"gia": "3 tỷ"}}
    assert conv.active_listing_id == UUID                        # theo sellers.active_listing_id, không phải căn đầu / cuối
    st2 = StoreGia(fallback=None, seller_active=None, rows=rows)
    assert st2.load("zalo-thu-1").active_listing_id == hai         # không có dấu → căn mới nhất


def test_load_khong_co_sqlite_suy_ban_nhap_tu_db():
    rows = [_dong(UUID_GACH, UUID[:8].upper(), chu_duyet_at="2026-10-19T00:00:00Z")]
    li = StoreGia(rows=rows).load("zalo-thu-1").listings[0]
    assert li.listing_proposed is True                             # bản cũ so "dang_rao" → luôn False → trình lại bản nháp


def test_kho_supabase_khong_doi_duong_dan_anh():
    from aioi.engine import Engine
    from aioi.kho_anh import SupabaseMediaStore
    from tests.test_engine import _engine

    e = _engine()
    e._media_store = SupabaseMediaStore("https://x.invalid", "khoa-gia")
    li = Listing(listing_id=UUID, prop=Property(loai_hinh="nha_pho", fields={"dia_chi": "12 Lê Lợi"}),
                 media=[{"path": f"listing-public/{UUID_GACH}/a.jpg", "filename": "a.jpg"}])
    Engine._sync_media_folder(e, li)
    assert li.media[0]["path"] == f"listing-public/{UUID_GACH}/a.jpg"


class StoreChuaHoiThoai(StoreGia):
    """Người bán có tin trên DB nhưng chưa có (hoặc đã xoá) dòng hội thoại — tin nhập từ CRM, người rao chỉ trả lời câu khách mua."""

    def _request(self, method, endpoint, data=None, prefer=None):
        if endpoint.startswith("conversations?"):
            self.goi.append((method, endpoint, data))
            return []
        if endpoint.startswith("listings?seller_id") and "limit=1" in endpoint:
            self.goi.append((method, endpoint, data))
            return [{"id": UUID_GACH}] if self.rows else []
        return super()._request(method, endpoint, data, prefer)


def test_load_nguoi_ban_co_tin_ma_chua_co_hoi_thoai():
    # SRS-5.1zzzzzzz77 (bắn thử người mua 19/10): chủ nhà trả lời câu khách mua → lõi coi như người mới, hỏi "chung cư, nhà phố hay
    # đất" và sinh thêm một tin rỗng. Có tin trên DB thì phải nạp tin, chỉ bỏ lịch sử.
    rows = [_dong(UUID_GACH, UUID[:8].upper())]
    conv = StoreChuaHoiThoai(rows=rows).load("zalo-thu-1")
    assert conv is not None and conv.role == "seller" and [li.listing_id for li in conv.listings] == [UUID]
    assert conv.history == []
    assert StoreChuaHoiThoai(rows=[]).load("zalo-thu-1") is None      # không tin, không hội thoại → như người mới (giữ như cũ)
