"""SRS-5.1zzzzzzz171 (chủ dự án 24/10/2026: "sao nó xưng mình z"). Ca gốc (chat thử Tuấn Hoàng, khách chưa xưng em): bot đáp "em xin lỗi mình nhé.
Mình đang cần gửi bán hay cho thuê căn nhà nào" — gọi khách là "mình" dù khối xưng hô "chưa biết" chỉ bảo gọi "anh/chị". Gốc: luật xưng hô chỉ
nói gọi gì, không cấm "mình" ngôi hai, và `_soat_hinh_thuc` không kiểm. Khách xưng "em" thì bot xưng "mình" (SRS-5.1zzzzzzz86) nên không bị kiểm.
Đỏ khi bỏ `_goi_khach_la_minh` khỏi `_soat_hinh_thuc` hoặc bỏ dòng cấm khỏi `khoi_xung_ho`."""
import pytest

from aioi.config import Settings
from aioi.engine import Engine, _goi_khach_la_minh, khoi_xung_ho
from aioi.llm.mock import MockProvider


@pytest.mark.parametrize("loi,xung_ho", [
    ("Cái này em chưa nắm được thông tin, em xin lỗi mình nhé. Mình đang cần gửi bán hay cho thuê căn nhà nào?", "unknown"),
    ("Cảm ơn anh nhé, mình có thêm thông tin là em sẵn sàng hỗ trợ.", "anh"),
    ("Mình đang cần gửi căn nào vậy chị, chung cư hay nhà phố?", "chi"),
    ("Em hỏi lại chút nha, Mình ở phường nào ạ?", "unknown"),      # viết hoa giữa câu
])
def test_goi_khach_la_minh_bi_bat(loi, xung_ho):
    assert _goi_khach_la_minh(loi, xung_ho)


@pytest.mark.parametrize("loi,xung_ho", [
    ("Khu nhà phố NYAL là khu nhà phố mình đang rao, em nắm được rồi anh.", "anh"),
    ("Nhà mình ở Phường 5 đúng không ạ?", "unknown"),
    ("Căn mình ở đường nào vậy anh?", "anh"),
    ("Đất mình ngang x dài khoảng bao nhiêu mét ạ?", "chi"),
    ("Em chào anh, em là Trang. Anh đang cần gửi bán hay tìm mua ạ?", "anh"),
    ("Anh ơi, tin này em soạn xong rồi, ví dụ trình bày — không có đại từ nào.", "unknown"),
])
def test_minh_hop_le_khong_bi_bat(loi, xung_ho):
    assert not _goi_khach_la_minh(loi, xung_ho)


def test_khoi_xung_ho_cam_minh_moi_cach_xung():
    # SRS-5.1zzzzzzz214: khách xưng "em" bot cũng không xưng "mình" nữa (xưng anh / chị theo tên) → cấm "mình" ở MỌI cách xưng.
    for p in ("unknown", "anh", "chi", "elder", "em", "chau"):
        assert "KHÔNG gọi khách là \"mình\"" in khoi_xung_ho(p)
    assert _goi_khach_la_minh("Mình ở đường nào vậy em?", "em")


class AiMinh(MockProvider):
    """Lần đầu trả lời gọi khách "mình"; lần gọi lại (có mục VIẾT LẠI) thì sửa."""

    def __init__(self):
        super().__init__(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
        self.system: list[str] = []

    def chat(self, system, messages, max_tokens=256):
        self.system.append(system)
        if "VIẾT LẠI LƯỢT NÀY" in system:
            return "Em xin lỗi anh/chị nhé. Anh/chị đang cần gửi bán hay cho thuê căn nào ạ?"
        return "Cái này em chưa nắm được thông tin, em xin lỗi mình nhé. Mình đang cần gửi bán hay cho thuê căn nhà nào?"


def test_luot_chat_goi_khach_la_minh_thi_viet_lai():
    ai = AiMinh()
    r = Engine(ai).handle("khach-minh-1", "Cho hỏi cái đồng hồ nước trước cổng ngày nào cắt")
    assert any("VIẾT LẠI LƯỢT NÀY" in s and "gọi khách là \"mình\"" in s for s in ai.system)
    assert "mình" not in r.reply.lower()
