"""20/10/2026 (SRS-5.1zzzzzzz79; chủ dự án: "hỏi theo cụm", "nên ra bản nháp khi nào học theo anh Luận"). Bot hỏi mỗi lượt một ô nên
nhà phố mất 7–8 lượt; môi giới hỏi gộp ("nhà ngang dài bao nhiêu, xây mấy tầng anh?"). Bản nháp ra theo công thức bản anh Luận: đủ ô
nhận diện + ≥ 75% mọi ô mong đợi (giữ ô bắt buộc tên đường / phường). Đỏ khi bỏ cụm hoặc ngưỡng."""
from aioi.prompts import build_chat_system
from aioi.schema import Property, SUMMARY_READY_COMPLETENESS


def _nha(**f):
    return Property(loai_hinh="nha_pho", fields=f)


def test_o_thieu_dau_tien_quyet_cum_va_hoi_gop():
    p = _nha(duong="Âu Cơ", dia_chi="110 Âu Cơ", phuong="Phường 9", quan="Quận 11", lo_gioi_hem="mặt tiền", gia="16 tỷ")
    thieu = p.missing_fields()
    assert p.cum_hoi(thieu[0], thieu) == ["dien_tich_dat"]    # SRS-5.1zzzzzzz136 (22/10: "bỏ hỏi gộp"): mỗi lượt đúng một ô
    s = build_chat_system("Hằng", p, thieu[0], cum=p.cum_hoi(thieu[0], thieu))
    assert "MỘT CỤM, hỏi gộp" not in s and "diện tích đất" in s


def test_o_ngoai_cum_hoi_rieng():
    p = _nha()
    assert p.cum_hoi("loai_hinh", ["loai_hinh", "dia_chi"]) == ["loai_hinh"]


def test_ban_nhap_theo_cong_thuc_anh_luan():
    assert SUMMARY_READY_COMPLETENESS == 0.75
    du = dict(duong="Âu Cơ", dia_chi="110 Âu Cơ", phuong="Phường 9", dien_tich_dat="80m2", dien_tich_nha="240m2", gia="16 tỷ",
              ket_cau="5 tầng")
    # SRS-5.1zzzzzzz200: công thức 75% thay bằng loại hình + vị trí + giá (theo anh Luận, facet bước 2)
    assert _nha(**du).summary_ready()
    assert not _nha(**{k: v for k, v in du.items() if k != "gia"}).summary_ready()
