"""20/10/2026 (SRS-5.1zzzzzzz85). Người test 20/10: tin đất "giá 8,8 tỷ chỉ áp dụng trong tháng 10" lên web với cờ "thương lượng".
Lõi gửi `boc_thong_so` chuỗi "nhãn ô: giá trị" — nhãn ô thuong_luong là "khả năng thương lượng, bớt lộc", tự nó chứa chữ khoá. Soát
mọi nhãn trên DB: 10/74 nhãn tự bật cột (mặt tiền cho nhà trong hẻm, căn góc cho căn thường, thang máy cho nhà không có…). Nhãn là chữ
của mình, không phải lời khách → các ô đó gửi giá trị trơn. Đỏ khi nhãn tự kích quay lại chuỗi gửi đi."""
from aioi.prompts import FIELD_LABELS
from aioi.supabase_store import NHAN_TRUNG_TINH
from tests.test_xac_minh_web import StoreGia

# Nhãn đo được trên DB 20/10 là tự bật cột (boc_thong_so("<nhãn>: x") khác {}) — trừ hinh_anh / phi_gui_xe / yeu_cau_xe_hoi (không gửi).
NHAN_TU_KICH = ("lo_gioi_hem", "mat_tien", "thuong_luong", "can_goc", "thang_may", "phap_ly_hoan_cong", "phap_ly_so_do")


def test_nhan_tu_kich_khong_vao_chuoi_gui_boc_thong_so():
    st = StoreGia()
    f = {"lo_gioi_hem": "hẻm 3m", "mat_tien": "4m", "thuong_luong": "chỉ áp dụng trong tháng 10", "can_goc": "căn thường",
         "thang_may": "không có", "phap_ly_hoan_cong": "chưa hoàn công", "phap_ly_so_do": "sổ chung", "phi_gui_xe": "xe máy 100k",
         "kich_thuoc": "4x15"}
    st._thong_so(f, "nha_pho")
    chu = [d for m, e, d in st.goi if e == "rpc/boc_thong_so"][0]["p_text"]
    for k in NHAN_TU_KICH:
        assert FIELD_LABELS[k].split(" (")[0] not in chu, k
    assert "ngang: 4m" in chu and "hẻm 3m" in chu and "xe máy" not in chu
    assert "kích thước: 4x15" in chu                                  # nhãn không tự kích vẫn đi kèm để đọc số đo


def test_moi_nhan_tu_kich_deu_co_cach_gui_trung_tinh():
    assert set(NHAN_TU_KICH) <= set(NHAN_TRUNG_TINH)
