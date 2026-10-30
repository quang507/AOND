"""30/10/2026 (SRS-5.1zzzzzzz306). Lưới "em gửi ảnh" (ngược vai phía bán) chỉ soi phần CHAT, không soi thân bản tin 📋: câu mời chốt viết cho
người mua "nhắn Zalo cho em, em gửi thêm hình" là đúng vai (AD_FORMAT cho phép). Bộ chấm 30/10: 7/9 lần Sonnet bị gọi lại là bắt nhầm câu này."""
from aioi.engine import _bot_hua_gui_anh

TIN = ("Wow, căn này đẹp quá anh! Em rao như vầy nhé:\n\n📋 Bản tin rao\n\nBán nhà mặt tiền Cao Lỗ, Quận 8 — 8,5 tỷ\n\n- Ngang 4,5m · dài 11m\n"
       "- 8,5 tỷ\n\n📲 Bấm nhắn Zalo cho em ngay đi, em gửi thêm hình và hẹn giờ coi nhà liền. Chần chừ là mất căn!\n\n"
       "Anh xem bản tin này ưng chưa ạ?")


def test_cau_moi_chot_trong_ban_tin_khong_bi_bat():
    assert not _bot_hua_gui_anh(TIN)
    assert not _bot_hua_gui_anh(TIN.replace("em gửi thêm hình", "em gửi thêm ảnh thực tế"))


def test_phan_chat_quanh_ban_tin_van_bi_bat():
    assert _bot_hua_gui_anh(TIN.replace("Anh xem bản tin này ưng chưa ạ?", "Anh có muốn em gửi thêm ảnh để tin nổi bật hơn không?"))
    assert _bot_hua_gui_anh(TIN.replace("Wow, căn này đẹp quá anh!", "Em gửi thêm vài tấm hình cho anh xem nha."))
