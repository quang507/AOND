"""SRS-5.1zzzzzzz232 (bắn thử ban-thu-ai 28/10/2026 trên model thật; chủ dự án: "175 fix đi, 162 fix đi", ảnh: "nói thật, không gửi lại", "có thể
xin thêm ảnh"). Ca gốc: khối việc khách mua (hẹn xem, xin ảnh, chê căn, thôi báo) được nhận / bỏ CẢ khối theo một `trich_dan` chung — AI chép lại
giờ hẹn lượt trước vào đó nên lượt chê căn / xin thôi báo / xin ảnh mất sạch (log lõi "Mua: AI có đọc việc … bị bỏ — trích_dẫn_khớp=False").
Nay kiểm TỪNG việc theo cụm của chính nó. Đỏ khi: quay lại kiểm chung cả khối, gửi lại ảnh đã gửi hết, lượt "ok" dài không bị gọi lại."""
from aioi import anh_can
from aioi.engine import _dap_ok_qua_dai, _loc_viec_mua
from tests.test_viec_mua import KHACH_MUA, _engine
from tests.test_xin_anh_can import KhoAnh

GAN = ["Anh muốn đi xem căn này thứ 7 tuần này lúc 9h sáng được không em?", "Số anh 0900000002 nhé", "ok"]


def test_trich_chung_cu_khong_lam_mat_viec_khac():
    cuoi = "Mà căn đó anh thấy diện tích nhỏ quá, không hợp với nhà anh"
    mua = {"ma_can": ["SEED0215"], "hen_xem": "thứ 7 tuần này lúc 9h sáng", "khong_hop": True, "khong_hop_trich": "nhỏ quá, không hợp",
           "trich_dan": "thứ 7 tuần này lúc 9h sáng"}
    ra = _loc_viec_mua(mua, cuoi, ["ok em", "ok", cuoi])
    assert ra.get("khong_hop") is True and "hen_xem" not in ra and ra["ma_can"] == ["SEED0215"]


def test_ngung_bao_va_xin_anh_theo_cum_rieng():
    cuoi = "Thôi em đừng báo căn mới cho anh nữa nhé"
    assert _loc_viec_mua({"ngung_bao": "tat", "ngung_bao_trich": "đừng báo căn mới", "trich_dan": "giờ hẹn cũ"}, cuoi, [cuoi])["ngung_bao"] == "tat"
    assert _loc_viec_mua({"ngung_bao": "tat", "trich_dan": "giờ hẹn cũ"}, cuoi, [cuoi]) == {}          # không căn cứ nào → bỏ
    cuoi2 = "Cho anh xem thêm ảnh căn đó với em"
    assert _loc_viec_mua({"xin_anh": True, "xin_anh_trich": "xem thêm ảnh"}, cuoi2, [cuoi2])["xin_anh"] is True
    assert _loc_viec_mua({"xin_anh": True, "xin_anh_trich": "gửi hình thật nhiều"}, cuoi2, [cuoi2]) == {}   # cụm bịa → bỏ


def test_kieu_cu_trich_chung_dung_van_nhan_het_va_hen_ghep_tu_nhieu_tin():
    cuoi = "Anh muốn đi xem căn này thứ 7 tuần này lúc 9h sáng được không em?"
    ra = _loc_viec_mua({"quan_tam": True, "xin_anh": True, "hen_xem": "thứ 7 tuần này lúc 9h sáng", "trich_dan": "đi xem căn này"}, cuoi, [cuoi])
    assert ra["quan_tam"] is True and ra["xin_anh"] is True and ra["hen_xem"] == "thứ 7 tuần này lúc 9h sáng"
    assert _loc_viec_mua({"hen_xem": "9h sáng thứ 7"}, "9h", ["thứ 7 nhé", "sáng", "9h"])["hen_xem"] == "9h sáng thứ 7"
    assert _loc_viec_mua({"hen_xem": "chủ nhật 10h"}, "ok", GAN) == {}                                  # giờ khách chưa từng nói


def test_xin_anh_khi_da_gui_het_noi_that_khong_gui_lai():
    anh_can._so_gui.dat("mua-anh", "ABCD1234", 4)
    try:
        eng, ai = _engine(KhoAnh(4), {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "xin_anh": True, "xin_anh_trich": "cho anh xem ảnh"}})
        r = eng.handle("mua-anh", "cho anh xem ảnh căn đó với em")
    finally:
        anh_can._so_gui.dat("mua-anh", "ABCD1234", 0)
    assert r.xin_anh == []
    assert any("ĐÃ gửi đủ cả 4 ảnh" in s and "xin chủ nhà thêm ảnh" in s for s in ai.system)
    assert not any("gửi ảnh #ABCD1234 NGAY SAU tin này" in s for s in ai.system)


def test_dap_ok_qua_dai():
    assert _dap_ok_qua_dai("Vâng anh, em sẽ sớm xác nhận lịch xem căn Số 5A với anh ạ. Nếu anh cần thêm thông tin gì cứ nhắn em nhé!")
    assert not _dap_ok_qua_dai("Vâng ạ, em cảm ơn anh.")
    assert _dap_ok_qua_dai("Dạ vâng. Anh chú ý điện thoại nhé.")
