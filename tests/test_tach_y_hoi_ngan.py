"""22/10/2026 (SRS-5.1zzzzzzz136). Lê Quang: mỗi lượt một câu hỏi ngắn, ý khen dài tách thành tin riêng, tin `$$$$$` đi trước, bỏ câu dẫn "Còn một điểm
em cần nắm thêm:", sổ đứng tên hỏi thật ngắn, tên tệp "undefined" không in ra, ảnh mặt tiền chỉ HỎI XÁC NHẬN. Đỏ khi bản sửa nào bị gỡ."""
from aioi import engine as eg
from aioi.delivery import chunk_reply
from aioi.prompts import LUAT_TACH_Y
from aioi.schema import CUM_TOI_DA
import aioi.server as srv


def test_moi_luot_mot_o():
    assert CUM_TOI_DA == 1


def test_cau_khen_dai_tach_khoi_cau_hoi():
    r = "Nhà trong hẻm ba gác đổ cửa thì khách đi xem dễ tìm, anh/chị nhỉ. Nhà mình ngang dài bao nhiêu vậy anh/chị?"
    b = chunk_reply(r)
    assert len(b) == 2 and b[1].endswith("?")


def test_cau_dan_thua_bi_bo():
    t = srv._CAU_DAN_THUA.sub("", "Còn một điểm em cần nắm thêm: sổ đứng tên ai vậy ạ?").lstrip()
    assert t == "sổ đứng tên ai vậy ạ?"
    assert "Còn một điểm em cần nắm thêm" in LUAT_TACH_Y                 # prompt cũng cấm


def test_ten_tep_rac_khong_in_ra():
    assert not eg._ten_tep_that("undefined") and not eg._ten_tep_that(" Null ") and not eg._ten_tep_that(None)
    assert eg._ten_tep_that("so-do-nha-123.jpg")


def test_hoi_so_dung_ten_that_ngan():
    from aioi.prompts import cau_hoi_o
    from aioi.schema import Property
    c = cau_hoi_o("dung_ten_so", Property(loai_hinh="nha_pho"))
    assert "Sổ đứng tên ai" in c and len(c) < 160


def test_anh_mat_tien_chi_hoi_xac_nhan():
    from aioi.prompts import build_media_read_instruction
    s = build_media_read_instruction("Hằng")
    assert "đúng không ạ" in s and "KHÔNG tự ghi ô" in s and "KHÔNG khen vật liệu" in s
