"""20/10/2026 (SRS-5.1zzzzzzz87). Chat chị N.: sau bản nháp, bot nhắc rồi tự hỏi "xác nhận giúp em bản tin đã ổn"; khách trả "rao tin này
giúp mình", "ổn", "ok đăng tin này nhé", "ok" — bốn lần không được tính là duyệt, bot hỏi lại mãi. Gốc: luật duyệt chỉ nhận khi tin
NGAY TRƯỚC của bot là bản nháp (vị trí tin), và lời bảo đăng bị bỏ khi bản nháp đã gửi. Nay duyệt đọc theo TRẠNG THÁI (bản nháp đã
gửi), lời bảo đăng sau bản nháp là đồng ý. Kèm: tên dự án không dấu, nhớ lần hụt tra kho dự án, mở đầu "Dạ" thì gọi lại model."""
from aioi.engine import Engine, _mo_dau_da
from aioi.projects import find_matching_key
from aioi.prompts import OPERATIONS_SYSTEM
from aioi.supabase_store import SupabaseConversationStore
from tests.test_duyet_ban_nhap import _eng
from tests.test_tieu_de_co_gia import _SpyLan


def test_loi_bao_dang_sau_ban_nhap_la_dong_y(monkeypatch):
    eng, kho, _, conv = _eng({"operations": [], "xin_dang": "rao tin này giúp mình"}, monkeypatch)
    conv.listing_proposed = True
    eng.handle("u-duyet", "rao tin này giúp mình")
    assert kho.duyet == [True]


def test_loi_bao_dang_bia_trich_dan_hay_chua_co_ban_nhap_khong_tinh(monkeypatch):
    eng, kho, _, conv = _eng({"operations": [], "xin_dang": "đăng đi"}, monkeypatch)
    conv.listing_proposed = True
    eng.handle("u-duyet", "để anh hỏi vợ đã")
    assert kho.duyet == []
    eng2, kho2, _, conv2 = _eng({"operations": [], "xin_dang": "đăng đi"}, monkeypatch)
    conv2.listing_proposed = False   # chưa có bản nháp: "đăng đi" là xin soạn tin (SRS-5.1zzzzzzz86), không phải duyệt
    eng2.handle("u-duyet", "đăng đi")
    assert kho2.duyet == []


def test_lap_thao_tac_biet_ban_nhap_da_gui(monkeypatch):
    eng, _, _, conv = _eng({"operations": []}, monkeypatch)
    he: list[str] = []
    monkeypatch.setattr(eng._provider, "extract", lambda system, messages, schema: he.append(system) or {"operations": []},
                        raising=False)
    conv.listing_proposed = True
    eng.handle("u-duyet", "ổn")
    assert any("\nTRẠNG THÁI: bot ĐÃ gửi" in s for s in he)
    eng2, _, _, conv2 = _eng({"operations": []}, monkeypatch)
    he2: list[str] = []
    monkeypatch.setattr(eng2._provider, "extract", lambda system, messages, schema: he2.append(system) or {"operations": []},
                        raising=False)
    conv2.listing_proposed = False
    eng2.handle("u-duyet", "ổn")
    assert he2 and "\nTRẠNG THÁI: bot ĐÃ gửi" not in he2[0]
    assert "NGAY TRƯỚC của bot là BẢN TIN NHÁP" not in OPERATIONS_SYSTEM


def test_ten_du_an_khong_dau_va_dau_nhay():
    kho = ["ny ah phú định", "masteri thảo điền"]
    assert find_matching_key("nyah phu dinh", kho) == "ny ah phú định"
    assert find_matching_key("khu dan cu nyah phu dinh", kho) == "ny ah phú định"
    assert find_matching_key("nyah phú định", kho) == "ny ah phú định"
    assert find_matching_key("masteri an phu", kho) is None


