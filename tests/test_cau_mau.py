"""21/10/2026 (SRS-5.1zzzzzzz106). Chủ dự án: "trên chỗ mẫu câu đưa thêm 1 bảng nhỏ ở 1 bên là các câu đã sửa thành mẫu từ lúc lấy lại các
yêu cầu của anh Luận đến bây giờ… có gì vào sửa tiếp". Tám câu bot nói nguyên văn đi qua MỘT nguồn `cau_mau` — câu chủ dự án sửa ở CRM
(bảng `cau_mau`) đè câu trong code; câu sửa hỏng thì dùng câu gốc. Đỏ khi một chỗ dùng còn viết tay câu thay vì đọc `cau_mau`, hoặc
khi câu sửa không tới lời bot."""
import pathlib
import re

import pytest

from aioi import cau_mau
from aioi.danh_gia import cau_xin_sao, vua_xin_sao
from aioi.prompts import build_fee_followup_system, khoi_trang_thai_web
from aioi.schema import Property


@pytest.fixture(autouse=True)
def _sach():
    cau_mau.dang_ky(None)
    yield
    cau_mau.dang_ky(None)


def test_mac_dinh_khi_chua_gan_kho():
    assert cau_mau.cau("duyet_tin") == "Em xin phép đăng tin ạ!"
    assert cau_mau.cau("xin_cham_sao", "chị").startswith("Chị chấm giúp em 1–5 sao")
    assert cau_mau.cau("nhac_ban_nhap", "anh") == "Em gửi anh bản nháp tin đăng, mình cần chỉnh sửa thêm nhắn em hỗ trợ ạ!"


def test_cau_sua_o_crm_toi_loi_bot():
    cau_mau.dang_ky(lambda: {"duyet_tin": "Dạ vâng, em đăng liền nha!", "hoi_phi": "{Goi} biết phí bên em chưa ạ?",
                             "xin_cham_sao": "{Goi} cho em xin 1–5 sao nhé, cảm ơn {goi} nhiều ạ."})
    assert '"Dạ vâng, em đăng liền nha!"' in khoi_trang_thai_web({"len_web": True})[0]
    assert "Anh/chị biết phí bên em chưa ạ?" in build_fee_followup_system("x", Property(loai_hinh="nha_pho"), web={"len_web": True})
    moi = cau_xin_sao("chị")
    assert moi == "Chị cho em xin 1–5 sao nhé, cảm ơn chị nhiều ạ." and vua_xin_sao("Em xin phép đăng tin ạ!\n\n" + moi)


def test_cau_sua_hong_thi_dung_cau_goc():
    cau_mau.dang_ky(lambda: {"nhac_ban_nhap": "Em gửi {ten} bản nháp", "giu_cho": "   "})
    assert cau_mau.cau("nhac_ban_nhap", "anh") == cau_mau._dien(cau_mau.MAC_DINH["nhac_ban_nhap"][0], "anh")
    assert cau_mau.cau("giu_cho") == cau_mau.MAC_DINH["giu_cho"][0]


def test_doc_kho_loi_khong_lam_hong_luot():
    def hong():
        raise RuntimeError("mạng")
    cau_mau.dang_ky(hong)
    assert cau_mau.cau("duyet_tin") == "Em xin phép đăng tin ạ!"


def test_khong_con_cho_nao_viet_tay_cau_mau():
    """Câu mặc định chỉ được nằm trong cau_mau.py — chỗ dùng phải gọi cau_mau.cau()."""
    goc = pathlib.Path(cau_mau.__file__).parent
    for f in goc.glob("*.py"):
        if f.name == "cau_mau.py":
            continue
        chu = f.read_text()
        for khoa, (mau, _, _) in cau_mau.MAC_DINH.items():
            dau = re.split(r"[{.!?,]", mau)[0].strip()
            if len(dau) >= 18:
                assert dau not in chu, f"{f.name} còn viết tay câu mẫu {khoa}: {dau!r}"


def test_migration_nap_dung_cau_mac_dinh():
    sql = (pathlib.Path(__file__).parents[1] / "bot/supabase/migrations/20261021b_cau_mau.sql").read_text()
    for khoa, (mau, _, _) in cau_mau.MAC_DINH.items():
        assert f"('{khoa}', '{mau}'" in sql.replace("''", "'"), khoa
