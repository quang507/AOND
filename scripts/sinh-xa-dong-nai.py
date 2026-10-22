#!/usr/bin/env python3
"""sinh-xa-dong-nai.py — sinh migration dữ liệu bảng `xa_tinh_khac` cho 95 xã / phường MỚI của tỉnh Đồng Nai (hợp nhất Đồng Nai + Bình Phước
01/07/2025) từ Nghị quyết 1662/NQ-UBTVQH15 (16/06/2025, Điều 1). SRS-5.1zzzzzzz129, chủ dự án 22/10/2026: "chạy … để bot biết đi về bình phước đúng".

Nguồn: toàn văn NQ do hoatieu.vn đăng lại (tải bằng script này, KHÔNG nhập tay); dùng lại bộ đọc của `sinh-xa-tay-ninh.py`. 88 khoản = đơn vị mới hình
thành sau sắp xếp + 7 đơn vị "không thực hiện sắp xếp" (nêu ở khoản cuối của Điều 1).

TỈNH CŨ (cột `tinh_cu`: Đồng Nai | Bình Phước) NQ KHÔNG GHI. Suy từ thứ tự khoản — NQ liệt kê toàn bộ đơn vị Đồng Nai cũ trước, Bình Phước cũ sau (xã:
khoản 1–37 | 38–67; phường: 68–81 | 82–88) — và tên huyện cũ ghi trong ngoặc / tên thị xã Bình Long, Phước Long, Đồng Xoài, Chơn Thành…; bảy đơn vị
không sắp xếp xếp tay (Bù Gia Mập, Đăk Ơ = Bình Phước; còn lại Đồng Nai). Đây là [giả định BA] chưa đối chiếu nguồn chính thức; script chặn bằng danh
sách tên mốc mỗi bên.

    python3 -I scripts/sinh-xa-dong-nai.py [đường-dẫn-NQ.txt] > bot/supabase/migrations/20261022b_xa_tinh_khac_dong_nai.sql

Soát: phải ra đúng 95 đơn vị = 72 xã + 23 phường (số liệu công bố của NQ); lệch thì thoát 1.
"""
from __future__ import annotations

import importlib.util
import json
import pathlib
import re
import sys
import unicodedata

NGUON_URL = "https://hoatieu.vn/phap-luat/nghi-quyet-1662-nq-ubtvqh15-2025-233527"
TINH = "Đồng Nai"
# (loai, từ khoản, đến khoản) thuộc Bình Phước cũ; ngoài các đoạn này (trong 1–88) là Đồng Nai cũ.
BINH_PHUOC_KHOAN = (("xa", 38, 67), ("phuong", 82, 88))
KHONG_SAP_XEP_BINH_PHUOC = {"Bù Gia Mập", "Đăk Ơ"}
MOC_BINH_PHUOC = {"Nha Bích", "Lộc Ninh", "Đồng Xoài", "Phước Long", "Bình Long", "Chơn Thành", "Bù Đăng", "Đồng Phú", "Bình Phước", "Phú Riềng",
                  "Bom Bo", "Đa Kia", "Tân Khai", "Bù Gia Mập", "Đăk Ơ"}
MOC_DONG_NAI = {"Biên Hòa", "Long Khánh", "Nhơn Trạch", "Long Thành", "Trảng Bom", "Định Quán", "Trị An", "Xuân Lộc", "Cẩm Mỹ", "Dầu Giây",
                "Trấn Biên", "Phước Tân", "Tam Phước", "Phú Lý", "Đak Lua", "Thanh Sơn"}


def _nap_bo_doc():
    duong = pathlib.Path(__file__).resolve().parent / "sinh-xa-tay-ninh.py"
    spec = importlib.util.spec_from_file_location("sinh_xa_tay_ninh", duong)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.NGUON_URL = NGUON_URL
    return mod


def tinh_cu(loai: str, so: int, ten: str) -> str:
    if so == 89:
        return "Bình Phước" if ten in KHONG_SAP_XEP_BINH_PHUOC else "Đồng Nai"
    return "Bình Phước" if any(loai == l and a <= so <= b for l, a, b in BINH_PHUOC_KHOAN) else "Đồng Nai"


def doc_khong_sap_xep(van_ban: str) -> list[dict]:
    """Khoản cuối Điều 1: "… 07 đơn vị hành chính cấp xã không thực hiện sắp xếp là phường Phước Tân, phường Tam Phước, các xã Thanh Sơn (huyện
    Định Quán), Đak Lua, Phú Lý, Bù Gia Mập, Đăk Ơ."."""
    van_ban = unicodedata.normalize("NFC", van_ban)
    i, j = van_ban.find("Điều 1."), van_ban.find("Điều 2.")
    m = re.search(r"không thực hiện sắp xếp là\s+(.+?)\.\s*$", van_ban[i:j], flags=re.M)
    if not m:
        raise SystemExit("không thấy khoản liệt kê đơn vị không sắp xếp")
    ra, loai = [], None
    for tok in re.split(r",\s*|\s+và\s+", m.group(1)):
        tok = tok.strip()
        mm = re.match(r"(?i)^(các\s+)?(xã|phường)\s+(.*)$", tok)
        if mm:
            loai, ten = ("xa" if mm.group(2).lower() == "xã" else "phuong"), mm.group(3).strip()
        else:
            ten = tok
        if loai is None or not ten:
            raise SystemExit(f"không đọc được đơn vị không sắp xếp: {tok!r}")
        ra.append({"loai": loai, "ten": ten, "ten_hien_thi": ten})
    return ra


