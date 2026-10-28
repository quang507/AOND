"""26/10/2026 (SRS-5.1zzzzzzz200; chủ dự án: "áp tinh thần facet vào lõi mình… đổi cách quyết 'đủ rao chưa' thành loại hình + vị trí +
giá của anh Luận luôn, đừng có nhắn trùng thế"). Lớp lỗi: cổng "đủ rao" đếm % ô mong đợi + ô bắt buộc theo loại nên một căn đã có
loại / vị trí / giá vẫn bị hỏi 5–8 lượt diện tích, kết cấu, hẻm…, và ô khách lờ bị hỏi y nguyên câu cũ (chat 26/10: "tổng diện tích sàn"
4 lượt liền). Nay: `minimal_missing` = loại hình + vị trí + giá; ô còn lại hỏi SAU khi khách duyệt, mỗi facet một câu. Đỏ khi
bỏ `minimal_missing` khỏi `summary_ready` hoặc bỏ đánh dấu `hoan` lúc ra bản nháp."""
from aioi.prompts import build_chat_system, build_listing_proposal_system
from aioi.schema import Property, facet_of
from tests.test_doc_y_khach import _eng

_MOI = {"dia_chi": "12 Lê Lợi", "duong": "Lê Lợi", "gia": "9 tỷ"}


def test_ba_o_toi_thieu_la_san_chua_du_soan_bai():
    p = Property(loai_hinh="nha_pho", fields=dict(_MOI))
    assert p.minimal_missing() == [] and p.can_publish()
    assert not p.summary_ready() and p.facet_trong() == ["quy_mo", "phap_ly", "hien_trang"]   # SRS-260: còn 3 nhóm cơ bản trống
    assert not Property(loai_hinh="nha_pho", fields={"dia_chi": "12 Lê Lợi", "duong": "Lê Lợi"}).can_publish()
    assert not Property(loai_hinh="nha_pho", fields={"gia": "9 tỷ"}).can_publish()
    assert not Property(loai_hinh=None, fields=dict(_MOI)).can_publish()          # chưa biết loại hình
    # căn hộ: vị trí = tên dự án
    assert Property(loai_hinh="chung_cu", fields={"du_an": "Sunrise City", "gia": "3 tỷ"}).can_publish()
    assert not Property(loai_hinh="chung_cu", fields={"gia": "3 tỷ"}).can_publish()          # chưa có vị trí nào


def test_du_nhom_co_ban_thi_soan_bai():
    # SRS-5.1zzzzzzz260 (chủ dự án 28/10): giá · địa chỉ hoặc khu vực · quy mô · pháp lý · hiện trạng là đủ; vị thế (hẻm) không chặn.
    du = {**_MOI, "dien_tich_dat": "60m2", "phap_ly": "sổ hồng riêng", "tinh_trang_ban_giao": "đang ở"}
    p = Property(loai_hinh="nha_pho", fields=du)
    assert p.facet_trong() == [] and p.summary_ready()
    assert Property(loai_hinh="nha_pho", fields={**du, "dien_tich_dat": "", "ket_cau": "3 tầng"}).summary_ready()   # quy mô: một ô là đủ
    for bo in ("dien_tich_dat", "phap_ly", "tinh_trang_ban_giao", "gia"):
        assert not Property(loai_hinh="nha_pho", fields={k: v for k, v in du.items() if k != bo}).summary_ready(), bo
    # khu vực (quận / phường) thay được địa chỉ cụ thể
    kv = {k: v for k, v in du.items() if k not in ("dia_chi", "duong")}
    assert Property(loai_hinh="nha_pho", fields={**kv, "quan": "Quận 5"}).summary_ready()
    assert not Property(loai_hinh="nha_pho", fields=kv).summary_ready()              # không có vị trí nào


def test_cho_thue_khong_doi_phap_ly_dat_khong_doi_hien_trang():
    thue = Property(loai_hinh="nha_pho", is_rental=True, fields={**_MOI, "dien_tich_dat": "60m2", "tinh_trang_ban_giao": "để trống"})
    assert thue.summary_ready()
    dat = Property(loai_hinh="dat", fields={**_MOI, "dien_tich": "100m2", "phap_ly_so_do": "sổ đỏ riêng"})
    assert dat.facet_trong() == [] and dat.summary_ready()
    ch = Property(loai_hinh="chung_cu", fields={"du_an": "Sunrise City", "gia": "3 tỷ", "dien_tich": "70m2"})
    assert ch.facet_trong() == ["phap_ly", "hien_trang"]


def test_hoi_moi_facet_trong_mot_cau_truoc_khi_soan():
    p = Property(loai_hinh="nha_pho", fields=dict(_MOI))
    assert p.missing_fields()[:3] == ["dien_tich_dat", "phap_ly_hoan_cong", "tinh_trang_ban_giao"]   # SRS-260: mỗi nhóm trống một ô
    p.update({"ket_cau": "3 tầng"})
    assert p.missing_fields()[:2] == ["phap_ly_hoan_cong", "tinh_trang_ban_giao"]                    # nhóm đã có dữ liệu thì thôi hỏi


def test_gia_va_vi_tri_luon_hoi_truoc_o_phu():
    p = Property(loai_hinh="nha_pho", fields={"dien_tich_dat": "60m2"})
    assert p.missing_fields()[:2] == ["dia_chi", "gia"]


def test_chua_du_facet_thi_chua_ra_ban_nhap_va_khach_bao_dang_thi_ra():
    eng, spy = _eng({"operations": []})
    conv = eng.conversation("ct0")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update({**_MOI, "lo_gioi_hem": "hẻm 4m"})
    eng.handle("ct0", "nhà em ở Lê Lợi nhé")
    assert not conv.listing_proposed                       # quy mô · pháp lý · hiện trạng còn trống → hỏi tiếp, không soạn vội


def test_ra_ban_nhap_thi_o_con_thieu_de_sau_khi_duyet():
    from tests.test_xin_dang import _tra_ban_tin
    eng, spy = _eng({"operations": []})
    _tra_ban_tin(spy)
    conv = eng.conversation("ct1")
    conv.prop.loai_hinh = "nha_pho"
    conv.prop.fields.update({**_MOI, "dien_tich_dat": "60m2", "phap_ly": "sổ hồng riêng", "tinh_trang_ban_giao": "đang ở"})
    eng.handle("ct1", "nhà em ở Lê Lợi nhé")
    assert conv.listing_proposed
    assert "phuong" in conv.prop.hoan                       # ô thiếu không bị hỏi trước bản nháp
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
