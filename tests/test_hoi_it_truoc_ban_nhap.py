"""19/10/2026 (SRS-5.1zzzzzzz76; chủ dự án: "nó hỏi nhiều quá chán chết được"). Ca gốc: chat thử Âu Cơ Q11 — khách đã nói đường,
phường, mặt tiền, số nhà, "80m 5 tầng", "sổ riêng", giá 16 tỷ mà bot còn hỏi hoàn công, rồi hỏi đang ở hay cho thuê, rồi diện tích
sàn mới ra bản nháp. Đỏ khi hiện trạng còn chặn bản nháp, hoặc khi "sổ riêng" chưa đủ thay câu hoàn công."""
from aioi.schema import Property


def _au_co(**them):
    f = {"duong": "Âu Cơ", "dia_chi": "110 Âu Cơ, Phường 9, Quận 11", "phuong": "Phường 9", "quan": "Quận 11",
         "lo_gioi_hem": "mặt tiền", "dien_tich_dat": "80m2", "ket_cau": "5 tầng", "phap_ly": "sổ riêng", "gia": "16 tỷ"}
    f.update(them)
    return Property(loai_hinh="nha_pho", fields=f)


def test_so_rieng_thi_khong_hoi_rieng_hoan_cong_va_hien_trang_hoi_sau():
    p = _au_co()
    assert p.missing_fields() == ["dien_tich_nha"]          # chỉ còn diện tích sàn, không hoàn công, không đang ở / cho thuê
    assert not p.summary_ready()


def test_du_dien_tich_san_la_ra_ban_nhap_hien_trang_hoi_sau_khi_duyet():
    from aioi.prompts import build_fee_followup_system
    p = _au_co(dien_tich_nha="240m2")
    assert p.summary_ready()
    assert p.cau_hoi_sau_ra_tin() == "tinh_trang_ban_giao"
    assert "đang ở hay đang cho thuê" in build_fee_followup_system("Hằng", p)
