"""30/10/2026 (SRS-5.1zzzzzzz302). Thử bằng quota CLI (Haiku viết lời): khách "Em rao lại xem" khi chưa có bản nháp → bóc tách không ghi xin_dang
(prompt bóc tách đưa đúng câu đó làm ví dụ "câu nhờ, không phải ô") nên lượt đi nhánh chat, rồi bot hứa "em gửi ngay bên dưới" mà không có bản
tin; lượt sau khách đính chính "mặt tiền có 5 m thôi" thì bot hỏi lại nghĩa. Chủ dự án: "từ các dữ liệu đã có thì bot tự hiểu", "không cần hỏi lại".
Ca đỏ khi gỡ bản sửa ở prompts.py."""
from aioi.prompts import OPERATIONS_SYSTEM, build_fee_followup_system
from aioi.schema import Property
from tests.test_engine import _engine


def test_rao_lai_xem_khi_chua_co_ban_nhap_la_xin_dang():
    assert '"em rao lại xem" khi CHƯA có bản nháp' in OPERATIONS_SYSTEM
    assert "để xin_dang / yeu_cau_viet hoặc bỏ" in OPERATIONS_SYSTEM


def test_nhanh_chat_khong_hua_gui_ban_tin():
    eng = _engine()
    seen: list[str] = []
    goc = eng._provider.chat
    eng._provider.chat = lambda system, messages, **k: seen.append(system) or goc(system, messages, **k)
    eng.handle("chu-302", "Anh cần bán nhà mặt tiền đường Hoàng Hoa Thám, Bình Thạnh")
    loi = [s for s in seen if "Thông tin cần hỏi tiếp theo" in s]
    assert loi and "KHÔNG có bản tin kèm theo" in loi[-1] and "KHÔNG hỏi lại khách để xác nhận nghĩa" in loi[-1]


def test_sau_ban_nhap_dinh_chinh_so_thi_sua_luon():
    s = build_fee_followup_system("Tài", Property(), duyet="khong_dong_y")
    assert "ĐÍNH CHÍNH một số" in s and "KHÔNG hỏi lại nghĩa" in s


def test_dem_tu_tieu_de_so_thap_phan_la_mot_tu():
    from aioi.engine import _tieu_de_thieu
    p = Property(loai_hinh="nha_pho")
    p.fields["gia"] = "12,5 tỷ"
    # tiêu đề thật của Sonnet (thử CLI 30/10): 24 từ theo `wc -w`, bản đếm cũ ra 27
    td = ("📋 Em sẽ rao như vầy nhé anh:\n\n🏠 Anh chị ơi, nhà phố mặt tiền Hoàng Hoa Thám, Gia Định, Bình Thạnh, 34,5m², 3 tầng kiên cố, "
          "12,5 tỷ thương lượng nhẹ\n\nMô tả.")
    assert _tieu_de_thieu(td, p) == []
