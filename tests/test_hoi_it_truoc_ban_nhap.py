"""19/10/2026 (SRS-5.1zzzzzzz76; chủ dự án: "nó hỏi nhiều quá chán chết được"). Ca gốc: chat thử Âu Cơ Q11 — khách đã nói đường,
phường, mặt tiền, số nhà, "80m 5 tầng", "sổ riêng", giá 16 tỷ mà bot còn hỏi hoàn công, rồi hỏi đang ở hay cho thuê, rồi diện tích
sàn mới ra bản nháp. Đỏ khi hiện trạng còn chặn bản nháp, hoặc khi "sổ riêng" chưa đủ thay câu hoàn công."""
from aioi.schema import Property


def _au_co(**them):
    f = {"duong": "Âu Cơ", "dia_chi": "110 Âu Cơ, Phường 9, Quận 11", "phuong": "Phường 9", "quan": "Quận 11",
         "lo_gioi_hem": "mặt tiền", "dien_tich_dat": "80m2", "ket_cau": "5 tầng", "phap_ly": "sổ riêng", "gia": "16 tỷ"}
    f.update(them)
    return Property(loai_hinh="nha_pho", fields=f)


def test_so_rieng_thi_khong_hoi_rieng_hoan_cong():
    p = _au_co()
    # 20/10 (SRS-5.1zzzzzzz81): hiện trạng lại hỏi trước bản nháp như bản anh Luận; hoàn công vẫn không hỏi riêng khi đã nói sổ.
    assert p.missing_fields() == ["dien_tich_nha", "tinh_trang_ban_giao"]
    assert not p.summary_ready()


def test_du_dien_tich_san_la_ra_ban_nhap():
    p = _au_co(dien_tich_nha="240m2")
    assert p.summary_ready()                                 # 8/9 ô ≥ 75% như bản anh Luận, hiện trạng không chặn
    assert p.cau_hoi_sau_ra_tin() is None


def test_cau_hoi_dien_tich_san_khong_bi_coi_la_xong_khi_da_biet_so_tang():
    # Bắn thử 19/10 lần 2: gợi ý cũ "hỏi diện tích sàn HOẶC số tầng/lầu" — khách đã nói 5 tầng, model coi ô xong và tự hỏi
    # "giá có thương lượng không".
    from aioi.prompts import build_chat_system
    p = _au_co()
    s = build_chat_system("Hằng", p, p.missing_fields()[0])
    assert "hoặc số tầng" not in s
    assert "m² sàn" in s and "KHÔNG tự hỏi ý khác" in s
