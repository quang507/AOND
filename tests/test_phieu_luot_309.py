"""30/10/2026 (SRS-5.1zzzzzzz309, kế hoạch bước 2). Lượt thu thập của người bán viết lời bằng phiếu lượt ngắn (giọng + 4 luật cố định + dữ liệu
căn + MỘT việc). Từ Đợt 8 (SRS-5.1zzzzzzz319) phiếu lượt là đường duy nhất — công tắc AIOI_PHIEU_LUOT và `build_chat_system` đã gỡ."""
from aioi.engine import Engine
from aioi.schema import Property
from aioi.prompts import GIONG_VUI, build_phieu_luot
from aioi.llm.base import RANH_GIOI_CACHE
from tests.test_form_ban_gon_303 import BAN
from tests.test_form_mua_gon_293 import AiGhiForm
from tests.test_viec_mua import KhoGia


def test_phieu_luot_ngan_co_giong_va_mot_viec():
    prop = Property(loai_hinh="nha_pho", fields={"duong": "Hoàng Hoa Thám"})
    p = build_phieu_luot("Mai·Anh", prop, "gia")
    assert GIONG_VUI in p and RANH_GIOI_CACHE in p and "Hoàng Hoa Thám" in p and "VIỆC LƯỢT NÀY: hỏi đúng MỘT ý" in p
    assert "đổi cách hỏi" in build_phieu_luot("Mai·Anh", prop, "gia", hoi_lai=True)
    assert "không hỏi thêm" in build_phieu_luot("Mai·Anh", prop, None)


def test_khach_that_dung_phieu_luot():
    ai = AiGhiForm(BAN)
    eng = Engine(ai, conversation_store=KhoGia())
    eng.handle("chu-309", "Anh cần bán nhà mặt tiền đường Hoàng Hoa Thám")
    eng.handle("chu-309", "Phường Gia Định")
    assert ai.system and all("VIỆC LƯỢT NÀY" in s and "GHI CHÚ NGHIỆP VỤ" not in s for s in ai.system)
