"""22/10/2026 (SRS-5.1zzzzzzz128). Lê Quang test đất "xã Phước Lý" (Long An): bot hỏi "thuộc huyện nào" — xã Phước Lý nay thuộc tỉnh Tây Ninh (hợp
nhất Long An 01/07/2025), không còn cấp huyện. "Nạp danh sách xã Long An đi": bảng `xa_tinh_khac` (96 đơn vị mới, NQ 1682/NQ-UBTVQH15). Test đọc ĐÚNG
file migration thật. Đỏ khi tra nhầm tên tỉnh "Long An" thành xã, khi đơn vị cũ không về đơn vị mới, hay khi khối prompt không bảo bỏ hỏi huyện."""
import json
import pathlib
import re

from aioi.dia_danh import TraDiaDanh, khoi_dia_danh, tra_xa
from aioi.schema import Property
from tests.test_doc_y_khach import _eng

SQL = pathlib.Path(__file__).resolve().parent.parent / "bot/supabase/migrations/20261022a_xa_tinh_khac_tay_ninh.sql"


def _kho() -> list[dict]:
    dong = re.findall(r"\('([^']+)', '([^']+)', '(xa|phuong)', '([^']+)', '(\[.*?\])'::jsonb", SQL.read_text(encoding="utf-8"))
    return [{"ten_day_du": a.replace("''", "'"), "ten": b.replace("''", "'"), "loai": c, "tinh": d, "don_vi_cu": json.loads(e.replace("''", "'"))}
            for a, b, c, d, e in dong]


def test_migration_du_96_don_vi_82_xa_14_phuong_va_don_vi_cu():
    kho = _kho()
    assert len(kho) == 96 and sum(x["loai"] == "xa" for x in kho) == 82 and sum(x["loai"] == "phuong" for x in kho) == 14
    assert all(x["tinh"] == "Tây Ninh" and x["don_vi_cu"] for x in kho)
    assert sum(len(x["don_vi_cu"]) for x in kho) >= 280


def test_xa_phuoc_ly_moi_cu_va_khong_dau():
    kho = _kho()
    for go in ("xã Phước Lý", "Xã phước lý", "xa phuoc ly", "xã Phước Lý (Cần Giuộc)"):
        x = tra_xa(kho, go)
        assert x and x["ten_day_du"] == "Xã Phước Lý" and x["tinh"] == "Tây Ninh" and not x["tu_ten_cu"], go
    cu = tra_xa(kho, "xã Long Thượng")                          # xã cũ gộp vào Phước Lý
    assert cu and cu["ten_day_du"] == "Xã Phước Lý" and cu["tu_ten_cu"] and "xã Phước Hậu" in cu["don_vi_cu"]


def test_khong_nhan_nham_ten_tinh_so_phuong_cu_hay_gan_dung():
    kho = _kho()
    assert tra_xa(kho, "Long An") is None                      # tên tỉnh trần; "Phường Long An" là phường mới, "xã Long An" là xã CŨ gộp vào Phước Vĩnh Tây
    assert tra_xa(kho, "Phường Long An")["ten_day_du"] == "Phường Long An" and tra_xa(kho, "xã Long An")["ten_day_du"] == "Xã Phước Vĩnh Tây"
    assert tra_xa(kho, "Phước Lý") is None and tra_xa(kho, "Long Thượng") is None   # không kèm chữ loại → không đoán
    assert tra_xa(kho, "Phường 5") is None and tra_xa(kho, "p.12") is None
    assert tra_xa(kho, "xã phuoc li") is None and tra_xa(kho, "") is None and tra_xa(kho, None) is None


def _tra():
    kho = _kho()
    return TraDiaDanh(rpc=lambda *a, **k: [], doc=lambda bang, tham: kho if bang == "xa_tinh_khac" else [])


def test_khoi_prompt_noi_xa_tinh_la_du_khong_hoi_huyen():
    khoi = khoi_dia_danh(_tra(), {"phuong": "xã phước lý"}, "dia_chi")
    assert "Xã Phước Lý, tỉnh Tây Ninh" in khoi and "KHÔNG hỏi quận / huyện / tỉnh" in khoi and "Long Thượng" in khoi
    assert khoi_dia_danh(_tra(), {"phuong": "Phường 5"}, "dia_chi") == ""


def test_engine_chuan_hoa_phuong_thanh_ten_xa_khi_khong_phai_phuong_hcm():
    eng, _ = _eng({"operations": []})
    tra = _tra()
    tra._thu = lambda *a, **k: []                               # tra phường TP.HCM không ra gì
    eng._dia_danh = tra
    prop = Property(loai_hinh="dat", fields={"phuong": "xã phước lý"})
    assert "phuong" in eng._chuan_dia_danh(prop, ["phuong"]) and prop.fields["phuong"] == "Xã Phước Lý"
