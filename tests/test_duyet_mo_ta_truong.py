"""21/10/2026 (SRS-5.1zzzzzzz94). Bắn thử KB3: sau bản nháp bot ghi thêm phí quản lý, khách "ok đăng đi" — tin không lên web. Mô tả
trường `duyet_ban_nhap` trong schema vẫn nói "Chỉ khi bot VỪA gửi bản tin nháp" (theo vị trí tin), trái luật DUYỆT theo trạng thái
của OPERATIONS_SYSTEM (20/10): hai chỗ dặn model ngược nhau. Kèm: nhà mặt tiền không mang độ rộng hẻm."""
from aioi.prompts import OPERATIONS_SYSTEM, operations_schema
from aioi.supabase_store import SupabaseConversationStore
from tests.test_duyet_ban_nhap import _eng


def test_mo_ta_truong_duyet_theo_trang_thai_nhu_luat():
    mo_ta = operations_schema()["properties"]["duyet_ban_nhap"]["description"]
    assert "TRẠNG THÁI: bot ĐÃ gửi bản tin nháp" in mo_ta and "TRẠNG THÁI: bot ĐÃ gửi bản tin nháp" in OPERATIONS_SYSTEM
    assert "vừa gửi bản tin nháp" not in mo_ta


def test_ok_dang_di_sau_tin_ghi_them_y_van_la_duyet(monkeypatch):
    eng, kho, _, conv = _eng({"operations": [], "duyet_ban_nhap": "dong_y", "duyet_trich_dan": "ok đăng đi"}, monkeypatch)
    conv.listing_proposed = True
    from aioi.engine import Turn
    conv.history.append(Turn("assistant", "Em ghi nhận phí quản lý khoảng 1,2 triệu cho căn rồi ạ.", 0.0))
    eng.handle("u-duyet", "ok đăng đi")
    assert kho.duyet == [True]


def test_nha_mat_tien_giu_do_rong_duong():
    """SRS-5.1zzzzzzz95: `alley_width_m` là độ rộng ĐƯỜNG VÀO (hẻm, hoặc con đường với nhà mặt tiền) — bản 94 bỏ nó với nhà mặt
    tiền là đọc sai nghĩa cột; KB5 mất "đường rộng 20 m" trên web."""
    kho = SupabaseConversationStore.__new__(SupabaseConversationStore)
    kho._thong_so_nho = {}
    gui: list[str] = []
    kho._request = lambda m, e, data=None, **k: gui.append(data["p_text"]) or {"access_type": "mat_tien", "alley_width_m": 20,
                                                                                 "frontage_m": 4}
    ra = kho._thong_so({"mat_tien": "4m", "lo_gioi_duong": "20m"}, "nha_pho")
    assert ra["alley_width_m"] == 20 and ra["frontage_m"] == 4
    assert gui == ["ngang: 4m; lộ giới đường: 20m"]          # chữ gửi bộ đọc DB không đổi theo nhãn ô


def test_nhan_o_noi_ro_cua_can_hay_cua_duong():
    from aioi.prompts import FIELD_LABELS, cau_hoi_o
    assert "CĂN" in FIELD_LABELS["mat_tien"] and "không phải độ rộng con đường" in FIELD_LABELS["mat_tien"]
    assert "CON ĐƯỜNG" in FIELD_LABELS["lo_gioi_duong"] and "không phải bề ngang" in FIELD_LABELS["lo_gioi_duong"]
    assert "rộng khoảng mấy mét" in cau_hoi_o("lo_gioi_hem")


def test_tin_cua_loi_mang_dau_thong_so_ai():
    from tests.test_supabase_store_luu_tin import StoreGia, _conv, _ghi_tin
    st = StoreGia(co_san=False)
    st.save(_conv({"gia": "6,95 tỷ", "dien_tich_dat": "4x11m", "lo_gioi_duong": "20m"}))
    [(_, _, d)] = _ghi_tin(st)
    assert d["boc_tach"]["_thong_so_ai"] is True and d["boc_tach"]["lo_gioi_duong"] == "20m"


def test_nap_lai_bo_dau_thong_so_ai_khoi_o_tin():
    from tests.test_trang_thai_va_nap_lai import UUID, UUID_GACH, StoreGia as StoreNap, _dong
    rows = [_dong(UUID_GACH, UUID[:8].upper(), fields={"gia": "5 tỷ", "_thong_so_ai": True})]
    li = StoreNap(rows=rows).load("zalo-thu-1").listings[0]
    assert li.prop.fields == {"gia": "5 tỷ"}