def main() -> None:
    tn = _nap_bo_doc()
    van_ban = tn.tai_van_ban(sys.argv[1] if len(sys.argv) > 1 else None)
    ds = tn.doc_khoan(van_ban)
    giu = doc_khong_sap_xep(van_ban)
    moi = [{"so": d["so"], "loai": d["loai"], "ten": d["ten"], "cu": d["cu"], "tinh_cu": tinh_cu(d["loai"], d["so"], d["ten"]),
            "nguon": f"NQ 1662/NQ-UBTVQH15 k.{d['so']} (hoatieu.vn)"} for d in ds]
    moi += [{"so": 89, "loai": g["loai"], "ten": re.sub(r"\s*\(.*?\)", "", g["ten"]).strip(), "cu": [], "tinh_cu": tinh_cu(g["loai"], 89, re.sub(r"\s*\(.*?\)", "", g["ten"]).strip()),
             "nguon": "NQ 1662/NQ-UBTVQH15 Điều 1 khoản cuối: không thực hiện sắp xếp (hoatieu.vn)"} for g in giu]
    xa = sum(d["loai"] == "xa" for d in moi)
    if len(ds) != 88 or len(giu) != 7 or len(moi) != 95 or xa != 72 or len(moi) - xa != 23:
        raise SystemExit(f"lệch số liệu NQ: {len(ds)} đơn vị sắp xếp + {len(giu)} không sắp xếp = {len(moi)} ({xa} xã, {len(moi) - xa} phường), cần 88 + 7 = 95 = 72 + 23")
    if len({(d["loai"], d["ten"]) for d in moi}) != 95:
        raise SystemExit("tên đơn vị mới trùng nhau")
    thieu_cu = [d["ten"] for d in moi if d["so"] != 89 and not d["cu"]]
    if thieu_cu:
        raise SystemExit(f"đơn vị mới không đọc được đơn vị cũ gộp vào: {thieu_cu}")
    bp = {d["ten"] for d in moi if d["tinh_cu"] == "Bình Phước"}
    dn = {d["ten"] for d in moi if d["tinh_cu"] == "Đồng Nai"}
    if not MOC_BINH_PHUOC <= bp or not MOC_DONG_NAI <= dn:
        raise SystemExit(f"ranh giới tỉnh cũ lệch tên mốc: Bình Phước thiếu {sorted(MOC_BINH_PHUOC - bp)}, Đồng Nai thiếu {sorted(MOC_DONG_NAI - dn)}")
    q = tn.q
    out = [
        "-- 20261022b — Bảng `xa_tinh_khac`: thêm 95 xã / phường MỚI của tỉnh Đồng Nai (hợp nhất Đồng Nai + Bình Phước từ 01/07/2025), kèm cột `tinh_cu`",
        "-- (Đồng Nai | Bình Phước) để lõi biết căn ở Bình Phước cũ là NGOÀI vùng nhận tin (SRS-5.1zzzzzzz129; chủ dự án 20/10: \"Bình Phước cũ: bỏ\").",
        "-- Cùng tên ở hai tỉnh có thật (Xã Tân Hưng: Tây Ninh và Đồng Nai) nên khoá chính đổi từ (ten_day_du) sang (tinh, ten_day_du).",
        "-- NGUỒN: Nghị quyết 1662/NQ-UBTVQH15 (16/06/2025) Điều 1, toàn văn hoatieu.vn — SINH TỰ ĐỘNG bằng scripts/sinh-xa-dong-nai.py, không nhập tay.",
        "-- `tinh_cu` KHÔNG có trong NQ: suy từ thứ tự khoản (Đồng Nai cũ trước, Bình Phước cũ sau) — [giả định BA], xem đầu script.",
        "",
        "alter table public.xa_tinh_khac add column if not exists tinh_cu text;",
        "comment on column public.xa_tinh_khac.tinh_cu is 'Tỉnh CŨ của đơn vị (Đồng Nai | Bình Phước), chỉ nạp cho Đồng Nai mới; null = chưa nạp. Bình Phước cũ là ngoài vùng nhận tin.';",
        "alter table public.xa_tinh_khac drop constraint if exists xa_tinh_khac_pkey;",
        "alter table public.xa_tinh_khac add primary key (tinh, ten_day_du);",
        "",
        "insert into public.xa_tinh_khac (ten_day_du, ten, loai, tinh, don_vi_cu, tinh_cu, nguon) values",
    ]
    dong = []
    for d in moi:
        tien_to = "Xã" if d["loai"] == "xa" else "Phường"
        cu = [{"ten": ten, "toan_bo": cd == "toan_bo"} for ten, cd in d["cu"]]
        dong.append(f"  ({q(tien_to + ' ' + d['ten'])}, {q(d['ten'])}, {q(d['loai'])}, {q(TINH)}, {q(json.dumps(cu, ensure_ascii=False))}::jsonb, "
                    f"{q(d['tinh_cu'])}, {q(d['nguon'])})")
    out.append(",\n".join(dong))
    out.append("on conflict (tinh, ten_day_du) do update set don_vi_cu = excluded.don_vi_cu, tinh_cu = excluded.tinh_cu, nguon = excluded.nguon;")
    print("\n".join(out))


if __name__ == "__main__":
    main()
