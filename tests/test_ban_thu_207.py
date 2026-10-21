"""21/10/2026 (SRS-5.1zzzzzzz107). Bắn thử 207 (sau deploy chấm sao):
- KB1: khách "nhà ở quận Đống Đa, Hà Nội em", AI đọc đúng NGOÀI VÙNG nhưng cụm trích lệch dấu phẩy → code bỏ, tin Hà Nội lọt vùng.
- KB1: khách bảo đăng khi tin còn thiếu phường → bot mở "Em xin phép đăng tin ạ." (câu duyệt) rồi mới hỏi phường.
- KB2: "giá 27 tỷ… đang cho thuê 50 triệu/tháng" thành tin CHO THUÊ (mô tả ô is_rental chỉ "Có phải tin cho thuê không").
Đỏ trên code cũ (đã thử)."""
from aioi.engine import _trich_dan_khop
from aioi.prompts import khoi_trang_thai_web, khoi_xin_dang, operations_schema
from aioi.schema import Property


def test_trich_dan_bo_dau_cau_van_khop_chu_va_so():
    assert _trich_dan_khop("quận Đống Đa Hà Nội", "nhà ở quận Đống Đa, Hà Nội em")
    assert _trich_dan_khop("Hà Nội.", "nhà ở quận Đống Đa, Hà Nội em")
    assert not _trich_dan_khop("quận Ba Đình", "nhà ở quận Đống Đa, Hà Nội em")
    assert not _trich_dan_khop("giá 7 tỷ", "giá 6,95 tỷ")
    assert _trich_dan_khop("100/9", "số nhà 100/9 Trần Bình Trọng")   # dấu "/" của số nhà trong hẻm vẫn giữ


def test_khach_bao_dang_khi_con_thieu_khong_noi_cau_duyet():
    p = Property(loai_hinh="nha_pho", fields={"gia": "22,5 tỷ", "duong": "Nguyễn Chí Thanh"})
    assert "Em xin phép đăng tin ạ!" in khoi_xin_dang(["phuong"], p) and "KHÔNG nói" in khoi_xin_dang(["phuong"], p)
    duyet, _ = khoi_trang_thai_web({"len_web": False, "thieu": ["phuong"]})
    assert "KHÔNG nói \"Em xin phép đăng tin ạ!\"" in duyet


def test_dang_cho_thue_la_hien_trang_khi_rao_ban():
    from aioi.prompts import MO_TA_CHO_THUE, extraction_schema
    assert "HIỆN TRẠNG" in MO_TA_CHO_THUE and "đang cho thuê 50 triệu/tháng" in MO_TA_CHO_THUE
    assert operations_schema()["properties"]["is_rental"]["description"] == MO_TA_CHO_THUE
    assert extraction_schema()["properties"]["is_rental"]["description"] == MO_TA_CHO_THUE


def test_cum_chi_co_ky_hieu_van_khop():
    assert _trich_dan_khop("❤️", "[khách thả cảm xúc ❤️]") and not _trich_dan_khop("👍", "[khách thả cảm xúc ❤️]")
