"""30/10/2026 (SRS-5.1zzzzzzz301). Chủ dự án chọn "cách 3": chỉnh prompt cho Haiku khen giống Sonnet, thử bằng quota CLI. Hai lỗi thấy khi thử: Haiku
mở "Ồ" bốn lượt, tự "Em chào anh ạ" giữa cuộc chat; lượt đầu tự giới thiệu dù khách đã nói nhu cầu. Ca đỏ khi gỡ bản sửa."""
from aioi.engine import Turn, khoi_mo_dau_vua_dung
from aioi.prompts import GIONG_VUI
from tests.test_engine import _engine


class _C:
    def __init__(self, loi):
        self.history = [Turn("assistant", x, 0) for x in loi]


def test_khoi_mo_dau_ke_cac_tieng_vua_dung_va_cam_chao_lai():
    k = khoi_mo_dau_vua_dung(_C(["Ồ, mặt tiền ngon", "Wow, sổ hồng đủ", "📋 Em sẽ rao như vầy nhé:\nNhà phố"]))
    assert "không chào lại" in k and '"Ồ"' in k and '"Wow"' in k and "📋" not in k
    assert khoi_mo_dau_vua_dung(_C([])) == ""


def test_luot_dau_da_noi_nhu_cau_khong_kem_khoi_chao():
    eng = _engine()
    seen: list[str] = []
    goc = eng._provider.chat
    eng._provider.chat = lambda system, messages, **k: seen.append(system) or goc(system, messages, **k)
    eng.handle("chu-301", "Anh cần bán nhà mặt tiền đường Hoàng Hoa Thám, Bình Thạnh giá 12 tỷ")
    assert not any("LƯỢT ĐẦU TIÊN CỦA CUỘC CHAT" in s for s in seen)
    seen.clear()
    eng.handle("chu-301b", "hello em")
    assert any("LƯỢT ĐẦU TIÊN CỦA CUỘC CHAT" in s for s in seen)


def test_giong_dan_khen_cu_the():
    assert "CỤ THỂ" in GIONG_VUI and "không khen chung chung" in GIONG_VUI
