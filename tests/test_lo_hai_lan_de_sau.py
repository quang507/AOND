"""20/10/2026 (SRS-5.1zzzzzzz80; chủ dự án: "khách lờ 2 lần thì để sau"). Bắn thử Cao Lỗ: bot hỏi diện tích sàn 4 lượt liền trong
lúc khách cứ trả lời ý khác, vì chỉ còn mỗi ô đó trước bản nháp nên lượt nào cũng bốc lại nó. Nay ô khách lờ lần thứ hai thì để sau:
không hỏi nữa, không chặn bản nháp, hỏi lại một lần sau khi khách duyệt. Loại, địa chỉ, giá và ô bắt buộc không bao giờ để sau.
Đỏ khi bỏ đếm lờ trong `Engine._o_hoi_ke` hoặc bỏ `hoan` khỏi `summary_ready` / `missing_fields`."""
from aioi.assistants import assign_assistant
from aioi.engine import Conversation, Engine
from aioi.prompts import build_fee_followup_system
from aioi.schema import Property


def _conv(**f):
    c = Conversation(user_key="k", assistant=assign_assistant("k"))
    c.active.prop = Property(loai_hinh="nha_pho", fields=f)
    return c


def test_lo_hai_lan_thi_de_sau_va_ra_ban_nhap():
    c = _conv(duong="Cao Lỗ", dia_chi="Cao Lỗ", phuong="Phường Chánh Hưng", quan="Quận 8", lo_gioi_hem="mặt tiền",
              dien_tich_dat="4,5x11", ket_cau="1 trệt 3 lầu", phap_ly="sổ riêng", gia="8,5 tỷ", tinh_trang_ban_giao="đang ở")
    p = c.prop
    assert p.missing_fields() == ["dien_tich_nha"]
    assert Engine._o_hoi_ke(c, p.missing_fields()) == "dien_tich_nha"     # hỏi lần 1
    assert Engine._o_hoi_ke(c, p.missing_fields()) == "dien_tich_nha"     # khách lờ lần 1: còn mỗi ô này nên hỏi lại
    assert Engine._o_hoi_ke(c, p.missing_fields()) is None                # lờ lần 2: để sau
    assert "dien_tich_nha" in p.hoan and p.missing_fields() == [] and p.summary_ready()
    # SRS-5.1zzzzzzz200: facet "quy mô xây dựng" đã có kết cấu (1 trệt 3 lầu) nên không hỏi thêm diện tích nhà; bỏ kết cấu thì hỏi.
    assert p.cau_hoi_sau_ra_tin() is None
    del p.fields["ket_cau"]
    assert p.cau_hoi_sau_ra_tin() == "dien_tich_nha"


def test_hoi_lai_sau_khi_duyet():
    p = Property(loai_hinh="nha_pho", fields=dict(lo_gioi_hem="mặt tiền", tinh_trang_ban_giao="đang ở"))
    p.hoan.add("dien_tich_nha")
    assert p.cau_hoi_sau_ra_tin() == "dien_tich_nha"
    assert "TỪ LƯỢT SAU LƯỢT DUYỆT" in build_fee_followup_system("Hằng", p)


def test_gia_dia_chi_khong_bao_gio_de_sau():
    c = _conv(duong="Cao Lỗ", dia_chi="Cao Lỗ", phuong="Phường Chánh Hưng")
    for _ in range(4):
        Engine._o_hoi_ke(c, ["gia"])
    assert "gia" not in c.prop.hoan and c.prop.missing_fields()[:1] != []
    assert not c.prop.hoan_duoc("loai_hinh") and not c.prop.hoan_duoc("dia_chi")


def test_o_giua_cum_cung_duoc_dem():
    """Bắn thử 20/10 lần 3: bot hỏi gộp "ngang dài, sàn, mấy tầng" (ô đầu cụm là diện tích đất); khách chỉ trả lời ngang dài rồi
    kết cấu, câu sàn vẫn hiện 3 lần vì bộ đếm chỉ tính ô đầu cụm. Nay ô nào trong cụm bị lờ cũng được đếm."""
    c = _conv(duong="Cao Lỗ", dia_chi="Cao Lỗ", phuong="Phường Chánh Hưng", quan="Quận 8", lo_gioi_hem="mặt tiền")
    p = c.prop
    hoi = []
    for khach_noi in ({}, {"dien_tich_dat": "4,5x11"}, {"ket_cau": "1 trệt 3 lầu"}, {"phap_ly": "sổ riêng"}, {"gia": "8,5 tỷ"}):
        p.fields.update(khach_noi)
        o = Engine._o_hoi_ke(c, p.missing_fields())
        hoi.append(c.cum_vua_hoi)
    assert sum("dien_tich_nha" in cum for cum in hoi) <= 2
    assert "dien_tich_nha" in p.hoan and p.summary_ready()
