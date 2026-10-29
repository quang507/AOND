"""29/10/2026 (SRS-5.1zzzzzzz282). Chủ dự án xem chat khách mua: "đoạn pháp lý dài quá ta". Khách hỏi "công chứng sang tên lâu không?" → bot chép
đủ mục kho (hạn 30 ngày, mức phạt, thời gian do tỉnh quy định, nơi nộp hồ sơ) + một câu kết dặn dò dài — bốn đoạn Zalo. Lời dặn khối pháp lý
nay: chỉ ý trúng câu hỏi, tối đa 2 câu, bỏ ý phụ khách không hỏi, kết bằng một vế ngắn có "tham khảo". Đỏ khi gỡ bản sửa."""
from aioi import phap_ly


def test_khoi_phap_ly_dan_tra_loi_ngan_dung_y_hoi():
    k = phap_ly.khoi_luot("thoi_han_sang_ten")
    assert "TỐI ĐA 2 câu" in k and "BỎ các ý phụ khách không hỏi" in k
    assert "tham khảo" in k                                       # vẫn luôn nói "tham khảo" (CLAUDE.md §6.2)
    assert "Kết bằng MỘT câu: đây là thông tin tham khảo theo quy định chung" not in k   # câu kết dặn dò dài cũ
