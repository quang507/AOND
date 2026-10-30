"""30/10/2026 (SRS-5.1zzzzzzz299). Claude hết tiền (29/10 15:57 UTC) mà Gemini dự phòng chỉ đỡ một lượt: model mặc định gemini-3.8-flash quá giờ
với khoá miễn phí (đo 30/10, cả 3 khoá chat). Danh sách model dự phòng một nguồn ở cai-vps.sh (MODEL_GEMINI → GEMINI_MODEL), mặc định code khớp."""
import pathlib
import re

from aioi.config import Settings


def _mac_dinh():
    return Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y").gemini_chat_models


def test_mac_dinh_khong_con_model_qua_gio():
    assert "gemini-3.8-flash" not in _mac_dinh()
    assert _mac_dinh()[0] == "gemini-3.5-flash"


def test_cai_vps_mot_nguon_khop_mac_dinh_code():
    sh = (pathlib.Path(__file__).parents[1] / "bot/bridge-zca/cai-vps.sh").read_text()
    m = re.search(r'^\s*MODEL_GEMINI="([^"]+)"', sh, re.M)
    assert m and tuple(m.group(1).split(",")) == _mac_dinh()
    assert "GEMINI_MODEL=%s" in sh and "^GEMINI_MODEL=" in sh   # ghi đè dòng cũ trong .env lõi
