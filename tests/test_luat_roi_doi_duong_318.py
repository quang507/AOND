"""01/11/2026 (SRS-5.1zzzzzzz318, audit Đợt 2 — luật rơi khi đổi đường, AU-02 / AU-06 / AU-11 / AU-12). Mọi bài chạy công tắc production (conftest:
PHIEU_LUOT=bat, SOAT_GON=bat). Lớp lỗi: luật / nhãn nằm ở prompt cũ (`build_chat_system`) hoặc ở nhánh soát chỉ chạy khi công tắc tắt, nên khi bật
đường mới thì luật rơi mà không bài nào đỏ."""
import glob
import os

from aioi.config import Settings
from aioi.engine import Engine, FetchedMedia
from aioi.llm.mock import MockProvider
from aioi.prompts import BUSINESS_CONTEXT, CHINH_SACH_PHI, NHAN_VIEC_LUOT
from tests.test_form_ban_gon_303 import BAN
from tests.test_form_mua_gon_293 import AiGhiForm
from tests.test_viec_mua import KhoGia

GOC = os.path.join(os.path.dirname(__file__), "..")


def _luot_ban(loi, ke_hoach):
    ai = AiGhiForm(ke_hoach)
    eng = Engine(ai, conversation_store=KhoGia())
    eng.handle("chu-318", loi)
    return ai.system


def test_khach_hoi_phi_luot_thu_thap_co_du_chinh_sach():
    """AU-02 + Q2 (chủ dự án 01/11): phiếu lượt không có BUSINESS_CONTEXT → khối hỏi phí phải tự mang 4 ý. Cách nói mới: "chị giảm chút phí cho em
    được hông" (AI đọc là hỏi phí)."""
    he = _luot_ban("Nhà mặt tiền Hoàng Hoa Thám, chị giảm chút phí cho em được hông", dict(BAN, hoi_ve="phi"))
    viet = [s for s in he if "KHÁCH HỎI VỀ PHÍ" in s]
    assert viet and f"{NHAN_VIEC_LUOT}:" in viet[0] and "GHI CHÚ NGHIỆP VỤ" not in viet[0]   # đường phiếu lượt, không phải prompt cũ
    assert CHINH_SACH_PHI in viet[0] and "ĐỦ cả 4 ý" in viet[0]
    assert "BỐI CẢNH ở trên" not in viet[0]                                      # khối không còn trỏ phần không có trong phiếu lượt


def test_chinh_sach_phi_mot_nguon():
    assert CHINH_SACH_PHI in BUSINESS_CONTEXT
    nguon = open(os.path.join(GOC, "src", "aioi", "prompts.py"), encoding="utf-8").read()
    assert nguon.count("KHÔNG độc quyền") == 1 and nguon.count("không có mức chia hoa hồng") == 1   # không chép hai nơi


def test_tin_dang_hien_bi_soat_ngay_lan_dau_duoi_soat_gon():
    """AU-06: lưới SRS-292 chỉ nằm ở danh sách soát bản gọi lại — chế độ gọn không chạy lần soát thứ hai nên lưới không bao giờ kích."""
    class Ghi(MockProvider):
        goi: list = []

        def reply(self, system, messages, max_tokens=256):
            self.goi.append(system)
            return "Dạ em cập nhật vào tin rồi nha."

    eng = Engine(Ghi(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")))
    conv = eng.conversation("chu-318b")
    conv.y_luot["_tin_dang_hien_ngoai_chat"] = True
    eng._soat_hinh_thuc(conv, "SYS", "Em cập nhật rồi nha.\n\n📋 Bản tin cập nhật:\nNhà phố Trần Bình Trọng")
    assert Ghi.goi and "ĐANG HIỂN THỊ" in Ghi.goi[-1]


def test_luot_anh_so_qua_phieu_luot_khong_khen_so(monkeypatch):
    """AU-11: lượt ảnh sổ luôn gọi build_chat_system (không theo công tắc), trong đó "khen điểm mạnh trước" đá nhau với "KHÔNG khen sổ"."""
    import aioi.engine as eng_mod

    def _cam(*a, **k):
        raise AssertionError("lượt ảnh sổ không được dùng build_chat_system")

    monkeypatch.setattr(eng_mod, "build_chat_system", _cam)

    class Ghi(MockProvider):
        he: list = []

        def reply(self, system, messages, max_tokens=256):
            self.he.append(system)
            return "Anh xem giúp em mấy dòng trên đúng chưa ạ?"

    m = Ghi(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y"))
    eng = Engine(m, fetcher=lambda url: FetchedMedia(b"\xff\xd8\xff", "image/jpeg", url, filename="so_hong_quan_7.jpg"))
    r = eng.handle_media("chu-318c", "https://example.com/so_hong_quan_7.jpg")
    assert "Thông tin đọc từ giấy tờ" in r.reply
    he = m.he[-1]
    assert f"{NHAN_VIEC_LUOT}: khách vừa gửi ảnh sổ" in he and "KHÔNG khen sổ / pháp lý (kể cả theo khối GIỌNG)" in he
    assert "Khen ngợi điểm mạnh" not in he and "Hãy khen ngợi điểm mạnh" not in he


def test_khong_con_khoi_tro_nhan_cu():
    """AU-12: khối trỏ nhãn chỉ có ở prompt cũ ("Thông tin cần hỏi tiếp theo", "BỐI CẢNH ở trên")."""
    lot = []
    for t in glob.glob(os.path.join(GOC, "src", "aioi", "**", "*.py"), recursive=True):
        for i, d in enumerate(open(t, encoding="utf-8"), 1):
            if ("Thông tin cần hỏi tiếp theo" in d or "BỐI CẢNH ở trên" in d) and not d.lstrip().startswith("#"):
                lot.append(f"{os.path.basename(t)}:{i}")
    assert not lot, lot
