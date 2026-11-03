"""03/11/2026 (SRS-5.1zzzzzzz373 / 374, chủ dự án: "câu này tách ra", "Em sẽ rao như vầy nhé anh: tách ra", điểm tin "tách ra khỏi tin nháp
gộp vào câu dưới", "xuống dòng thôi ko cần xuống 2 dòng"). Lượt có bản tin 📋 gửi Zalo: câu chat trước · dòng mở 📋 · thân bản tin nguyên
khối · phần chat sau (điểm tin + câu chốt, một tin). Đỏ khi `server` gửi cả lời thành một tin như trước."""
from aioi.delivery import tach_ban_tin, tach_tin_ban_tin
from aioi.engine import _phan_chat_quanh_ban_tin

LOI = ("Hẻm rộng tới 10m cả hai đầu là điểm khách đi xem sẽ để ý ngay, em đưa lên tin cho rõ nghen.\n\n"
       "📋 Em sẽ rao như vầy nhé anh:\n\n"
       "🏡 Bán dãy trọ 10 phòng, 2 hẻm 10m trước sau, gần Đầm Sen, 27 tỷ\n\n"
       "Chính chủ bán dãy trọ 10 phòng đang cho thuê.\n\n"
       "- Diện tích: 253.1 m²\n- Giá bán: 27 tỷ\n\n"
       "Nhắn Zalo để em gửi thêm hình và hẹn giờ đi xem nhé!\n\n"
       "Tin này đang được 94/100 điểm. Anh là người rao hạng Vàng.\n\n"
       "Anh muốn sửa chỗ nào, hay em đăng luôn ạ?")


def test_bon_tin_rieng():
    tin = tach_tin_ban_tin(LOI)
    assert tin[0].startswith("Hẻm rộng tới 10m") and "📋" not in tin[0]
    assert tin[1] == "📋 Em sẽ rao như vầy nhé anh:"
    assert tin[2].startswith("🏡 Bán dãy trọ") and "- Giá bán: 27 tỷ" in tin[2] and tin[2].endswith("hẹn giờ đi xem nhé!")
    assert "\n\n" in tin[2], "thân bản tin giữ bố cục"
    assert tin[3] == "Tin này đang được 94/100 điểm. Anh là người rao hạng Vàng.\nAnh muốn sửa chỗ nào, hay em đăng luôn ạ?"
    assert len(tin) == 4


def test_khong_co_phan_sau_thi_ba_tin():
    truoc, ban, sau = tach_ban_tin(LOI.split("\n\nTin này", 1)[0])
    assert truoc and ban.endswith("hẹn giờ đi xem nhé!") and sau == ""


def test_tin_chat_khong_ban_tin_xuong_mot_dong():
    assert tach_tin_ban_tin("Em xin phép đăng tin ạ!\n\nAnh vào https://x.vn/nha-dat/2CC00A23 để theo dõi tin nha.") == [
        "Em xin phép đăng tin ạ!\nAnh vào https://x.vn/nha-dat/2CC00A23 để theo dõi tin nha."]


def test_phan_chat_cung_nguon():
    assert _phan_chat_quanh_ban_tin(LOI) == (
        "Hẻm rộng tới 10m cả hai đầu là điểm khách đi xem sẽ để ý ngay, em đưa lên tin cho rõ nghen.\n"
        "Tin này đang được 94/100 điểm. Anh là người rao hạng Vàng.\nAnh muốn sửa chỗ nào, hay em đăng luôn ạ?")
