"""20/10/2026 (SRS-5.1zzzzzzz89). BA soát màn Sửa tin #715B4B3E: (1) mô tả luôn trống — lõi không ghi `description`, bản tin khách
duyệt chỉ nằm trong chat; (6) cột nguồn luôn `suy_doan` và ô admin sửa tay bị lượt chat sau ghi đè. Đỏ khi bỏ một trong các bản sửa."""
from aioi.engine import Engine, _than_ban_tin
from tests.test_duyet_ban_nhap import _eng
from tests.test_supabase_store_luu_tin import StoreGia, _conv, _ghi_tin

BAN = ("Em cập nhật rồi ạ.\n\n📋 Bản tin cập nhật:\n\nBán nhà MT Âu Cơ Q.11, 80m², 16 tỷ\n\nNhà 5 tầng mặt tiền Âu Cơ.\n\n- Sổ hồng riêng"
       "\n\nAnh/chị thấy bản tin đã ổn chưa ạ? Nếu đồng ý, em đăng lên web ngay.")


def test_cat_ban_tin_theo_bo_cuc():
    assert _than_ban_tin(BAN) == ("Bán nhà MT Âu Cơ Q.11, 80m², 16 tỷ", "Nhà 5 tầng mặt tiền Âu Cơ.\n\n- Sổ hồng riêng")
    assert _than_ban_tin("Không có bản tin") is None
    assert _than_ban_tin("📋 Em sẽ rao:\n\nChỉ tiêu đề\n\nAnh/chị thấy ổn chưa?") is None


def test_khach_dong_y_thi_ghi_mo_ta_dung_ban_vua_duyet(monkeypatch):
    eng, kho, _, conv = _eng({"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": "ok"}, monkeypatch)
    ghi: list[str] = []
    kho.ghi_ban_tin = lambda c, mo_ta: ghi.append(mo_ta)
    conv.listing_proposed = True
    from aioi.engine import Turn
    conv.history.append(Turn("assistant", BAN, 0.0))
    eng.handle("u-duyet", "ok")
    assert kho.duyet == [True] and ghi == ["Nhà 5 tầng mặt tiền Âu Cơ.\n\n- Sổ hồng riêng"]


def test_khong_dong_y_thi_khong_dung_mo_ta(monkeypatch):
    eng, kho, _, conv = _eng({"operations": [], "duyet_ban_nhap": "khong_dong_y", "duyet_trich_dan": "chưa"}, monkeypatch)
    ghi: list[str] = []
    kho.ghi_ban_tin = lambda c, mo_ta: ghi.append(mo_ta)
    conv.listing_proposed = True
    from aioi.engine import Turn
    conv.history.append(Turn("assistant", BAN, 0.0))
    eng.handle("u-duyet", "chưa, để anh sửa đã")
    assert ghi == []


def test_cot_nguon_va_giu_o_admin_da_sua():
    st = StoreGia(co_san=False)
    st.save(_conv({"gia": "5 tỷ 2", "dien_tich": "50m2", "dia_chi": "12 Trần Hưng Đạo, Phường 1, Quận 5"}))
    [(_, _, d)] = _ghi_tin(st)
    assert d["price_source"] == "chu_xac_nhan" and d["ward_source"] == "chu_xac_nhan" and d["ward"] == "Phường Chợ Quán"

    class StoreAdmin(StoreGia):
        def _request(self, method, endpoint, data=None, prefer=None):
            if endpoint.startswith("listings?seller_id") and method == "GET":
                self.goi.append((method, endpoint, data))
                return [{"id": "l1", "status": "cho_thong_tin", "price_source": "admin", "ward_source": "admin",
                         "property_type_source": "suy_doan"}]
            return super()._request(method, endpoint, data, prefer)
    st2 = StoreAdmin(co_san=True)
    st2.save(_conv({"gia": "9 tỷ", "dien_tich": "50m2", "dia_chi": "Phường 1, Quận 5"}))
    [(m, _, d2)] = _ghi_tin(st2)
    assert m == "PATCH" and "price_raw" not in d2 and "ward" not in d2 and d2["property_type"] == "nha_pho"
