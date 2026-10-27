"""18/10/2026 (SRS-5.1zzzzzzz44): bot báo "đã đăng lên web" theo prompt cố định, trong khi trigger DB giữ tin ở `cho_thong_tin`
khi thiếu phường chuẩn / giá / diện tích (vd phường cũ đã chia về nhiều phường mới → `chuan_dia_ban` trả `mo_ho`). Nay câu
"đã đăng / đang hiển thị" đọc trạng thái THẬT. Đỏ khi prompt quay lại lời cố định hay khi engine không đọc kho."""
from aioi.prompts import build_fee_followup_system, khoi_trang_thai_web
from aioi.schema import Property
from aioi.supabase_store import SupabaseConversationStore

# Câu tester, chủ dự án duyệt bỏ "Dạ" 21/10 (SRS-5.1zzzzzzz103) — dòng LỆNH nói câu đó; nhánh chưa lên web có câu đó trong lời CẤM.
DA_DANG = 'nguyên văn: "Em xin phép đăng tin ạ!"'


def _nha():
    return Property(loai_hinh="nha_pho", fields={"dia_chi": "146 Trần Bình Trọng", "duong": "Trần Bình Trọng",
                                                 "phuong": "Phường 2", "lo_gioi_hem": "hẻm"})


def test_chi_noi_da_dang_khi_tin_dang_hien_thi():
    assert DA_DANG in khoi_trang_thai_web({"len_web": True, "thieu": []})[0]
    assert DA_DANG in khoi_trang_thai_web(None)[0]  # kho không có khái niệm web (SQLite / thử): giữ lời cũ
    for web in ({"len_web": False, "thieu": ["phuong"]}, {"len_web": False, "thieu": [], "cho_duyet": True},
                {"len_web": False, "thieu": []}, {"len_web": False, "chua_ban_nhap": True}, {"len_web": None}):
        duyet, link = khoi_trang_thai_web(web)
        assert DA_DANG not in duyet and "TUYỆT ĐỐI KHÔNG nói tin đã đăng" in duyet, web
        assert "đã được hiển thị trên web" not in link, web
        assert "đã duyệt" not in link and "cảm ơn" not in link.lower(), web  # khách hỏi link chưa chắc đã duyệt


def test_thieu_phuong_thi_hoi_phuong_moi_khong_hoi_hem():
    s = build_fee_followup_system("Hằng", _nha(), web={"len_web": False, "thieu": ["phuong"]})
    assert DA_DANG not in s and "phường MỚI sau sáp nhập" in s
    assert "phí môi giới của tụi em chưa" not in s  # SRS-5.1zzzzzzz81: tin chưa lên web → hỏi ô thiếu, không thêm câu phí
    s = build_fee_followup_system("Hằng", _nha(), web={"len_web": False, "thieu": ["gia", "dien_tich"]})
    assert "còn thiếu giá, diện tích" in s and "hỏi ĐÚNG 1 câu về giá" in s
    s = build_fee_followup_system("Hằng", _nha(), web={"len_web": True, "thieu": []})
    assert DA_DANG in s and "phí môi giới của tụi em chưa" in s and "TẠM BỎ QUA BƯỚC HỎI PHÍ" not in s


