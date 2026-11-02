"""SRS-5.1zzzzzzz355 — `srd_phi` lượt 9 ("Anh là chính chủ, vậy phí bao nhiêu em?") dán lại gần nguyên lượt 8 (đủ bốn ý chính sách lần nữa).
Lớp lỗi: khối ưu tiên phí lượt nào cũng dặn "nói cho ĐỦ các ý chính sách", không biết lượt trước đã nói dù code có cờ `_phi_da_bao`; lưới lặp
`lap` ở nhóm `mem` (SRS-298, chỉ ghi log) nên không chặn. Sửa: chính sách đã nói thì khối lượt sau chỉ dặn đáp đúng điều vừa hỏi."""
from tests.test_doc_y_khach import _eng

DU_Y = "nói lướt cho ĐỦ các ý còn lại của CHÍNH SÁCH"


def test_hoi_phi_lan_hai_khong_doc_lai_chinh_sach():
    for lan_hai in ("Anh là chính chủ, vậy phí bao nhiêu em?", "thế em lấy anh mấy phần trăm"):   # cách nói mới
        eng, spy = _eng({"operations": [], "hoi_ve": "phi"})
        eng.handle("thu-355", "Phí môi giới bên em thu sao?")
        dau = spy.systems[-1]
        assert DU_Y in dau and "EM ĐÃ NÓI" not in dau                 # lần đầu: đủ chính sách (SRS-318)
        eng.handle("thu-355", lan_hai)
        sau = spy.systems[-1]
        assert "EM ĐÃ NÓI" in sau and DU_Y not in sau, lan_hai         # lần hai: chỉ đáp điều vừa hỏi
        assert "KHÁCH HỎI VỀ PHÍ / CHÍNH SÁCH GỬI BÁN" not in sau, lan_hai
