"""SRS-5.1zzzzzzz233 / 234 (chat chị Ngân 28/10/2026 "chú bán nhà ở 125 Bình Long…" → tin nhắc 5 phút "Anh ơi, em hỏi lại chút nha…"; chủ dự án:
"thử Sonnet cho tài khoản thử đi"). (1) Khách tự xưng chú / cô / bác: nhóm "chu_co_bac" nay giữ chữ khách xưng, câu mẫu (tin nhắc, dòng mở bản
nháp) gọi đúng chữ đó và bot xưng "cháu". (2) ID thử chat bằng model thử (`AIOI_CHAT_MODEL_THU`), khách thật giữ model mặc định.
Đỏ khi: bỏ chữ kèm nhóm, goi_toi bỏ nhánh "elder:", handle không đặt model của lượt."""
from aioi.engine import Conversation, _detect_customer_pronoun
from aioi.followup import cau_nhac
from aioi.llm.base import MODEL_CHAT_LUOT, model_chat_thu
from aioi.prompts import mo_dau_nhap
from aioi.xung_ho import goi_toi
from tests.test_phap_ly import CHU_NHA
from tests.test_viec_mua import KhoGia, _engine


def test_khach_xung_chu_giu_chu_va_cau_mau_goi_dung():
    eng, ai = _engine(KhoGia(), {**CHU_NHA, "xung_ho": "chu_co_bac", "xung_ho_trich_dan": "chú bán nhà"})
    eng.handle("xh-chu", "chú bán nhà ở 125 Bình Long, Bình Hưng Hòa A, Bình Tân, 70m2, giá 3 tỷ")
    conv = eng.conversation("xh-chu")
    assert conv.xung_ho == "chu_co_bac:chú"
    p = _detect_customer_pronoun(conv)
    assert p == "elder:chú" and goi_toi(p, "M•ai") == ("chú", "cháu")
    assert mo_dau_nhap(p) == "📋 Cháu sẽ rao như vầy nhé chú:"
    assert any("Gọi khách là 'chú', bản thân lễ phép xưng 'cháu'" in s for s in ai.system)


def test_tin_nhac_goi_chu_khong_goi_anh():
    from aioi.assistants import assign_assistant
    from aioi.engine import Turn
    conv = Conversation(user_key="xh-2", assistant=assign_assistant("xh-2"))
    conv.xung_ho, conv.xung_ho_goi_y = "chu_co_bac:chú", "anh"      # giới tính Zalo "anh" không đè lời khách tự xưng
    conv.history += [Turn("user", "chú bán nhà", 0.0), Turn("assistant", "Nhà mình ở phường nào vậy chú?", 0.0)]
    assert cau_nhac(conv, conv.active, _detect_customer_pronoun(conv), conv.assistant.name).startswith("Chú ơi, cháu hỏi lại")


def test_khach_goi_bot_la_con_khong_co_chu_rieng():
    eng, _ = _engine(KhoGia(), {**CHU_NHA, "xung_ho": "chu_co_bac", "xung_ho_trich_dan": "sao hỏi nhiều vậy con"})
    eng.handle("xh-con", "sao hỏi nhiều vậy con")
    assert eng.conversation("xh-con").xung_ho == "chu_co_bac"                 # không đoán chú hay cô
    assert goi_toi("elder") == ("anh/chị", "em")


def test_id_thu_chat_bang_model_thu_khach_that_khong(monkeypatch):
    monkeypatch.setenv("AIOI_CHAT_MODEL_THU", "claude-sonnet-4-6")
    thay = []
    eng, ai = _engine(KhoGia(), CHU_NHA)
    goc = ai.chat
    ai.chat = lambda *a, **k: (thay.append(MODEL_CHAT_LUOT.get()), goc(*a, **k))[1]   # type: ignore[method-assign]
    eng.handle("thu-sonnet-1", "Chị bán nhà 125 Bình Long giá 3 tỷ")
    eng.handle("khach-that-1", "Chị bán nhà 125 Bình Long giá 3 tỷ")
    assert thay and "claude-sonnet-4-6" in thay and None in thay
    assert MODEL_CHAT_LUOT.get() is None                                       # trả lại sau lượt
    monkeypatch.setenv("AIOI_CHAT_MODEL_THU", "tat")
    assert model_chat_thu() is None


def test_model_chat_khach_that_mot_nguon_o_cai_vps(monkeypatch):
    """SRS-5.1zzzzzzz235 (chủ dự án 28/10: "để sonnet 5.5 đi, khi nào cần thì thôi đổi lại"): model chat của lõi ghi vào .env bởi cai-vps.sh
    từ MỘT dòng MODEL_CHAT; ID thử mặc định chat cùng model khách thật."""
    import pathlib
    s = (pathlib.Path(__file__).parents[1] / "bot/bridge-zca/cai-vps.sh").read_text(encoding="utf-8")
    # SRS-5.1zzzzzzz308: chủ dự án 30/10 đổi sang Haiku ("dùng haiku hết luôn cũng dc") — vẫn MỘT dòng, tên model Claude.
    import re
    assert re.search(r'^\s*MODEL_CHAT="claude-[a-z0-9-]+"$', s, re.M) and "AIOI_CHAT_MODEL=%s" in s
    monkeypatch.delenv("AIOI_CHAT_MODEL_THU", raising=False)
    assert model_chat_thu() is None
