"""21/10/2026 (SRS-5.1zzzzzzz120). Lê Quang: "mấy cái em ghi nhận sửa ở chỗ mẫu câu". Các câu ví dụ ghi nhận từng nằm cứng trong prompt
(và một ví dụ "Em ghi rồi chị." ở luật 5/6 + mô tả công cụ) nên model chép đúng mấy câu đó — sổ câu bot 21/10: "Em cảm ơn" 46 lượt, "Em ghi nhận"
42, "Em ghi rồi" 21. Nay một nguồn `cau_mau.ghi_nhan_mau` (CRM sửa được). Đỏ khi prompt còn câu viết cứng, khi câu sửa ở CRM không tới prompt,
hay khi câu mở đầu "Dạ" lọt qua (luật cấm Dạ)."""
import pytest

from aioi import cau_mau, prompts
from aioi.prompts import build_chat_system, build_fee_followup_system
from aioi.schema import Property


@pytest.fixture(autouse=True)
def _sach():
    cau_mau.dang_ky(None)
    yield
    cau_mau.dang_ky(None)


def _he_thong():
    return build_chat_system("Hằng", Property(loai_hinh="nha_pho"), "dien_tich")


def test_mac_dinh_vao_prompt_va_khong_con_cho_giu_chu():
    s = _he_thong()
    assert '"Em ghi rồi ạ."' in s and '"Em cảm ơn anh/chị."' in s and "<<VI_DU_GHI_NHAN>>" not in s
    f = build_fee_followup_system("x", Property(loai_hinh="nha_pho"), web={"len_web": False, "cho_duyet": True})
    assert '"Em nắm rồi anh/chị."' in f and "<<VI_DU_GHI_NHAN>>" not in f


def test_cau_sua_o_crm_toi_prompt_ca_hai_noi_dung():
    cau_mau.dang_ky(lambda: {"ghi_nhan_mau": "Em đã lưu nha {goi}. | Ok {goi}, em cập nhật liền.\nEm xong ý này rồi."})
    s = _he_thong()
    assert '"Em đã lưu nha anh/chị."' in s and '"Ok anh/chị, em cập nhật liền."' in s and '"Em xong ý này rồi."' in s
    assert "Em lưu vào tin rồi nha" not in s


def test_cau_mo_dau_da_bi_bo_va_sua_hong_thi_dung_mac_dinh():
    cau_mau.dang_ky(lambda: {"ghi_nhan_mau": "Dạ em ghi rồi ạ. | Vâng ạ. | Em ghi nhận nha."})
    assert cau_mau.vi_du_ghi_nhan() == '"Em ghi nhận nha."'
    cau_mau.dang_ky(lambda: {"ghi_nhan_mau": "Dạ ạ. | Vâng em."})        # bỏ hết → mặc định
    assert "Em ghi rồi ạ." in cau_mau.vi_du_ghi_nhan()
    cau_mau.dang_ky(lambda: {"ghi_nhan_mau": "Em lưu {ten} rồi."})       # chỗ giữ chữ lạ → mặc định
    assert "Em ghi rồi ạ." in cau_mau.vi_du_ghi_nhan()


def test_prompt_khong_con_cau_ghi_nhan_viet_cung():
    nguon = open(prompts.__file__, encoding="utf-8").read()
    assert '"Em ghi rồi chị. …"' not in nguon and '"Em lưu vào tin rồi nha anh."' not in nguon
    from aioi.llm import claude
    assert '\\"Em ghi rồi chị.\\"' not in open(claude.__file__, encoding="utf-8").read()


def test_luot_dau_khong_con_ep_van_mau_cam_on_dai():
    """Sổ câu bot 21/10: lượt đầu nào cũng "Em cảm ơn anh/chị đã tin tưởng gửi thông tin nhà cho bên em ạ" vì prompt dặn đúng câu đó."""
    s = _he_thong()
    assert "cảm ơn NGẮN một vế" in s
    for dong in s.splitlines():
        if "đã tin tưởng gửi thông tin nhà cho bên em" in dong:
            assert "KHÔNG viết" in dong or "KHÔNG viết" in s.split(dong)[0][-200:]


def test_khong_con_ban_sao_vi_du_ghi_nhan_nao_viet_cung():
    nguon = open(prompts.__file__, encoding="utf-8").read()
    assert '"Em nắm rồi anh."' not in nguon and '"Em cảm ơn chị."' not in nguon.replace(cau_mau.MAC_DINH["ghi_nhan_mau"][0], "")


def test_prompt_gon_khong_lap_cau_vi_du():
    """SRS-5.1zzzzzzz121: model chép câu có trong prompt — một câu ví dụ xuất hiện hai ba chỗ thì lời bot lặp theo. Câu ví dụ trích dẫn trong
    prompt lượt hỏi không được lặp (trừ các câu ghi nhận lấy từ bảng câu mẫu, nằm một chỗ)."""
    import re
    s = _he_thong()
    cau = [c for c in re.findall(r'"([^"\n]{30,220})"', s) if re.search(r"\b(em|anh|chị|mình)\b", c, re.I)]
    lap = sorted({c for c in cau if cau.count(c) > 1})
    assert not lap, lap
    assert "Căn này diện tích sàn sử dụng khoảng bao nhiêu mét vuông" not in s
    assert "KHÔNG chép nguyên câu mẫu" in s
    f = build_fee_followup_system("x", Property(loai_hinh="nha_pho"), web={"len_web": False, "cho_duyet": True})
    assert "đồng ý là em đăng lên web ngay" not in f
