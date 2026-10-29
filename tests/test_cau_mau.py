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
    assert cau_mau.cau("nhac_ban_nhap", "anh") == "Em gửi anh bản nháp tin đăng, anh cần chỉnh sửa thêm nhắn em hỗ trợ ạ!"


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
    assert cau_mau.cau("giu_cho") == cau_mau.cau("giu_cho", "anh/chị", toi="em") and "{" not in cau_mau.cau("giu_cho")   # SRS-267: câu gốc có chỗ giữ


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
    sql = "".join(f.read_text() for f in sorted((pathlib.Path(__file__).parents[1] / "bot/supabase/migrations").glob("*_cau_mau*.sql")))
    for khoa, (mau, _, _) in cau_mau.MAC_DINH.items():
        assert f"('{khoa}', '{mau}'" in sql.replace("''", "'"), khoa


def test_cau_cu_truoc_anh_luan_sua_o_crm_toi_loi_bot():
    """SRS-5.1zzzzzzz110 (chủ dự án: "đưa luôn mấy câu trước đó nữa đi"): lời chào, ẩn rổ hàng, tin nhắc… cũng đi qua cau_mau."""
    from tests.test_doc_y_khach import _eng
    cau_mau.dang_ky(lambda: {"chao_lan_dau": "Em chào {goi}, em là {ten} ạ. {Goi} cần bán hay mua ạ?",
                             "xac_nhan_an": "{Goi} chắc muốn em {viec} không ạ?",
                             "nhac_hoi_lai": "{Goi} ơi, {toi} hỏi lại nha: {hoi}"})
    eng, spy = _eng({"operations": []})
    eng.handle("cm1", "hello")          # lời chào đầu do AI đọc (SRS-5.1zzzzzzz125): câu mẫu sửa ở CRM nằm trong khối mẫu của prompt
    assert "Em chào anh/chị, em là " in spy.systems[0] and "Anh/chị cần bán hay mua ạ?" in spy.systems[0]
    from aioi.engine import Engine
    assert Engine._receipt_reply(eng, eng.conversation("cm1"), [("confirm_destructive", "NGƯNG RAO căn A12")]) == \
        "Anh/chị chắc muốn em NGƯNG RAO căn A12 không ạ?"
    from aioi.followup import cau_nhac
    from types import SimpleNamespace
    from aioi.engine import Turn
    conv = SimpleNamespace(history=[Turn("assistant", "Nhà mình mấy tầng vậy chị?", 0.0)])
    assert cau_nhac(conv, SimpleNamespace(media=[]), "chi") == "Chị ơi, em hỏi lại nha: Nhà mình mấy tầng vậy chị?"


def test_dong_mo_ban_nhap_sua_o_crm_van_cat_cau_dan():
    from aioi.prompts import cat_truoc_mo_dau, mo_dau_nhap
    cau_mau.dang_ky(lambda: {"mo_dau_nhap": "📋 Tin của {goi} em soạn như sau:"})
    assert mo_dau_nhap("chi") == "📋 Tin của chị em soạn như sau:"
    loi = "Em ghi đủ rồi ạ. Tin của anh chị em soạn như sau:\n\nBán nhà MT Cao Lỗ Q.8 60m² 10 tỷ"
    assert cat_truoc_mo_dau(loi, "chi") == "📋 Tin của chị em soạn như sau:\n\nBán nhà MT Cao Lỗ Q.8 60m² 10 tỷ"
    # Khuôn cũ vẫn nhận (model còn nhớ câu cũ)
    assert cat_truoc_mo_dau("Ok ạ. Em sẽ rao như vầy nhé anh:\n\nBán nhà", "anh").startswith("📋 Tin của anh em soạn như sau:\n\nBán")


def test_dong_mo_ban_nhap_sai_khung_thi_dung_cau_goc():
    from aioi.prompts import MO_DAU_NHAP, mo_dau_nhap
    cau_mau.dang_ky(lambda: {"mo_dau_nhap": "Tin của {goi} em soạn như sau", "mo_dau_nhap_em": "📋 Mình soạn\nnhư sau:"})
    assert mo_dau_nhap("unknown") == MO_DAU_NHAP[1] and mo_dau_nhap("em") == MO_DAU_NHAP[0]


