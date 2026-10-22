"""22/10/2026 (SRS-5.1zzzzzzz131). Lê Quang: "giờ xóa hết mấy cái em ghi nhận em bla bla đi, và khen nhiều hơn vị trí các thứ cũng 100% khen".
Bot không mở lượt bằng câu ghi nhận nữa — mở bằng lời khen gắn với điều khách vừa nói (kể cả vị trí), rồi hỏi. Vẫn cấm bịa thị trường / bình luận
giá / thêm chi tiết khách chưa nói (quyết định 21/10 chưa bỏ). Đỏ khi luật cũ "GHI NHẬN VỪA NGẮN" còn trong prompt, khi câu mẫu `ghi_nhan_mau` còn,
khi lời bot mở bằng "Em ghi nhận / Em lưu rồi" mà không bị gọi lại, hay khi luật khen mất các cấm cũ."""
import pathlib

from aioi import cau_mau, prompts
from aioi.engine import Engine, _mo_dau_ghi_nhan
from aioi.prompts import CONVERSATION_POLICY, LUAT_KHEN, LUAT_MO_LUOT, build_chat_system, build_fee_followup_system
from aioi.schema import Property

GOC = pathlib.Path(__file__).resolve().parent.parent


def test_khong_con_cau_mau_ghi_nhan_va_cho_giu_chu():
    assert "ghi_nhan_mau" not in cau_mau.MAC_DINH and not hasattr(cau_mau, "vi_du_ghi_nhan")
    nguon = "".join((GOC / "src/aioi" / f).read_text(encoding="utf-8") for f in ("prompts.py", "cau_mau.py", "engine.py"))
    assert "VI_DU_GHI_NHAN" not in nguon and "LUAT_GHI_NHAN" not in nguon and "GHI NHẬN VỪA NGẮN" not in nguon
    sql = (GOC / "bot/supabase/migrations/20261022e_cau_mau_bo_ghi_nhan_mau.sql").read_text(encoding="utf-8")
    assert "delete from public.cau_mau where khoa = 'ghi_nhan_mau'" in sql


def test_luat_mo_luot_bang_khen_o_ca_luot_thuong_lan_sau_ban_nhap():
    assert LUAT_MO_LUOT in CONVERSATION_POLICY and "KHÔNG CÂU GHI NHẬN" in LUAT_MO_LUOT and "Em ghi nhận" in LUAT_MO_LUOT
    s = build_chat_system("Hằng", Property(loai_hinh="nha_pho", fields={"gia": "9,2 tỷ"}), "dia_chi")
    assert LUAT_MO_LUOT in s and "KHÔNG nịnh bợ" not in s
    f = build_fee_followup_system("Hằng", Property(loai_hinh="nha_pho"), web={"len_web": False, "cho_duyet": True})
    assert LUAT_MO_LUOT in f


def test_luat_khen_100_phan_tram_ke_ca_vi_tri_nhung_van_cam_bia():
    k = LUAT_KHEN
    assert "100% lượt" in k and "VỊ TRÍ khách nêu" in k and "bùng binh Dân Chủ" in k
    assert "thanh khoản tốt" in k and "KHÔNG bình luận giá" in k and "CHỈ khen đúng điều khách VỪA NÓI" in k and "hẻm xe hơi" in k
    assert "tối đa HAI ý khen" in k and "CÁCH khách cung cấp thông tin" in k
    assert build_chat_system("Hằng", Property(loai_hinh="nha_pho"), "gia").count(LUAT_KHEN) == 1


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


def test_mot_luot_mo_bang_ghi_nhan_la_goi_lai_ngay():
    spy = _SpyHangDoi(["Em ghi nhận hẻm 4m rồi anh. Nhà mình mấy lầu vậy anh?"])
    eng = Engine(spy)
    r = eng.handle("k1", "nhà anh ở hẻm 4m đường Cao Lỗ quận 8")
    assert not _mo_dau_ghi_nhan(r.reply)
    assert any("VIẾT LẠI LƯỢT NÀY" in s and "câu ghi nhận" in s and "lời khen" in s for s in spy.systems)


def test_loi_mo_bang_khen_khong_bi_goi_lai():
    spy = _SpyHangDoi(["Hẻm 4m xe hơi vào được, khách đi xem tiện anh. Nhà mình mấy lầu vậy anh?"])
    eng = Engine(spy)
    eng.handle("k2", "nhà anh ở hẻm 4m đường Cao Lỗ quận 8")
    assert not any("VIẾT LẠI LƯỢT NÀY" in s for s in spy.systems)
