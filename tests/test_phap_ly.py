"""SRS-5.1zzzzzzz176 (soát UX 25/10/2026, điểm A1; chủ dự án: "pháp lý lúc cần thì nó search gg hay nạp sẵn cho nó" → "Nạp sẵn đi nạp vào
luôn, tôi ko biết duyệt"). Trước đó bot không có khối nào cho câu hỏi pháp lý / thủ tục — trả lời bằng kiến thức model, không nhãn nguồn,
không biết câu nào phải chuyển người. Nay: AI chọn khoá trong kho `phap_ly.MAC_DINH` theo nghĩa (code kiểm cụm trích), lời đáp chỉ dùng nội
dung dòng đó kèm "tham khảo"; không có mục hợp → nói thật chưa có; nhạy cảm → báo admin như khách xin gặp người thật.
Đỏ khi: khoá lạ lọt, cụm trích AI bịa vẫn kích, khối nhạy cảm không báo admin, migration lệch kho trong code, DB sửa không tới lời bot."""
import pathlib

import pytest

from aioi import phap_ly
from aioi.prompts import OPERATIONS_SYSTEM, operations_schema
from tests.test_viec_mua import KHACH_MUA, KhoGia, _engine

CHU_NHA = {"operations": [], "user_intent": "sell"}


@pytest.fixture(autouse=True)
def _sach():
    phap_ly.dang_ky(None)
    yield
    phap_ly.dang_ky(None)


def test_migration_nap_dung_kho():
    sql = "".join(f.read_text() for f in sorted((pathlib.Path(__file__).parents[1] / "bot/supabase/migrations").glob("*_kien_thuc_phap_ly*.sql")))
    sql = sql.replace("''", "'")
    for khoa, (tieu_de, tra_loi, nguon, _) in phap_ly.MAC_DINH.items():
        assert f"('{khoa}', '{tieu_de}', '{tra_loi}', '{tra_loi}', '{nguon}'" in sql, khoa
    assert "kiem_duyet" in sql and "'chua'" in sql


def test_prompt_va_schema_co_danh_muc():
    for k in phap_ly.KHOA:
        assert f"  {k}: " in OPERATIONS_SYSTEM
    assert "{DANH_MUC_PHAP_LY}" not in OPERATIONS_SYSTEM
    enum = operations_schema()["properties"]["hoi_phap_ly"]["enum"]
    assert set(enum) == set(phap_ly.KHOA) | {"khac"}


def test_khoi_luot_ba_lop_nguon():
    co = phap_ly.khoi_luot("thue_tncn")
    assert "Thuế thu nhập cá nhân khi bán nhà đất" in co and "2% trên giá chuyển nhượng" in co
    assert "tham khảo" in co and "cập nhật tháng 10/2026" in co and "KHÔNG thêm điều không có ở trên" in co
    khac = phap_ly.khoi_luot("khac")
    assert "chưa có trong tài liệu" in khac and "KHÔNG đoán" in khac
    nhay = phap_ly.khoi_luot("thue_tncn", nhay_cam=True)
    assert "NHẠY CẢM" in nhay and "ĐÃ BÁO" in nhay and "2%" not in nhay
    assert phap_ly.khoi_luot(None) == "" and phap_ly.tra_loi("khoa_la") is None


def test_db_sua_de_cau_mac_dinh_va_loi_doc_khong_lam_hong():
    phap_ly.dang_ky(lambda: {"dat_coc": {"tra_loi": "Cọc 5% nha anh.", "cap_nhat": "2026-11-02"}, "khoa_la": {"tra_loi": "x"},
                             "vi_bang": {"tra_loi": "   "}})
    assert phap_ly.tra_loi("dat_coc")["tra_loi"] == "Cọc 5% nha anh." and "tháng 11/2026" in phap_ly.khoi_luot("dat_coc")
    assert phap_ly.tra_loi("vi_bang")["tra_loi"] == phap_ly.MAC_DINH["vi_bang"][1]

    def hong():
        raise RuntimeError("mạng")
    phap_ly.dang_ky(hong)
    assert phap_ly.tra_loi("dat_coc")["tra_loi"] == phap_ly.MAC_DINH["dat_coc"][1]


def test_chu_nha_hoi_thue_phi_duoc_khoi_tham_khao():
    eng, ai = _engine(KhoGia(), {**CHU_NHA, "hoi_phap_ly": "thue_phi_sang_ten", "phap_ly_trich_dan": "thuế phí sang tên bên nào chịu"})
    r = eng.handle("pl-1", "Cho hỏi thuế phí sang tên bên nào chịu vậy em?")
    assert any("KHÁCH HỎI PHÁP LÝ / THỦ TỤC: Mua bán nhà đất phải nộp những thuế phí gì" in s for s in ai.system)
    assert r.can_nguoi_that is None


def test_khach_mua_hoi_phap_ly_cung_duoc_khoi():
    eng, ai = _engine(KhoGia(), {**KHACH_MUA, "hoi_phap_ly": "nha_the_chap", "phap_ly_trich_dan": "nhà đang thế chấp mua được không"})
    eng.handle("pl-2", "Em tìm nhà phố quận 5 tầm 5 tỷ, mà nhà đang thế chấp mua được không?")
    assert any("Nhà đang thế chấp ngân hàng có mua bán được không" in s for s in ai.system)


def test_cau_nhay_cam_bao_admin_va_khong_tu_van():
    eng, ai = _engine(KhoGia(), {**CHU_NHA, "hoi_phap_ly": "khac", "phap_ly_nhay_cam": True,
                                 "phap_ly_trich_dan": "nhà ba mẹ để lại mà anh em tranh chấp thì bán sao"})
    r = eng.handle("pl-3", "Nhà ba mẹ để lại mà anh em tranh chấp thì bán sao em?")
    assert r.can_nguoi_that == "nhà ba mẹ để lại mà anh em tranh chấp thì bán sao"
    cuoi = ai.system[-1]
    assert "PHÁP LÝ NHẠY CẢM" in cuoi and "KHÁCH XIN GẶP NGƯỜI THẬT" not in cuoi


def test_khoa_la_hoac_trich_dan_bia_thi_bo():
    eng, ai = _engine(KhoGia(), {**CHU_NHA, "hoi_phap_ly": "thue_tncn", "phap_ly_trich_dan": "thuế bán nhà bao nhiêu phần trăm"})
    eng.handle("pl-4", "Nhà em ở quận 5, 60m2, 5 tỷ")                        # AI bịa cụm trích
    assert not any("KHÁCH HỎI PHÁP LÝ" in s for s in ai.system)
    eng, ai = _engine(KhoGia(), {**CHU_NHA, "hoi_phap_ly": "luat_rung", "phap_ly_trich_dan": "nhà em ở quận 5"})
    eng.handle("pl-5", "Nhà em ở quận 5")
    assert not any("KHÁCH HỎI PHÁP LÝ" in s for s in ai.system)