def test_lenh_xem_json_khong_mang_dau_ban_nhap():
    """SRS-5.1zzzzzzz110: khối JSON của lệnh "thong tin" mở bằng 📋 → sau bản nháp, khách duyệt là đăng khối JSON lên web."""
    from aioi.engine import Turn, _ban_tin_da_trinh
    from tests.test_doc_y_khach import _eng
    eng, _ = _eng({"operations": []})
    conv = eng.conversation("js1")
    conv.history.append(Turn("assistant", "📋 Em sẽ rao như vầy nhé anh chị:\n\nBán nhà MT Cao Lỗ Q.8 60m² 10 tỷ\n\nNhà đẹp.", 0.0))
    r = eng.handle("js1", "thong tin")
    assert "📋" not in r.reply and _ban_tin_da_trinh(conv)[0] == "Bán nhà MT Cao Lỗ Q.8 60m² 10 tỷ"


def test_cau_bao_phi_tester_sua_toi_loi_bot():
    """SRS-5.1zzzzzzz111 (chủ dự án: "mấy câu mẫu đã sửa cũng cho lên trên câu mẫu lun"): câu báo phí tester sửa ở Câu chuẩn là câu
    mẫu `bao_phi` — model được dặn nói nguyên văn, code điền mức phí theo vai + bán / thuê."""
    from aioi.prompts import khoi_bao_phi
    from aioi.revenue import SellerRole
    thue = build_fee_followup_system("x", Property(loai_hinh="nha_pho", is_rental=True), user_type=SellerRole.CHU_NHA,
                                     web={"len_web": True})
    assert ("Em xin phép báo phí bên em: phí môi giới bên em là 0.75 tháng tiền thuê. Chỉ thu khi giao dịch thành công. "
            "Anh/chị cần biết thêm thông tin, nhắn em hỗ trợ ạ.") in thue
    assert "phí môi giới bên em là 1% giá chốt." in khoi_bao_phi(SellerRole.CHU_NHA, False)
    assert "phí môi giới bên em là 0.5% giá chốt." in khoi_bao_phi(SellerRole.MOI_GIOI, False)
    assert khoi_bao_phi(SellerRole.CHU_DAU_TU, False) == ""   # chủ đầu tư: phí thoả thuận riêng, không báo con số


def test_cau_bao_phi_sua_o_crm_phai_giu_cho_muc_phi():
    from aioi.prompts import khoi_bao_phi
    from aioi.revenue import SellerRole
    cau_mau.dang_ky(lambda: {"bao_phi": "Phí bên em là {phi}, chỉ thu khi thành công ạ."})
    assert '"Phí bên em là 1% giá chốt, chỉ thu khi thành công ạ."' in khoi_bao_phi(SellerRole.CHU_NHA, False)
    cau_mau.dang_ky(lambda: {"bao_phi": "Phí bên em rẻ lắm ạ."})   # sửa mất {phi} → bot nói câu không có con số: dùng câu gốc
    assert "phí môi giới bên em là 1% giá chốt." in khoi_bao_phi(SellerRole.CHU_NHA, False)


def test_khach_hoi_phi_cung_doc_cau_bao_phi():
    """Nhánh khách chủ động hỏi phí (engine) dùng cùng câu mẫu, không viết câu phí riêng."""
    goc = (pathlib.Path(cau_mau.__file__).parent / "engine.py").read_text()
    khoi = goc[goc.index('if conv.hoi_ve_luot == "phi":'):goc.index('elif conv.hoi_ve_luot == "uy_tin":')]
    assert "khoi_bao_phi(conv.vai_phi, conv.prop.is_rental)" in khoi   # SRS-5.1zzzzzzz240: vai tính phí


def test_cau_code_ghep_goi_theo_cach_khach_xung():
    """SRS-5.1zzzzzzz250 (mục 11): câu code ghép (bảng giá, ảnh, tách nhóm tệp) và câu mẫu luồng dự án gọi đúng cách khách xưng — trước bản này
    luôn "anh/chị" + "em" kể cả khi khách xưng "em" / "chú". Bỏ `_xung_ho_cau` / `_goi_toi` ở các chỗ ghép thì đỏ."""
    from aioi.engine import _xung_ho_cau
    goc = "\n\nAnh/chị xem giúp em tách vậy có đúng không ạ? Lần sau anh/chị gửi trước — xem kỹ nha"
    assert _xung_ho_cau(goc, "anh/chị", "em") == goc
    assert _xung_ho_cau(goc, "em", "anh") == "\n\nEm xem giúp anh tách vậy có đúng không ạ? Lần sau em gửi trước — xem kỹ nha"
    assert _xung_ho_cau(goc, "chú", "cháu").startswith("\n\nChú xem giúp cháu")
    assert cau_mau.cau("hoi_ro_can", "chị", toi="em") == "Chị nói rõ thêm giúp em căn nào ạ?"
    assert "bên cháu đang có" in cau_mau.cau("du_an_hoi_trung_ten", ten="X", du_an="Y", toi="cháu")
