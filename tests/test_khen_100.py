"""22/10/2026 (SRS-5.1zzzzzzz131). Lê Quang: "giờ xóa hết mấy cái em ghi nhận em bla bla đi, và khen nhiều hơn vị trí các thứ cũng 100% khen".
Bot không mở lượt bằng câu ghi nhận nữa — mở bằng lời khen gắn với điều khách vừa nói (kể cả vị trí), rồi hỏi. Vẫn cấm bịa thị trường / bình luận
giá / thêm chi tiết khách chưa nói (quyết định 21/10 chưa bỏ). Đỏ khi luật cũ "GHI NHẬN VỪA NGẮN" còn trong prompt, khi câu mẫu `ghi_nhan_mau` còn,
khi lời bot mở bằng "Em ghi nhận / Em lưu rồi" mà không bị gọi lại. 26/10 (SRS-5.1zzzzzzz207): luật khen / mở lượt trong prompt đã
thay bằng giọng bản anh Luận — các bài kiểm chữ của LUAT_KHEN / LUAT_MO_LUOT bỏ, lưới code "câu ghi nhận" giữ."""
import pathlib

from aioi import cau_mau
from aioi.engine import Engine, _mo_dau_ghi_nhan
from aioi.schema import Property

GOC = pathlib.Path(__file__).resolve().parent.parent


def test_khong_con_cau_mau_ghi_nhan_va_cho_giu_chu():
    assert "ghi_nhan_mau" not in cau_mau.MAC_DINH and not hasattr(cau_mau, "vi_du_ghi_nhan")
    nguon = "".join((GOC / "src/aioi" / f).read_text(encoding="utf-8") for f in ("prompts.py", "cau_mau.py", "engine.py"))
    assert "VI_DU_GHI_NHAN" not in nguon and "LUAT_GHI_NHAN" not in nguon and "GHI NHẬN VỪA NGẮN" not in nguon
    sql = (GOC / "bot/supabase/migrations/20261022e_cau_mau_bo_ghi_nhan_mau.sql").read_text(encoding="utf-8")
    assert "delete from public.cau_mau where khoa = 'ghi_nhan_mau'" in sql


def test_nhan_dien_cau_ghi_nhan_rong_hon():
    for c in ("Em ghi nhận vị trí này rồi anh.", "Em lưu vào tin rồi nha chị.", "Em nắm rồi anh, nhà mấy lầu?", "Em thêm vào tin rồi ạ.", "Em đã ghi rồi."):
        assert _mo_dau_ghi_nhan(c), c
    for c in ("Gần bùng binh Dân Chủ thì đi các quận tiện lắm anh. Nhà mấy lầu?", "Em sửa giá còn 24 tỷ cho chị rồi.", "Cho em hỏi thêm nhà mình mấy lầu?"):
        assert not _mo_dau_ghi_nhan(c), c


class _SpyHangDoi:
    """AI giả: lượt lập thao tác trả kế hoạch rỗng; lời trả lời lấy lần lượt từ hàng đợi (hết thì câu sạch). Ghi lại mọi system."""

    def __init__(self, loi):
        self.loi, self.systems = list(loi), []

    def extract(self, *a, **k):
        return {"operations": []}

    def reply(self, system, messages, **k):
        self.systems.append(system)
        return self.loi.pop(0) if self.loi else "Hẻm 4m xe hơi vào được, khách đi xem tiện anh. Nhà mình mấy lầu vậy anh?"

    chat = reply


def test_ghi_nhan_mot_lan_duoc_lan_hai_goi_lai():
    """SRS-5.1zzzzzzz228 mục 3 (chủ dự án 27/10: "câu nào cũng dc, đừng trùng 3 4 câu em ghi nhận, 1 lần là dc") — thay "bỏ hẳn" của SRS-131."""
    spy = _SpyHangDoi(["Em ghi nhận hẻm 4m rồi anh. Nhà mấy lầu vậy anh?", "Vậy em ghi nhận là 3 lầu nha anh. Sổ hồng riêng chưa anh?"])
    eng = Engine(spy)
    r1 = eng.handle("k1", "nhà anh ở hẻm 4m đường Cao Lỗ quận 8")
    assert r1.reply.startswith("Em ghi nhận") and not any("VIẾT LẠI LƯỢT NÀY" in s for s in spy.systems)
    r2 = eng.handle("k1", "3 lầu em")
    assert "ghi nhận" not in r2.reply
    assert any("VIẾT LẠI LƯỢT NÀY" in s and "câu ghi nhận" in s and "một lần" in s for s in spy.systems)


def test_loi_mo_bang_khen_khong_bi_goi_lai():
    spy = _SpyHangDoi(["Hẻm 4m xe hơi vào được, khách đi xem tiện anh. Nhà mình mấy lầu vậy anh?"])
    eng = Engine(spy)
    eng.handle("k2", "nhà anh ở hẻm 4m đường Cao Lỗ quận 8")
    assert not any("VIẾT LẠI LƯỢT NÀY" in s for s in spy.systems)
