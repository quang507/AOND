"""20/10/2026 (SRS-5.1zzzzzzz86). Bắn thử KB1 / KB2: khách "ok em đăng đi" khi tin còn thiếu ý → prompt hỏi chuyện tự soạn "bài
đăng" không 📋 (ngoại lệ "khách xin đăng thì soạn bài đầy đủ"), hệ thống không ghi là bản nháp nên khách duyệt cũng không ghi được, tin
nằm mãi `cho_thong_tin`; bài còn hỏi lại ô khách đã lờ. Nay: AI đọc "khách bảo đăng" (code kiểm trích dẫn) → đủ ô tối thiểu thì ra bản
nháp 📋 thật (ô còn lại hỏi sau khi duyệt), thiếu thì hỏi đúng ô tối thiểu, không soạn bài."""
from aioi.prompts import AD_FORMAT
from tests.test_doc_y_khach import _eng

DU_TOI_THIEU = {"dia_chi": "12 Lê Lợi", "duong": "Lê Lợi", "phuong": "Phường Bến Thành", "dien_tich_dat": "60m2",
                "dien_tich_nha": "200m2", "gia": "9 tỷ"}


def _chuan_bi(eng, uk, fields):
    conv = eng.conversation(uk)
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update(fields)
    return conv


def test_du_toi_thieu_khach_bao_dang_thi_ra_ban_nhap_that():
    eng, spy = _eng({"operations": [], "xin_dang": "đăng đi"})
    conv = _chuan_bi(eng, "xd1", DU_TOI_THIEU)
    assert conv.prop.summary_ready()                     # SRS-5.1zzzzzzz200: loại + vị trí + giá là đủ; ô phụ hỏi sau bản nháp
    eng.handle("xd1", "ok em đăng đi")
    assert AD_FORMAT in spy.systems[-1] and "KHÁCH VỪA BẢO ĐĂNG" not in spy.systems[-1]
    assert conv.listing_proposed                         # bản nháp được ghi → khách duyệt lượt sau mới ghi được
    assert conv.prop.cau_hoi_sau_ra_tin()                # ô chưa hỏi để sau bản nháp, không mất


def test_thieu_o_toi_thieu_thi_hoi_dung_o_do_khong_soan_bai():
    eng, spy = _eng({"operations": [], "xin_dang": "đăng đi"})
    f = {k: v for k, v in DU_TOI_THIEU.items() if k != "gia"}
    conv = _chuan_bi(eng, "xd2", f)
    eng.handle("xd2", "ok em đăng đi")
    he = spy.systems[-1]
    assert "KHÁCH VỪA BẢO ĐĂNG" in he and AD_FORMAT not in he
    assert conv.o_vua_hoi == "gia" and not conv.listing_proposed


def test_trich_dan_khong_co_trong_tin_khach_thi_khong_tinh_la_bao_dang():
    eng, spy = _eng({"operations": [], "xin_dang": "đăng đi"})
    conv = _chuan_bi(eng, "xd3", {k: v for k, v in DU_TOI_THIEU.items() if k != "gia"})
    eng.handle("xd3", "phí bên em bao nhiêu")
    assert not conv.listing_proposed and AD_FORMAT not in spy.systems[-1]
