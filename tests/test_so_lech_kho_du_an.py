"""21/10/2026 (SRS-5.1zzzzzzz105). Bắn thử 205, KB5 (nhà trong Ny'ah Phú Định): khách nói dtsd 245 m², mẫu Fusion trong kho 195 m² →
bot đòi số lô "để đối chiếu trước khi đăng"; khách "rao tin này giúp mình", "ok", "ok" — ba lượt không đăng. Trái quyết định chủ dự
án 20/10 (mã căn có thì tốt, không có vẫn nhận) và luật ô tin chỉ ghi điều khách nói. Khối hướng dẫn công cụ dự án (đường agent, chỉ
dùng khi dự án có rổ căn) không nói gì về số lệch kho nên model tự chặn. Đỏ khi khối đó thiếu luật "lệch kho thì hỏi một lần, rồi
theo lời khách"."""
from aioi.engine import _AGENT_TOOL_GUIDE


def test_so_lech_kho_hoi_mot_lan_roi_theo_loi_khach():
    assert "KHÁC thông số chung" in _AGENT_TOOL_GUIDE and "MỘT lần" in _AGENT_TOOL_GUIDE
    assert "KHÔNG đòi số lô / mã căn mới chịu đăng" in _AGENT_TOOL_GUIDE
