"""30/10/2026 (SRS-5.1zzzzzzz309, kế hoạch bước 2). Lượt thu thập của người bán viết lời bằng phiếu lượt ngắn (giọng + 4 luật cố định + dữ liệu
căn + MỘT việc) thay văn xuôi `build_chat_system`, sau công tắc AIOI_PHIEU_LUOT. Ca engine đỏ khi gỡ móc ở engine."""
from aioi.engine import Engine
from aioi.schema import Property
from aioi.prompts import GIONG_VUI, build_chat_system, build_phieu_luot
from aioi.llm.base import RANH_GIOI_CACHE
from tests.test_form_ban_gon_303 import BAN
from tests.test_form_mua_gon_293 import AiGhiForm
from tests.test_viec_mua import KhoGia


def test_phieu_luot_ngan_co_giong_va_mot_viec():
    prop = Property(loai_hinh="nha_pho", fields={"duong": "Hoàng Hoa Thám"})
    p = build_phieu_luot("Mai·Anh", prop, "gia")
    assert GIONG_VUI in p and RANH_GIOI_CACHE in p and "Hoàng Hoa Thám" in p and "VIỆC LƯỢT NÀY: hỏi đúng MỘT ý" in p
    assert len(p) < 0.5 * len(build_chat_system("Mai·Anh", prop, "gia"))
    assert "đổi cách hỏi" in build_phieu_luot("Mai·Anh", prop, "gia", hoi_lai=True)
    assert "không hỏi thêm" in build_phieu_luot("Mai·Anh", prop, None)


def _hai_luot(user_key, monkeypatch, gia_tri):
    monkeypatch.setenv("AIOI_PHIEU_LUOT", gia_tri)
    ai = AiGhiForm(BAN)
    eng = Engine(ai, conversation_store=KhoGia())
    eng.handle(user_key, "Anh cần bán nhà mặt tiền đường Hoàng Hoa Thám")
    eng.handle(user_key, "Phường Gia Định")
    return ai.system


def test_id_thu_dung_phieu_luot(monkeypatch):
    he = _hai_luot("thu-309", monkeypatch, "thu")
    assert he and all("VIỆC LƯỢT NÀY" in s and "GHI CHÚ NGHIỆP VỤ" not in s for s in he)


def test_khach_that_khi_thu_va_cong_tac_tat_giu_prompt_cu(monkeypatch):
    for key, gt in (("chu-309", "thu"), ("thu-309b", "tat")):
        he = _hai_luot(key, monkeypatch, gt)
        assert he and all("VIỆC LƯỢT NÀY" not in s for s in he)
