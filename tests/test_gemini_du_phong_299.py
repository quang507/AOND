"""30/10/2026 (SRS-5.1zzzzzzz299). Claude hết tiền (29/10 15:57 UTC) mà Gemini dự phòng chỉ đỡ một lượt: model mặc định gemini-3.8-flash quá giờ
với khoá miễn phí (đo 30/10, cả 3 khoá chat). Danh sách model dự phòng một nguồn ở bot/cau-hinh-loi.env (GEMINI_MODEL; SRS-401, trước ở cai-vps.sh), mặc định code khớp."""

from aioi.config import Settings


def _mac_dinh():
    return Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y").gemini_chat_models


def test_mac_dinh_khong_con_model_qua_gio():
    assert "gemini-3.8-flash" not in _mac_dinh()
    assert _mac_dinh()[0] == "gemini-3.5-flash"


def test_cau_hinh_mot_nguon_khop_mac_dinh_code():
    from tests.cau_hinh_vps import doc_tep
    assert tuple(doc_tep()["GEMINI_MODEL"].split(",")) == _mac_dinh()