def test_tra_du_an_hut_khong_nho():
    kho = SupabaseConversationStore.__new__(SupabaseConversationStore)
    kho._du_an_nho = {}
    tra = [[], [{"id": "p1", "name": "Ny'ah Phú Định"}]]
    kho._request = lambda *a, **k: tra.pop(0)
    assert kho._du_an({"du_an": "Nyah Phú Định"}) is None        # dự án chưa vào kho
    assert kho._du_an({"du_an": "Nyah Phú Định"}) is None and len(tra) == 1   # hụt nhớ 5 phút: không gọi lại ngay (SRS-5.1zzzzzzz96)
    kho._du_an_hut["Nyah Phú Định"] -= 301
    assert kho._du_an({"du_an": "Nyah Phú Định"})["id"] == "p1"   # vào kho rồi thì lượt sau 5 phút gắn được


def test_mo_dau_da_thi_goi_lai_mot_lan():
    assert _mo_dau_da("Dạ không sao ạ") and _mo_dau_da("  dạ, em hiểu") and not _mo_dau_da("Dạng nhà phố") and not _mo_dau_da("Em")
    spy = _SpyLan({"operations": []}, ["Dạ, em hiểu ạ.", "Em hiểu ạ."])
    eng = Engine(spy)
    conv = eng.conversation("da1")
    conv.prop.loai_hinh = "nha_pho"
    eng.handle("da1", "chưa tiện")
    assert len(spy.systems) == 2 and "VIẾT LẠI LƯỢT NÀY" in spy.systems[-1] and "Dạ" in spy.systems[-1]
    assert conv.history[-1].content == "Em hiểu ạ."


def test_mot_cum_mot_o_va_mat_tien_khong_lon_hon_lo():
    from aioi.engine import Engine as E
    eng = E(_SpyLan({"operations": []}, []))
    conv = eng.conversation("mc1")
    conv.prop.loai_hinh = "nha_pho"
    out = E._mot_cum_mot_o(conv, {"phap_ly": "SHR Hoàn Công Đầy Đủ", "phap_ly_hoan_cong": "SHR Hoàn Công Đầy Đủ",
                                  "kich_thuoc": "4x11m", "mat_tien": "20m", "so_tang": "3 lầu", "ket_cau": "1 trệt 3 lầu"})
    assert len({"phap_ly", "phap_ly_hoan_cong"} & set(out)) == 1
    assert "mat_tien" not in out and out["kich_thuoc"] == "4x11m" and out["ket_cau"] == "1 trệt 3 lầu"
    # giá trị đã nằm ở một ô từ lượt trước → ô mới cùng chữ bị bỏ, ô cũ giữ
    conv.prop.fields["tien_ich_phong"] = "Garege trong nhà"
    out2 = E._mot_cum_mot_o(conv, {"dien_tich_trang_thiet_bi": "Garege trong nhà"})
    assert out2 == {}
    # ngang hợp lệ, "có" một từ ở hai ô thì không đụng
    assert E._mot_cum_mot_o(conv, {"mat_tien": "4m", "kich_thuoc": "4x11"})["mat_tien"] == "4m"
    assert E._mot_cum_mot_o(conv, {"co_gara": "có", "co_san_thuong": "có"}) == {"co_gara": "có", "co_san_thuong": "có"}


def test_phuong_du_an_tra_cot_chuan_truoc_dia_chi_dai():
    kho = SupabaseConversationStore.__new__(SupabaseConversationStore)
    kho._du_an_nho = {}
    kho._du_an = lambda f: {"id": "p1", "name": "Ny'ah Phú Định", "ward": "Phường Phú Định", "district": "Quận 8",
                            "location_raw": "58A Trương Đình Hội, Phường Phú Định (Phường 16, Quận 8 cũ), TP.HCM"}
    # địa chỉ dài nhắc cả phường cũ → bộ tra báo mơ hồ; cột phường chuẩn thì ra một phường
    kho._chuan_dia_ban = lambda chu: ((None, "Quận 8") if ("Phường 16" in chu or not chu.startswith("Phường"))
                                      else ("Phường Phú Định", "Quận 8"))
    assert kho._dia_ban({"dia_chi": "Trương Đình Hội, khu dân cư Nyah Phú Định", "du_an": "Nyah Phú Định"}) == \
        ("Phường Phú Định", "Quận 8", "suy_doan")
