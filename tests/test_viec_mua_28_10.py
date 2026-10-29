"""SRS-5.1zzzzzzz232 (bắn thử ban-thu-ai 28/10/2026 trên model thật; chủ dự án: "175 fix đi, 162 fix đi", ảnh: "nói thật, không gửi lại", "có thể
xin thêm ảnh"). Ca gốc: khối việc khách mua (hẹn xem, xin ảnh, chê căn, thôi báo) được nhận / bỏ CẢ khối theo một `trich_dan` chung — AI chép lại
giờ hẹn lượt trước vào đó nên lượt chê căn / xin thôi báo / xin ảnh mất sạch (log lõi "Mua: AI có đọc việc … bị bỏ — trích_dẫn_khớp=False").
Nay kiểm TỪNG việc theo cụm của chính nó. Đỏ khi: quay lại kiểm chung cả khối, gửi lại ảnh đã gửi hết, lượt "ok" dài không bị gọi lại."""
from aioi import anh_can
from aioi.engine import _dap_ok_qua_dai, _loc_viec_mua
from aioi.mua import XIN_THEM_ANH
from tests.test_viec_mua import KHACH_MUA, _engine
from tests.test_xin_anh_can import KhoAnh

def test_moi_viec_ai_doc_ra_deu_nhan_chi_chuan_hoa_kieu():
    """SRS-5.1zzzzzzz281 (chủ dự án 29/10: "sửa để ai hiểu ý khách, thực thi đúng ý khách"): bản 232 kiểm từng việc theo cụm nguyên văn — nay AI
    đọc ra là nhận; code chỉ chuẩn hoá kiểu (cờ phải là true, ngung_bao chỉ tat / bat, chuỗi rỗng bỏ)."""
    mua = {"ma_can": ["SEED0215"], "hen_xem": "thứ 7 tuần này lúc 9h sáng", "khong_hop": True, "ly_do": "diện tích nhỏ",
           "xin_anh": True, "ngung_bao": "tat", "quan_tam": True, "hoi_du_an": "Ny'ah", "trich_dan": "giờ hẹn cũ"}
    ra = _loc_viec_mua(mua)
    assert ra == {"ma_can": ["SEED0215"], "hen_xem": "thứ 7 tuần này lúc 9h sáng", "khong_hop": True, "ly_do": "diện tích nhỏ",
                  "xin_anh": True, "ngung_bao": "tat", "quan_tam": True, "hoi_du_an": "Ny'ah"}
    assert _loc_viec_mua({"xin_anh": "có", "ngung_bao": "khong", "hen_xem": "  ", "ma_can": ["X"]}) == {}   # sai kiểu → bỏ, không việc → không mã


def test_xin_anh_khi_da_gui_het_noi_that_khong_gui_lai():
    anh_can._so_gui.dat("mua-anh", "ABCD1234", 4)
    try:
        kho = KhoAnh(4)
        eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "xin_anh": True}})
        r = eng.handle("mua-anh", "cho anh xem ảnh căn đó với em")
    finally:
        anh_can._so_gui.dat("mua-anh", "ABCD1234", 0)
    assert r.xin_anh == []
    assert any("ĐÃ gửi đủ cả 4 ảnh" in s and "em ĐÃ nhắn chủ nhà xin thêm ảnh" in s for s in ai.system)
    # SRS-5.1zzzzzzz254: nhờ chủ nhà gửi thêm ảnh NGAY qua `info_requests` (không hỏi khách "có muốn em xin không")
    assert any(m == "POST" and e == "info_requests" and (d or {}).get("question") == XIN_THEM_ANH for m, e, d, *_ in kho.goi)
    assert not any("gửi ảnh #ABCD1234 NGAY SAU tin này" in s for s in ai.system)


def test_dap_ok_qua_dai():
    assert _dap_ok_qua_dai("Vâng anh, em sẽ sớm xác nhận lịch xem căn Số 5A với anh ạ. Nếu anh cần thêm thông tin gì cứ nhắn em nhé!")
    assert not _dap_ok_qua_dai("Vâng ạ, em cảm ơn anh.")
    assert _dap_ok_qua_dai("Dạ vâng. Anh chú ý điện thoại nhé.")