def test_engine_doc_trang_thai_that_khi_khach_duyet():
    from tests.test_engine import _engine

    eng = _engine()
    seen: list[str] = []
    goc = eng._provider.chat
    eng._provider.chat = lambda system, messages, **k: seen.append(system) or goc(system, messages, **k)

    class Kho:
        def __init__(self):
            self.luu = 0
        def load(self, k): return None
        def reset(self, k): pass
        def save(self, conv): self.luu += 1
        def trang_thai_tin(self, conv): return {"len_web": False, "thieu": ["phuong"], "cho_duyet": False}

    kho = Kho()
    eng._convstore = kho
    conv = eng.conversation("u-web")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update({"dia_chi": "146 Trần Bình Trọng, Q5", "duong": "Trần Bình Trọng", "phuong": "Phường 2",
                             "dien_tich_dat": "60m2", "dien_tich_nha": "50m2", "gia": "10 tỷ", "ket_cau": "1 trệt 2 lầu, 4PN",
                             "lo_gioi_hem": "hẻm xe hơi 4m"})
    eng.handle("u-web", "xong rồi đó em")
    assert conv.listing_proposed
    truoc = kho.luu
    eng.handle("u-web", "đăng đi em")
    assert "TIN CHƯA LÊN WEB" in seen[-1] and DA_DANG not in seen[-1]
    assert kho.luu >= truoc + 2  # ghi lượt này xuống TRƯỚC khi đọc trạng thái, rồi ghi cuối lượt như thường


class StoreGia(SupabaseConversationStore):
    def __init__(self, dong):
        super().__init__(url="https://x.invalid", key="khoa-gia")
        self.dong = dong

    def _request(self, method, endpoint, data=None, prefer=None):
        if endpoint.startswith("sellers?"):
            return [{"id": "s1", "name": "A"}]
        if endpoint.startswith("listings?seller_id=eq.s1&code=eq.ABCDEF12"):
            assert "select=status,ward,area_m2,price_vnd" in endpoint
            return self.dong
        raise AssertionError(endpoint)


def _conv():
    from types import SimpleNamespace
    return SimpleNamespace(user_key="zalo-thu-1", active=SimpleNamespace(listing_id="abcdef123456"))


def test_store_doc_status_va_o_thieu():
    c = _conv()
    ma = c.active.listing_id[:8].upper()   # SRS-5.1zzzzzzz220: mã tin đi kèm để bot gửi link trang tin
    assert StoreGia([{"status": "dang_ban", "ward": "Phường Chợ Quán", "area_m2": 60, "price_vnd": 10}]).trang_thai_tin(c) == \
        {"len_web": True, "thieu": [], "cho_duyet": False, "ma": ma}
    assert StoreGia([{"status": "cho_thong_tin", "ward": None, "area_m2": 60, "price_vnd": None}]).trang_thai_tin(c) == \
        {"len_web": False, "thieu": ["phuong", "gia"], "cho_duyet": False, "ma": ma}
    assert StoreGia([{"status": "cho_thong_tin", "ward": "P", "area_m2": 1, "price_vnd": 1, "can_chu_duyet": True,
                      "chu_duyet_at": None}]).trang_thai_tin(_conv())["cho_duyet"] is True
    assert StoreGia([]).trang_thai_tin(_conv()) is None


def test_xac_nhan_noi_dung_loai_tin_khong_gop_ban_cho_thue():
    """SRS-5.1zzzzzzz101 (tester 21/10): "nếu bán nó sẽ hiển thị bán, cho thuê nó sẽ hiển thị cho thuê, chứ không phải bán/cho thuê"."""
    ban, _ = khoi_trang_thai_web({"len_web": True})
    thue, _ = khoi_trang_thai_web({"len_web": True}, thue=True)
    assert "tin bán" in ban and "tin cho thuê" in thue
    assert "bán / cho thuê" not in ban + thue and "bán/cho thuê" not in ban + thue


def test_xac_nhan_ngan_mot_cau_khong_mo_dau_da():
    """SRS-5.1zzzzzzz103: tester "khách nhắn ok thì mình nhắn lại 'Dạ em xin phép đăng tin ạ!' vậy xong"; chủ dự án "ừ đổi, ngắn
    thì tốt". Đỏ khi lời duyệt quay lại câu dài (kể đã đăng + mạng lưới) hoặc giữ chữ "Dạ"."""
    ban, _ = khoi_trang_thai_web({"len_web": True})
    assert '"Em xin phép đăng tin ạ!"' in ban and "Dạ em xin phép" not in ban
    assert "mạng lưới" not in ban and "đã được đăng lên hệ thống" not in ban
