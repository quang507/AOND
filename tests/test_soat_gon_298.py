"""29/10/2026 (SRS-5.1zzzzzzz298, B2 bước 1). Chủ dự án hỏi lớp "≈34 luật regex soát lời, sai thì gọi lại model tối đa 2 lần" xoá hay giữ. Quyết định:
luật giọng / lặp chỉ ghi log (không gọi lại), "Dạ" do code bỏ, luật giữ sự thật / tiền / riêng tư / một câu hỏi vẫn gọi lại nhưng tối đa MỘT lần.
Công tắc AIOI_SOAT_GON (thu / bat / tat). Ca chế độ gọn đỏ khi gỡ bản sửa."""
from tests.test_engine import _engine


def _eng(monkeypatch, gia_tri, lai="Căn này còn đó, anh muốn xem hôm nào? Anh cần mấy phòng?"):
    monkeypatch.setenv("AIOI_SOAT_GON", gia_tri)
    eng = _engine()
    goi: list[str] = []
    eng._provider.reply = lambda system, messages, max_tokens=0: goi.append(system) or lai
    return eng, goi


def test_gon_luat_giong_chi_ghi_log_khong_goi_lai(monkeypatch):
    eng, goi = _eng(monkeypatch, "thu")
    conv = eng.conversation("thu-298")
    loi = "Căn này NHÀ ĐẸP GIÁ TỐT anh nhé."
    assert eng._soat_hinh_thuc(conv, "SYS", loi) == loi and goi == []


def test_gon_da_mo_dau_code_bo_khong_goi_lai(monkeypatch):
    eng, goi = _eng(monkeypatch, "thu")
    assert eng._soat_hinh_thuc(eng.conversation("thu-298b"), "SYS", "Dạ, căn này còn ạ.") == "Căn này còn ạ." and goi == []


def test_gon_luat_giu_goi_lai_toi_da_mot_lan(monkeypatch):
    eng, goi = _eng(monkeypatch, "thu")   # bản gọi lại vẫn hai câu hỏi — chế độ gọn không gọi lần hai
    eng._soat_hinh_thuc(eng.conversation("thu-298c"), "SYS", "Anh muốn xem hôm nào? Anh cần mấy phòng?")
    assert len(goi) == 1


def test_khach_that_khi_thu_van_nhu_cu(monkeypatch):
    eng, goi = _eng(monkeypatch, "thu", lai="Căn này đẹp giá tốt anh nhé.")
    eng._soat_hinh_thuc(eng.conversation("khach-298"), "SYS", "Căn này NHÀ ĐẸP GIÁ TỐT anh nhé.")
    assert len(goi) == 1   # luật giọng vẫn gọi lại như trước
