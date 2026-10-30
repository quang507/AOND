"""Bước 2B (SRS-5.1zzzzzzz314): `viec_luot` chọn MỘT việc theo trạng thái; khối hỏi khác đang bật được liệt kê là chỗ lệch. Không gọi model."""
from aioi.viec_luot import TrangThaiLuot as T
from aioi.viec_luot import viec_luot


def _v(**k):
    v = viec_luot(T(**k))
    return (v.ten, v.o), set(v.bo)


def test_rao_lai_theo_trang_thai():
    # cùng một ý khách ("em rao lại xem" / "đăng đi") — ba trạng thái, ba việc
    assert _v(pha="thu_thap", muon_dang=True)[0] == ("trinh_nhap", None)
    # "đăng đi" khi còn thiếu ô tối thiểu → hỏi đúng ô thiếu, không trình bản nháp giả (đo bộ chấm `dang_khi_thieu` lượt 2)
    assert _v(pha="thu_thap", muon_dang=True, thieu_toi_thieu=True, next_field="gia", khoi=("hoi_o",)) == (("hoi_o", "gia"), set())
    assert _v(pha="sau_nhap", muon_dang=True, da_co_nhap=True)[0] == ("gui_lai_ban_tin", None)
    assert _v(pha="sau_nhap", muon_dang=True, da_co_nhap=True, trang_thai="ẩn")[0] == ("doi_trang_thai", "rao")


def test_hai_khoi_hoi_chi_ra_mot_viec_va_bao_lech():
    viec, bo = _v(pha="thu_thap", next_field="phap_ly", khoi=("hoi_o", "mat_tien", "hoi_du_an"))
    assert viec == ("hoi_du_an", None) and bo == {"hoi_o", "mat_tien"}
    viec, bo = _v(pha="thu_thap", next_field="gia", khoi=("hoi_o",))
    assert viec == ("hoi_o", "gia") and not bo


def test_cau_khach_hoi_thang_viec_cua_pha():
    viec, bo = _v(pha="thu_thap", next_field="gia", khoi=("hoi_o", "hoi_ve"), hoi_ve="phi")
    assert viec == ("tra_loi", "phi") and bo == {"hoi_o"}
    assert _v(pha="sau_nhap", khoi=("can_nguoi", "hoi_sau_dang"))[0] == ("can_nguoi", None)
    assert _v(pha="ngoai_vung", khoi=("ngoai_vung",))[0] == ("ngoai_vung", None)


def test_khoi_dia_danh_ke_phuong_la_cau_hoi_phuong():
    viec, bo = _v(pha="thu_thap", next_field="phuong", khoi=("hoi_o", "dia_danh"))
    assert viec == ("hoi_o", "phuong") and not bo
    assert _v(pha="thu_thap", next_field="gia", khoi=("hoi_o", "dia_danh"))[0] == ("hoi_dia_danh", None)


def test_sau_nhap():
    assert _v(pha="sau_nhap", yeu_cau_viet=True, duyet="dong_y")[0] == ("sua_nhap", None)
    assert _v(pha="sau_nhap", duyet="dong_y", khoi=("hoi_sau_dang",))[0] == ("dang_tin", None)
    assert _v(pha="sau_nhap", khoi=("tin_dang_hien_ngoai_chat",))[0] == ("cap_nhat_tin_dang_hien", None)
    assert _v(pha="sau_nhap")[0] == ("chot", None)


def test_engine_ghi_viec_va_khoi_moi_luot():
    from aioi.config import Settings
    from aioi.engine import Engine
    from aioi.llm.mock import MockProvider
    eng = Engine(MockProvider(Settings(provider="mock", anthropic_api_key=None, chat_model="x", vision_model="y")))
    eng.handle("thu-viec-1", "Bán nhà phố đường Cao Lỗ quận 8")
    y = eng.conversation("thu-viec-1").y_luot
    assert y["_viec"]["ten"] and isinstance(y["_khoi"], list)
