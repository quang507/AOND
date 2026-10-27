"""SRS-5.1zzzzzzz222 — ban-thu-ban 27/10 sau SRS-219 (kịch bản anh Luận): 3/4 lượt sửa tin model viết "… nha anh. Bản tin cập nhật:" nối
cuối câu dẫn, THIẾU dấu 📋 → hệ thống coi là chat thường. Code gắn lại dấu (cùng lớp `cat_truoc_mo_dau`, SRS-80). Đỏ khi tắt bản sửa."""
from aioi.engine import Engine, Turn, _ban_tin_da_trinh, _gan_dau_ban_tin, _phan_chat_quanh_ban_tin

THAN = ("🏡 Anh chị cô bác ơi, mặt tiền 5m đường Hoàng Hoa Thám Bình Thạnh, 34,5m² đất, 3 tầng kiên cố, giá 12,5 tỷ!\n\n"
        "Căn mặt tiền Hoàng Hoa Thám, đất 34,5m², ngang 5m dài 8m.\n\n- Ngang 5m, dài 8m, đất 34,5m²\n- 12,5 tỷ (thương lượng nhẹ)\n\n"
        "📞 Nhắn Zalo cho em liền nha!\n\nAnh xem bản này đã vừa ý chưa?")
LOI = "Đúng rồi anh, mặt tiền 5m là điểm ăn tiền, em đưa lên ngay nha anh. Bản tin cập nhật:\n\n" + THAN


def test_gan_lai_dau_tach_cau_dan():
    ra = _gan_dau_ban_tin(LOI)
    assert "📋 Bản tin cập nhật:" in ra and ra.startswith("Đúng rồi anh") and "anh.\n\n📋 Bản tin cập nhật:\n\n🏡" in ra
    assert _phan_chat_quanh_ban_tin(ra).startswith("Đúng rồi anh, mặt tiền 5m là điểm ăn tiền")


def test_khong_dung_loi_khong_phai_ban_tin():   # cách nói mới: chat thường nhắc chữ "bản tin cập nhật:" mà không có bố cục tin rao
    chat = "Anh xem giúp em bản tin cập nhật: em đã bớt chữ kiên cố rồi ạ."
    assert _gan_dau_ban_tin(chat) == chat
    co_dau = "Vâng anh.\n\n📋 Bản tin cập nhật:\n\n" + THAN
    assert _gan_dau_ban_tin(co_dau) == co_dau


def test_soat_hinh_thuc_gan_dau_va_ban_duyet_lay_ban_moi():
    class _Spy:
        systems: list = []

        def reply(self, system, messages, **k):
            self.systems.append(system)
            return LOI

        chat = reply

    eng = Engine(_Spy())
    c = eng.conversation("k-222")
    c.prop.loai_hinh = "nha_pho"
    c.prop.fields.update({"duong": "Hoàng Hoa Thám", "gia": "12,5 tỷ", "dien_tich_dat": "34,5m2", "mat_tien": "5m", "kich_thuoc": "5x8"})
    c.history.append(Turn("assistant", "📋 Em sẽ rao như vầy nhé anh:\n\nNhà cũ 12,5 tỷ\n\n- 12,5 tỷ\n\nNhắn Zalo nha!", 0.0))
    c.history.append(Turn("user", "mặt tiền 5m xứng đáng để nói", 0.0))
    ra = eng._soat_hinh_thuc(c, "SYS", LOI)
    assert "📋 Bản tin cập nhật:" in ra
    c.history.append(Turn("assistant", ra, 0.0))
    assert "mặt tiền 5m" in _ban_tin_da_trinh(c)[0]
