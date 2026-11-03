"""03/11/2026 (SRS-5.1zzzzzzz373, chủ dự án: "câu này tách ra"). Lượt có bản tin 📋 gửi Zalo thành MỘT tin dính cả câu chat mở đầu và câu
hỏi chốt. Nay: câu chat trước 📋, nguyên khối bản tin, câu chốt — ba tin. Đỏ khi `server` gửi cả lời thành một tin như trước."""
from aioi.delivery import tach_ban_tin, tach_tin_ban_tin
from aioi.engine import _phan_chat_quanh_ban_tin

LOI = ("Hẻm rộng tới 10m cả hai đầu là điểm khách đi xem sẽ để ý ngay, em đưa lên tin cho rõ nghen.\n\n"
       "📋 Bản tin cập nhật:\n\n"
       "🏡 Bán dãy trọ 10 phòng, 2 hẻm 10m trước sau, gần Đầm Sen, 27 tỷ\n\n"
       "Chính chủ bán dãy trọ 10 phòng đang cho thuê.\n\n"
       "- Diện tích: 253.1 m²\n- Giá bán: 27 tỷ\n\n"
       "Nhắn Zalo để em gửi thêm hình và hẹn giờ đi xem nhé!\n\n"
       "Anh xem còn chỗ nào cần chỉnh không, hay mình đăng luôn?")


def test_ba_tin_rieng():
    tin = tach_tin_ban_tin(LOI)
    assert tin[0].startswith("Hẻm rộng tới 10m") and "📋" not in tin[0]
    assert tin[-1] == "Anh xem còn chỗ nào cần chỉnh không, hay mình đăng luôn?"
    ban = [t for t in tin if t.startswith("📋")]
    assert len(ban) == 1 and "- Giá bán: 27 tỷ" in ban[0] and ban[0].rstrip().endswith("hẹn giờ đi xem nhé!")


def test_khong_co_cau_chot_thi_hai_tin():
    truoc, ban, chot = tach_ban_tin(LOI.rsplit("\n\n", 1)[0])
    assert truoc and ban.endswith("hẹn giờ đi xem nhé!") and chot == ""


def test_khong_ban_tin_giu_nguyen():
    assert tach_ban_tin("Dạ chưa có bản tin") == ("Dạ chưa có bản tin", "", "")


def test_phan_chat_cung_nguon():
    assert _phan_chat_quanh_ban_tin(LOI) == ("Hẻm rộng tới 10m cả hai đầu là điểm khách đi xem sẽ để ý ngay, em đưa lên tin cho rõ nghen.\n"
                                             "Anh xem còn chỗ nào cần chỉnh không, hay mình đăng luôn?")
