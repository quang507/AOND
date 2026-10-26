"""26/10/2026 (SRS-5.1zzzzzzz200; chủ dự án: "áp tinh thần facet vào lõi mình… đổi cách quyết 'đủ rao chưa' thành loại hình + vị trí +
giá của anh Luận luôn, đừng có nhắn trùng thế"). Lớp lỗi: cổng "đủ rao" đếm % ô mong đợi + ô bắt buộc theo loại nên một căn đã có
loại / vị trí / giá vẫn bị hỏi 5–8 lượt diện tích, kết cấu, hẻm…, và ô khách lờ bị hỏi y nguyên câu cũ (chat 26/10: "tổng diện tích sàn"
4 lượt liền). Nay: `minimal_missing` = loại hình + vị trí + giá; ô còn lại hỏi SAU khi khách duyệt, mỗi facet một câu. Đỏ khi
bỏ `minimal_missing` khỏi `summary_ready` hoặc bỏ đánh dấu `hoan` lúc ra bản nháp."""
from aioi.prompts import build_chat_system, build_listing_proposal_system
from aioi.schema import Property
from tests.test_doc_y_khach import _eng

_MOI = {"dia_chi": "12 Lê Lợi", "duong": "Lê Lợi", "gia": "9 tỷ"}


def test_ba_o_toi_thieu_la_du_rao():
    p = Property(loai_hinh="nha_pho", fields=dict(_MOI))
    assert p.minimal_missing() == [] and p.summary_ready()
    assert not Property(loai_hinh="nha_pho", fields={"dia_chi": "12 Lê Lợi", "duong": "Lê Lợi"}).summary_ready()
    assert not Property(loai_hinh="nha_pho", fields={"gia": "9 tỷ"}).summary_ready()
    assert not Property(loai_hinh=None, fields=dict(_MOI)).summary_ready()          # chưa biết loại hình
    # căn hộ: vị trí = tên dự án
    assert Property(loai_hinh="chung_cu", fields={"du_an": "Sunrise City", "gia": "3 tỷ"}).summary_ready()
    assert not Property(loai_hinh="chung_cu", fields={"gia": "3 tỷ"}).summary_ready()          # chưa có vị trí nào


def test_gia_va_vi_tri_luon_hoi_truoc_o_phu():
    p = Property(loai_hinh="nha_pho", fields={"dien_tich_dat": "60m2"})
    assert p.missing_fields()[:2] == ["dia_chi", "gia"]


def test_ra_ban_nhap_thi_o_con_thieu_de_sau_khi_duyet():
    eng, spy = _eng({"operations": []})
    conv = eng.conversation("ct1")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update(_MOI)
    eng.handle("ct1", "nhà em ở Lê Lợi nhé")
    assert conv.listing_proposed
    assert {"phuong", "dien_tich_dat"} <= conv.prop.hoan          # ô thiếu không bị hỏi trước bản nháp
    assert "dia_chi" not in conv.prop.hoan and "gia" not in conv.prop.hoan   # ô tối thiểu không bao giờ để sau


def test_ban_nhap_noi_thang_du_de_rao_va_cam_do_chu():
    p = Property(loai_hinh="nha_pho", fields=dict(_MOI))
    s = build_listing_proposal_system("Linh", p)
    assert "đủ để rao" in s and "KHÔNG độn chữ" in s and "đã khá đầy đủ" not in s


def test_o_vua_hoi_ma_khach_chua_tra_loi_thi_doi_cach_hoi():
    p = Property(loai_hinh="nha_pho", fields={"dia_chi": "12 Lê Lợi", "duong": "Lê Lợi"})
    s = build_chat_system("Linh", p, "gia", hoi_lai=True)
    assert "ĐỔI cách hỏi" in s
    assert "ĐỔI cách hỏi" not in build_chat_system("Linh", p, "gia")
