"""22/10/2026 (SRS-5.1zzzzzzz132). Bắn thử ban-thu-92 (Gemini lite) để lộ hai lỗi luật đã cấm mà model vẫn phạm: (1) "Mức giá 9,2 tỷ… quá hợp lý
rồi" — bình luận giá; (2) khách gõ "5x10", AI nhét cả vào ô trang thiết bị và cổng bằng chứng nhận. Hai lưới cùng lớp chống bịa / ghi đúng ô,
đặt đúng hàm chủ (`_soat_hinh_thuc`, `_mot_cum_mot_o`). Đỏ khi nhận xét giá không bị gọi lại, khi nhắc lại con số khách đưa bị bắt oan, hay khi
giá trị dạng kích thước còn vào ô ngoài kích thước / diện tích."""
from aioi.engine import Engine, _binh_luan_gia, _la_kich_thuoc
from tests.test_doc_y_khach import _eng
from tests.test_khen_100 import _SpyHangDoi


def test_nhan_dien_binh_luan_gia():
    assert _binh_luan_gia("Mức giá 9,2 tỷ cho căn nhà 6 tầng trung tâm này quá hợp lý rồi anh/chị nhỉ!")
    assert _binh_luan_gia("Khu này đắt khách lắm anh.") and _binh_luan_gia("Giá 16 tỷ vậy là vừa tầm.") and _binh_luan_gia("Nhà này dễ bán lắm.")
    for ok in ("Em đã để sẵn giá 9,2 tỷ trong bản tin ở trên rồi anh.", "Giờ xem nhà vậy hợp lý rồi ạ, em sắp lịch nhé.",
               "Giá 9,2 tỷ em ghi vào tin rồi, nhà hướng Đông tốt lắm anh."):
        assert _binh_luan_gia(ok) is None, ok


def test_binh_luan_gia_bi_goi_lai_mot_lan():
    spy = _SpyHangDoi(["Mức giá 9,2 tỷ cho căn nhà này quá hợp lý rồi anh nhỉ! Nhà mình mấy lầu vậy anh?"])
    eng = Engine(spy)
    r = eng.handle("bg1", "bán nhà quận 10 giá 9.2")
    assert _binh_luan_gia(r.reply) is None
    assert any("VIẾT LẠI LƯỢT NÀY" in s and "nhận xét giá" in s for s in spy.systems)


def test_la_kich_thuoc():
    for v in ("5x10", "5 x 10", "4,5x12m", "5×10m²", "50m2", "50 m²", "80 mét vuông"):
        assert _la_kich_thuoc(v), v
    for v in ("4m", "5m", "hẻm 4m", "6 tầng", "2", "5x10 có gác", "50m2 đất 30m2 sàn"):
        assert not _la_kich_thuoc(v), v


def _ghi(fields, text):
    eng, _ = _eng({"operations": [{"op": "update", "fields": fields, "bang_chung": {k: text for k in fields}}], "user_intent": "sell"})
    eng.handle("kt1", text)
    conv = eng.conversation("kt1")
    return conv.prop.fields, conv.bo_luot


def test_gia_tri_dang_kich_thuoc_chi_vao_o_kich_thuoc():
    f, bo = _ghi({"kich_thuoc": "5x10", "dien_tich_trang_thiet_bi": "5x10"}, "5x10")
    assert f.get("kich_thuoc") == "5x10" and "dien_tich_trang_thiet_bi" not in f
    assert [b[0] for b in bo] == ["dien_tich_trang_thiet_bi"] and "dạng kích thước" in bo[0][3]
    f, bo = _ghi({"dien_tich_dat": "50m2", "lo_gioi_hem": "4m"}, "đất 50m2, hẻm 4m")
    assert f.get("dien_tich_dat") == "50m2" and f.get("lo_gioi_hem") == "4m" and not bo
    f, bo = _ghi({"ket_cau": "4x12m"}, "4x12m")
    assert "ket_cau" not in f and bo
