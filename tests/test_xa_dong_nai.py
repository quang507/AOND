"""22/10/2026 (SRS-5.1zzzzzzz129). Chủ dự án: "chạy … để bot biết đi về bình phước đúng". Bình Phước cũ nay thuộc tỉnh Đồng Nai nhưng vẫn NGOÀI vùng
nhận tin (20/10: "bỏ"): bảng `xa_tinh_khac` thêm 95 đơn vị Đồng Nai (NQ 1662/NQ-UBTVQH15) kèm `tinh_cu`. Test đọc ĐÚNG file migration thật. Đỏ khi một
xã Bình Phước cũ bị coi là trong vùng, khi xã Đồng Nai cũ bị chặn nhầm, khi cùng tên ở hai tỉnh bị đoán, hay khi căn có "quận" (TP.HCM) bị cờ ngoài vùng."""
import json
import pathlib
import re

from aioi.dia_danh import TraDiaDanh, khoi_dia_danh, tra_xa
from aioi.schema import Property
from tests.test_doc_y_khach import _eng

MIG = pathlib.Path(__file__).resolve().parent.parent / "bot/supabase/migrations"
TN, DN = MIG / "20261022a_xa_tinh_khac_tay_ninh.sql", MIG / "20261022b_xa_tinh_khac_dong_nai.sql"


def _doc(duong: pathlib.Path, co_tinh_cu: bool) -> list[dict]:
    mau = r"\('([^']+)', '([^']+)', '(xa|phuong)', '([^']+)', '(\[.*?\])'::jsonb, " + (r"'([^']+)', " if co_tinh_cu else "")
    ra = []
    for g in re.findall(mau, duong.read_text(encoding="utf-8")):
        a, b, c, d, e, *f = g
        ra.append({"ten_day_du": a, "ten": b, "loai": c, "tinh": d, "don_vi_cu": json.loads(e), "tinh_cu": f[0] if f else None})
    return ra


def _dn() -> list[dict]:
    return _doc(DN, True)


def _kho() -> list[dict]:
    return _doc(TN, False) + _dn()


def test_migration_du_95_don_vi_72_xa_23_phuong_39_binh_phuoc_cu():
    dn = _dn()
    assert len(dn) == 95 and sum(x["loai"] == "xa" for x in dn) == 72 and sum(x["loai"] == "phuong" for x in dn) == 23
    assert all(x["tinh"] == "Đồng Nai" and x["tinh_cu"] in ("Đồng Nai", "Bình Phước") for x in dn)
    assert sum(x["tinh_cu"] == "Bình Phước" for x in dn) == 39
    assert sum(1 for x in dn if not x["don_vi_cu"]) == 7            # 7 đơn vị không sắp xếp (NQ khoản cuối)
    sql = DN.read_text(encoding="utf-8")
    assert "add primary key (tinh, ten_day_du)" in sql and "on conflict (tinh, ten_day_du)" in sql


def test_xa_binh_phuoc_cu_la_ngoai_vung_ca_ten_moi_lan_ten_cu():
    kho = _kho()
    for go in ("xã Nha Bích", "xa nha bich", "phường Đồng Xoài", "xã Lộc Hưng", "xã Bù Đăng", "phường Bình Phước", "xã Bù Gia Mập", "xã Đăk Ơ"):
        x = tra_xa(kho, go)
        assert x and x["tinh"] == "Đồng Nai" and x["tinh_cu"] == "Bình Phước" and x["ngoai_vung"], go
    cu = tra_xa(kho, "phường Tân Đồng")                           # phường CŨ của Đồng Xoài, gộp vào Phường Bình Phước
    assert cu and cu["ten_day_du"] == "Phường Bình Phước" and cu["tu_ten_cu"] and cu["ngoai_vung"]


def test_xa_dong_nai_cu_van_trong_vung():
    kho = _kho()
    for go in ("xã Long Thành", "xã Nhơn Trạch", "phường Trấn Biên", "phường Long Khánh", "xã Trảng Bom", "phường Tam Phước", "xã Phú Lý", "xã Đak Lua"):
        x = tra_xa(kho, go)
        assert x and x["tinh"] == "Đồng Nai" and x["tinh_cu"] == "Đồng Nai" and not x["ngoai_vung"], go
    assert tra_xa(kho, "phường Hố Nai 3") is None and tra_xa(kho, "Bình Phước") is None and tra_xa(kho, "xã Nha") is None


def test_cung_ten_hai_tinh_khong_doan_tay_ninh_van_tra_duoc():
    kho = _kho()
    assert tra_xa(kho, "xã Tân Hưng") is None                       # Xã Tân Hưng có ở Tây Ninh (Long An cũ) VÀ Đồng Nai (Hớn Quản, Bình Phước cũ)
    assert tra_xa(kho, "xã Lộc Ninh") is None                       # cũng vậy: Xã Lộc Ninh ở Tây Ninh (Dương Minh Châu cũ) và ở Đồng Nai (Bình Phước cũ)
    x = tra_xa(kho, "xã Phước Lý")
    assert x and x["ten_day_du"] == "Xã Phước Lý" and x["tinh"] == "Tây Ninh" and not x["ngoai_vung"]


def _tra():
    kho = _kho()
    return TraDiaDanh(rpc=lambda *a, **k: [], doc=lambda bang, tham: kho if bang == "xa_tinh_khac" else [])


def test_khoi_prompt_binh_phuoc_cu_ngoai_vung_dong_nai_cu_khong_hoi_huyen():
    bp = khoi_dia_danh(_tra(), {"phuong": "xã Nha Bích"}, "dia_chi")
    assert "Xã Nha Bích" in bp and "Bình Phước CŨ" in bp and "NGOÀI khu vực nhận tin" in bp
    dn = khoi_dia_danh(_tra(), {"phuong": "xã Long Thành"}, "dia_chi")
    assert "Xã Long Thành, tỉnh Đồng Nai" in dn and "Bình Phước cũ" in dn and "KHÔNG hỏi quận / huyện / tỉnh" in dn and "NGOÀI" not in dn
    tn = khoi_dia_danh(_tra(), {"phuong": "xã phước lý"}, "dia_chi")
    assert "tỉnh Tây Ninh" in tn and "Long An cũ" in tn


def _chuan(phuong: str, **them) -> Property:
    eng, _ = _eng({"operations": []})
    tra = _tra()
    tra._thu = lambda *a, **k: []                                   # tra phường TP.HCM không ra gì
    eng._dia_danh = tra
    prop = Property(loai_hinh="dat", fields={"phuong": phuong, **them})
    eng._chuan_dia_danh(prop, ["phuong"])
    return prop


def test_engine_cam_ngoai_vung_khi_xa_binh_phuoc_cu():
    assert _chuan("xã Nha Bích").fields.get("_ngoai_vung") == "Bình Phước"
    assert _chuan("xã Long Thành").fields.get("_ngoai_vung") is None
    assert _chuan("xã Phước Lý").fields.get("_ngoai_vung") is None
    assert _chuan("xã Nha Bích", quan="Quận 7").fields.get("_ngoai_vung") is None   # khách đã nói quận (TP.HCM): không cờ ngoài vùng
