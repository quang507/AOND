"""SRS-5.1zzzzzzz157 (chat chị Ngân 23/10/2026 + chủ dự án: "địa chỉ chỉ có tên đường thì tự ghi là mặt tiền", "sao hẹn 4 giờ hôm nay xong lại còn hỏi
ngày"). Khách chỉ nói "ngày nào cũng rảnh", "chiều", "4h"; bot tự viết "chiều nay" rồi "xác nhận giúp em 4 giờ chiều nay…", khách đáp "có" thì bot
hỏi "ngày nào" — tự mâu thuẫn. Nguyên nhân: (1) lịch lưu DB chỉ giữ chữ đầu tiên ("chiều"), "4h" nói sau không vào; (2) model phía mua không thấy lịch
đã ghi gì nên tự thêm "nay" rồi hỏi lại. Đỏ khi bỏ gộp giờ, bỏ khối lịch đã ghi, hoặc bỏ luật mặt tiền theo tên đường."""
from aioi.mua import gop_gio_hen, khoi_lich_dang_cho
from aioi.schema import Property
from tests.test_viec_mua import CAN, KHACH_MUA, KhoGia, _engine


def test_gop_gio_hen():
    assert gop_gio_hen("chiều", "4h") == "chiều, 4h"
    assert gop_gio_hen("chiều, 4h", "4h") == "chiều, 4h"            # đã có thì giữ
    assert gop_gio_hen("chiều", "chiều nay 4h") == "chiều nay 4h"   # chữ cũ nằm trong chữ mới thì lấy chữ mới
    assert gop_gio_hen("thứ 7", "") == "thứ 7" and gop_gio_hen(None, "9h sáng") == "9h sáng"
    assert len(gop_gio_hen("a" * 150, "b" * 150)) == 200


class KhoCoLich(KhoGia):
    """Đã có một lịch chờ cho căn `ABCD1234`, chữ giờ "chiều"."""

    def _request(self, method, endpoint, data=None, prefer=None):
        if method == "GET" and endpoint.startswith("viewings?buyer_id=eq.b1&listing_id=eq."):
            self.goi.append((method, endpoint, data))
            return [{"id": "v1", "time_text": "chiều"}]
        if method == "GET" and endpoint.startswith("viewings?buyer_id=eq.b1&status=in.(proposed,pending)&select=listing_code,time_text"):
            self.goi.append((method, endpoint, data))
            return [{"listing_code": "ABCD1234", "time_text": "chiều, 4h"}]
        return super()._request(method, endpoint, data, prefer)


def test_gio_khach_noi_them_duoc_gop_vao_lich_cu():
    kho = KhoCoLich()
    assert kho.ghi_hen_xem("b1", CAN, "4h") is True
    sua = kho.ghi("PATCH", "viewings?id=eq.v1")
    assert sua == [{"time_text": "chiều, 4h"}] and not kho.ghi("POST", "viewings")           # không tạo lịch thứ hai
    kho.goi.clear()
    assert kho.ghi_hen_xem("b1", CAN, "chiều") is True and not kho.ghi("PATCH", "viewings")   # không có gì mới thì không ghi


def test_khoi_lich_dang_cho_dan_khong_tu_them_ngay_va_khong_hoi_lai():
    k = khoi_lich_dang_cho([{"listing_code": "SEED0044", "time_text": "chiều, 4h"}])
    assert "#SEED0044" in k and "chiều, 4h" in k
    assert "KHÔNG tự thêm \"nay\"" in k and "KHÔNG hỏi lại ngày / giờ" in k and "đúng không ạ" in k
    assert khoi_lich_dang_cho([]) == "" and khoi_lich_dang_cho(None) == ""


def test_engine_dua_lich_da_ghi_vao_loi_dap_khach_mua():
    kho = KhoCoLich()
    eng, ai = _engine(kho, {**KHACH_MUA, "mua": {"ma_can": ["ABCD1234"], "hen_xem": "4h", "trich_dan": "4h"}})
    eng.handle("lh-1", "căn ABCD1234 chị xem lúc 4h")
    assert "LỊCH HẸN XEM ĐÃ GHI" in ai.system[-1] and "chiều, 4h" in ai.system[-1]
    assert kho.ghi("PATCH", "viewings?id=eq.v1") == [{"time_text": "chiều, 4h"}]               # "4h" nói sau vào lịch cũ ("chiều")


def test_dia_chi_chi_co_ten_duong_tu_ghi_mat_tien():
    p = Property(loai_hinh="nha_pho")
    p.update({"duong": "Lê Lai", "dia_chi": "Lê Lai"})
    assert p.fields.get("lo_gioi_hem") == "Mặt tiền"
    # có dấu "/" thì là hẻm (luật có sẵn), khách nói hẻm / ngõ thì không tự ghi mặt tiền
    p = Property(loai_hinh="nha_pho")
    p.update({"duong": "Lê Lai", "dia_chi": "12/3 Lê Lai"})
    assert p.fields.get("lo_gioi_hem") == "Nhà hẻm"
    for dc in ("hẻm 4m Lê Lai", "ngõ 5 Lê Lai", "Hem 12 Le Lai", "ngách 3 Lê Lai"):
        p = Property(loai_hinh="nha_pho")
        p.update({"duong": "Lê Lai", "dia_chi": dc})
        assert not p.fields.get("lo_gioi_hem"), dc
    # chưa có tên đường thì không đoán; ô đã có giá trị thì không đè
    p = Property(loai_hinh="nha_pho")
    p.update({"dia_chi": "nhà gần chợ"})
    assert not p.fields.get("lo_gioi_hem")
    p = Property(loai_hinh="nha_pho")
    p.update({"lo_gioi_hem": "hẻm 3m", "duong": "Lê Lai", "dia_chi": "Lê Lai"})
    assert p.fields["lo_gioi_hem"] == "hẻm 3m"
