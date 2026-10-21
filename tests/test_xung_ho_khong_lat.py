"""20/10/2026 (SRS-5.1zzzzzzz91). Bắn thử KB2: khách "Em gửi căn nhà phố…" → bot "mình… em", lượt sau lại "anh/chị". Cổng cũ chỉ đòi cụm
trích có thật trong 6 tin khách gần nhất — một cụm cũ ("Em gửi") đỡ được cả cách xưng khác. Nay cụm phải chứa đúng chữ xưng, và đổi cách
xưng đã chốt thì cụm phải ở tin vừa nhắn. Đỏ khi bỏ một trong hai kiểm."""
from tests.test_duyet_ban_nhap import _eng


def test_cum_trich_phai_chua_chu_xung(monkeypatch):
    eng, _, _, conv = _eng({"operations": [], "xung_ho": "chi", "xung_ho_trich_dan": "Em gửi căn"}, monkeypatch)
    eng.handle("u-duyet", "Em gửi căn nhà phố này")
    assert conv.xung_ho is None


def test_cum_cu_khong_lat_cach_xung_da_chot(monkeypatch):
    eng, _, _, conv = _eng({"operations": [], "xung_ho": "em", "xung_ho_trich_dan": "Em gửi"}, monkeypatch)
    eng.handle("u-duyet", "Em gửi căn nhà phố này")
    assert conv.xung_ho == "em"
    monkeypatch.setattr(eng._provider, "extract", lambda s, m, sc: {"operations": [], "xung_ho": "anh",
                                                                    "xung_ho_trich_dan": "anh"}, raising=False)
    conv.history[-2].content = "Em gửi căn nhà phố này, anh ơi"   # "anh" nằm ở tin CŨ (gọi bot), không phải tin vừa nhắn
    eng.handle("u-duyet", "hướng Đông Nam, nội thất cơ bản")
    assert conv.xung_ho == "em"
    eng.handle("u-duyet", "anh là chủ nhà")   # tin vừa nhắn có chữ xưng mới → đổi được
    assert conv.xung_ho == "anh"


def test_tin_nhac_ban_nhap_chi_khi_da_gui_ban_nhap():
    import aioi.followup as F
    src = open(F.__file__, encoding="utf-8").read()
    assert 'is_draft_ready = bool(getattr(conv, "listing_proposed", False))' in src


def test_tin_nhac_ban_nhap_theo_cau_tester():
    """SRS-5.1zzzzzzz99: tester sửa "Bản tin nháp căn nhà em soạn ở trên anh/chị xem qua thấy ưng ý chưa ạ, có cần điều chỉnh thêm
    thông tin nào không cứ nhắn em nhé ạ!" → "Em gửi anh/chị bản nháp tin đăng, mình có cần chỉnh sửa thêm nhắn em hỗ trợ ạ!"."""
    import threading
    from types import SimpleNamespace
    from aioi.assistants import assign_assistant
    from aioi.engine import Conversation, Turn
    from aioi.followup import FollowUpManager
    conv = Conversation(user_key="bn-1", assistant=assign_assistant("bn-1"))
    conv.prop.loai_hinh = "nha_pho"
    conv.listing_proposed = True
    conv.xung_ho = "chi"
    conv.history.append(Turn("user", "chị bán nhà", 0.0))
    eng = SimpleNamespace(conversation=lambda uk: conv, khoa_luot=lambda uk: threading.RLock(), _convstore=None)
    FollowUpManager()._execute_followup("bn-1", eng, None, "seller", hen=None)
    nhac = conv.history[-1].content
    assert nhac == "Em gửi chị bản nháp tin đăng, mình cần chỉnh sửa thêm nhắn em hỗ trợ ạ!"   # đúng câu tester (SRS-5.1zzzzzzz101)
